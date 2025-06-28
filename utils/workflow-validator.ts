import Ajv, { ValidateFunction } from 'ajv';
import addFormats from 'ajv-formats';
import {
  WorkflowDefinition,
  WorkflowValidationResult,
  ValidationError,
  ValidationWarning,
  WORKFLOW_JSON_SCHEMA,
  ActionType,
  GitHubEvent,
  FilterOperator
} from '../types/workflow-schema';

export class WorkflowValidator {
  private ajv: InstanceType<typeof Ajv>;
  private validateSchema: ValidateFunction;

  constructor() {
    this.ajv = new Ajv({ allErrors: true, verbose: true });
    addFormats(this.ajv);
    this.validateSchema = this.ajv.compile(WORKFLOW_JSON_SCHEMA);
  }

  /**
   * Validates a workflow definition against the JSON schema and business rules
   */
  public validate(workflow: WorkflowDefinition): WorkflowValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    // Schema validation
    const isValid = this.validateSchema(workflow);
    if (!isValid && this.validateSchema.errors) {
      errors.push(...this.validateSchema.errors.map((err) => ({
        path: err.schemaPath || 'root',
        message: err.message || 'Schema validation failed',
        code: err.keyword || 'SCHEMA_ERROR'
      })));
    }

    // Business logic validation
    this.validateBusinessRules(workflow, errors, warnings);

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }

  private validateBusinessRules(
    workflow: WorkflowDefinition,
    errors: ValidationError[],
    warnings: ValidationWarning[]
  ): void {
    // Validate trigger configuration
    this.validateTrigger(workflow, errors, warnings);

    // Validate actions
    this.validateActions(workflow, errors, warnings);

    // Validate conditions
    if (workflow.conditions) {
      this.validateConditionGroup(workflow.conditions, 'conditions', errors, warnings);
    }

    // Validate dependencies
    this.validateActionDependencies(workflow, errors, warnings);

    // Validate timeouts
    this.validateTimeouts(workflow, errors, warnings);

    // Performance warnings
    this.generatePerformanceWarnings(workflow, warnings);
  }

  private validateTrigger(
    workflow: WorkflowDefinition,
    errors: ValidationError[],
    warnings: ValidationWarning[]
  ): void {
    const { trigger } = workflow;

    // Validate GitHub event types
    if (trigger.type === 'webhook') {
      const validEvents: GitHubEvent[] = [
        'issues.opened', 'issues.closed', 'issues.labeled', 'issues.assigned',
        'pull_request.opened', 'pull_request.closed', 'pull_request.merged',
        'pull_request.review_requested', 'pull_request.synchronize',
        'push', 'release.published', 'workflow_run.completed',
        'check_suite.completed', 'deployment_status', 'repository.created'
      ];

      if (!validEvents.includes(trigger.event as GitHubEvent)) {
        errors.push({
          path: 'trigger.event',
          message: `Invalid GitHub event: ${trigger.event}`,
          code: 'INVALID_EVENT'
        });
      }
    }

    // Validate schedule format
    if (trigger.type === 'schedule' && trigger.schedule) {
      if (!this.isValidCronExpression(trigger.schedule.cron)) {
        errors.push({
          path: 'trigger.schedule.cron',
          message: 'Invalid cron expression',
          code: 'INVALID_CRON'
        });
      }
    }

    // Validate repository patterns
    if (trigger.repository) {
      if (!this.isValidRepositoryPattern(trigger.repository)) {
        errors.push({
          path: 'trigger.repository',
          message: 'Invalid repository pattern',
          code: 'INVALID_REPOSITORY_PATTERN'
        });
      }
    }

    // Validate filters
    if (trigger.filters) {
      trigger.filters.forEach((filter, index) => {
        this.validateFilter(filter, `trigger.filters[${index}]`, errors, warnings);
      });
    }
  }

  private validateActions(
    workflow: WorkflowDefinition,
    errors: ValidationError[],
    warnings: ValidationWarning[]
  ): void {
    const { actions } = workflow;

    if (!actions || actions.length === 0) {
      errors.push({
        path: 'actions',
        message: 'Workflow must have at least one action',
        code: 'NO_ACTIONS'
      });
      return;
    }

    // Check for duplicate action IDs
    const actionIds = new Set<string>();
    actions.forEach((action, index) => {
      if (action.id) {
        if (actionIds.has(action.id)) {
          errors.push({
            path: `actions[${index}].id`,
            message: `Duplicate action ID: ${action.id}`,
            code: 'DUPLICATE_ACTION_ID'
          });
        }
        actionIds.add(action.id);
      }
    });

    // Validate each action
    actions.forEach((action, index) => {
      this.validateAction(action, `actions[${index}]`, errors, warnings);
    });
  }

  private validateAction(
    action: any,
    path: string,
    errors: ValidationError[],
    warnings: ValidationWarning[]
  ): void {
    // Validate action type
    const validActionTypes: ActionType[] = [
      'github_issue_assign', 'github_issue_unassign', 'github_issue_label',
      'github_issue_comment', 'github_issue_close', 'github_issue_reopen',
      'github_pr_assign', 'github_pr_request_review', 'github_pr_merge',
      'github_pr_comment', 'github_pr_approve', 'github_pr_close',
      'github_create_branch', 'github_create_pr', 'github_create_issue',
      'slack_message', 'slack_dm', 'email_send', 'teams_message',
      'discord_message', 'webhook_call',
      'jira_create_ticket', 'jira_update_ticket', 'jira_transition',
      'confluence_create_page', 'confluence_update_page',
      'linear_create_issue', 'notion_create_page',
      'delay', 'conditional', 'loop', 'parallel',
      'http_request', 'script_execute', 'data_transform',
      'audit_log', 'metrics_track'
    ];

    if (!validActionTypes.includes(action.type)) {
      errors.push({
        path: `${path}.type`,
        message: `Invalid action type: ${action.type}`,
        code: 'INVALID_ACTION_TYPE'
      });
    }

    // Validate action-specific parameters
    this.validateActionParameters(action, path, errors, warnings);

    // Validate conditions
    if (action.condition) {
      this.validateConditionGroup(action.condition, `${path}.condition`, errors, warnings);
    }

    // Validate timeout
    if (action.timeout && (action.timeout < 1 || action.timeout > 3600)) {
      errors.push({
        path: `${path}.timeout`,
        message: 'Action timeout must be between 1 and 3600 seconds',
        code: 'INVALID_TIMEOUT'
      });
    }
  }

  private validateActionParameters(
    action: any,
    path: string,
    errors: ValidationError[],
    warnings: ValidationWarning[]
  ): void {
    const { type, parameters } = action;

    if (!parameters || typeof parameters !== 'object') {
      errors.push({
        path: `${path}.parameters`,
        message: 'Action parameters must be an object',
        code: 'INVALID_PARAMETERS'
      });
      return;
    }

    // Validate specific action types
    switch (type) {
      case 'github_issue_assign':
        if (!parameters.assignee) {
          errors.push({
            path: `${path}.parameters.assignee`,
            message: 'Assignee is required for github_issue_assign',
            code: 'MISSING_ASSIGNEE'
          });
        }
        break;

      case 'slack_message':
        if (!parameters.channel) {
          errors.push({
            path: `${path}.parameters.channel`,
            message: 'Channel is required for slack_message',
            code: 'MISSING_CHANNEL'
          });
        }
        if (!parameters.message) {
          errors.push({
            path: `${path}.parameters.message`,
            message: 'Message is required for slack_message',
            code: 'MISSING_MESSAGE'
          });
        }
        break;

      case 'http_request':
        if (!parameters.url) {
          errors.push({
            path: `${path}.parameters.url`,
            message: 'URL is required for http_request',
            code: 'MISSING_URL'
          });
        }
        if (!parameters.method) {
          errors.push({
            path: `${path}.parameters.method`,
            message: 'Method is required for http_request',
            code: 'MISSING_METHOD'
          });
        }
        break;

      case 'delay':
        if (!parameters.duration || typeof parameters.duration !== 'number') {
          errors.push({
            path: `${path}.parameters.duration`,
            message: 'Duration (number) is required for delay action',
            code: 'MISSING_DURATION'
          });
        }
        break;

      case 'conditional':
        if (!parameters.condition) {
          errors.push({
            path: `${path}.parameters.condition`,
            message: 'Condition is required for conditional action',
            code: 'MISSING_CONDITION'
          });
        }
        if (!parameters.onTrue) {
          errors.push({
            path: `${path}.parameters.onTrue`,
            message: 'onTrue actions are required for conditional action',
            code: 'MISSING_ON_TRUE'
          });
        }
        break;

      case 'loop':
        if (!parameters.items) {
          errors.push({
            path: `${path}.parameters.items`,
            message: 'Items selector is required for loop action',
            code: 'MISSING_ITEMS'
          });
        }
        if (!parameters.actions) {
          errors.push({
            path: `${path}.parameters.actions`,
            message: 'Actions array is required for loop action',
            code: 'MISSING_LOOP_ACTIONS'
          });
        }
        break;
    }
  }

  private validateConditionGroup(
    condition: any,
    path: string,
    errors: ValidationError[],
    warnings: ValidationWarning[]
  ): void {
    if (!condition.operator || !['AND', 'OR', 'NOT'].includes(condition.operator)) {
      errors.push({
        path: `${path}.operator`,
        message: 'Condition operator must be AND, OR, or NOT',
        code: 'INVALID_OPERATOR'
      });
    }

    if (!condition.rules || !Array.isArray(condition.rules) || condition.rules.length === 0) {
      errors.push({
        path: `${path}.rules`,
        message: 'Condition must have at least one rule',
        code: 'NO_RULES'
      });
      return;
    }

    condition.rules.forEach((rule: any, index: number) => {
      if (rule.operator && rule.field) {
        // It's a filter rule
        this.validateFilter(rule, `${path}.rules[${index}]`, errors, warnings);
      } else if (rule.operator && rule.rules) {
        // It's a nested condition group
        this.validateConditionGroup(rule, `${path}.rules[${index}]`, errors, warnings);
      } else {
        errors.push({
          path: `${path}.rules[${index}]`,
          message: 'Rule must be either a filter or condition group',
          code: 'INVALID_RULE'
        });
      }
    });
  }

  private validateFilter(
    filter: any,
    path: string,
    errors: ValidationError[],
    warnings: ValidationWarning[]
  ): void {
    const validOperators: FilterOperator[] = [
      'equals', 'not_equals', 'contains', 'not_contains',
      'starts_with', 'ends_with', 'regex', 'in', 'not_in',
      'greater_than', 'less_than', 'greater_equal', 'less_equal',
      'is_null', 'is_not_null', 'exists', 'not_exists'
    ];

    if (!validOperators.includes(filter.operator)) {
      errors.push({
        path: `${path}.operator`,
        message: `Invalid filter operator: ${filter.operator}`,
        code: 'INVALID_FILTER_OPERATOR'
      });
    }

    // Validate that operators requiring values have them
    const operatorsRequiringValue = [
      'equals', 'not_equals', 'contains', 'not_contains',
      'starts_with', 'ends_with', 'regex',
      'greater_than', 'less_than', 'greater_equal', 'less_equal'
    ];

    const operatorsRequiringValues = ['in', 'not_in'];

    if (operatorsRequiringValue.includes(filter.operator) && filter.value === undefined) {
      errors.push({
        path: `${path}.value`,
        message: `Operator ${filter.operator} requires a value`,
        code: 'MISSING_VALUE'
      });
    }

    if (operatorsRequiringValues.includes(filter.operator) && !filter.values) {
      errors.push({
        path: `${path}.values`,
        message: `Operator ${filter.operator} requires a values array`,
        code: 'MISSING_VALUES'
      });
    }

    // Validate regex patterns
    if (filter.operator === 'regex' && filter.value) {
      try {
        new RegExp(filter.value);
      } catch (e) {
        errors.push({
          path: `${path}.value`,
          message: `Invalid regex pattern: ${filter.value}`,
          code: 'INVALID_REGEX'
        });
      }
    }
  }

  private validateActionDependencies(
    workflow: WorkflowDefinition,
    errors: ValidationError[],
    warnings: ValidationWarning[]
  ): void {
    const actionIds = new Set(workflow.actions.map(a => a.id).filter(Boolean));

    workflow.actions.forEach((action, index) => {
      if (action.dependsOn) {
        action.dependsOn.forEach((depId: string) => {
          if (!actionIds.has(depId)) {
            errors.push({
              path: `actions[${index}].dependsOn`,
              message: `Action depends on unknown action ID: ${depId}`,
              code: 'UNKNOWN_DEPENDENCY'
            });
          }
        });
      }
    });

    // Check for circular dependencies
    if (this.hasCircularDependencies(workflow.actions)) {
      errors.push({
        path: 'actions',
        message: 'Circular dependencies detected in actions',
        code: 'CIRCULAR_DEPENDENCY'
      });
    }
  }

  private validateTimeouts(
    workflow: WorkflowDefinition,
    errors: ValidationError[],
    warnings: ValidationWarning[]
  ): void {
    if (workflow.timeout && workflow.timeout > 86400) {
      warnings.push({
        path: 'timeout',
        message: 'Workflow timeout is very long (> 24 hours)',
        suggestion: 'Consider breaking into smaller workflows'
      });
    }

    // Check if total action timeouts exceed workflow timeout
    const totalActionTimeouts = workflow.actions.reduce((sum, action) => {
      return sum + (action.timeout || 60); // Default 60s per action
    }, 0);

    if (workflow.timeout && totalActionTimeouts > workflow.timeout) {
      warnings.push({
        path: 'timeout',
        message: 'Sum of action timeouts exceeds workflow timeout',
        suggestion: 'Increase workflow timeout or reduce action timeouts'
      });
    }
  }

  private generatePerformanceWarnings(
    workflow: WorkflowDefinition,
    warnings: ValidationWarning[]
  ): void {
    // Too many actions
    if (workflow.actions.length > 20) {
      warnings.push({
        path: 'actions',
        message: 'Workflow has many actions (> 20)',
        suggestion: 'Consider breaking into multiple workflows'
      });
    }

    // Deep nesting in conditions
    const maxDepth = this.getMaxConditionDepth(workflow.conditions);
    if (maxDepth > 3) {
      warnings.push({
        path: 'conditions',
        message: 'Condition nesting is very deep',
        suggestion: 'Consider simplifying condition logic'
      });
    }

    // No error handling
    if (!workflow.errorHandling) {
      warnings.push({
        path: 'errorHandling',
        message: 'No error handling strategy defined',
        suggestion: 'Add error handling to make workflow more robust'
      });
    }
  }

  private isValidCronExpression(cron: string): boolean {
    // Basic cron validation (5 or 6 fields)
    const parts = cron.trim().split(/\s+/);
    return parts.length === 5 || parts.length === 6;
  }

  private isValidRepositoryPattern(pattern: string): boolean {
    // Basic repository pattern validation
    return /^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.*-]+$/.test(pattern);
  }

  private hasCircularDependencies(actions: any[]): boolean {
    const graph = new Map<string, string[]>();
    const visited = new Set<string>();
    const recursionStack = new Set<string>();

    // Build dependency graph
    actions.forEach(action => {
      if (action.id) {
        graph.set(action.id, action.dependsOn || []);
      }
    });

    // DFS to detect cycles
    const hasCycle = (nodeId: string): boolean => {
      if (recursionStack.has(nodeId)) return true;
      if (visited.has(nodeId)) return false;

      visited.add(nodeId);
      recursionStack.add(nodeId);

      const dependencies = graph.get(nodeId) || [];
      for (const depId of dependencies) {
        if (hasCycle(depId)) return true;
      }

      recursionStack.delete(nodeId);
      return false;
    };

    return Array.from(graph.keys()).some(nodeId => hasCycle(nodeId));
  }

  private getMaxConditionDepth(condition: any, currentDepth: number = 0): number {
    if (!condition || !condition.rules) return currentDepth;

    let maxDepth = currentDepth;
    condition.rules.forEach((rule: any) => {
      if (rule.rules) {
        // Nested condition group
        const depth = this.getMaxConditionDepth(rule, currentDepth + 1);
        maxDepth = Math.max(maxDepth, depth);
      }
    });

    return maxDepth;
  }
}

// Export singleton instance
export const workflowValidator = new WorkflowValidator();