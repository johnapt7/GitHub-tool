import { EventEmitter } from 'events';
import {
  WorkflowDefinition,
  ActionConfig,
  ExecutionContext,
  ActionResult,
  RetryPolicy,
  BackoffStrategy,
  ErrorAction,
  ConditionGroup
} from '../types/workflow-schema';
import { ExecutionHistory } from './execution-history';
import { DependencyResolver } from './dependency-resolver';
import { ActionExecutor } from './action-executor';
import { TemplateEngine } from './template-engine';
import { ConditionEvaluator, EvaluationContext } from '../utils/condition-evaluator';
import logger from '../utils/logger';

export interface WorkflowExecutionOptions {
  maxConcurrency?: number | undefined;
  defaultTimeout?: number | undefined;
  enableMetrics?: boolean | undefined;
  dryRun?: boolean | undefined;
}

export interface ExecutionResult {
  executionId: string;
  workflowId: string;
  status: 'completed' | 'failed' | 'cancelled' | 'timeout';
  startTime: Date;
  endTime: Date;
  duration: number;
  actionResults: ActionResult[];
  error?: string | undefined;
  metrics?: ExecutionMetrics | undefined;
}

export interface ExecutionMetrics {
  totalActions: number;
  successfulActions: number;
  failedActions: number;
  skippedActions: number;
  retriedActions: number;
  totalRetries: number;
  averageActionDuration: number;
  longestAction: string;
  shortestAction: string;
}

export class WorkflowEngine extends EventEmitter {
  private executionHistory: ExecutionHistory;
  private dependencyResolver: DependencyResolver;
  private actionExecutor: ActionExecutor;
  private templateEngine: TemplateEngine;
  private activeExecutions: Map<string, ExecutionContext>;
  private options: WorkflowExecutionOptions;

  constructor(options: WorkflowExecutionOptions = {}) {
    super();
    this.options = {
      maxConcurrency: 10,
      defaultTimeout: 300, // 5 minutes
      enableMetrics: true,
      dryRun: false,
      ...options
    };

    this.executionHistory = new ExecutionHistory();
    this.dependencyResolver = new DependencyResolver();
    this.actionExecutor = new ActionExecutor();
    this.templateEngine = new TemplateEngine();
    this.activeExecutions = new Map();

    this.setupEventHandlers();
  }

  /**
   * Execute a workflow with the given context
   */
  public async executeWorkflow(
    workflow: WorkflowDefinition,
    triggerContext: any,
    executionId?: string
  ): Promise<ExecutionResult> {
    const execId = executionId || this.generateExecutionId();
    const startTime = new Date();

    try {
      // Create execution context
      const context = await this.createExecutionContext(workflow, triggerContext, execId);
      this.activeExecutions.set(execId, context);

      // Start execution tracking
      await this.executionHistory.startExecution(execId, workflow, context);
      this.emit('execution:started', { executionId: execId, workflow: workflow.name });

      logger.info(`Starting workflow execution: ${workflow.name}`, {
        executionId: execId,
        workflowName: workflow.name,
        trigger: triggerContext
      });

      // Check workflow timeout
      const timeoutPromise = this.createTimeoutPromise(workflow.timeout || this.options.defaultTimeout!);
      const executionPromise = this.executeWorkflowActions(workflow, context);

      // Race between execution and timeout
      const result = await Promise.race([executionPromise, timeoutPromise]);

      if (result.status === 'timeout') {
        await this.handleExecutionTimeout(execId, workflow);
      }

      const endTime = new Date();
      const duration = endTime.getTime() - startTime.getTime();

      // Create final result
      const executionResult: ExecutionResult = {
        executionId: execId,
        workflowId: workflow.name,
        status: result.status,
        startTime,
        endTime,
        duration,
        actionResults: result.actionResults,
        error: result.error,
        metrics: this.options.enableMetrics ? this.calculateMetrics(result.actionResults, duration) : undefined
      };

      // Complete execution tracking
      await this.executionHistory.completeExecution(execId, executionResult);
      this.activeExecutions.delete(execId);

      this.emit('execution:completed', executionResult);
      logger.info(`Workflow execution completed: ${workflow.name}`, {
        executionId: execId,
        status: result.status,
        duration: `${duration}ms`
      });

      return executionResult;

    } catch (error) {
      const endTime = new Date();
      const duration = endTime.getTime() - startTime.getTime();
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      const executionResult: ExecutionResult = {
        executionId: execId,
        workflowId: workflow.name,
        status: 'failed',
        startTime,
        endTime,
        duration,
        actionResults: [],
        error: errorMessage,
        metrics: this.options.enableMetrics ? this.calculateMetrics([], duration) : undefined
      };

      await this.executionHistory.completeExecution(execId, executionResult);
      this.activeExecutions.delete(execId);

      this.emit('execution:failed', { executionId: execId, error: errorMessage });
      logger.error(`Workflow execution failed: ${workflow.name}`, {
        executionId: execId,
        error: errorMessage
      });

      throw error;
    }
  }

