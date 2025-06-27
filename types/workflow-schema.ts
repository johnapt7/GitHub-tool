// TypeScript interfaces for workflow definitions

export interface WorkflowDefinition {
  name: string;
  description?: string;
  version?: string;
  enabled?: boolean;
  trigger: TriggerConfig;
  conditions?: ConditionGroup;
  actions: ActionConfig[];
  errorHandling?: ErrorHandlingStrategy;
  timeout?: number; // seconds
  retryPolicy?: RetryPolicy;
  metadata?: Record<string, any>;
}

// Trigger Configuration
export interface TriggerConfig {
  type: TriggerType;
  event: GitHubEvent;
  repository?: string; // Supports wildcards like "org/*"
  branch?: string; // For push/PR events
  filters?: FilterRule[];
  schedule?: ScheduleConfig; // For scheduled triggers
}

export type TriggerType = 'webhook' | 'schedule' | 'manual' | 'api';

export type GitHubEvent = 
  | 'issues.opened' | 'issues.closed' | 'issues.labeled' | 'issues.assigned'
  | 'pull_request.opened' | 'pull_request.closed' | 'pull_request.merged'
  | 'pull_request.review_requested' | 'pull_request.synchronize'
  | 'push' | 'release.published' | 'workflow_run.completed'
  | 'check_suite.completed' | 'deployment_status' | 'repository.created';

export interface ScheduleConfig {
  cron: string;
  timezone?: string;
}

// Filter and Condition System
export interface FilterRule {
  field: string; // JSONPath-like field selector
  operator: FilterOperator;
  value?: any;
  values?: any[]; // For 'in' operator
}

export type FilterOperator = 
  | 'equals' | 'not_equals' | 'contains' | 'not_contains'
  | 'starts_with' | 'ends_with' | 'regex' | 'in' | 'not_in'
  | 'greater_than' | 'less_than' | 'greater_equal' | 'less_equal'
  | 'between' | 'is_null' | 'is_not_null' | 'exists' | 'not_exists'
  | 'matches';

export interface ConditionGroup {
  operator: LogicalOperator;
  rules: (FilterRule | ConditionGroup)[];
}

export type LogicalOperator = 'AND' | 'OR' | 'NOT';

// Action Configuration
export interface ActionConfig {
  id?: string; // Unique identifier for the action
  type: ActionType;
  name?: string; // Human-readable name
  parameters: Record<string, any>;
  condition?: ConditionGroup; // Action-specific conditions
  timeout?: number; // Action timeout in seconds
  retryPolicy?: RetryPolicy;
  onError?: ErrorAction;
  onSuccess?: SuccessAction;
  runAsync?: boolean; // Whether to run asynchronously
  dependsOn?: string[]; // IDs of actions this depends on
}

export type ActionType = 
  // GitHub Actions
  | 'github_issue_assign' | 'github_issue_unassign' | 'github_issue_label'
  | 'github_issue_comment' | 'github_issue_close' | 'github_issue_reopen'
  | 'github_pr_assign' | 'github_pr_request_review' | 'github_pr_merge'
  | 'github_pr_comment' | 'github_pr_approve' | 'github_pr_close'
  | 'github_create_branch' | 'github_create_pr' | 'github_create_issue'
  
  // Communication Actions
  | 'slack_message' | 'slack_dm' | 'email_send' | 'teams_message'
  | 'discord_message' | 'webhook_call'
  
  // Integration Actions
  | 'jira_create_ticket' | 'jira_update_ticket' | 'jira_transition'
  | 'confluence_create_page' | 'confluence_update_page'
  | 'linear_create_issue' | 'notion_create_page'
  
  // Utility Actions
  | 'delay' | 'conditional' | 'loop' | 'parallel'
  | 'http_request' | 'script_execute' | 'data_transform'
  | 'audit_log' | 'metrics_track';

// Error Handling
export interface ErrorHandlingStrategy {
  onFailure: ErrorAction;
  maxRetries?: number;
  retryDelay?: number; // seconds
  continueOnError?: boolean;
  notifyOnError?: NotificationConfig;
}

export type ErrorAction = 'stop' | 'continue' | 'retry' | 'rollback' | 'escalate';

export interface RetryPolicy {
  maxAttempts: number;
  delay: number; // seconds
  backoff?: BackoffStrategy;
  retryOn?: string[]; // Error types to retry on
}

export type BackoffStrategy = 'fixed' | 'exponential' | 'linear';

export interface SuccessAction {
  notify?: NotificationConfig;
  triggerWorkflow?: string; // Workflow ID to trigger
  updateMetadata?: Record<string, any>;
}

export interface NotificationConfig {
  channels: NotificationChannel[];
  message?: string;
  template?: string;
}

