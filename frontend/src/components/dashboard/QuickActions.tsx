'use client';

import Link from 'next/link';
import { 
  PlusIcon,
  PlayIcon,
  DocumentDuplicateIcon,
  Cog6ToothIcon,
  ArrowPathIcon,
  BoltIcon,
} from '@heroicons/react/24/outline';

const quickActions = [
  {
    name: 'Create Workflow',
    description: 'Build a new automation workflow',
    href: '/workflows/new',
    icon: PlusIcon,
    color: 'bg-primary-600 hover:bg-primary-700',
  },
  {
    name: 'Run Workflow',
    description: 'Manually trigger an existing workflow',
    href: '/workflows?action=run',
    icon: PlayIcon,
    color: 'bg-success-600 hover:bg-success-700',
  },
  {
    name: 'Import Template',
    description: 'Start from a pre-built template',
    href: '/templates',
    icon: DocumentDuplicateIcon,
    color: 'bg-blue-600 hover:bg-blue-700',
  },
  {
    name: 'Manage Integrations',
    description: 'Configure external service connections',
    href: '/integrations',
    icon: BoltIcon,
    color: 'bg-warning-600 hover:bg-warning-700',
  },
];

export function QuickActions() {
  return (
    <div className="card p-6">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-semibold text-gray-900">Quick Actions</h3>
      </div>

      <div className="space-y-3">
        {quickActions.map((action) => (
          <Link
            key={action.name}
            href={action.href}
            className="flex items-center space-x-3 p-3 rounded-lg border border-gray-200 hover:border-gray-300 hover:shadow-sm transition-all group"
          >
            <div className={`p-2 rounded-md ${action.color} transition-colors`}>
              <action.icon className="h-5 w-5 text-white" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium text-gray-900 group-hover:text-gray-700">
                {action.name}
              </p>
              <p className="text-xs text-gray-500">
                {action.description}
              </p>
            </div>
          </Link>
        ))}
      </div>

      {/* System shortcuts */}
      <div className="mt-6 pt-6 border-t border-gray-200">
        <h4 className="text-sm font-medium text-gray-900 mb-3">System</h4>
        <div className="grid grid-cols-2 gap-2">
          <button className="flex items-center justify-center space-x-2 p-2 text-xs text-gray-600 hover:text-gray-900 hover:bg-gray-50 rounded-md transition-colors">
            <ArrowPathIcon className="h-4 w-4" />
            <span>Refresh Data</span>
          </button>
          <Link
            href="/settings"
            className="flex items-center justify-center space-x-2 p-2 text-xs text-gray-600 hover:text-gray-900 hover:bg-gray-50 rounded-md transition-colors"
          >
            <Cog6ToothIcon className="h-4 w-4" />
            <span>Settings</span>
          </Link>
        </div>
      </div>
    </div>
  );
}