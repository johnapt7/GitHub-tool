'use client';

import { useState, useEffect } from 'react';
import { 
  CheckCircleIcon,
  ExclamationTriangleIcon,
  XCircleIcon,
  ServerIcon,
  CpuChipIcon,
  ClockIcon,
} from '@heroicons/react/24/outline';
import { SystemHealth as SystemHealthType } from '@/types';

// Mock data
const mockSystemHealth: SystemHealthType = {
  status: 'healthy',
  workflowCount: 12,
  activeExecutions: 3,
  queueLength: 0,
  memoryUsage: {
    used: 245,
    total: 512,
    percentage: 47.9,
  },
  uptime: 126543, // seconds
  lastCheck: '2025-06-28T10:35:00Z',
};

export function SystemHealth() {
  const [health, setHealth] = useState<SystemHealthType | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Simulate API call
    const timer = setTimeout(() => {
      setHealth(mockSystemHealth);
      setLoading(false);
    }, 700);

    return () => clearTimeout(timer);
  }, []);

  const formatUptime = (seconds: number) => {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    
    if (days > 0) {
      return `${days}d ${hours}h ${minutes}m`;
    } else if (hours > 0) {
      return `${hours}h ${minutes}m`;
    } else {
      return `${minutes}m`;
    }
  };

  const getStatusIcon = (status: SystemHealthType['status']) => {
    switch (status) {
      case 'healthy':
        return <CheckCircleIcon className="h-5 w-5 text-success-500" />;
      case 'degraded':
        return <ExclamationTriangleIcon className="h-5 w-5 text-warning-500" />;
      case 'unhealthy':
        return <XCircleIcon className="h-5 w-5 text-error-500" />;
      default:
        return <CheckCircleIcon className="h-5 w-5 text-gray-500" />;
    }
  };

  const getStatusColor = (status: SystemHealthType['status']) => {
    switch (status) {
      case 'healthy':
        return 'text-success-700 bg-success-100';
      case 'degraded':
        return 'text-warning-700 bg-warning-100';
      case 'unhealthy':
        return 'text-error-700 bg-error-100';
      default:
        return 'text-gray-700 bg-gray-100';
    }
  };

  const getMemoryUsageColor = (percentage: number) => {
    if (percentage > 80) return 'bg-error-500';
    if (percentage > 60) return 'bg-warning-500';
    return 'bg-success-500';
  };

  if (loading) {
    return (
      <div className="card p-6">
        <div className="h-6 bg-gray-200 rounded w-1/2 mb-4 animate-pulse"></div>
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="flex items-center justify-between animate-pulse">
              <div className="h-4 bg-gray-200 rounded w-1/3"></div>
              <div className="h-4 bg-gray-200 rounded w-1/4"></div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (!health) return null;

  return (
    <div className="card p-6">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-semibold text-gray-900">System Health</h3>
        <div className="flex items-center space-x-2">
          {getStatusIcon(health.status)}
          <span className={`status-badge ${getStatusColor(health.status)}`}>
            {health.status}
          </span>
        </div>
      </div>

      <div className="space-y-4">
        {/* Active Workflows */}
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <ServerIcon className="h-4 w-4 text-gray-400" />
            <span className="text-sm text-gray-600">Active Workflows</span>
          </div>
          <span className="text-sm font-medium text-gray-900">
            {health.workflowCount}
          </span>
        </div>

        {/* Running Executions */}
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <ClockIcon className="h-4 w-4 text-gray-400" />
            <span className="text-sm text-gray-600">Running Executions</span>
          </div>
          <span className="text-sm font-medium text-gray-900">
            {health.activeExecutions}
          </span>
        </div>

        {/* Queue Length */}
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <ClockIcon className="h-4 w-4 text-gray-400" />
            <span className="text-sm text-gray-600">Queue Length</span>
          </div>
          <span className="text-sm font-medium text-gray-900">
            {health.queueLength}
          </span>
        </div>

        {/* Memory Usage */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center space-x-2">
              <CpuChipIcon className="h-4 w-4 text-gray-400" />
              <span className="text-sm text-gray-600">Memory Usage</span>
            </div>
            <span className="text-sm font-medium text-gray-900">
              {health.memoryUsage.used}MB / {health.memoryUsage.total}MB
            </span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div
              className={`h-2 rounded-full transition-all duration-300 ${getMemoryUsageColor(health.memoryUsage.percentage)}`}
              style={{ width: `${health.memoryUsage.percentage}%` }}
            ></div>
          </div>
          <p className="text-xs text-gray-500 mt-1">
            {health.memoryUsage.percentage.toFixed(1)}% used
          </p>
        </div>

        {/* Uptime */}
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-600">Uptime</span>
          <span className="text-sm font-medium text-gray-900">
            {formatUptime(health.uptime)}
          </span>
        </div>
      </div>

      {/* Last checked */}
      <div className="mt-6 pt-4 border-t border-gray-200">
        <p className="text-xs text-gray-500">
          Last checked: {new Date(health.lastCheck).toLocaleTimeString()}
        </p>
      </div>
    </div>
  );
}