'use client';

import { useState, useEffect } from 'react';
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  AreaChart,
  Area,
} from 'recharts';
import { ExecutionChartData } from '@/types';

// Mock data for the last 7 days
const mockChartData: ExecutionChartData[] = [
  { date: '2025-06-22', completed: 45, failed: 3, total: 48 },
  { date: '2025-06-23', completed: 52, failed: 5, total: 57 },
  { date: '2025-06-24', completed: 38, failed: 2, total: 40 },
  { date: '2025-06-25', completed: 61, failed: 4, total: 65 },
  { date: '2025-06-26', completed: 44, failed: 6, total: 50 },
  { date: '2025-06-27', completed: 58, failed: 2, total: 60 },
  { date: '2025-06-28', completed: 67, failed: 3, total: 70 },
];

export function ExecutionChart() {
  const [chartData, setChartData] = useState<ExecutionChartData[]>([]);
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState<'7d' | '30d' | '90d'>('7d');

  useEffect(() => {
    // Simulate API call
    const timer = setTimeout(() => {
      setChartData(mockChartData);
      setLoading(false);
    }, 600);

    return () => clearTimeout(timer);
  }, [timeRange]);

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric' 
    });
  };

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-white p-3 border border-gray-200 rounded-lg shadow-sm">
          <p className="text-sm font-medium text-gray-900 mb-2">
            {formatDate(label)}
          </p>
          {payload.map((entry: any, index: number) => (
            <p key={index} className="text-sm" style={{ color: entry.color }}>
              {entry.name}: {entry.value}
            </p>
          ))}
        </div>
      );
    }
    return null;
  };

  if (loading) {
    return (
      <div className="card p-6">
        <div className="h-6 bg-gray-200 rounded w-1/3 mb-4 animate-pulse"></div>
        <div className="h-64 bg-gray-100 rounded animate-pulse"></div>
      </div>
    );
  }

  return (
    <div className="card p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">Execution Trends</h3>
          <p className="text-sm text-gray-500">
            Workflow execution history over time
          </p>
        </div>
        
        <div className="flex space-x-1">
          {['7d', '30d', '90d'].map((range) => (
            <button
              key={range}
              onClick={() => setTimeRange(range as any)}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                timeRange === range
                  ? 'bg-primary-100 text-primary-700'
                  : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
              }`}
            >
              {range}
            </button>
          ))}
        </div>
      </div>

      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData}>
            <defs>
              <linearGradient id="completedGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#10b981" stopOpacity={0.8}/>
                <stop offset="95%" stopColor="#10b981" stopOpacity={0.1}/>
              </linearGradient>
              <linearGradient id="failedGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#ef4444" stopOpacity={0.8}/>
                <stop offset="95%" stopColor="#ef4444" stopOpacity={0.1}/>
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
            <XAxis 
              dataKey="date" 
              tickFormatter={formatDate}
              stroke="#6b7280"
              fontSize={12}
            />
            <YAxis 
              stroke="#6b7280"
              fontSize={12}
            />
            <Tooltip content={<CustomTooltip />} />
            <Area
              type="monotone"
              dataKey="completed"
              stroke="#10b981"
              fillOpacity={1}
              fill="url(#completedGradient)"
              name="Completed"
              strokeWidth={2}
            />
            <Area
              type="monotone"
              dataKey="failed"
              stroke="#ef4444"
              fillOpacity={1}
              fill="url(#failedGradient)"
              name="Failed"
              strokeWidth={2}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Summary stats */}
      <div className="mt-6 grid grid-cols-3 gap-4 pt-4 border-t border-gray-200">
        <div className="text-center">
          <p className="text-sm font-medium text-gray-900">
            {chartData.reduce((sum, day) => sum + day.total, 0)}
          </p>
          <p className="text-xs text-gray-500">Total Executions</p>
        </div>
        <div className="text-center">
          <p className="text-sm font-medium text-success-600">
            {chartData.reduce((sum, day) => sum + day.completed, 0)}
          </p>
          <p className="text-xs text-gray-500">Successful</p>
        </div>
        <div className="text-center">
          <p className="text-sm font-medium text-error-600">
            {chartData.reduce((sum, day) => sum + day.failed, 0)}
          </p>
          <p className="text-xs text-gray-500">Failed</p>
        </div>
      </div>
    </div>
  );
}