import { WorkflowDefinition, ExecutionContext, ActionResult } from '../types/workflow-schema';
import { ExecutionResult } from './workflow-engine';
import prisma from '../config/database';
import logger from '../utils/logger';

export interface ExecutionSnapshot {
  executionId: string;
  workflowName: string;
  status: 'running' | 'completed' | 'failed' | 'cancelled' | 'timeout';
  startTime: Date;
  endTime?: Date | undefined;
  duration?: number | undefined;
  currentAction?: string | undefined;
  progress: {
    completed: number;
    failed: number;
    skipped: number;
    total: number;
    percentage: number;
  };
  context: ExecutionContext;
  actionResults: ActionResult[];
  error?: string | undefined;
  metrics?: any;
}

export interface ExecutionQuery {
  workflowName?: string;
  status?: string[];
  startTimeRange?: { from: Date; to: Date };
  limit?: number;
  offset?: number;
  includeActions?: boolean;
}

export interface ExecutionAggregation {
  totalExecutions: number;
  successfulExecutions: number;
  failedExecutions: number;
  averageDuration: number;
  successRate: number;
  mostFrequentErrors: { error: string; count: number }[];
  executionsByHour: { hour: number; count: number }[];
  executionsByDay: { date: string; count: number }[];
  actionSuccess: { actionType: string; successRate: number }[];
}

export class ExecutionHistory {
  private activeExecutions: Map<string, ExecutionSnapshot> = new Map();
  private executionCache: Map<string, ExecutionSnapshot> = new Map();
  private readonly maxCacheSize = 1000;

