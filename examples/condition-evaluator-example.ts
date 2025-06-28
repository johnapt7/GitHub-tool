import { ConditionEvaluator } from '../utils/condition-evaluator';
import { ConditionGroup } from '../types/workflow-schema';
import logger from '../utils/logger';

// Example: GitHub workflow automation conditions
logger.info('=== GitHub Workflow Automation Condition Examples ===\n');
console.log('=== GitHub Workflow Automation Condition Examples ===\n');

// Example 1: Auto-assign PR reviewers based on complex conditions
const prReviewerCondition: ConditionGroup = {
  operator: 'AND',
  rules: [
    { field: 'event.action', operator: 'equals', value: 'opened' },
    { field: 'event.pull_request.draft', operator: 'equals', value: false },
    {
      operator: 'OR',
      rules: [
        {
          operator: 'AND',
          rules: [
            { field: 'event.pull_request.base.ref', operator: 'equals', value: 'main' },
            { field: 'event.pull_request.additions', operator: 'greater_than', value: 100 }
          ]
        },
        { field: 'event.pull_request.labels[*].name', operator: 'contains', value: 'needs-review' }
      ]
    }
  ]
};

const prContext = {
  event: {
    action: 'opened',
    pull_request: {
      draft: false,
      base: { ref: 'main' },
      additions: 150,
      labels: [{ name: 'feature' }, { name: 'needs-review' }]
    }
  }
};

logger.info('1. PR Auto-reviewer Assignment:');
logger.info('   Condition: PR opened, not draft, AND (targeting main with 100+ additions OR has needs-review label)');
logger.info('   Result:', ConditionEvaluator.evaluate(prReviewerCondition, prContext));
logger.info('');

console.log('1. PR Auto-reviewer Assignment:');
console.log('   Condition: PR opened, not draft, AND (targeting main with 100+ additions OR has needs-review label)');
console.log('   Result:', ConditionEvaluator.evaluate(prReviewerCondition, prContext));
console.log();

// Example 2: Issue triage automation
const issueTriageCondition: ConditionGroup = {
  operator: 'AND',
  rules: [
    { field: 'event.action', operator: 'equals', value: 'opened' },
    {
      operator: 'OR',
      rules: [
        { field: 'event.issue.title', operator: 'regex', value: '(?i)(bug|error|crash|fail)' },
        { field: 'event.issue.body', operator: 'contains', value: 'Steps to reproduce' },
        {
          operator: 'AND',
          rules: [
            { field: 'event.issue.user.type', operator: 'equals', value: 'User' },
            { field: 'event.issue.user.site_admin', operator: 'equals', value: false }
          ]
        }
      ]
    }
  ]
};

const issueContext = {
  event: {
    action: 'opened',
    issue: {
      title: 'Application crashes on startup',
      body: 'The app fails to load when...',
      user: {
        type: 'User',
        site_admin: false
      }
    }
  }
};

logger.info('2. Issue Auto-triage:');
logger.info('   Condition: Issue opened AND (title matches bug pattern OR has reproduction steps OR from external user)');
logger.info('   Result:', ConditionEvaluator.evaluate(issueTriageCondition, issueContext));
logger.info('');

console.log('2. Issue Auto-triage:');
console.log('   Condition: Issue opened AND (title matches bug pattern OR has reproduction steps OR from external user)');
console.log('   Result:', ConditionEvaluator.evaluate(issueTriageCondition, issueContext));
console.log();

// Example 3: Deployment approval based on multiple criteria
const deploymentCondition: ConditionGroup = {
  operator: 'AND',
  rules: [
    { field: 'workflow.ref', operator: 'regex', value: '^refs/tags/v\\d+\\.\\d+\\.\\d+$' },
    { field: 'tests.passed', operator: 'equals', value: true },
    { field: 'coverage.percentage', operator: 'greater_equal', value: 80 },
    {
      operator: 'OR',
      rules: [
        { field: 'approvals.count', operator: 'greater_equal', value: 2 },
        { field: 'approvals.users', operator: 'contains', value: 'tech-lead' }
      ]
    },
    { field: 'security.vulnerabilities.critical', operator: 'equals', value: 0 }
  ]
};