export interface NotificationChannel {
  type: 'slack' | 'email' | 'teams' | 'discord' | 'webhook';
  target: string; // Channel ID, email, URL, etc.
  condition?: ConditionGroup;
}

// Context and Variables
export interface ExecutionContext {
  workflow: {
    id: string;
    name: string;
    version: string;
  };
  trigger: {
    event: GitHubEvent;
    timestamp: string;
    payload: any;
  };
  repository?: {
    name: string;
    owner: string;
    fullName: string;
  };
  variables: Record<string, any>;
  secrets: Record<string, string>;
  execution: {
    id: string;
    startTime: string;
    previousActions: ActionResult[];
  };
}

export interface ActionResult {
  actionId: string;
  actionType: ActionType;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
  startTime: string;
  endTime?: string;
  result?: any;
  error?: string;
  retryCount: number;
}

// Validation and Schema
export interface WorkflowValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
}

export interface ValidationError {
  path: string;
  message: string;
  code: string;
}

export interface ValidationWarning {
  path: string;
  message: string;
  suggestion?: string;
}

// Built-in action parameter interfaces
export interface GitHubIssueAssignParams {
  assignee: string; // GitHub username or @team
  repository?: string; // Override default repository
}

export interface GitHubIssueLabelParams {
  labels: string[];
  mode: 'add' | 'remove' | 'set';
}

export interface GitHubIssueCommentParams {
  body: string; // Supports template variables
  update?: boolean; // Update existing comment if found
}

export interface SlackMessageParams {
  channel: string;
  message: string;
  thread?: boolean; // Reply in thread
  blocks?: any[]; // Slack Block Kit
}

export interface HttpRequestParams {
  url: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  headers?: Record<string, string>;
  body?: any;
  timeout?: number;
  followRedirects?: boolean;
}

export interface ConditionalParams {
  condition: ConditionGroup;
  onTrue: ActionConfig[];
  onFalse?: ActionConfig[];
}

export interface LoopParams {
  items: string; // JSONPath to array
  itemVariable: string; // Variable name for current item
  actions: ActionConfig[];
  maxIterations?: number;
}

// Template system for dynamic values
export interface TemplateVariable {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  description?: string;
  required?: boolean;
  defaultValue?: any;
}

// Export validation schema as const for runtime validation
export const WORKFLOW_JSON_SCHEMA = {
  $schema: "http://json-schema.org/draft-07/schema#",
  type: "object",
  required: ["name", "trigger", "actions"],
  properties: {
    name: { type: "string", minLength: 1, maxLength: 255 },
    description: { type: "string", maxLength: 1000 },
    version: { type: "string", pattern: "^\\d+\\.\\d+\\.\\d+$" },
    enabled: { type: "boolean", default: true },
    trigger: {
      type: "object",
      required: ["type", "event"],
      properties: {
        type: { enum: ["webhook", "schedule", "manual", "api"] },
        event: { type: "string" },
        repository: { type: "string" },
        branch: { type: "string" },
        filters: {
          type: "array",
          items: {
            type: "object",
            required: ["field", "operator"],
            properties: {
              field: { type: "string" },
              operator: { enum: ["equals", "not_equals", "contains", "not_contains", "starts_with", "ends_with", "regex", "in", "not_in", "greater_than", "less_than", "greater_equal", "less_equal", "is_null", "is_not_null", "exists", "not_exists"] },
              value: {},
              values: { type: "array" }
            }
          }
        },
        schedule: {
          type: "object",
          required: ["cron"],
          properties: {
            cron: { type: "string" },
            timezone: { type: "string" }
          }
        }
      }
    },
    conditions: {
      type: "object",
      required: ["operator", "rules"],
      properties: {
        operator: { enum: ["AND", "OR", "NOT"] },
        rules: { type: "array", minItems: 1 }
      }
    },
    actions: {
      type: "array",
      minItems: 1,
      items: {
        type: "object",
        required: ["type", "parameters"],
        properties: {
          id: { type: "string" },
          type: { type: "string" },
          name: { type: "string" },
          parameters: { type: "object" },
          timeout: { type: "number", minimum: 1, maximum: 3600 },
          onError: { enum: ["stop", "continue", "retry", "rollback", "escalate"] },
          runAsync: { type: "boolean", default: false },
          dependsOn: {
            type: "array",
            items: { type: "string" }
          }
        }
      }
    },
    errorHandling: {
      type: "object",
      required: ["onFailure"],
      properties: {
        onFailure: { enum: ["stop", "continue", "retry", "rollback", "escalate"] },
        maxRetries: { type: "number", minimum: 0, maximum: 10 },
        retryDelay: { type: "number", minimum: 1 },
        continueOnError: { type: "boolean" },
        notifyOnError: { type: "object" }
      }
    },
    timeout: { type: "number", minimum: 1, maximum: 86400 },
    metadata: { type: "object" }
  }
} as const;