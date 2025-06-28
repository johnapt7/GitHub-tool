'use client';

import { useState } from 'react';
import { 
  KeyIcon,
  BellIcon,
  ShieldCheckIcon,
  Cog6ToothIcon,
  GlobeAltIcon,
  UserIcon,
  CheckIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline';

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState('general');
  const [settings, setSettings] = useState({
    general: {
      systemName: 'GitHub Workflow Hub',
      timezone: 'UTC',
      dateFormat: 'MM/DD/YYYY',
      language: 'en',
    },
    notifications: {
      emailExecutionComplete: true,
      emailExecutionFailed: true,
      slackExecutionComplete: false,
      slackExecutionFailed: true,
      webhookUrl: '',
    },
    security: {
      sessionTimeout: 8,
      requireMFA: false,
      allowApiKeys: true,
      maxApiKeys: 5,
    },
    github: {
      appId: '12345',
      installationId: '67890',
      webhookSecret: '***',
      privateKey: '***',
    },
  });

  const tabs = [
    { id: 'general', name: 'General', icon: Cog6ToothIcon },
    { id: 'notifications', name: 'Notifications', icon: BellIcon },
    { id: 'security', name: 'Security', icon: ShieldCheckIcon },
    { id: 'github', name: 'GitHub', icon: GlobeAltIcon },
    { id: 'api', name: 'API Keys', icon: KeyIcon },
  ];

  const handleSave = () => {
    // In a real app, this would save to the backend
    console.log('Saving settings:', settings);
  };

  const renderGeneralSettings = () => (
    <div className="space-y-6">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          System Name
        </label>
        <input
          type="text"
          value={settings.general.systemName}
          onChange={(e) => setSettings(prev => ({
            ...prev,
            general: { ...prev.general, systemName: e.target.value }
          }))}
          className="input-field"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Timezone
          </label>
          <select
            value={settings.general.timezone}
            onChange={(e) => setSettings(prev => ({
              ...prev,
              general: { ...prev.general, timezone: e.target.value }
            }))}
            className="input-field"
          >
            <option value="UTC">UTC</option>
            <option value="America/New_York">Eastern Time</option>
            <option value="America/Los_Angeles">Pacific Time</option>
            <option value="Europe/London">London</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Date Format
          </label>
          <select
            value={settings.general.dateFormat}
            onChange={(e) => setSettings(prev => ({
              ...prev,
              general: { ...prev.general, dateFormat: e.target.value }
            }))}
            className="input-field"
          >
            <option value="MM/DD/YYYY">MM/DD/YYYY</option>
            <option value="DD/MM/YYYY">DD/MM/YYYY</option>
            <option value="YYYY-MM-DD">YYYY-MM-DD</option>
          </select>
        </div>
      </div>
    </div>
  );

  const renderNotificationSettings = () => (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium text-gray-900 mb-4">Email Notifications</h3>
        <div className="space-y-4">
          <label className="flex items-center">
            <input
              type="checkbox"
              checked={settings.notifications.emailExecutionComplete}
              onChange={(e) => setSettings(prev => ({
                ...prev,
                notifications: { ...prev.notifications, emailExecutionComplete: e.target.checked }
              }))}
              className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
            />
            <span className="ml-3 text-sm text-gray-700">Execution completed</span>
          </label>
          <label className="flex items-center">
            <input
              type="checkbox"
              checked={settings.notifications.emailExecutionFailed}
              onChange={(e) => setSettings(prev => ({
                ...prev,
                notifications: { ...prev.notifications, emailExecutionFailed: e.target.checked }
              }))}
              className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
            />
            <span className="ml-3 text-sm text-gray-700">Execution failed</span>
          </label>
        </div>
      </div>

      <div>
        <h3 className="text-lg font-medium text-gray-900 mb-4">Slack Notifications</h3>
        <div className="space-y-4">
          <label className="flex items-center">
            <input
              type="checkbox"
              checked={settings.notifications.slackExecutionComplete}
              onChange={(e) => setSettings(prev => ({
                ...prev,
                notifications: { ...prev.notifications, slackExecutionComplete: e.target.checked }
              }))}
              className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
            />
            <span className="ml-3 text-sm text-gray-700">Execution completed</span>
          </label>
          <label className="flex items-center">
            <input
              type="checkbox"
              checked={settings.notifications.slackExecutionFailed}
              onChange={(e) => setSettings(prev => ({
                ...prev,
                notifications: { ...prev.notifications, slackExecutionFailed: e.target.checked }
              }))}
              className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
            />
            <span className="ml-3 text-sm text-gray-700">Execution failed</span>
          </label>
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Webhook URL
        </label>
        <input
          type="url"
          value={settings.notifications.webhookUrl}
          onChange={(e) => setSettings(prev => ({
            ...prev,
            notifications: { ...prev.notifications, webhookUrl: e.target.value }
          }))}
          placeholder="https://hooks.slack.com/services/..."
          className="input-field"
        />
        <p className="mt-1 text-sm text-gray-500">
          Optional webhook URL for custom notifications
        </p>
      </div>
    </div>
  );

  const renderSecuritySettings = () => (
    <div className="space-y-6">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Session Timeout (hours)
        </label>
        <input
          type="number"
          min="1"
          max="24"
          value={settings.security.sessionTimeout}
          onChange={(e) => setSettings(prev => ({
            ...prev,
            security: { ...prev.security, sessionTimeout: parseInt(e.target.value) }
          }))}
          className="input-field max-w-xs"
        />
      </div>

      <div className="space-y-4">
        <label className="flex items-center">
          <input
            type="checkbox"
            checked={settings.security.requireMFA}
            onChange={(e) => setSettings(prev => ({
              ...prev,
              security: { ...prev.security, requireMFA: e.target.checked }
            }))}
            className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
          />
          <span className="ml-3 text-sm text-gray-700">Require Multi-Factor Authentication</span>
        </label>
        <label className="flex items-center">
          <input
            type="checkbox"
            checked={settings.security.allowApiKeys}
            onChange={(e) => setSettings(prev => ({
              ...prev,
              security: { ...prev.security, allowApiKeys: e.target.checked }
            }))}
            className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
          />
          <span className="ml-3 text-sm text-gray-700">Allow API Key Authentication</span>
        </label>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Maximum API Keys per User
        </label>
        <input
          type="number"
          min="1"
          max="20"
          value={settings.security.maxApiKeys}
          onChange={(e) => setSettings(prev => ({
            ...prev,
            security: { ...prev.security, maxApiKeys: parseInt(e.target.value) }
          }))}
          className="input-field max-w-xs"
        />
      </div>
    </div>
  );

  const renderGitHubSettings = () => (
    <div className="space-y-6">
      <div className="bg-blue-50 border border-blue-200 rounded-md p-4">
        <div className="flex">
          <ShieldCheckIcon className="h-5 w-5 text-blue-400" />
          <div className="ml-3">
            <h3 className="text-sm font-medium text-blue-800">
              GitHub App Configuration
            </h3>
            <p className="mt-1 text-sm text-blue-700">
              Configure your GitHub App settings for webhook processing and API access.
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            App ID
          </label>
          <input
            type="text"
            value={settings.github.appId}
            onChange={(e) => setSettings(prev => ({
              ...prev,
              github: { ...prev.github, appId: e.target.value }
            }))}
            className="input-field"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Installation ID
          </label>
          <input
            type="text"
            value={settings.github.installationId}
            onChange={(e) => setSettings(prev => ({
              ...prev,
              github: { ...prev.github, installationId: e.target.value }
            }))}
            className="input-field"
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Webhook Secret
        </label>
        <div className="flex">
          <input
            type="password"
            value={settings.github.webhookSecret}
            onChange={(e) => setSettings(prev => ({
              ...prev,
              github: { ...prev.github, webhookSecret: e.target.value }
            }))}
            className="input-field"
          />
          <button className="ml-2 btn-secondary">
            Test Connection
          </button>
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Private Key
        </label>
        <textarea
          rows={4}
          value={settings.github.privateKey}
          onChange={(e) => setSettings(prev => ({
            ...prev,
            github: { ...prev.github, privateKey: e.target.value }
          }))}
          placeholder="-----BEGIN RSA PRIVATE KEY-----"
          className="input-field"
        />
      </div>
    </div>
  );

  const renderApiKeys = () => (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium text-gray-900 mb-4">API Keys</h3>
        <p className="text-sm text-gray-600 mb-6">
          Create and manage API keys for programmatic access to the workflow automation system.
        </p>
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between p-4 border border-gray-200 rounded-lg">
          <div>
            <h4 className="text-sm font-medium text-gray-900">Production API Key</h4>
            <p className="text-sm text-gray-500">Created on June 15, 2025</p>
            <p className="text-xs text-gray-400 font-mono">wf_1234567890abcdef...</p>
          </div>
          <div className="flex items-center space-x-2">
            <span className="status-badge status-success">Active</span>
            <button className="text-error-600 hover:text-error-800">
              <XMarkIcon className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="flex items-center justify-between p-4 border border-gray-200 rounded-lg">
          <div>
            <h4 className="text-sm font-medium text-gray-900">Development API Key</h4>
            <p className="text-sm text-gray-500">Created on June 20, 2025</p>
            <p className="text-xs text-gray-400 font-mono">wf_abcdef1234567890...</p>
          </div>
          <div className="flex items-center space-x-2">
            <span className="status-badge status-success">Active</span>
            <button className="text-error-600 hover:text-error-800">
              <XMarkIcon className="h-5 w-5" />
            </button>
          </div>
        </div>
      </div>

      <button className="btn-primary">
        <KeyIcon className="h-5 w-5 mr-2" />
        Generate New API Key
      </button>
    </div>
  );

  return (
    <div className="space-y-8">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
        <p className="mt-1 text-sm text-gray-500">
          Configure your workflow automation system preferences and integrations
        </p>
      </div>

      <div className="flex flex-col lg:flex-row lg:space-x-8">
        {/* Sidebar navigation */}
        <div className="lg:w-64 mb-8 lg:mb-0">
          <nav className="space-y-1">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`w-full flex items-center px-3 py-2 text-sm font-medium rounded-lg transition-colors ${
                  activeTab === tab.id
                    ? 'bg-primary-100 text-primary-700 border-r-2 border-primary-600'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                }`}
              >
                <tab.icon className="mr-3 h-5 w-5" />
                {tab.name}
              </button>
            ))}
          </nav>
        </div>

        {/* Main content */}
        <div className="flex-1">
          <div className="card p-8">
            {activeTab === 'general' && renderGeneralSettings()}
            {activeTab === 'notifications' && renderNotificationSettings()}
            {activeTab === 'security' && renderSecuritySettings()}
            {activeTab === 'github' && renderGitHubSettings()}
            {activeTab === 'api' && renderApiKeys()}

            {/* Save button */}
            <div className="mt-8 pt-6 border-t border-gray-200">
              <div className="flex justify-end space-x-3">
                <button className="btn-secondary">
                  Cancel
                </button>
                <button onClick={handleSave} className="btn-primary">
                  <CheckIcon className="h-5 w-5 mr-2" />
                  Save Changes
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}