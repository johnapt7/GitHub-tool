import { WorkflowDefinition, ExecutionContext } from '../types/workflow-schema';
import { WorkflowEngine, ExecutionResult, WorkflowExecutionOptions } from '../engine/workflow-engine';
import { ExecutionHistory, ExecutionQuery, ExecutionAggregation } from '../engine/execution-history';
import { workflowValidator } from '../utils/workflow-validator';
import prisma from '../config/database';
import logger from '../utils/logger';
import { EventEmitter } from 'events';

export interface WorkflowServiceOptions {
  enableMetrics?: boolean;
  maxConcurrentExecutions?: number;
  defaultTimeout?: number;
  retentionDays?: number;
}

export interface WorkflowExecutionRequest {
  workflowName: string;
  triggerEvent: any;
  variables?: Record<string, any>;
  secrets?: Record<string, string>;
  options?: WorkflowExecutionOptions;
}

export interface WorkflowStatus {
  name: string;
  enabled: boolean;
  version: string;
  lastExecuted?: Date;
  totalExecutions: number;
  successRate: number;
  averageDuration: number;
}

export class WorkflowService extends EventEmitter {
  private workflowEngine: WorkflowEngine;
  private workflows: Map<string, WorkflowDefinition> = new Map();
  private options: WorkflowServiceOptions;
  private executionQueue: WorkflowExecutionRequest[] = [];
  private processing = false;

  constructor(options: WorkflowServiceOptions = {}) {
    super();
    
    this.options = {
      enableMetrics: true,
      maxConcurrentExecutions: 10,
      defaultTimeout: 300,
      retentionDays: 30,
      ...options
    };

    this.workflowEngine = new WorkflowEngine({
      maxConcurrency: this.options.maxConcurrentExecutions,
      defaultTimeout: this.options.defaultTimeout,
      enableMetrics: this.options.enableMetrics
    });

    this.setupEventHandlers();
    this.startQueueProcessor();
  }

