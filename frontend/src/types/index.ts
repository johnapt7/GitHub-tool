// Re-export backend types for frontend use
export interface Workflow {
  id: string;
  name: string;
  description?: string;
  enabled: boolean;
  version: string;
  triggerConfig: TriggerConfig;
  conditions?: ConditionGroup;
  actions: ActionConfig[];
  metadata?: Record<string, any>;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface Execution {
  id: string;
  workflowId: string;
  workflowName?: string;
  status: 'running' | 'completed' | 'failed' | 'cancelled' | 'timeout';
  triggerEvent: any;
  executionSteps?: any;
  startedAt: string;
  completedAt?: string;
  duration?: number;
  error?: string;
}

export interface AuditLog {
  id: string;
  entityType: string;
  entityId: string;
  action: string;
  userId?: string;
  changes?: any;
  createdAt: string;
  workflowId?: string;
  executionId?: string;
}

export interface TriggerConfig {
  type: 'webhook' | 'schedule' | 'manual' | 'api';
  event: string;
  repository?: string;
  branch?: string;
  filters?: FilterRule[];
  schedule?: ScheduleConfig;
}

export interface ScheduleConfig {
  cron: string;
  timezone?: string;
}

export interface FilterRule {
  field: string;
  operator: FilterOperator;
  value?: any;
  values?: any[];
}

export type FilterOperator = 
  | 'equals' | 'not_equals' | 'contains' | 'not_contains'
  | 'starts_with' | 'ends_with' | 'regex' | 'in' | 'not_in'
  | 'greater_than' | 'less_than' | 'greater_equal' | 'less_equal'
  | 'between' | 'is_null' | 'is_not_null' | 'exists' | 'not_exists';

export interface ConditionGroup {
  operator: 'AND' | 'OR' | 'NOT';
  rules: (FilterRule | ConditionGroup)[];
}

export interface ActionConfig {
  id?: string;
  type: string;
  name?: string;
  parameters: Record<string, any>;
  condition?: ConditionGroup;
  timeout?: number;
  retryPolicy?: RetryPolicy;
  onError?: 'stop' | 'continue' | 'retry' | 'rollback' | 'escalate';
  runAsync?: boolean;
  dependsOn?: string[];
}

export interface RetryPolicy {
  maxAttempts: number;
  delay: number;
  backoff?: 'fixed' | 'exponential' | 'linear';
  retryOn?: string[];
}

// UI-specific types
export interface DashboardStats {
  totalWorkflows: number;
  activeWorkflows: number;
  totalExecutions: number;
  successfulExecutions: number;
  failedExecutions: number;
  averageExecutionTime: number;
  activeExecutions: number;
  successRate: number;
}

export interface WorkflowStatus {
  name: string;
  enabled: boolean;
  version: string;
  lastExecuted?: string;
  totalExecutions: number;
  successRate: number;
  averageDuration: number;
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

export interface SystemHealth {
  status: 'healthy' | 'unhealthy' | 'degraded';
  workflowCount: number;
  activeExecutions: number;
  queueLength: number;
  memoryUsage: {
    used: number;
    total: number;
    percentage: number;
  };
  uptime: number;
  lastCheck: string;
}

export interface ExecutionChartData {
  date: string;
  completed: number;
  failed: number;
  total: number;
}

export interface APIResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

// Form types
export interface WorkflowFormData {
  name: string;
  description: string;
  enabled: boolean;
  trigger: TriggerConfig;
  conditions?: ConditionGroup;
  actions: ActionConfig[];
  errorHandling?: any;
  timeout?: number;
}

// Navigation types
export interface NavigationItem {
  name: string;
  href: string;
  icon: React.ComponentType<any>;
  current?: boolean;
  badge?: number;
}

// UI State types
export interface LoadingState {
  isLoading: boolean;
  error?: string;
}

export interface TableColumn<T> {
  key: keyof T;
  label: string;
  sortable?: boolean;
  render?: (value: any, item: T) => React.ReactNode;
}

export interface TableProps<T> {
  data: T[];
  columns: TableColumn<T>[];
  loading?: boolean;
  onSort?: (column: keyof T, direction: 'asc' | 'desc') => void;
  onRowClick?: (item: T) => void;
}

// WebSocket event types
export interface WebSocketEvent {
  type: 'execution:started' | 'execution:completed' | 'execution:failed' | 'execution:cancelled';
  data: any;
}

export type NotificationType = 'success' | 'error' | 'warning' | 'info';