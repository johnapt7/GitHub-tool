'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { 
  PlusIcon,
  FunnelIcon,
  MagnifyingGlassIcon,
  EyeIcon,
  PencilIcon,
  TrashIcon,
  PlayIcon,
  PauseIcon,
  DocumentDuplicateIcon,
} from '@heroicons/react/24/outline';
import { Workflow } from '@/types';
import clsx from 'clsx';

// Mock data
const mockWorkflows: Workflow[] = [
  {
    id: 'issue-auto-assignment',
    name: 'Issue Auto-Assignment',
    description: 'Automatically assign issues to team members based on labels and expertise',
    enabled: true,
    version: '1.2.0',
    triggerConfig: {
      type: 'webhook',
      event: 'issues.opened',
      repository: 'acme/*',
    },
    actions: [
      { type: 'github_issue_assign', parameters: { assignee: '@team-leads' } },
      { type: 'github_issue_label', parameters: { labels: ['needs-triage'], mode: 'add' } },
    ],
    createdBy: 'john@acme.com',
    createdAt: '2025-06-15T10:00:00Z',
    updatedAt: '2025-06-20T14:30:00Z',
  },
  {
    id: 'pr-review-automation',
    name: 'PR Review Automation',
    description: 'Request reviews from appropriate team members and run automated checks',
    enabled: true,
    version: '1.1.0',
    triggerConfig: {
      type: 'webhook',
      event: 'pull_request.opened',
    },
    actions: [
      { type: 'github_pr_request_review', parameters: { reviewers: ['@senior-devs'] } },
      { type: 'github_pr_label', parameters: { labels: ['review-required'], mode: 'add' } },
    ],
    createdBy: 'sarah@acme.com',
    createdAt: '2025-06-10T09:15:00Z',
    updatedAt: '2025-06-25T11:45:00Z',
  },
  {
    id: 'release-notes-generator',
    name: 'Release Notes Generator',
    description: 'Generate release notes from PR titles and commit messages',
    enabled: false,
    version: '1.0.1',
    triggerConfig: {
      type: 'webhook',
      event: 'release.published',
    },
    actions: [
      { type: 'github_create_issue', parameters: { title: 'Release Notes', body: '{{generated_notes}}' } },
    ],
    createdBy: 'mike@acme.com',
    createdAt: '2025-06-05T16:20:00Z',
    updatedAt: '2025-06-05T16:20:00Z',
  },
  {
    id: 'security-alert-handler',
    name: 'Security Alert Handler',
    description: 'Handle security vulnerability alerts and notify the security team',
    enabled: true,
    version: '1.3.0',
    triggerConfig: {
      type: 'webhook',
      event: 'repository_vulnerability_alert',
    },
    actions: [
      { type: 'slack_message', parameters: { channel: '#security', message: 'Security alert: {{alert.summary}}' } },
      { type: 'github_issue_create', parameters: { title: 'Security Alert: {{alert.title}}' } },
    ],
    createdBy: 'alex@acme.com',
    createdAt: '2025-06-01T08:00:00Z',
    updatedAt: '2025-06-28T07:30:00Z',
  },
];