  /**
   * Register a workflow definition
   */
  public async registerWorkflow(workflow: WorkflowDefinition): Promise<void> {
    try {
      // Validate workflow definition
      const validation = workflowValidator.validate(workflow);
      if (!validation.valid) {
        throw new Error(`Workflow validation failed: ${validation.errors.map(e => e.message).join(', ')}`);
      }

      // Store in memory
      this.workflows.set(workflow.name, workflow);

      // Store in database
      await this.saveWorkflowToDatabase(workflow);

      logger.info(`Workflow registered successfully`, {
        workflowName: workflow.name,
        version: workflow.version,
        actionsCount: workflow.actions.length
      });

      this.emit('workflow:registered', { workflowName: workflow.name });

    } catch (error) {
      logger.error(`Failed to register workflow`, {
        workflowName: workflow.name,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  /**
   * Execute a workflow
   */
  public async executeWorkflow(request: WorkflowExecutionRequest): Promise<ExecutionResult> {
    const workflow = this.workflows.get(request.workflowName);
    if (!workflow) {
      throw new Error(`Workflow not found: ${request.workflowName}`);
    }

    if (!workflow.enabled) {
      throw new Error(`Workflow is disabled: ${request.workflowName}`);
    }

    try {
      // Create execution context
      const context = this.createExecutionContext(workflow, request);

      // Execute workflow
      const result = await this.workflowEngine.executeWorkflow(workflow, request.triggerEvent);

      // Update workflow statistics
      await this.updateWorkflowStats(workflow.name, result);

      logger.info(`Workflow execution completed`, {
        workflowName: request.workflowName,
        executionId: result.executionId,
        status: result.status,
        duration: `${result.duration}ms`
      });

      this.emit('workflow:executed', result);
      return result;

    } catch (error) {
      logger.error(`Workflow execution failed`, {
        workflowName: request.workflowName,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  /**
   * Queue workflow execution for async processing
   */
  public async queueWorkflowExecution(request: WorkflowExecutionRequest): Promise<string> {
    const executionId = this.generateExecutionId();
    
    this.executionQueue.push(request);
    
    logger.info(`Workflow execution queued`, {
      workflowName: request.workflowName,
      executionId,
      queueLength: this.executionQueue.length
    });

    this.emit('workflow:queued', { workflowName: request.workflowName, executionId });
    this.processQueue();
    
    return executionId;
  }

  /**
   * Get workflow definition
   */
  public getWorkflow(name: string): WorkflowDefinition | null {
    return this.workflows.get(name) || null;
  }

  /**
   * List all registered workflows
   */
  public listWorkflows(): WorkflowDefinition[] {
    return Array.from(this.workflows.values());
  }

  /**
   * Get workflow status and statistics
   */
  public async getWorkflowStatus(name: string): Promise<WorkflowStatus | null> {
    const workflow = this.workflows.get(name);
    if (!workflow) {
      return null;
    }

    try {
      const stats = await this.getWorkflowStatistics(name);
      
      return {
        name: workflow.name,
        enabled: workflow.enabled || true,
        version: workflow.version || '1.0.0',
        lastExecuted: stats.lastExecuted,
        totalExecutions: stats.totalExecutions,
        successRate: stats.successRate,
        averageDuration: stats.averageDuration
      };

    } catch (error) {
      logger.error(`Failed to get workflow status`, {
        workflowName: name,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return null;
    }
  }

  /**
   * Update workflow definition
   */
  public async updateWorkflow(workflow: WorkflowDefinition): Promise<void> {
    try {
      // Validate updated workflow
      const validation = workflowValidator.validate(workflow);
      if (!validation.valid) {
        throw new Error(`Workflow validation failed: ${validation.errors.map(e => e.message).join(', ')}`);
      }

      // Update in memory
      this.workflows.set(workflow.name, workflow);

      // Update in database
      await this.saveWorkflowToDatabase(workflow);

      logger.info(`Workflow updated successfully`, {
        workflowName: workflow.name,
        version: workflow.version
      });

      this.emit('workflow:updated', { workflowName: workflow.name });

    } catch (error) {
      logger.error(`Failed to update workflow`, {
        workflowName: workflow.name,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  /**
   * Delete workflow
   */
  public async deleteWorkflow(name: string): Promise<boolean> {
    try {
      const workflow = this.workflows.get(name);
      if (!workflow) {
        return false;
      }

      // Remove from memory
      this.workflows.delete(name);

      // Remove from database
      await prisma.workflow.delete({
        where: { id: name }
      });

      logger.info(`Workflow deleted successfully`, { workflowName: name });
      this.emit('workflow:deleted', { workflowName: name });
      
      return true;

    } catch (error) {
      logger.error(`Failed to delete workflow`, {
        workflowName: name,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return false;
    }
  }

  /**
   * Enable/disable workflow
   */
  public async setWorkflowEnabled(name: string, enabled: boolean): Promise<boolean> {
    try {
      const workflow = this.workflows.get(name);
      if (!workflow) {
        return false;
      }

      workflow.enabled = enabled;
      await this.saveWorkflowToDatabase(workflow);

      logger.info(`Workflow ${enabled ? 'enabled' : 'disabled'}`, { workflowName: name });
      this.emit('workflow:toggled', { workflowName: name, enabled });
      
      return true;

    } catch (error) {
      logger.error(`Failed to ${enabled ? 'enable' : 'disable'} workflow`, {
        workflowName: name,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return false;
    }
  }

  /**
   * Get execution history
   */
  public async getExecutionHistory(query: ExecutionQuery = {}): Promise<any[]> {
    return this.workflowEngine.getExecutionHistory().queryExecutions(query);
  }

  /**
   * Get execution aggregation/statistics
   */
  public async getExecutionAggregation(
    timeRange?: { from: Date; to: Date },
    workflowName?: string
  ): Promise<ExecutionAggregation> {
    return this.workflowEngine.getExecutionHistory().getExecutionAggregation(timeRange, workflowName);
  }

  /**
   * Cancel running execution
   */
  public async cancelExecution(executionId: string): Promise<boolean> {
    return this.workflowEngine.cancelExecution(executionId);
  }

  /**
   * Get active executions
   */
  public getActiveExecutions(): string[] {
    return this.workflowEngine.getActiveExecutions();
  }

  /**
   * Clean up old execution data
   */
  public async cleanupExecutions(olderThanDays?: number): Promise<number> {
    const days = olderThanDays || this.options.retentionDays!;
    return this.workflowEngine.getExecutionHistory().cleanupHistory(days);
  }

  /**
   * Export workflows
   */
  public async exportWorkflows(names?: string[]): Promise<WorkflowDefinition[]> {
    if (names) {
      return names.map(name => this.workflows.get(name)).filter(Boolean) as WorkflowDefinition[];
    }
    return this.listWorkflows();
  }

  /**
   * Import workflows
   */
  public async importWorkflows(workflows: WorkflowDefinition[]): Promise<{ success: number; failed: number; errors: string[] }> {
    let success = 0;
    let failed = 0;
    const errors: string[] = [];

    for (const workflow of workflows) {
      try {
        await this.registerWorkflow(workflow);
        success++;
      } catch (error) {
        failed++;
        errors.push(`${workflow.name}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }

    logger.info(`Workflow import completed`, { success, failed, total: workflows.length });
    
    return { success, failed, errors };
  }

  /**
   * Load workflows from database on startup
   */
  public async loadWorkflowsFromDatabase(): Promise<void> {
    try {
      const workflows = await prisma.workflow.findMany({
        where: { enabled: true }
      });

      for (const dbWorkflow of workflows) {
        try {
          const workflowDef = this.parseWorkflowFromDatabase(dbWorkflow);
          this.workflows.set(workflowDef.name, workflowDef);
          
          logger.debug(`Loaded workflow from database`, {
            workflowName: workflowDef.name,
            version: workflowDef.version
          });
          
        } catch (error) {
          logger.error(`Failed to load workflow from database`, {
            workflowId: dbWorkflow.id,
            error: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      }

      logger.info(`Loaded ${this.workflows.size} workflows from database`);

    } catch (error) {
      logger.error(`Failed to load workflows from database`, {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Health check for the service
   */
  public async healthCheck(): Promise<{ status: 'healthy' | 'unhealthy'; details: any }> {
    try {
      const activeExecutions = this.getActiveExecutions();
      const queueLength = this.executionQueue.length;
      const workflowCount = this.workflows.size;

      // Check database connectivity
      await prisma.$queryRaw`SELECT 1`;

      return {
        status: 'healthy',
        details: {
          workflowCount,
          activeExecutions: activeExecutions.length,
          queueLength,
          memoryUsage: process.memoryUsage(),
          uptime: process.uptime()
        }
      };

    } catch (error) {
      return {
        status: 'unhealthy',
        details: {
          error: error instanceof Error ? error.message : 'Unknown error'
        }
      };
    }
  }

  /**
   * Create execution context
   */
  private createExecutionContext(
    workflow: WorkflowDefinition,
    request: WorkflowExecutionRequest
  ): ExecutionContext {
    return {
      workflow: {
        id: workflow.name,
        name: workflow.name,
        version: workflow.version || '1.0.0'
      },
      trigger: {
        event: request.triggerEvent.event || 'manual',
        timestamp: new Date().toISOString(),
        payload: request.triggerEvent
      },
      repository: request.triggerEvent.repository,
      variables: request.variables || {},
      secrets: request.secrets || {},
      execution: {
        id: this.generateExecutionId(),
        startTime: new Date().toISOString(),
        previousActions: []
      }
    };
  }

  /**
   * Save workflow to database
   */
  private async saveWorkflowToDatabase(workflow: WorkflowDefinition): Promise<void> {
    await prisma.workflow.upsert({
      where: { id: workflow.name },
      update: {
        name: workflow.name,
        description: workflow.description || null,
        enabled: workflow.enabled !== false,
        triggerConfig: workflow.trigger,
        conditions: workflow.conditions || undefined,
        actions: workflow.actions,
        metadata: {
          ...(workflow.version && { version: workflow.version }),
          ...(workflow.errorHandling && { errorHandling: workflow.errorHandling }),
          ...(workflow.timeout && { timeout: workflow.timeout }),
          ...(workflow.retryPolicy && { retryPolicy: workflow.retryPolicy }),
          ...(workflow.metadata || {})
        },
        updatedAt: new Date()
      },
      create: {
        id: workflow.name,
        name: workflow.name,
        description: workflow.description || null,
        enabled: workflow.enabled !== false,
        triggerConfig: workflow.trigger,
        conditions: workflow.conditions || undefined,
        actions: workflow.actions,
        metadata: {
          ...(workflow.version && { version: workflow.version }),
          ...(workflow.errorHandling && { errorHandling: workflow.errorHandling }),
          ...(workflow.timeout && { timeout: workflow.timeout }),
          ...(workflow.retryPolicy && { retryPolicy: workflow.retryPolicy }),
          ...(workflow.metadata || {})
        },
        createdBy: 'system', // Would be actual user in production
        createdAt: new Date(),
        updatedAt: new Date()
      }
    });
  }

  /**
   * Parse workflow from database record
   */
  private parseWorkflowFromDatabase(dbWorkflow: any): WorkflowDefinition {
    return {
      name: dbWorkflow.name,
      description: dbWorkflow.description,
      version: dbWorkflow.metadata?.version || '1.0.0',
      enabled: dbWorkflow.enabled,
      trigger: dbWorkflow.triggerConfig,
      conditions: dbWorkflow.conditions,
      actions: dbWorkflow.actions,
      errorHandling: dbWorkflow.metadata?.errorHandling,
      timeout: dbWorkflow.metadata?.timeout,
      retryPolicy: dbWorkflow.metadata?.retryPolicy,
      metadata: dbWorkflow.metadata
    };
  }

  /**
   * Get workflow statistics
   */
  private async getWorkflowStatistics(workflowName: string): Promise<any> {
    try {
      const executions = await prisma.execution.findMany({
        where: { workflowId: workflowName },
        orderBy: { startedAt: 'desc' },
        take: 100
      });

      const totalExecutions = executions.length;
      const successfulExecutions = executions.filter(e => e.status === 'COMPLETED').length;
      const successRate = totalExecutions > 0 ? successfulExecutions / totalExecutions : 0;

      const completedExecutions = executions.filter(e => e.completedAt);
      const totalDuration = completedExecutions.reduce((sum, e) => {
        return sum + (e.completedAt!.getTime() - e.startedAt.getTime());
      }, 0);
      const averageDuration = completedExecutions.length > 0 ? totalDuration / completedExecutions.length : 0;

      const lastExecuted = executions.length > 0 ? executions[0]?.startedAt : undefined;

      return {
        totalExecutions,
        successRate,
        averageDuration,
        lastExecuted
      };

    } catch (error) {
      logger.error(`Failed to get workflow statistics`, {
        workflowName,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      
      return {
        totalExecutions: 0,
        successRate: 0,
        averageDuration: 0,
        lastExecuted: undefined
      };
    }
  }

  /**
   * Update workflow statistics after execution
   */
  private async updateWorkflowStats(workflowName: string, result: ExecutionResult): Promise<void> {
    // This could update cached statistics or trigger analytics updates
    logger.debug(`Updated workflow statistics`, {
      workflowName,
      executionId: result.executionId,
      status: result.status
    });
  }

  /**
   * Process execution queue
   */
  private async processQueue(): Promise<void> {
    if (this.processing || this.executionQueue.length === 0) {
      return;
    }

    this.processing = true;

    try {
      while (this.executionQueue.length > 0) {
        const request = this.executionQueue.shift()!;
        
        try {
          await this.executeWorkflow(request);
        } catch (error) {
          logger.error(`Queued workflow execution failed`, {
            workflowName: request.workflowName,
            error: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      }
    } finally {
      this.processing = false;
    }
  }

  /**
   * Start queue processor
   */
  private startQueueProcessor(): void {
    setInterval(() => {
      this.processQueue();
    }, 1000); // Process queue every second
  }

  /**
   * Setup event handlers
   */
  private setupEventHandlers(): void {
    this.workflowEngine.on('execution:started', (data) => {
      this.emit('execution:started', data);
    });

    this.workflowEngine.on('execution:completed', (data) => {
      this.emit('execution:completed', data);
    });

    this.workflowEngine.on('execution:failed', (data) => {
      this.emit('execution:failed', data);
    });

    this.workflowEngine.on('execution:cancelled', (data) => {
      this.emit('execution:cancelled', data);
    });
  }

  /**
   * Generate execution ID
   */
  private generateExecutionId(): string {
    return `exec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}