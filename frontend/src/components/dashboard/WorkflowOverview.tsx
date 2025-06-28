'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { 
  EyeIcon,
  PencilIcon,
  PlayIcon,
  PauseIcon,
} from '@heroicons/react/24/outline';
import { WorkflowStatus } from '@/types';

// Mock data
const mockWorkflows: WorkflowStatus[] = [
  {
    name: 'Issue Auto-Assignment',
    enabled: true,
    version: '1.2.0',
    lastExecuted: '2025-06-28T10:30:00Z',
    totalExecutions: 156,
    successRate: 94.2,
    averageDuration: 12.5,
  },
  {
    name: 'PR Review Automation',
    enabled: true,
    version: '1.1.0',
    lastExecuted: '2025-06-28T09:15:00Z',
    totalExecutions: 89,
    successRate: 96.7,
    averageDuration: 8.3,
  },
  {
    name: 'Release Notes Generator',
    enabled: false,
    version: '1.0.1',
    lastExecuted: '2025-06-27T16:45:00Z',
    totalExecutions: 23,
    successRate: 91.3,
    averageDuration: 45.2,
  },
  {
    name: 'Security Alert Handler',
    enabled: true,
    version: '1.3.0',
    lastExecuted: '2025-06-28T08:00:00Z',
    totalExecutions: 78,
    successRate: 89.7,
    averageDuration: 32.1,
  },
];

export function WorkflowOverview() {
  const [workflows, setWorkflows] = useState<WorkflowStatus[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Simulate API call
    const timer = setTimeout(() => {
      setWorkflows(mockWorkflows);
      setLoading(false);
    }, 300);

    return () => clearTimeout(timer);
  }, []);

  const formatTimeAgo = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffInMinutes = Math.floor((now.getTime() - date.getTime()) / (1000 * 60));
    
    if (diffInMinutes < 60) {
      return `${diffInMinutes}m ago`;
    } else if (diffInMinutes < 1440) {
      return `${Math.floor(diffInMinutes / 60)}h ago`;
    } else {
      return `${Math.floor(diffInMinutes / 1440)}d ago`;
    }
  };

  if (loading) {
    return (
      <div className="card p-6">
        <div className="h-6 bg-gray-200 rounded w-1/3 mb-4 animate-pulse"></div>
        <div className="space-y-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="animate-pulse">
              <div className="h-4 bg-gray-200 rounded w-3/4 mb-2"></div>
              <div className="h-3 bg-gray-200 rounded w-1/2"></div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="card p-6">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-semibold text-gray-900">Workflows</h3>
        <Link
          href="/workflows"
          className="text-sm text-primary-600 hover:text-primary-700 font-medium"
        >
          View all
        </Link>
      </div>

      <div className="space-y-4">
        {workflows.map((workflow) => (
          <div key={workflow.name} className="border border-gray-200 rounded-lg p-4 hover:border-gray-300 transition-colors">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center space-x-2">
                  <h4 className="text-sm font-medium text-gray-900">
                    {workflow.name}
                  </h4>
                  <span className={`status-badge ${workflow.enabled ? 'status-success' : 'status-pending'}`}>
                    {workflow.enabled ? 'Active' : 'Disabled'}
                  </span>
                </div>
                
                <div className="mt-2 flex items-center space-x-4 text-xs text-gray-500">
                  <span>v{workflow.version}</span>
                  <span>•</span>
                  <span>{workflow.totalExecutions} runs</span>
                  <span>•</span>
                  <span>{workflow.successRate}% success</span>
                </div>
                
                {workflow.lastExecuted && (
                  <p className="mt-1 text-xs text-gray-400">
                    Last run {formatTimeAgo(workflow.lastExecuted)}
                  </p>
                )}
              </div>

              <div className="flex items-center space-x-1 ml-4">
                <button
                  className="p-1 text-gray-400 hover:text-gray-600 transition-colors"
                  title="View workflow"
                >
                  <EyeIcon className="h-4 w-4" />
                </button>
                <button
                  className="p-1 text-gray-400 hover:text-gray-600 transition-colors"
                  title="Edit workflow"
                >
                  <PencilIcon className="h-4 w-4" />
                </button>
                <button
                  className={`p-1 transition-colors ${
                    workflow.enabled 
                      ? 'text-warning-500 hover:text-warning-600' 
                      : 'text-success-500 hover:text-success-600'
                  }`}
                  title={workflow.enabled ? 'Disable workflow' : 'Enable workflow'}
                >
                  {workflow.enabled ? (
                    <PauseIcon className="h-4 w-4" />
                  ) : (
                    <PlayIcon className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-6">
        <Link
          href="/workflows/new"
          className="block w-full text-center py-2 px-4 border border-dashed border-gray-300 rounded-lg text-sm text-gray-600 hover:border-gray-400 hover:text-gray-700 transition-colors"
        >
          + Create New Workflow
        </Link>
      </div>
    </div>
  );
}