const deploymentContext = {
  workflow: { ref: 'refs/tags/v2.1.0' },
  tests: { passed: true },
  coverage: { percentage: 85 },
  approvals: {
    count: 1,
    users: ['developer1', 'tech-lead']
  },
  security: {
    vulnerabilities: {
      critical: 0,
      high: 2,
      medium: 5
    }
  }
};

logger.info('3. Deployment Auto-approval:');
logger.info('   Condition: Valid version tag AND tests pass AND coverage >= 80% AND (2+ approvals OR tech-lead approved) AND no critical vulnerabilities');
logger.info('   Result:', ConditionEvaluator.evaluate(deploymentCondition, deploymentContext));
logger.info('');

console.log('3. Deployment Auto-approval:');
console.log('   Condition: Valid version tag AND tests pass AND coverage >= 80% AND (2+ approvals OR tech-lead approved) AND no critical vulnerabilities');
console.log('   Result:', ConditionEvaluator.evaluate(deploymentCondition, deploymentContext));
console.log();

// Example 4: Cross-team notification rules
const notificationCondition: ConditionGroup = {
  operator: 'OR',
  rules: [
    {
      operator: 'AND',
      rules: [
        { field: 'repository.name', operator: 'in', value: ['api-gateway', 'auth-service', 'payment-service'] },
        { field: 'event.pull_request.merged', operator: 'equals', value: true }
      ]
    },
    {
      operator: 'AND',
      rules: [
        { field: 'event.issue.labels[*].name', operator: 'contains', value: 'security' },
        { field: 'event.issue.state', operator: 'equals', value: 'open' }
      ]
    },
    { field: 'event.release.prerelease', operator: 'equals', value: false }
  ]
};

const notificationContext = {
  repository: { name: 'payment-service' },
  event: {
    pull_request: { merged: true },
    issue: { labels: [], state: 'closed' },
    release: { prerelease: true }
  }
};

logger.info('4. Cross-team Notification:');
logger.info('   Condition: (Critical service PR merged) OR (Security issue opened) OR (Production release)');
logger.info('   Result:', ConditionEvaluator.evaluate(notificationCondition, notificationContext));
logger.info('');

console.log('4. Cross-team Notification:');
console.log('   Condition: (Critical service PR merged) OR (Security issue opened) OR (Production release)');
console.log('   Result:', ConditionEvaluator.evaluate(notificationCondition, notificationContext));
console.log();

// Example 5: Complex business analyst workflow
const baWorkflowCondition: ConditionGroup = {
  operator: 'AND',
  rules: [
    { field: 'trigger.schedule.dayOfWeek', operator: 'between', value: [1, 5] }, // Monday to Friday
    { field: 'trigger.schedule.hour', operator: 'between', value: [9, 17] }, // Business hours
    {
      operator: 'NOT',
      rules: [
        { field: 'calendar.holidays', operator: 'contains', value: new Date().toISOString().split('T')[0] }
      ]
    },
    {
      operator: 'OR',
      rules: [
        {
          operator: 'AND',
          rules: [
            { field: 'metrics.openIssues', operator: 'greater_than', value: 50 },
            { field: 'metrics.avgResolutionTime', operator: 'greater_than', value: 72 } // hours
          ]
        },
        { field: 'alerts.slaBreaches', operator: 'greater_than', value: 0 }
      ]
    }
  ]
};

const baContext = {
  trigger: {
    schedule: {
      dayOfWeek: 3, // Wednesday
      hour: 14 // 2 PM
    }
  },
  calendar: {
    holidays: ['2024-12-25', '2024-01-01']
  },
  metrics: {
    openIssues: 75,
    avgResolutionTime: 96
  },
  alerts: {
    slaBreaches: 2
  }
};

logger.info('5. Business Analyst Escalation Workflow:');
logger.info('   Condition: Business hours AND not holiday AND (high issue volume with slow resolution OR SLA breaches)');
logger.info('   Result:', ConditionEvaluator.evaluate(baWorkflowCondition, baContext));
logger.info('');

console.log('5. Business Analyst Escalation Workflow:');
console.log('   Condition: Business hours AND not holiday AND (high issue volume with slow resolution OR SLA breaches)');
console.log('   Result:', ConditionEvaluator.evaluate(baWorkflowCondition, baContext));
console.log();

logger.info('=== Demonstration Complete ===');
console.log('=== Demonstration Complete ===');