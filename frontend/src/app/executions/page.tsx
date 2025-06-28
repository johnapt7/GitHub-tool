'use client';

import { useState, useEffect } from 'react';
import { 
  MagnifyingGlassIcon,
  FunnelIcon,
  EyeIcon,
  ArrowPathIcon,
  XCircleIcon,
  ClockIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  PlayIcon,
} from '@heroicons/react/24/outline';
import { Execution } from '@/types';
import clsx from 'clsx';

// Mock data with more detailed executions
const mockExecutions: Execution[] = [
  {
    id: 'exec_1703851234_abc123',
    workflowId: 'issue-auto-assignment',
    workflowName: 'Issue Auto-Assignment',
    status: 'completed',
    triggerEvent: {
      event: 'issues.opened',
      repository: 'acme/web-app',
      action: 'opened',
      issue: {
        number: 1234,
        title: 'Bug: Login form validation not working',
        author: 'john.doe'
      }
    },
    startedAt: '2025-06-28T10:30:15Z',
    completedAt: '2025-06-28T10:30:28Z',
    duration: 13,
    executionSteps: [
      { action: 'github_issue_assign', status: 'completed', duration: 8 },
      { action: 'github_issue_label', status: 'completed', duration: 5 }
    ]
  },
  {
    id: 'exec_1703851156_def456',
    workflowId: 'pr-review-automation',
    workflowName: 'PR Review Automation',
    status: 'running',
    triggerEvent: {
      event: 'pull_request.opened',
      repository: 'acme/api-service',
      action: 'opened',
      pull_request: {
        number: 567,
        title: 'feat: Add user authentication endpoint',
        author: 'jane.smith'
      }
    },
    startedAt: '2025-06-28T10:28:45Z',
  },
  {
    id: 'exec_1703851089_ghi789',
    workflowId: 'security-alert-handler',
    workflowName: 'Security Alert Handler',
    status: 'failed',
    triggerEvent: {
      event: 'repository_vulnerability_alert',
      repository: 'acme/mobile-app',
      action: 'create',
      alert: {
        severity: 'high',
        package: 'lodash@4.17.19'
      }
    },
    startedAt: '2025-06-28T10:25:12Z',
    completedAt: '2025-06-28T10:25:45Z',
    duration: 33,
    error: 'Failed to send Slack notification: Channel #security not found',
    executionSteps: [
      { action: 'slack_message', status: 'failed', duration: 30, error: 'Channel not found' },
      { action: 'github_issue_create', status: 'skipped', duration: 0 }
    ]
  },
  {
    id: 'exec_1703850987_jkl012',
    workflowId: 'issue-auto-assignment',
    workflowName: 'Issue Auto-Assignment',
    status: 'completed',
    triggerEvent: {
      event: 'issues.labeled',
      repository: 'acme/docs-site',
      action: 'labeled',
      issue: {
        number: 890,
        title: 'Documentation: API endpoints missing examples',
        author: 'mike.wilson'
      }
    },
    startedAt: '2025-06-28T10:22:30Z',
    completedAt: '2025-06-28T10:22:42Z',
    duration: 12,
  },
  {
    id: 'exec_1703850845_mno345',
    workflowId: 'pr-review-automation',
    workflowName: 'PR Review Automation',
    status: 'timeout',
    triggerEvent: {
      event: 'pull_request.synchronize',
      repository: 'acme/web-app',
      action: 'synchronize',
      pull_request: {
        number: 234,
        title: 'fix: Resolve memory leak in data processing',
        author: 'alex.brown'
      }
    },
    startedAt: '2025-06-28T10:18:15Z',
    completedAt: '2025-06-28T10:23:15Z',
    duration: 300,
    error: 'Execution timeout after 5 minutes',
  },
];

