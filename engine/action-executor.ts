import { ActionType, ExecutionContext } from '../types/workflow-schema';
import { logger } from '../utils/logger';

export interface ActionExecutorResult {
  success: boolean;
  result?: any;
  error?: string;
  metadata?: Record<string, any>;
}

export abstract class BaseActionExecutor {
  abstract execute(parameters: any, context: ExecutionContext): Promise<ActionExecutorResult>;
  
  protected validateParameters(parameters: any, required: string[]): void {
    for (const param of required) {
      if (parameters[param] === undefined || parameters[param] === null) {
        throw new Error(`Required parameter '${param}' is missing`);
      }
    }
  }

  protected sanitizeParameters(parameters: any): any {
    // Remove any potentially dangerous parameters
    const sanitized = { ...parameters };
    delete sanitized.__proto__;
    delete sanitized.constructor;
    return sanitized;
  }
}

// GitHub Action Executors
export class GitHubIssueAssignExecutor extends BaseActionExecutor {
  async execute(parameters: any, context: ExecutionContext): Promise<ActionExecutorResult> {
    this.validateParameters(parameters, ['assignee']);
    const { assignee, repository } = this.sanitizeParameters(parameters);

    try {
      // Simulate GitHub API call
      const repoName = repository || context.repository?.fullName;
      const issueNumber = context.trigger.payload?.issue?.number;

      if (!issueNumber) {
        throw new Error('No issue number found in trigger context');
      }

      logger.info(`Assigning issue to user`, {
        repository: repoName,
        issue: issueNumber,
        assignee
      });

      // In real implementation, this would call GitHub API
      const result = {
        assignee,
        issue: issueNumber,
        repository: repoName,
        assigned_at: new Date().toISOString()
      };

      return {
        success: true,
        result,
        metadata: {
          apiCall: 'github.issues.addAssignees',
          executionTime: Date.now()
        }
      };

    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }
}

export class GitHubIssueLabelExecutor extends BaseActionExecutor {
  async execute(parameters: any, context: ExecutionContext): Promise<ActionExecutorResult> {
    this.validateParameters(parameters, ['labels']);
    const { labels, mode = 'add' } = this.sanitizeParameters(parameters);

    try {
      const issueNumber = context.trigger.payload?.issue?.number;
      if (!issueNumber) {
        throw new Error('No issue number found in trigger context');
      }

      logger.info(`Managing issue labels`, {
        issue: issueNumber,
        labels,
        mode
      });

      const result = {
        labels,
        mode,
        issue: issueNumber,
        updated_at: new Date().toISOString()
      };

      return {
        success: true,
        result,
        metadata: {
          apiCall: `github.issues.${mode}Labels`,
          executionTime: Date.now()
        }
      };

    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }
}

export class GitHubIssueCommentExecutor extends BaseActionExecutor {
  async execute(parameters: any, context: ExecutionContext): Promise<ActionExecutorResult> {
    this.validateParameters(parameters, ['body']);
    const { body, update = false } = this.sanitizeParameters(parameters);

    try {
      const issueNumber = context.trigger.payload?.issue?.number;
      if (!issueNumber) {
        throw new Error('No issue number found in trigger context');
      }

      logger.info(`Adding comment to issue`, {
        issue: issueNumber,
        bodyLength: body.length,
        update
      });

      const result = {
        body,
        issue: issueNumber,
        comment_id: `comment_${Date.now()}`,
        created_at: new Date().toISOString()
      };

      return {
        success: true,
        result,
        metadata: {
          apiCall: 'github.issues.createComment',
          executionTime: Date.now()
        }
      };

    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }
}

export class GitHubPRRequestReviewExecutor extends BaseActionExecutor {
  async execute(parameters: any, context: ExecutionContext): Promise<ActionExecutorResult> {
    const { reviewers = [], teams = [] } = this.sanitizeParameters(parameters);

    if (reviewers.length === 0 && teams.length === 0) {
      throw new Error('At least one reviewer or team must be specified');
    }

    try {
      const prNumber = context.trigger.payload?.pull_request?.number;
      if (!prNumber) {
        throw new Error('No pull request number found in trigger context');
      }

      logger.info(`Requesting PR review`, {
        pr: prNumber,
        reviewers,
        teams
      });

      const result = {
        reviewers,
        teams,
        pull_request: prNumber,
        requested_at: new Date().toISOString()
      };

      return {
        success: true,
        result,
        metadata: {
          apiCall: 'github.pulls.requestReviewers',
          executionTime: Date.now()
        }
      };

    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }
}

// Communication Action Executors
export class SlackMessageExecutor extends BaseActionExecutor {
  async execute(parameters: any, context: ExecutionContext): Promise<ActionExecutorResult> {
    this.validateParameters(parameters, ['channel', 'message']);
    const { channel, message, thread = false, blocks } = this.sanitizeParameters(parameters);

    try {
      logger.info(`Sending Slack message`, {
        channel,
        messageLength: message.length,
        thread,
        hasBlocks: !!blocks
      });

      // Simulate Slack API call
      const result = {
        channel,
        message,
        thread,
        blocks,
        message_id: `msg_${Date.now()}`,
        sent_at: new Date().toISOString()
      };

      return {
        success: true,
        result,
        metadata: {
          apiCall: 'slack.chat.postMessage',
          executionTime: Date.now()
        }
      };

    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }
}

export class EmailSendExecutor extends BaseActionExecutor {
  async execute(parameters: any, context: ExecutionContext): Promise<ActionExecutorResult> {
    this.validateParameters(parameters, ['to', 'subject', 'body']);
    const { to, subject, body, cc, bcc } = this.sanitizeParameters(parameters);

    try {
      logger.info(`Sending email`, {
        to: Array.isArray(to) ? to.length : 1,
        subject,
        bodyLength: body.length
      });

      const result = {
        to,
        subject,
        body,
        cc,
        bcc,
        message_id: `email_${Date.now()}`,
        sent_at: new Date().toISOString()
      };

      return {
        success: true,
        result,
        metadata: {
          apiCall: 'email.send',
          executionTime: Date.now()
        }
      };

    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }
}

// HTTP Action Executor
export class HttpRequestExecutor extends BaseActionExecutor {
  async execute(parameters: any, context: ExecutionContext): Promise<ActionExecutorResult> {
    this.validateParameters(parameters, ['url', 'method']);
    const { 
      url, 
      method, 
      headers = {}, 
      body, 
      timeout = 30000,
      followRedirects = true 
    } = this.sanitizeParameters(parameters);

    try {
      logger.info(`Making HTTP request`, {
        url,
        method,
        timeout,
        hasBody: !!body
      });

      // Simulate HTTP request
      const result = {
        url,
        method,
        status: 200,
        headers: { 'content-type': 'application/json' },
        body: { success: true, timestamp: new Date().toISOString() },
        duration: Math.floor(Math.random() * 1000) + 100
      };

      return {
        success: true,
        result,
        metadata: {
          apiCall: 'http.request',
          executionTime: Date.now()
        }
      };

    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }
}

// Utility Action Executors
export class DelayExecutor extends BaseActionExecutor {
  async execute(parameters: any, context: ExecutionContext): Promise<ActionExecutorResult> {
    this.validateParameters(parameters, ['duration']);
    const { duration } = this.sanitizeParameters(parameters);

    if (typeof duration !== 'number' || duration < 0) {
      throw new Error('Duration must be a positive number');
    }

    try {
      logger.info(`Delaying execution`, { duration: `${duration}ms` });

      await new Promise(resolve => setTimeout(resolve, duration));

      const result = {
        duration,
        delayed_until: new Date().toISOString()
      };

      return {
        success: true,
        result,
        metadata: {
          apiCall: 'util.delay',
          executionTime: duration
        }
      };

    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }
}

export class ConditionalExecutor extends BaseActionExecutor {
  async execute(parameters: any, context: ExecutionContext): Promise<ActionExecutorResult> {
    this.validateParameters(parameters, ['condition', 'onTrue']);
    const { condition, onTrue, onFalse = [] } = this.sanitizeParameters(parameters);

    try {
      // Evaluate condition (simplified implementation)
      const conditionResult = this.evaluateCondition(condition, context);
      
      logger.info(`Conditional execution`, {
        conditionResult,
        onTrueActions: onTrue.length,
        onFalseActions: onFalse.length
      });

      const result = {
        condition_result: conditionResult,
        executed_path: conditionResult ? 'onTrue' : 'onFalse',
        actions_to_execute: conditionResult ? onTrue : onFalse
      };

      return {
        success: true,
        result,
        metadata: {
          apiCall: 'util.conditional',
          executionTime: Date.now()
        }
      };

    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  private evaluateCondition(condition: any, context: ExecutionContext): boolean {
    // Simplified condition evaluation
    // In real implementation, this would integrate with the condition engine
    return true;
  }
}

export class LoopExecutor extends BaseActionExecutor {
  async execute(parameters: any, context: ExecutionContext): Promise<ActionExecutorResult> {
    this.validateParameters(parameters, ['items', 'actions']);
    const { 
      items, 
      itemVariable = 'item', 
      actions, 
      maxIterations = 100 
    } = this.sanitizeParameters(parameters);

    try {
      // Get items array from context using JSONPath-like selector
      const itemsArray = this.getArrayFromContext(items, context);
      
      if (!Array.isArray(itemsArray)) {
        throw new Error(`Items selector '${items}' did not resolve to an array`);
      }

      const iterations = Math.min(itemsArray.length, maxIterations);
      
      logger.info(`Loop execution`, {
        totalItems: itemsArray.length,
        iterations,
        actionsPerIteration: actions.length
      });

      const results = [];
      for (let i = 0; i < iterations; i++) {
        results.push({
          index: i,
          item: itemsArray[i],
          [itemVariable]: itemsArray[i]
        });
      }

      const result = {
        total_items: itemsArray.length,
        processed_items: iterations,
        iterations: results,
        actions_per_iteration: actions.length
      };

      return {
        success: true,
        result,
        metadata: {
          apiCall: 'util.loop',
          executionTime: Date.now()
        }
      };

    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  private getArrayFromContext(selector: string, context: ExecutionContext): any[] {
    // Simplified JSONPath-like selector implementation
    // In real implementation, this would use a proper JSONPath library
    if (selector.startsWith('{{') && selector.endsWith('}}')) {
      const path = selector.slice(2, -2);
      return this.getValueByPath(context, path) || [];
    }
    return [];
  }

  private getValueByPath(obj: any, path: string): any {
    return path.split('.').reduce((current, key) => current?.[key], obj);
  }
}

// Main Action Executor Factory
export class ActionExecutor {
  private executors: Map<ActionType, BaseActionExecutor> = new Map();

  constructor() {
    this.registerExecutors();
  }

  private registerExecutors(): void {
    // GitHub executors
    this.executors.set('github_issue_assign', new GitHubIssueAssignExecutor());
    this.executors.set('github_issue_label', new GitHubIssueLabelExecutor());
    this.executors.set('github_issue_comment', new GitHubIssueCommentExecutor());
    this.executors.set('github_pr_request_review', new GitHubPRRequestReviewExecutor());

    // Communication executors
    this.executors.set('slack_message', new SlackMessageExecutor());
    this.executors.set('email_send', new EmailSendExecutor());

    // HTTP executor
    this.executors.set('http_request', new HttpRequestExecutor());

    // Utility executors
    this.executors.set('delay', new DelayExecutor());
    this.executors.set('conditional', new ConditionalExecutor());
    this.executors.set('loop', new LoopExecutor());
  }

  public async execute(
    actionType: ActionType,
    parameters: any,
    context: ExecutionContext
  ): Promise<any> {
    const executor = this.executors.get(actionType);
    
    if (!executor) {
      throw new Error(`No executor found for action type: ${actionType}`);
    }

    logger.debug(`Executing action`, {
      actionType,
      executionId: context.execution.id,
      parameters: this.sanitizeForLogging(parameters)
    });

    const startTime = Date.now();
    
    try {
      const result = await executor.execute(parameters, context);
      const executionTime = Date.now() - startTime;

      if (result.success) {
        logger.debug(`Action execution successful`, {
          actionType,
          executionId: context.execution.id,
          executionTime: `${executionTime}ms`
        });
        return result.result;
      } else {
        logger.warn(`Action execution failed`, {
          actionType,
          executionId: context.execution.id,
          error: result.error,
          executionTime: `${executionTime}ms`
        });
        throw new Error(result.error || 'Action execution failed');
      }

    } catch (error) {
      const executionTime = Date.now() - startTime;
      logger.error(`Action execution error`, {
        actionType,
        executionId: context.execution.id,
        error: error instanceof Error ? error.message : 'Unknown error',
        executionTime: `${executionTime}ms`
      });
      throw error;
    }
  }

  public registerExecutor(actionType: ActionType, executor: BaseActionExecutor): void {
    this.executors.set(actionType, executor);
    logger.info(`Registered custom executor for action type: ${actionType}`);
  }

  public getAvailableActionTypes(): ActionType[] {
    return Array.from(this.executors.keys());
  }

  private sanitizeForLogging(parameters: any): any {
    const sanitized = { ...parameters };
    
    // Remove sensitive information from logs
    const sensitiveKeys = ['password', 'token', 'secret', 'key', 'auth'];
    
    Object.keys(sanitized).forEach(key => {
      if (sensitiveKeys.some(sensitive => key.toLowerCase().includes(sensitive))) {
        sanitized[key] = '[REDACTED]';
      }
    });

    return sanitized;
  }
}