'use client';

import { useState, useEffect } from 'react';
import { 
  MagnifyingGlassIcon,
  FunnelIcon,
  DocumentTextIcon,
  UserIcon,
  ClockIcon,
  EyeIcon,
} from '@heroicons/react/24/outline';
import { AuditLog } from '@/types';
import clsx from 'clsx';

// Mock audit log data
const mockAuditLogs: AuditLog[] = [
  {
    id: 'audit_001',
    entityType: 'workflow',
    entityId: 'issue-auto-assignment',
    action: 'updated',
    userId: 'john@acme.com',
    changes: {
      before: { enabled: false },
      after: { enabled: true },
      fields: ['enabled']
    },
    createdAt: '2025-06-28T10:45:00Z',
    workflowId: 'issue-auto-assignment',
  },
  {
    id: 'audit_002',
    entityType: 'execution',
    entityId: 'exec_1703851234_abc123',
    action: 'completed',
    changes: {
      status: 'completed',
      duration: 13,
      actions_executed: 2
    },
    createdAt: '2025-06-28T10:30:28Z',
    workflowId: 'issue-auto-assignment',
    executionId: 'exec_1703851234_abc123',
  },
  {
    id: 'audit_003',
    entityType: 'workflow',
    entityId: 'security-alert-handler',
    action: 'created',
    userId: 'alex@acme.com',
    changes: {
      workflow_definition: {
        name: 'Security Alert Handler',
        trigger: 'repository_vulnerability_alert',
        actions: 2
      }
    },
    createdAt: '2025-06-28T08:00:00Z',
    workflowId: 'security-alert-handler',
  },
  {
    id: 'audit_004',
    entityType: 'execution',
    entityId: 'exec_1703851089_ghi789',
    action: 'failed',
    changes: {
      status: 'failed',
      error: 'Failed to send Slack notification: Channel #security not found',
      duration: 33
    },
    createdAt: '2025-06-28T10:25:45Z',
    workflowId: 'security-alert-handler',
    executionId: 'exec_1703851089_ghi789',
  },
  {
    id: 'audit_005',
    entityType: 'workflow',
    entityId: 'pr-review-automation',
    action: 'updated',
    userId: 'sarah@acme.com',
    changes: {
      before: { actions: [{ type: 'github_pr_request_review' }] },
      after: { actions: [{ type: 'github_pr_request_review' }, { type: 'github_pr_label' }] },
      fields: ['actions']
    },
    createdAt: '2025-06-25T11:45:00Z',
    workflowId: 'pr-review-automation',
  },
];