export default function ExecutionsPage() {
  const [executions, setExecutions] = useState<Execution[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [workflowFilter, setWorkflowFilter] = useState<string>('all');

  useEffect(() => {
    // Simulate API call
    const timer = setTimeout(() => {
      setExecutions(mockExecutions);
      setLoading(false);
    }, 600);

    return () => clearTimeout(timer);
  }, []);

  const filteredExecutions = executions.filter(execution => {
    const matchesSearch = execution.workflowName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         execution.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         execution.triggerEvent.repository?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'all' || execution.status === statusFilter;
    const matchesWorkflow = workflowFilter === 'all' || execution.workflowId === workflowFilter;
    
    return matchesSearch && matchesStatus && matchesWorkflow;
  });

  const uniqueWorkflows = Array.from(new Set(executions.map(e => e.workflowId)));

  const formatTimeAgo = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffInMinutes = Math.floor((now.getTime() - date.getTime()) / (1000 * 60));
    
    if (diffInMinutes < 1) return 'Just now';
    if (diffInMinutes < 60) return `${diffInMinutes}m ago`;
    if (diffInMinutes < 1440) return `${Math.floor(diffInMinutes / 60)}h ago`;
    return `${Math.floor(diffInMinutes / 1440)}d ago`;
  };

  const formatDuration = (seconds: number) => {
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}m ${remainingSeconds}s`;
  };

  const getStatusIcon = (status: Execution['status']) => {
    switch (status) {
      case 'completed':
        return <CheckCircleIcon className="h-5 w-5 text-success-500" />;
      case 'failed':
        return <XCircleIcon className="h-5 w-5 text-error-500" />;
      case 'running':
        return <PlayIcon className="h-5 w-5 text-blue-500 animate-pulse" />;
      case 'timeout':
        return <ClockIcon className="h-5 w-5 text-warning-500" />;
      case 'cancelled':
        return <ExclamationTriangleIcon className="h-5 w-5 text-gray-500" />;
      default:
        return <ClockIcon className="h-5 w-5 text-gray-500" />;
    }
  };

  const getStatusColor = (status: Execution['status']) => {
    switch (status) {
      case 'completed':
        return 'text-success-700 bg-success-100';
      case 'failed':
        return 'text-error-700 bg-error-100';
      case 'running':
        return 'text-blue-700 bg-blue-100';
      case 'timeout':
        return 'text-warning-700 bg-warning-100';
      case 'cancelled':
        return 'text-gray-700 bg-gray-100';
      default:
        return 'text-gray-700 bg-gray-100';
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Executions</h1>
          <p className="mt-1 text-sm text-gray-500">
            Monitor workflow execution history and current status
          </p>
        </div>
        <button className="btn-secondary flex items-center space-x-2">
          <ArrowPathIcon className="h-5 w-5" />
          <span>Refresh</span>
        </button>
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
              placeholder="Search executions..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="input-field pl-10"
            />
          </div>

          {/* Filters */}
          <div className="flex items-center space-x-3">
            <FunnelIcon className="h-5 w-5 text-gray-400" />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="input-field"
            >
              <option value="all">All statuses</option>
              <option value="running">Running</option>
              <option value="completed">Completed</option>
              <option value="failed">Failed</option>
              <option value="timeout">Timeout</option>
              <option value="cancelled">Cancelled</option>
            </select>
            <select
              value={workflowFilter}
              onChange={(e) => setWorkflowFilter(e.target.value)}
              className="input-field"
            >
              <option value="all">All workflows</option>
              {uniqueWorkflows.map(workflowId => (
                <option key={workflowId} value={workflowId}>{workflowId}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Executions table */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Workflow
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Trigger
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Started
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Duration
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredExecutions.map((execution) => (
                <tr key={execution.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center space-x-2">
                      {getStatusIcon(execution.status)}
                      <span className={clsx('status-badge', getStatusColor(execution.status))}>
                        {execution.status}
                      </span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div>
                      <div className="text-sm font-medium text-gray-900">
                        {execution.workflowName || execution.workflowId}
                      </div>
                      <div className="text-sm text-gray-500">
                        ID: {execution.id}
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div>
                      <div className="text-sm text-gray-900">
                        {execution.triggerEvent.event}
                      </div>
                      <div className="text-sm text-gray-500">
                        {execution.triggerEvent.repository}
                      </div>
                      {execution.triggerEvent.issue && (
                        <div className="text-xs text-gray-400">
                          Issue #{execution.triggerEvent.issue.number}
                        </div>
                      )}
                      {execution.triggerEvent.pull_request && (
                        <div className="text-xs text-gray-400">
                          PR #{execution.triggerEvent.pull_request.number}
                        </div>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {formatTimeAgo(execution.startedAt)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {execution.duration ? formatDuration(execution.duration) : '-'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <div className="flex items-center justify-end space-x-2">
                      <button
                        className="text-primary-600 hover:text-primary-900"
                        title="View details"
                      >
                        <EyeIcon className="h-5 w-5" />
                      </button>
                      {execution.status === 'running' && (
                        <button
                          className="text-error-600 hover:text-error-900"
                          title="Cancel execution"
                        >
                          <XCircleIcon className="h-5 w-5" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Empty state */}
        {filteredExecutions.length === 0 && (
          <div className="text-center py-12">
            <PlayIcon className="h-12 w-12 text-gray-300 mx-auto mb-3" />
            <h3 className="text-lg font-semibold text-gray-900 mb-2">No executions found</h3>
            <p className="text-gray-500">
              {searchTerm || statusFilter !== 'all' || workflowFilter !== 'all'
                ? 'Try adjusting your search or filter criteria.'
                : 'Workflow executions will appear here when they start running.'
              }
            </p>
          </div>
        )}
      </div>
    </div>
  );
}