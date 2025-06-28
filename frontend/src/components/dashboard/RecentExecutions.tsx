'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { 
  CheckCircleIcon,
  XCircleIcon,
  ClockIcon,
  ExclamationTriangleIcon,
  PlayIcon,
} from '@heroicons/react/24/outline';
import { Execution } from '@/types';
import clsx from 'clsx';

// Mock data
const mockExecutions: Execution[] = [
  {
    id: 'exec_1703851234_abc123',
    workflowId: 'issue-auto-assignment',
    workflowName: 'Issue Auto-Assignment',
    status: 'completed',
    triggerEvent: {
      event: 'issues.opened',
      repository: 'acme/web-app',
      action: 'opened'
    },
    startedAt: '2025-06-28T10:30:15Z',
    completedAt: '2025-06-28T10:30:28Z',
    duration: 13,
  },
  {
    id: 'exec_1703851156_def456',
    workflowId: 'pr-review-automation',
    workflowName: 'PR Review Automation',
    status: 'running',
    triggerEvent: {
      event: 'pull_request.opened',
      repository: 'acme/api-service',
      action: 'opened'
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
      action: 'create'
    },
    startedAt: '2025-06-28T10:25:12Z',
    completedAt: '2025-06-28T10:25:45Z',
    duration: 33,
    error: 'Failed to send Slack notification: Channel not found',
  },
  {
    id: 'exec_1703850987_jkl012',
    workflowId: 'issue-auto-assignment',
    workflowName: 'Issue Auto-Assignment',
    status: 'completed',
    triggerEvent: {
      event: 'issues.labeled',
      repository: 'acme/docs-site',
      action: 'labeled'
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
      action: 'synchronize'
    },
    startedAt: '2025-06-28T10:18:15Z',
    completedAt: '2025-06-28T10:23:15Z',
    duration: 300,
    error: 'Execution timeout after 5 minutes',
  },
];

export function RecentExecutions() {
  const [executions, setExecutions] = useState<Execution[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Simulate API call
    const timer = setTimeout(() => {
      setExecutions(mockExecutions);
      setLoading(false);
    }, 400);

    return () => clearTimeout(timer);
  }, []);

  const formatTimeAgo = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffInMinutes = Math.floor((now.getTime() - date.getTime()) / (1000 * 60));
    
    if (diffInMinutes < 1) return 'Just now';
    if (diffInMinutes < 60) return `${diffInMinutes}m ago`;
    if (diffInMinutes < 1440) return `${Math.floor(diffInMinutes / 60)}h ago`;
    return `${Math.floor(diffInMinutes / 1440)}d ago`;
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
      <div className="card p-6">
        <div className="h-6 bg-gray-200 rounded w-1/3 mb-4 animate-pulse"></div>
        <div className="space-y-4">
          {Array.from({ length: 5 }).map((_, index) => (
            <div key={index} className="flex items-center space-x-4 animate-pulse">
              <div className="h-5 w-5 bg-gray-200 rounded-full"></div>
              <div className="flex-1">
                <div className="h-4 bg-gray-200 rounded w-3/4 mb-2"></div>
                <div className="h-3 bg-gray-200 rounded w-1/2"></div>
              </div>
              <div className="h-3 bg-gray-200 rounded w-16"></div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="card p-6">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-semibold text-gray-900">Recent Executions</h3>
        <Link
          href="/executions"
          className="text-sm text-primary-600 hover:text-primary-700 font-medium"
        >
          View all
        </Link>
      </div>

      <div className="space-y-4">
        {executions.map((execution) => (
          <div key={execution.id} className="flex items-start space-x-4 py-3 border-b border-gray-100 last:border-0">
            <div className="flex-shrink-0 mt-0.5">
              {getStatusIcon(execution.status)}
            </div>
            
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-900 truncate">
                    {execution.workflowName || execution.workflowId}
                  </p>
                  <p className="text-xs text-gray-500 mt-1">
                    {execution.triggerEvent.event} • {execution.triggerEvent.repository}
                  </p>
                  {execution.error && (
                    <p className="text-xs text-error-600 mt-1 truncate">
                      {execution.error}
                    </p>
                  )}
                </div>
                
                <div className="flex items-center space-x-2 ml-4">
                  <span className={clsx('status-badge', getStatusColor(execution.status))}>
                    {execution.status}
                  </span>
                  <span className="text-xs text-gray-500 whitespace-nowrap">
                    {formatTimeAgo(execution.startedAt)}
                  </span>
                </div>
              </div>
              
              {execution.duration && (
                <p className="text-xs text-gray-400 mt-1">
                  Duration: {execution.duration}s
                </p>
              )}
            </div>
          </div>
        ))}
      </div>

      {executions.length === 0 && (
        <div className="text-center py-8">
          <PlayIcon className="h-12 w-12 text-gray-300 mx-auto mb-3" />
          <p className="text-sm text-gray-500">No recent executions</p>
        </div>
      )}
    </div>
  );
}