  /**
   * Execute workflow actions with dependency resolution
   */
  private async executeWorkflowActions(
    workflow: WorkflowDefinition,
    context: ExecutionContext
  ): Promise<{ status: 'completed' | 'failed' | 'cancelled' | 'timeout'; actionResults: ActionResult[]; error?: string }> {
    const actionResults: ActionResult[] = [];
    
    try {
      // Resolve action execution order based on dependencies
      const executionPlan = this.dependencyResolver.resolveExecutionOrder(workflow.actions);
      
      logger.debug(`Execution plan resolved`, {
        executionId: context.execution.id,
        totalStages: executionPlan.length,
        totalActions: workflow.actions.length
      });

      // Execute actions in dependency order
      for (const stage of executionPlan) {
        const stageResults = await this.executeActionStage(stage, context, actionResults);
        actionResults.push(...stageResults);

        // Check if any critical action failed and should stop execution
        const criticalFailure = stageResults.find(result => 
          result.status === 'failed' && this.shouldStopOnError(workflow.actions.find(a => a.id === result.actionId))
        );

        if (criticalFailure) {
          logger.warn(`Critical action failure, stopping execution`, {
            executionId: context.execution.id,
            failedAction: criticalFailure.actionId,
            error: criticalFailure.error
          });
          break;
        }
      }

      // Determine final status
      const hasFailures = actionResults.some(result => result.status === 'failed');
      const status = hasFailures && workflow.errorHandling?.onFailure === 'stop' ? 'failed' : 'completed';

      return {
        status,
        actionResults,
        error: hasFailures ? 'One or more actions failed' : undefined
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`Workflow execution error`, {
        executionId: context.execution.id,
        error: errorMessage
      });

      return {
        status: 'failed',
        actionResults,
        error: errorMessage
      };
    }
  }