  /**
   * Start tracking a new workflow execution
   */
  public async startExecution(
    executionId: string,
    workflow: WorkflowDefinition,
    context: ExecutionContext
  ): Promise<void> {
    const snapshot: ExecutionSnapshot = {
      executionId,
      workflowName: workflow.name,
      status: 'running',
      startTime: new Date(),
      progress: {
        completed: 0,
        failed: 0,
        skipped: 0,
        total: workflow.actions.length,
        percentage: 0
      },
      context,
      actionResults: []
    };

    this.activeExecutions.set(executionId, snapshot);

    try {
      // Store in database
      await prisma.execution.create({
        data: {
          id: executionId,
          workflowId: workflow.name,
          status: 'RUNNING',
          triggerEvent: context.trigger,
          startedAt: snapshot.startTime,
          executionSteps: {
            workflow: {
              name: workflow.name,
              version: workflow.version,
              actions: workflow.actions.map(a => ({
                id: a.id,
                type: a.type,
                name: a.name
              }))
            },
            context: context,
            progress: snapshot.progress
          }
        }
      });

      logger.info(`Execution tracking started`, {
        executionId,
        workflowName: workflow.name,
        totalActions: workflow.actions.length
      });

    } catch (error) {
      logger.error(`Failed to start execution tracking`, {
        executionId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Complete workflow execution
   */
  public async completeExecution(
    executionId: string,
    result: ExecutionResult
  ): Promise<void> {
    const snapshot = this.activeExecutions.get(executionId);
    if (!snapshot) {
      logger.warn(`Execution not found for completion`, { executionId });
      return;
    }

    snapshot.status = result.status;
    snapshot.endTime = result.endTime;
    snapshot.duration = result.duration;
    snapshot.actionResults = result.actionResults;
    snapshot.error = result.error || undefined;
    snapshot.metrics = result.metrics;

    // Calculate final progress
    snapshot.progress = this.calculateProgress(result.actionResults);

    // Move to cache
    this.executionCache.set(executionId, snapshot);
    this.activeExecutions.delete(executionId);
    this.maintainCacheSize();

    try {
      // Update database
      await prisma.execution.update({
        where: { id: executionId },
        data: {
          status: this.mapStatusToDb(result.status),
          completedAt: result.endTime,
          executionSteps: {
            ...snapshot.context,
            progress: snapshot.progress,
            actionResults: result.actionResults,
            metrics: result.metrics
          },
          error: result.error || null
        }
      });

      // Store individual action results for detailed analysis
      await this.storeActionResults(executionId, result.actionResults);

      logger.info(`Execution tracking completed`, {
        executionId,
        status: result.status,
        duration: `${result.duration}ms`,
        actions: {
          total: snapshot.progress.total,
          completed: snapshot.progress.completed,
          failed: snapshot.progress.failed
        }
      });

    } catch (error) {
      logger.error(`Failed to complete execution tracking`, {
        executionId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Update action status during execution
   */
  public async updateActionStatus(
    executionId: string,
    actionId: string,
    status: 'running' | 'completed' | 'failed' | 'skipped',
    result?: any,
    error?: string
  ): Promise<void> {
    const snapshot = this.activeExecutions.get(executionId);
    if (!snapshot) {
      return;
    }

    // Update or add action result
    const existingIndex = snapshot.actionResults.findIndex(r => r.actionId === actionId);
    const endTime = status !== 'running' ? new Date().toISOString() : undefined;
    const actionResult: ActionResult = {
      actionId,
      actionType: 'audit_log', // Placeholder, will be filled from workflow definition
      status,
      startTime: new Date().toISOString(),
      ...(endTime && { endTime }),
      result,
      error,
      retryCount: 0
    };

    if (existingIndex >= 0) {
      snapshot.actionResults[existingIndex] = actionResult;
    } else {
      snapshot.actionResults.push(actionResult);
    }

    // Update current action
    if (status === 'running') {
      snapshot.currentAction = actionId;
    } else if (snapshot.currentAction === actionId) {
      snapshot.currentAction = undefined;
    }

    // Update progress
    snapshot.progress = this.calculateProgress(snapshot.actionResults);

    logger.debug(`Action status updated`, {
      executionId,
      actionId,
      status,
      progress: snapshot.progress.percentage
    });
  }

  /**
   * Update execution status
   */
  public async updateExecutionStatus(
    executionId: string,
    status: 'running' | 'completed' | 'failed' | 'cancelled' | 'timeout'
  ): Promise<void> {
    const snapshot = this.activeExecutions.get(executionId);
    if (snapshot) {
      snapshot.status = status;
    }

    try {
      await prisma.execution.update({
        where: { id: executionId },
        data: { status: this.mapStatusToDb(status) }
      });
    } catch (error) {
      logger.error(`Failed to update execution status`, {
        executionId,
        status,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Get execution snapshot
   */
  public getExecution(executionId: string): ExecutionSnapshot | null {
    return this.activeExecutions.get(executionId) || this.executionCache.get(executionId) || null;
  }

  /**
   * Get all active executions
   */
  public getActiveExecutions(): ExecutionSnapshot[] {
    return Array.from(this.activeExecutions.values());
  }

  /**
   * Query execution history
   */
  public async queryExecutions(query: ExecutionQuery = {}): Promise<ExecutionSnapshot[]> {
    try {
      const whereClause: any = {};

      if (query.workflowName) {
        whereClause.workflowId = query.workflowName;
      }

      if (query.status && query.status.length > 0) {
        whereClause.status = {
          in: query.status.map(s => this.mapStatusToDb(s))
        };
      }

      if (query.startTimeRange) {
        whereClause.startedAt = {
          gte: query.startTimeRange.from,
          lte: query.startTimeRange.to
        };
      }

      const executions = await prisma.execution.findMany({
        where: whereClause,
        orderBy: { startedAt: 'desc' },
        take: query.limit || 100,
        skip: query.offset || 0,
        include: {
          auditLogs: query.includeActions || false
        }
      });

      return executions.map(exec => this.mapDbToSnapshot(exec));

    } catch (error) {
      logger.error(`Failed to query executions`, {
        query,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return [];
    }
  }

  /**
   * Get execution statistics and aggregations
   */
  public async getExecutionAggregation(
    timeRange?: { from: Date; to: Date },
    workflowName?: string
  ): Promise<ExecutionAggregation> {
    try {
      const whereClause: any = {};

      if (workflowName) {
        whereClause.workflowId = workflowName;
      }

      if (timeRange) {
        whereClause.startedAt = {
          gte: timeRange.from,
          lte: timeRange.to
        };
      }

      // Get basic statistics
      const [totalCount, successCount, failedCount] = await Promise.all([
        prisma.execution.count({ where: whereClause }),
        prisma.execution.count({ 
          where: { ...whereClause, status: 'COMPLETED' } 
        }),
        prisma.execution.count({ 
          where: { ...whereClause, status: 'FAILED' } 
        })
      ]);

      // Calculate average duration
      const durationResult = await prisma.execution.aggregate({
        where: {
          ...whereClause,
          completedAt: { not: null }
        },
        _count: {
          id: true
        }
      });

      // Get most frequent errors
      const errorExecutions = await prisma.execution.findMany({
        where: {
          ...whereClause,
          error: { not: null }
        },
        select: { error: true }
      });

      const errorCounts = new Map<string, number>();
      errorExecutions.forEach(exec => {
        if (exec.error) {
          const count = errorCounts.get(exec.error) || 0;
          errorCounts.set(exec.error, count + 1);
        }
      });

      const mostFrequentErrors = Array.from(errorCounts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([error, count]) => ({ error, count }));

      // Get executions by hour and day
      const executionsByHour = await this.getExecutionsByHour(whereClause);
      const executionsByDay = await this.getExecutionsByDay(whereClause);

      return {
        totalExecutions: totalCount,
        successfulExecutions: successCount,
        failedExecutions: failedCount,
        averageDuration: 0, // Would need proper duration calculation
        successRate: totalCount > 0 ? successCount / totalCount : 0,
        mostFrequentErrors,
        executionsByHour,
        executionsByDay,
        actionSuccess: [] // Would need action-level analysis
      };

    } catch (error) {
      logger.error(`Failed to get execution aggregation`, {
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      return {
        totalExecutions: 0,
        successfulExecutions: 0,
        failedExecutions: 0,
        averageDuration: 0,
        successRate: 0,
        mostFrequentErrors: [],
        executionsByHour: [],
        executionsByDay: [],
        actionSuccess: []
      };
    }
  }

  /**
   * Get detailed action analysis
   */
  public async getActionAnalysis(
    actionType?: string,
    timeRange?: { from: Date; to: Date }
  ): Promise<ActionAnalysis[]> {
    // This would query action-level data for detailed analysis
    // Implementation depends on how action results are stored
    return [];
  }

  /**
   * Export execution history
   */
  public async exportExecutions(
    query: ExecutionQuery,
    format: 'json' | 'csv' = 'json'
  ): Promise<string> {
    const executions = await this.queryExecutions(query);

    if (format === 'csv') {
      return this.convertToCSV(executions);
    }

    return JSON.stringify(executions, null, 2);
  }

  /**
   * Clean up old execution history
   */
  public async cleanupHistory(olderThanDays: number): Promise<number> {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

      const result = await prisma.execution.deleteMany({
        where: {
          startedAt: {
            lt: cutoffDate
          }
        }
      });

      logger.info(`Cleaned up execution history`, {
        deletedCount: result.count,
        olderThanDays
      });

      return result.count;

    } catch (error) {
      logger.error(`Failed to cleanup execution history`, {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return 0;
    }
  }

  /**
   * Calculate progress from action results
   */
  private calculateProgress(actionResults: ActionResult[]): ExecutionSnapshot['progress'] {
    const completed = actionResults.filter(r => r.status === 'completed').length;
    const failed = actionResults.filter(r => r.status === 'failed').length;
    const skipped = actionResults.filter(r => r.status === 'skipped').length;
    const total = actionResults.length;

    return {
      completed,
      failed,
      skipped,
      total,
      percentage: total > 0 ? Math.round(((completed + failed + skipped) / total) * 100) : 0
    };
  }

  /**
   * Store action results for detailed analysis
   */
  private async storeActionResults(
    executionId: string,
    actionResults: ActionResult[]
  ): Promise<void> {
    try {
      const auditLogEntries = actionResults.map(result => ({
        entityType: 'EXECUTION',
        entityId: executionId,
        action: result.status.toUpperCase(),
        changes: {
          actionId: result.actionId,
          actionType: result.actionType,
          startTime: result.startTime,
          endTime: result.endTime,
          result: result.result,
          error: result.error,
          retryCount: result.retryCount
        },
        executionId
      }));

      await prisma.auditLog.createMany({
        data: auditLogEntries
      });

    } catch (error) {
      logger.error(`Failed to store action results`, {
        executionId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Map execution status to database enum
   */
  private mapStatusToDb(status: string): string {
    const mapping: Record<string, string> = {
      'running': 'RUNNING',
      'completed': 'COMPLETED',
      'failed': 'FAILED',
      'cancelled': 'CANCELLED',
      'timeout': 'FAILED' // Map timeout to failed
    };
    return mapping[status] || 'RUNNING';
  }

  /**
   * Map database execution to snapshot
   */
  private mapDbToSnapshot(dbExecution: any): ExecutionSnapshot {
    const duration = dbExecution.completedAt && dbExecution.startedAt
      ? dbExecution.completedAt.getTime() - dbExecution.startedAt.getTime()
      : undefined;

    return {
      executionId: dbExecution.id,
      workflowName: dbExecution.workflowId,
      status: dbExecution.status.toLowerCase(),
      startTime: dbExecution.startedAt,
      endTime: dbExecution.completedAt,
      duration: duration || 0,
      progress: dbExecution.executionSteps?.progress || {
        completed: 0,
        failed: 0,
        skipped: 0,
        total: 0,
        percentage: 0
      },
      context: dbExecution.executionSteps?.context || {} as ExecutionContext,
      actionResults: dbExecution.executionSteps?.actionResults || [],
      error: dbExecution.error,
      metrics: dbExecution.executionSteps?.metrics
    };
  }

  /**
   * Get executions grouped by hour
   */
  private async getExecutionsByHour(whereClause: any): Promise<{ hour: number; count: number }[]> {
    // This would implement SQL aggregation by hour
    // Simplified implementation for now
    const hours = Array.from({ length: 24 }, (_, i) => ({ hour: i, count: 0 }));
    return hours;
  }

  /**
   * Get executions grouped by day
   */
  private async getExecutionsByDay(whereClause: any): Promise<{ date: string; count: number }[]> {
    // This would implement SQL aggregation by day
    // Simplified implementation for now
    return [];
  }

  /**
   * Convert executions to CSV format
   */
  private convertToCSV(executions: ExecutionSnapshot[]): string {
    const headers = [
      'Execution ID',
      'Workflow Name',
      'Status',
      'Start Time',
      'End Time',
      'Duration (ms)',
      'Total Actions',
      'Completed Actions',
      'Failed Actions',
      'Success Rate',
      'Error'
    ];

    const rows = executions.map(exec => [
      exec.executionId,
      exec.workflowName,
      exec.status,
      exec.startTime.toISOString(),
      exec.endTime?.toISOString() || '',
      exec.duration?.toString() || '',
      exec.progress.total.toString(),
      exec.progress.completed.toString(),
      exec.progress.failed.toString(),
      exec.progress.total > 0 
        ? ((exec.progress.completed / exec.progress.total) * 100).toFixed(2) + '%'
        : '0%',
      exec.error || ''
    ]);

    return [headers.join(','), ...rows.map(row => row.join(','))].join('\n');
  }

  /**
   * Maintain cache size
   */
  private maintainCacheSize(): void {
    if (this.executionCache.size > this.maxCacheSize) {
      const entries = Array.from(this.executionCache.entries());
      entries.sort((a, b) => b[1].startTime.getTime() - a[1].startTime.getTime());
      
      // Keep only the most recent entries
      const toKeep = entries.slice(0, this.maxCacheSize);
      this.executionCache.clear();
      toKeep.forEach(([id, snapshot]) => {
        this.executionCache.set(id, snapshot);
      });
    }
  }
}

export interface ActionAnalysis {
  actionType: string;
  totalExecutions: number;
  successCount: number;
  failureCount: number;
  averageDuration: number;
  successRate: number;
  commonErrors: string[];
  retryRate: number;
}