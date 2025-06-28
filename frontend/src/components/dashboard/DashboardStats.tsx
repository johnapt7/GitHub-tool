'use client';

import { useEffect, useState } from 'react';
import { 
  Cog6ToothIcon,
  PlayIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  ClockIcon,
} from '@heroicons/react/24/outline';
import { DashboardStats as DashboardStatsType } from '@/types';

// Mock data - in a real app, this would come from an API
const mockStats: DashboardStatsType = {
  totalWorkflows: 12,
  activeWorkflows: 8,
  totalExecutions: 1247,
  successfulExecutions: 1156,
  failedExecutions: 91,
  averageExecutionTime: 45.2,
  activeExecutions: 3,
  successRate: 92.7,
};

export function DashboardStats() {
  const [stats, setStats] = useState<DashboardStatsType | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Simulate API call
    const timer = setTimeout(() => {
      setStats(mockStats);
      setLoading(false);
    }, 500);

    return () => clearTimeout(timer);
  }, []);

  if (loading) {
    return (
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-5">
        {Array.from({ length: 5 }).map((_, index) => (
          <div key={index} className="card p-6 animate-pulse">
            <div className="h-4 bg-gray-200 rounded w-3/4 mb-2"></div>
            <div className="h-6 bg-gray-200 rounded w-1/2 mb-2"></div>
            <div className="h-3 bg-gray-200 rounded w-full"></div>
          </div>
        ))}
      </div>
    );
  }

  if (!stats) return null;

  const statItems = [
    {
      name: 'Total Workflows',
      value: stats.totalWorkflows,
      subtext: `${stats.activeWorkflows} active`,
      icon: Cog6ToothIcon,
      color: 'text-primary-600',
      bgColor: 'bg-primary-100',
    },
    {
      name: 'Total Executions',
      value: stats.totalExecutions.toLocaleString(),
      subtext: 'All time',
      icon: PlayIcon,
      color: 'text-blue-600',
      bgColor: 'bg-blue-100',
    },
    {
      name: 'Success Rate',
      value: `${stats.successRate}%`,
      subtext: `${stats.successfulExecutions} successful`,
      icon: CheckCircleIcon,
      color: 'text-success-600',
      bgColor: 'bg-success-100',
    },
    {
      name: 'Failed Executions',
      value: stats.failedExecutions,
      subtext: 'Need attention',
      icon: ExclamationTriangleIcon,
      color: 'text-error-600',
      bgColor: 'bg-error-100',
    },
    {
      name: 'Avg. Duration',
      value: `${stats.averageExecutionTime}s`,
      subtext: `${stats.activeExecutions} running`,
      icon: ClockIcon,
      color: 'text-warning-600',
      bgColor: 'bg-warning-100',
    },
  ];

  return (
    <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-5">
      {statItems.map((item) => (
        <div key={item.name} className="card p-6 hover:shadow-md transition-shadow">
          <div className="flex items-center">
            <div className={`p-2 rounded-lg ${item.bgColor}`}>
              <item.icon className={`h-6 w-6 ${item.color}`} />
            </div>
            <div className="ml-4 flex-1">
              <p className="text-sm font-medium text-gray-600">{item.name}</p>
              <p className="text-2xl font-semibold text-gray-900">{item.value}</p>
              <p className="text-xs text-gray-500">{item.subtext}</p>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}