  /**
   * Execute a stage of actions (actions that can run in parallel)
   */
  private async executeActionStage(
    actions: ActionConfig[],
    context: ExecutionContext,
    previousResults: ActionResult[]
  ): Promise<ActionResult[]> {
    const concurrentExecutions: Promise<ActionResult>[] = [];
    const stageResults: ActionResult[] = [];

    // Update context with previous results
    context.execution.previousActions = previousResults;

    // Start concurrent executions for this stage
    for (const action of actions) {
      if (action.runAsync) {
        // Start async execution
        const execution = this.executeAction(action, context);
        concurrentExecutions.push(execution);
      } else {
        // Execute synchronously
        const result = await this.executeAction(action, context);
        stageResults.push(result);
        
        // Update context with this result for subsequent actions
        context.execution.previousActions = [...previousResults, ...stageResults];
      }
    }

    // Wait for all concurrent executions to complete
    if (concurrentExecutions.length > 0) {
      const concurrentResults = await Promise.allSettled(concurrentExecutions);
      
      concurrentResults.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          stageResults.push(result.value);
        } else {
          // Create failed result for rejected promise
          const action = actions.filter(a => a.runAsync)[index];
          stageResults.push({
            actionId: action.id || `action-${index}`,
            actionType: action.type,
            status: 'failed',
            startTime: new Date().toISOString(),
            endTime: new Date().toISOString(),
            error: result.reason instanceof Error ? result.reason.message : 'Unknown error',
            retryCount: 0
          });
        }
      });
    }

    return stageResults;
  }

  /**
   * Execute a single action with retry logic
   */
  private async executeAction(
    action: ActionConfig,
    context: ExecutionContext
  ): Promise<ActionResult> {
    const actionId = action.id || `action-${Date.now()}`;
    const startTime = new Date();
    let retryCount = 0;
    let lastError: string | undefined;

    const result: ActionResult = {
      actionId,
      actionType: action.type,
      status: 'pending',
      startTime: startTime.toISOString(),
      retryCount: 0
    };

    // Update execution history
    await this.executionHistory.updateActionStatus(context.execution.id, actionId, 'running');

    try {
      // Check action condition if specified
      if (action.condition && !await this.evaluateCondition(action.condition, context)) {
        result.status = 'skipped';
        result.endTime = new Date().toISOString();
        
        logger.debug(`Action skipped due to condition`, {
          executionId: context.execution.id,
          actionId,
          actionType: action.type
        });
        
        return result;
      }

      // Resolve template variables in action parameters
      const resolvedParameters = await this.templateEngine.resolveTemplate(action.parameters, context);
      
      logger.debug(`Executing action`, {
        executionId: context.execution.id,
        actionId,
        actionType: action.type,
        parameters: resolvedParameters
      });

      // Execute with retry logic
      const maxAttempts = this.getMaxRetryAttempts(action);
      
      for (let attempt = 0; attempt <= maxAttempts; attempt++) {
        retryCount = attempt;
        result.retryCount = retryCount;
        
        try {
          // Execute the action
          result.status = 'running';
          const actionResult = await this.executeActionWithTimeout(action, resolvedParameters, context);
          
          result.status = 'completed';
          result.result = actionResult;
          result.endTime = new Date().toISOString();
          
          logger.debug(`Action completed successfully`, {
            executionId: context.execution.id,
            actionId,
            attempt: attempt + 1,
            result: actionResult
          });
          
          break; // Success, exit retry loop
          
        } catch (error) {
          lastError = error instanceof Error ? error.message : 'Unknown error';
          
          logger.warn(`Action attempt failed`, {
            executionId: context.execution.id,
            actionId,
            attempt: attempt + 1,
            error: lastError
          });
          
          // Check if we should retry
          if (attempt < maxAttempts && this.shouldRetryAction(action, error)) {
            const delay = this.calculateRetryDelay(action, attempt);
            logger.debug(`Retrying action after delay`, {
              executionId: context.execution.id,
              actionId,
              attempt: attempt + 1,
              delay: `${delay}ms`
            });
            
            await this.delay(delay);
          } else {
            // Max attempts reached or shouldn't retry
            result.status = 'failed';
            result.error = lastError;
            result.endTime = new Date().toISOString();
            break;
          }
        }
      }

      // Update execution history
      await this.executionHistory.updateActionStatus(
        context.execution.id,
        actionId,
        result.status,
        result.result,
        result.error
      );

      return result;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      result.status = 'failed';
      result.error = errorMessage;
      result.endTime = new Date().toISOString();
      
      logger.error(`Action execution failed`, {
        executionId: context.execution.id,
        actionId,
        error: errorMessage
      });

      await this.executionHistory.updateActionStatus(
        context.execution.id,
        actionId,
        'failed',
        undefined,
        errorMessage
      );

      return result;
    }
  }

  /**
   * Execute action with timeout
   */
  private async executeActionWithTimeout(
    action: ActionConfig,
    parameters: any,
    context: ExecutionContext
  ): Promise<any> {
    const timeout = action.timeout || this.options.defaultTimeout!;
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error(`Action timeout after ${timeout}s`)), timeout * 1000);
    });

    const executionPromise = this.actionExecutor.execute(action.type, parameters, context);

    return Promise.race([executionPromise, timeoutPromise]);
  }

  /**
   * Calculate retry delay with exponential backoff
   */
  private calculateRetryDelay(action: ActionConfig, attempt: number): number {
    const retryPolicy = action.retryPolicy;
    if (!retryPolicy) return 1000; // Default 1 second

    const baseDelay = retryPolicy.delay * 1000; // Convert to milliseconds
    const backoff = retryPolicy.backoff || 'fixed';

    switch (backoff) {
      case 'exponential':
        return baseDelay * Math.pow(2, attempt);
      case 'linear':
        return baseDelay * (attempt + 1);
      case 'fixed':
      default:
        return baseDelay;
    }
  }

  /**
   * Get maximum retry attempts for an action
   */
  private getMaxRetryAttempts(action: ActionConfig): number {
    if (action.retryPolicy?.maxAttempts) {
      return action.retryPolicy.maxAttempts - 1; // Subtract 1 because first attempt is not a retry
    }
    return 0; // No retries by default
  }

  /**
   * Check if action should be retried based on error
   */
  private shouldRetryAction(action: ActionConfig, error: any): boolean {
    if (!action.retryPolicy) return false;
    
    // If specific error types are specified, check if current error matches
    if (action.retryPolicy.retryOn) {
      const errorType = error instanceof Error ? error.constructor.name : 'Error';
      return action.retryPolicy.retryOn.includes(errorType);
    }
    
    // Default: retry on any error
    return true;
  }

  /**
   * Check if execution should stop on action error
   */
  private shouldStopOnError(action?: ActionConfig): boolean {
    if (!action) return false;
    return action.onError === 'stop';
  }

  /**
   * Create execution context
   */
  private async createExecutionContext(
    workflow: WorkflowDefinition,
    triggerContext: any,
    executionId: string
  ): Promise<ExecutionContext> {
    return {
      workflow: {
        id: workflow.name,
        name: workflow.name,
        version: workflow.version || '1.0.0'
      },
      trigger: {
        event: triggerContext.event,
        timestamp: new Date().toISOString(),
        payload: triggerContext.payload
      },
      repository: triggerContext.repository,
      variables: triggerContext.variables || {},
      secrets: triggerContext.secrets || {},
      execution: {
        id: executionId,
        startTime: new Date().toISOString(),
        previousActions: []
      }
    };
  }

  /**
   * Evaluate condition against context
   */
  private async evaluateCondition(condition: ConditionGroup, context: ExecutionContext): Promise<boolean> {
    try {
      // Convert ExecutionContext to EvaluationContext
      const evalContext: EvaluationContext = {
        workflow: context.workflow,
        trigger: context.trigger,
        repository: context.repository,
        variables: context.variables,
        secrets: context.secrets,
        execution: context.execution,
        // Add any additional context data that might be needed
        event: context.trigger.payload,
        sender: context.trigger.payload?.sender,
        installation: context.trigger.payload?.installation
      };

      // Evaluate the condition using ConditionEvaluator
      return ConditionEvaluator.evaluate(condition, evalContext);
    } catch (error) {
      logger.error('Failed to evaluate condition', {
        executionId: context.execution.id,
        condition,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      // Return false on error to skip the action
      return false;
    }
  }

  /**
   * Create timeout promise
   */
  private createTimeoutPromise(timeoutSeconds: number): Promise<{ status: 'timeout'; actionResults: ActionResult[] }> {
    return new Promise(resolve => {
      setTimeout(() => {
        resolve({ status: 'timeout', actionResults: [] });
      }, timeoutSeconds * 1000);
    });
  }

  /**
   * Handle execution timeout
   */
  private async handleExecutionTimeout(executionId: string, workflow: WorkflowDefinition): Promise<void> {
    logger.warn(`Workflow execution timeout`, {
      executionId,
      workflowName: workflow.name
    });

    // Cancel any pending actions
    // This would integrate with action cancellation logic
    this.emit('execution:timeout', { executionId, workflow: workflow.name });
  }

  /**
   * Calculate execution metrics
   */
  private calculateMetrics(actionResults: ActionResult[], duration: number): ExecutionMetrics {
    const successful = actionResults.filter(r => r.status === 'completed').length;
    const failed = actionResults.filter(r => r.status === 'failed').length;
    const skipped = actionResults.filter(r => r.status === 'skipped').length;
    const retried = actionResults.filter(r => r.retryCount > 0).length;
    const totalRetries = actionResults.reduce((sum, r) => sum + r.retryCount, 0);

    // Calculate action durations
    const durations = actionResults
      .filter(r => r.startTime && r.endTime)
      .map(r => new Date(r.endTime!).getTime() - new Date(r.startTime).getTime());

    const averageDuration = durations.length > 0 ? durations.reduce((a, b) => a + b, 0) / durations.length : 0;
    const longestDuration = durations.length > 0 ? Math.max(...durations) : 0;
    const shortestDuration = durations.length > 0 ? Math.min(...durations) : 0;

    const longestAction = actionResults.find(r => {
      if (!r.startTime || !r.endTime) return false;
      const duration = new Date(r.endTime).getTime() - new Date(r.startTime).getTime();
      return duration === longestDuration;
    })?.actionId || 'unknown';

    const shortestAction = actionResults.find(r => {
      if (!r.startTime || !r.endTime) return false;
      const duration = new Date(r.endTime).getTime() - new Date(r.startTime).getTime();
      return duration === shortestDuration;
    })?.actionId || 'unknown';

    return {
      totalActions: actionResults.length,
      successfulActions: successful,
      failedActions: failed,
      skippedActions: skipped,
      retriedActions: retried,
      totalRetries,
      averageActionDuration: averageDuration,
      longestAction,
      shortestAction
    };
  }

  /**
   * Generate unique execution ID
   */
  private generateExecutionId(): string {
    return `exec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Utility delay function
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Setup event handlers
   */
  private setupEventHandlers(): void {
    this.on('execution:started', (data) => {
      logger.info(`Workflow execution started`, data);
    });

    this.on('execution:completed', (data) => {
      logger.info(`Workflow execution completed`, {
        executionId: data.executionId,
        status: data.status,
        duration: data.duration
      });
    });

    this.on('execution:failed', (data) => {
      logger.error(`Workflow execution failed`, data);
    });
  }

  /**
   * Get active executions
   */
  public getActiveExecutions(): string[] {
    return Array.from(this.activeExecutions.keys());
  }

  /**
   * Cancel execution
   */
  public async cancelExecution(executionId: string): Promise<boolean> {
    const context = this.activeExecutions.get(executionId);
    if (!context) {
      return false;
    }

    logger.info(`Cancelling workflow execution`, { executionId });
    
    // Mark execution as cancelled
    await this.executionHistory.updateExecutionStatus(executionId, 'cancelled');
    this.activeExecutions.delete(executionId);
    
    this.emit('execution:cancelled', { executionId });
    return true;
  }

  /**
   * Get execution history
   */
  public getExecutionHistory(): ExecutionHistory {
    return this.executionHistory;
  }
}