export default function AuditLogsPage() {
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [entityTypeFilter, setEntityTypeFilter] = useState<string>('all');
  const [actionFilter, setActionFilter] = useState<string>('all');

  useEffect(() => {
    // Simulate API call
    const timer = setTimeout(() => {
      setAuditLogs(mockAuditLogs);
      setLoading(false);
    }, 500);

    return () => clearTimeout(timer);
  }, []);

  const filteredLogs = auditLogs.filter(log => {
    const matchesSearch = log.entityId.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         log.action.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         log.userId?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesEntityType = entityTypeFilter === 'all' || log.entityType === entityTypeFilter;
    const matchesAction = actionFilter === 'all' || log.action === actionFilter;
    
    return matchesSearch && matchesEntityType && matchesAction;
  });

  const formatTimeAgo = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffInMinutes = Math.floor((now.getTime() - date.getTime()) / (1000 * 60));
    
    if (diffInMinutes < 1) return 'Just now';
    if (diffInMinutes < 60) return `${diffInMinutes}m ago`;
    if (diffInMinutes < 1440) return `${Math.floor(diffInMinutes / 60)}h ago`;
    return `${Math.floor(diffInMinutes / 1440)}d ago`;
  };

  const getActionColor = (action: string) => {
    switch (action) {
      case 'created':
        return 'text-success-700 bg-success-100';
      case 'updated':
        return 'text-blue-700 bg-blue-100';
      case 'deleted':
        return 'text-error-700 bg-error-100';
      case 'completed':
        return 'text-success-700 bg-success-100';
      case 'failed':
        return 'text-error-700 bg-error-100';
      default:
        return 'text-gray-700 bg-gray-100';
    }
  };

  const getEntityIcon = (entityType: string) => {
    switch (entityType) {
      case 'workflow':
        return <DocumentTextIcon className="h-5 w-5 text-primary-600" />;
      case 'execution':
        return <ClockIcon className="h-5 w-5 text-blue-600" />;
      case 'user':
        return <UserIcon className="h-5 w-5 text-green-600" />;
      default:
        return <DocumentTextIcon className="h-5 w-5 text-gray-600" />;
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-8 bg-gray-200 rounded w-1/4 animate-pulse"></div>
        <div className="card p-6">
          <div className="space-y-4">
            {Array.from({ length: 5 }).map((_, index) => (
              <div key={index} className="animate-pulse">
                <div className="h-6 bg-gray-200 rounded w-1/2 mb-2"></div>
                <div className="h-4 bg-gray-200 rounded w-3/4 mb-2"></div>
                <div className="h-4 bg-gray-200 rounded w-1/4"></div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Audit Logs</h1>
        <p className="mt-1 text-sm text-gray-500">
          Track all changes and activities across your workflow automation system
        </p>
      </div>

      {/* Filters and search */}
      <div className="card p-6">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between space-y-4 lg:space-y-0 lg:space-x-4">
          {/* Search */}
          <div className="relative flex-1 max-w-md">
            <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
              <MagnifyingGlassIcon className="h-5 w-5 text-gray-400" />
            </div>
            <input
              type="text"
              placeholder="Search audit logs..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="input-field pl-10"
            />
          </div>

          {/* Filters */}
          <div className="flex items-center space-x-3">
            <FunnelIcon className="h-5 w-5 text-gray-400" />
            <select
              value={entityTypeFilter}
              onChange={(e) => setEntityTypeFilter(e.target.value)}
              className="input-field"
            >
              <option value="all">All entities</option>
              <option value="workflow">Workflows</option>
              <option value="execution">Executions</option>
              <option value="user">Users</option>
            </select>
            <select
              value={actionFilter}
              onChange={(e) => setActionFilter(e.target.value)}
              className="input-field"
            >
              <option value="all">All actions</option>
              <option value="created">Created</option>
              <option value="updated">Updated</option>
              <option value="deleted">Deleted</option>
              <option value="completed">Completed</option>
              <option value="failed">Failed</option>
            </select>
          </div>
        </div>
      </div>

      {/* Audit logs list */}
      <div className="space-y-4">
        {filteredLogs.map((log) => (
          <div key={log.id} className="card p-6 hover:shadow-md transition-shadow">
            <div className="flex items-start space-x-4">
              <div className="flex-shrink-0 mt-1">
                {getEntityIcon(log.entityType)}
              </div>
              
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center space-x-2">
                      <span className={clsx('status-badge', getActionColor(log.action))}>
                        {log.action}
                      </span>
                      <span className="text-sm text-gray-500">
                        {log.entityType}
                      </span>
                    </div>
                    
                    <h3 className="mt-2 text-sm font-medium text-gray-900">
                      {log.entityType === 'workflow' && `Workflow: ${log.entityId}`}
                      {log.entityType === 'execution' && `Execution: ${log.entityId.slice(0, 20)}...`}
                      {log.entityType === 'user' && `User: ${log.entityId}`}
                    </h3>
                    
                    {log.userId && (
                      <p className="mt-1 text-sm text-gray-600">
                        By: {log.userId}
                      </p>
                    )}
                    
                    {/* Changes summary */}
                    {log.changes && (
                      <div className="mt-3 text-sm text-gray-600">
                        {log.action === 'updated' && log.changes.fields && (
                          <p>Modified: {log.changes.fields.join(', ')}</p>
                        )}
                        {log.action === 'completed' && log.changes.duration && (
                          <p>Duration: {log.changes.duration}s</p>
                        )}
                        {log.action === 'failed' && log.changes.error && (
                          <p className="text-error-600">Error: {log.changes.error}</p>
                        )}
                        {log.action === 'created' && log.changes.workflow_definition && (
                          <p>Created workflow with {log.changes.workflow_definition.actions} actions</p>
                        )}
                      </div>
                    )}
                  </div>
                  
                  <div className="flex items-center space-x-2 ml-4">
                    <span className="text-sm text-gray-500 whitespace-nowrap">
                      {formatTimeAgo(log.createdAt)}
                    </span>
                    <button
                      className="p-1 text-gray-400 hover:text-gray-600 transition-colors"
                      title="View details"
                    >
                      <EyeIcon className="h-4 w-4" />
                    </button>
                  </div>
                </div>
                
                {/* Additional metadata */}
                <div className="mt-3 flex items-center space-x-4 text-xs text-gray-400">
                  <span>ID: {log.id}</span>
                  {log.workflowId && <span>Workflow: {log.workflowId}</span>}
                  {log.executionId && <span>Execution: {log.executionId.slice(0, 12)}...</span>}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Empty state */}
      {filteredLogs.length === 0 && (
        <div className="card p-12 text-center">
          <DocumentTextIcon className="h-12 w-12 text-gray-300 mx-auto mb-3" />
          <h3 className="text-lg font-semibold text-gray-900 mb-2">No audit logs found</h3>
          <p className="text-gray-500">
            {searchTerm || entityTypeFilter !== 'all' || actionFilter !== 'all'
              ? 'Try adjusting your search or filter criteria.'
              : 'Audit logs will appear here as activities occur in the system.'
            }
          </p>
        </div>
      )}
    </div>
  );
}