export default function WorkflowsPage() {
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterEnabled, setFilterEnabled] = useState<'all' | 'enabled' | 'disabled'>('all');

  useEffect(() => {
    // Simulate API call
    const timer = setTimeout(() => {
      setWorkflows(mockWorkflows);
      setLoading(false);
    }, 800);

    return () => clearTimeout(timer);
  }, []);

  const filteredWorkflows = workflows.filter(workflow => {
    const matchesSearch = workflow.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         workflow.description?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesFilter = filterEnabled === 'all' || 
                         (filterEnabled === 'enabled' && workflow.enabled) ||
                         (filterEnabled === 'disabled' && !workflow.enabled);
    
    return matchesSearch && matchesFilter;
  });

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-8 bg-gray-200 rounded w-1/4 animate-pulse"></div>
        <div className="card p-6">
          <div className="space-y-4">
            {Array.from({ length: 4 }).map((_, index) => (
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
          <h1 className="text-2xl font-bold text-gray-900">Workflows</h1>
          <p className="mt-1 text-sm text-gray-500">
            Manage your automation workflows and their configurations
          </p>
        </div>
        <Link
          href="/workflows/new"
          className="btn-primary flex items-center space-x-2"
        >
          <PlusIcon className="h-5 w-5" />
          <span>Create Workflow</span>
        </Link>
      </div>

      {/* Filters and search */}
      <div className="card p-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between space-y-4 sm:space-y-0 sm:space-x-4">
          {/* Search */}
          <div className="relative flex-1 max-w-md">
            <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
              <MagnifyingGlassIcon className="h-5 w-5 text-gray-400" />
            </div>
            <input
              type="text"
              placeholder="Search workflows..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="input-field pl-10"
            />
          </div>

          {/* Filters */}
          <div className="flex items-center space-x-3">
            <FunnelIcon className="h-5 w-5 text-gray-400" />
            <select
              value={filterEnabled}
              onChange={(e) => setFilterEnabled(e.target.value as any)}
              className="input-field max-w-xs"
            >
              <option value="all">All workflows</option>
              <option value="enabled">Enabled only</option>
              <option value="disabled">Disabled only</option>
            </select>
          </div>
        </div>
      </div>

      {/* Workflows list */}
      <div className="space-y-4">
        {filteredWorkflows.map((workflow) => (
          <div key={workflow.id} className="card p-6 hover:shadow-md transition-shadow">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center space-x-3">
                  <h3 className="text-lg font-semibold text-gray-900">
                    {workflow.name}
                  </h3>
                  <span className={clsx(
                    'status-badge',
                    workflow.enabled ? 'status-success' : 'status-pending'
                  )}>
                    {workflow.enabled ? 'Enabled' : 'Disabled'}
                  </span>
                  <span className="text-sm text-gray-500">
                    v{workflow.version}
                  </span>
                </div>
                
                <p className="mt-2 text-sm text-gray-600 max-w-2xl">
                  {workflow.description}
                </p>
                
                <div className="mt-4 flex items-center space-x-6 text-sm text-gray-500">
                  <span>
                    Trigger: {workflow.triggerConfig.event}
                  </span>
                  <span>
                    Actions: {workflow.actions.length}
                  </span>
                  <span>
                    Created: {formatDate(workflow.createdAt)}
                  </span>
                  <span>
                    Updated: {formatDate(workflow.updatedAt)}
                  </span>
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center space-x-2 ml-6">
                <button
                  className="p-2 text-gray-400 hover:text-gray-600 transition-colors"
                  title="View workflow"
                >
                  <EyeIcon className="h-5 w-5" />
                </button>
                <Link
                  href={`/workflows/${workflow.id}/edit`}
                  className="p-2 text-gray-400 hover:text-gray-600 transition-colors"
                  title="Edit workflow"
                >
                  <PencilIcon className="h-5 w-5" />
                </Link>
                <button
                  className="p-2 text-gray-400 hover:text-gray-600 transition-colors"
                  title="Duplicate workflow"
                >
                  <DocumentDuplicateIcon className="h-5 w-5" />
                </button>
                <button
                  className={clsx(
                    'p-2 transition-colors',
                    workflow.enabled 
                      ? 'text-warning-500 hover:text-warning-600' 
                      : 'text-success-500 hover:text-success-600'
                  )}
                  title={workflow.enabled ? 'Disable workflow' : 'Enable workflow'}
                >
                  {workflow.enabled ? (
                    <PauseIcon className="h-5 w-5" />
                  ) : (
                    <PlayIcon className="h-5 w-5" />
                  )}
                </button>
                <button
                  className="p-2 text-error-500 hover:text-error-600 transition-colors"
                  title="Delete workflow"
                >
                  <TrashIcon className="h-5 w-5" />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Empty state */}
      {filteredWorkflows.length === 0 && !loading && (
        <div className="card p-12 text-center">
          <div className="mx-auto h-12 w-12 text-gray-300 mb-4">
            <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">
            {searchTerm || filterEnabled !== 'all' ? 'No workflows found' : 'No workflows yet'}
          </h3>
          <p className="text-gray-500 mb-6 max-w-md mx-auto">
            {searchTerm || filterEnabled !== 'all' 
              ? 'Try adjusting your search or filter criteria.' 
              : 'Get started by creating your first automation workflow.'
            }
          </p>
          {!searchTerm && filterEnabled === 'all' && (
            <Link href="/workflows/new" className="btn-primary">
              Create your first workflow
            </Link>
          )}
        </div>
      )}
    </div>
  );
}