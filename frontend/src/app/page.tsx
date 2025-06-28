'use client';

import { useState, useEffect } from 'react';
import { DashboardStats } from '@/components/dashboard/DashboardStats';
import { WorkflowOverview } from '@/components/dashboard/WorkflowOverview';
import { RecentExecutions } from '@/components/dashboard/RecentExecutions';
import { ExecutionChart } from '@/components/dashboard/ExecutionChart';
import { QuickActions } from '@/components/dashboard/QuickActions';
import { SystemHealth } from '@/components/dashboard/SystemHealth';

export default function Dashboard() {
  return (
    <div className="space-y-8">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="mt-1 text-sm text-gray-500">
          Overview of your GitHub workflow automation system
        </p>
      </div>

      {/* Quick stats */}
      <DashboardStats />

      {/* Main content grid */}
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
        {/* Left column - main charts and data */}
        <div className="lg:col-span-2 space-y-8">
          <ExecutionChart />
          <RecentExecutions />
        </div>

        {/* Right column - sidebar widgets */}
        <div className="space-y-8">
          <QuickActions />
          <WorkflowOverview />
          <SystemHealth />
        </div>
      </div>
    </div>
  );
}