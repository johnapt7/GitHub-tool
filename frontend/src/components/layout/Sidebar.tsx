'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { 
  HomeIcon,
  Cog6ToothIcon,
  PlayIcon,
  ClockIcon,
  DocumentTextIcon,
  ChartBarIcon,
  BoltIcon,
  Cog8ToothIcon,
} from '@heroicons/react/24/outline';
import { NavigationItem } from '@/types';
import clsx from 'clsx';

const navigation: NavigationItem[] = [
  { name: 'Dashboard', href: '/', icon: HomeIcon },
  { name: 'Workflows', href: '/workflows', icon: Cog6ToothIcon },
  { name: 'Executions', href: '/executions', icon: PlayIcon },
  { name: 'Audit Logs', href: '/audit-logs', icon: DocumentTextIcon },
  { name: 'Analytics', href: '/analytics', icon: ChartBarIcon },
  { name: 'Integrations', href: '/integrations', icon: BoltIcon },
  { name: 'Settings', href: '/settings', icon: Cog8ToothIcon },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <div className="flex flex-col h-full bg-white border-r border-gray-200">
      {/* Logo */}
      <div className="flex items-center px-6 py-4 border-b border-gray-200">
        <div className="flex items-center">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary-600">
            <BoltIcon className="h-5 w-5 text-white" />
          </div>
          <div className="ml-3">
            <h1 className="text-lg font-semibold text-gray-900">
              Workflow Hub
            </h1>
            <p className="text-xs text-gray-500">
              GitHub Automation
            </p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-4 py-6 space-y-1">
        {navigation.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.name}
              href={item.href}
              className={clsx(
                'sidebar-link',
                isActive ? 'sidebar-link-active' : 'sidebar-link-inactive'
              )}
            >
              <item.icon className="mr-3 h-5 w-5 flex-shrink-0" />
              {item.name}
              {item.badge && (
                <span className="ml-auto inline-flex items-center justify-center px-2 py-1 text-xs font-bold leading-none text-white bg-primary-600 rounded-full">
                  {item.badge}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* Bottom section */}
      <div className="px-4 py-4 border-t border-gray-200">
        <div className="flex items-center text-sm text-gray-500">
          <div className="h-2 w-2 bg-success-500 rounded-full mr-2"></div>
          System Online
        </div>
        <div className="mt-2 text-xs text-gray-400">
          Version 1.0.0
        </div>
      </div>
    </div>
  );
}