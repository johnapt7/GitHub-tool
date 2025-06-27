# Workflow Schema Documentation

## Overview

The Workflow Schema provides a comprehensive JSON structure for defining automated workflows that respond to GitHub events, execute complex logic, and integrate with various external services. This schema is designed specifically for Technical Business Analysts to create sophisticated automation without writing code.

## Schema Structure

### Core Components

```typescript
interface WorkflowDefinition {
  name: string;              // Workflow identifier
  description?: string;      // Human-readable description
  version?: string;          // Semantic version
  enabled?: boolean;         // Whether workflow is active
  trigger: TriggerConfig;    // What starts the workflow
  conditions?: ConditionGroup; // When to execute
  actions: ActionConfig[];   // What to do
  errorHandling?: ErrorHandlingStrategy; // How to handle failures
  timeout?: number;          // Maximum execution time
  retryPolicy?: RetryPolicy; // Retry configuration
  metadata?: Record<string, any>; // Custom metadata
}
```

## Trigger Configuration

Workflows can be triggered by various events:

### Webhook Triggers
```json
{
  "trigger": {
    "type": "webhook",
    "event": "issues.labeled",
    "repository": "org/*",
    "branch": "main",
    "filters": [
      {
        "field": "label.name",
        "operator": "equals",
        "value": "critical"
      }
    ]
  }
}
```

### Scheduled Triggers
```json
{
  "trigger": {
    "type": "schedule",
    "event": "schedule.weekly",
    "schedule": {
      "cron": "0 9 * * 1",
      "timezone": "UTC"
    }
  }
}
```

### Supported GitHub Events

| Event | Description | Use Cases |
|-------|-------------|-----------|
| `issues.opened` | New issue created | Auto-triage, assign labels |
| `issues.labeled` | Label added to issue | Route to teams, escalate |
| `pull_request.opened` | New PR created | Request reviews, run checks |
| `pull_request.merged` | PR merged to main | Deploy, notify stakeholders |
| `push` | Code pushed to branch | Run tests, validate changes |
| `release.published` | New release created | Deploy, update documentation |
| `workflow_run.completed` | CI/CD workflow finished | Deploy on success |

## Condition System

### Simple Conditions
```json
{
  "conditions": {
    "operator": "AND",
    "rules": [
      {
        "field": "issue.assignee",
        "operator": "is_null"
      },
      {
        "field": "issue.state",
        "operator": "equals",
        "value": "open"
      }
    ]
  }
}
```

### Complex Nested Conditions
```json
{
  "conditions": {
    "operator": "AND",
    "rules": [
      {
        "field": "pull_request.changed_files",
        "operator": "greater_than",
        "value": 0
      },
      {
        "operator": "OR",
        "rules": [
          {
            "field": "pull_request.base.ref",
            "operator": "equals",
            "value": "main"
          },
          {
            "field": "pull_request.base.ref",
            "operator": "equals",
            "value": "develop"
          }
        ]
      }
    ]
  }
}
```

### Filter Operators

| Operator | Description | Example |
|----------|-------------|---------|
| `equals` | Exact match | `"value": "critical"` |
| `contains` | Substring match | `"value": "bug"` |
| `regex` | Regular expression | `"value": "^(feat|fix):"` |
| `in` | Value in array | `"values": ["bug", "enhancement"]` |
| `greater_than` | Numeric comparison | `"value": 5` |
| `is_null` | Field is null/empty | No value needed |
| `exists` | Field exists | No value needed |

## Action Types

### GitHub Actions

#### Issue Management
```json
{
  "type": "github_issue_assign",
  "parameters": {
    "assignee": "@oncall-dev"
  }
}
```

```json
{
  "type": "github_issue_label",
  "parameters": {
    "labels": ["bug", "high-priority"],
    "mode": "add"
  }
}
```

```json
{
  "type": "github_issue_comment",
  "parameters": {
    "body": "Thank you for reporting this issue! We'll investigate and get back to you soon."
  }
}
```

#### Pull Request Management
```json
{
  "type": "github_pr_request_review",
  "parameters": {
    "reviewers": ["@senior-dev"],
    "teams": ["@code-reviewers"]
  }
}
```

```json
{
  "type": "github_pr_merge",
  "parameters": {
    "merge_method": "squash",
    "commit_title": "{{pull_request.title}}",
    "commit_message": "{{pull_request.body}}"
  }
}
```

### Communication Actions

#### Slack Integration
```json
{
  "type": "slack_message",
  "parameters": {
    "channel": "#dev-team",
    "message": "🚨 Critical issue #{{issue.number}} needs attention!",
    "thread": false,
    "blocks": [
      {
        "type": "section",
        "text": {
          "type": "mrkdwn",
          "text": "*Issue:* <{{issue.html_url}}|{{issue.title}}>"
        }
      }
    ]
  }
}
```

#### Email Notifications
```json
{
  "type": "email_send",
  "parameters": {
    "to": ["team@company.com"],
    "subject": "Deployment Status: {{workflow.name}}",
    "body": "Deployment completed successfully at {{execution.completedAt}}"
  }
}
```

### Integration Actions

#### JIRA Integration
```json
{
  "type": "jira_create_ticket",
  "parameters": {
    "project": "DEV",
    "issueType": "Bug",
    "summary": "GitHub Issue: {{issue.title}}",
    "description": "{{issue.body}}",
    "priority": "High",
    "labels": ["github-sync"]
  }
}
```

#### HTTP Requests
```json
{
  "type": "http_request",
  "parameters": {
    "url": "https://api.external-service.com/webhook",
    "method": "POST",
    "headers": {
      "Authorization": "Bearer {{secrets.API_TOKEN}}",
      "Content-Type": "application/json"
    },
    "body": {
      "event": "{{trigger.event}}",
      "repository": "{{repository.full_name}}",
      "timestamp": "{{execution.startTime}}"
    }
  }
}
```

### Control Flow Actions

#### Conditional Execution
```json
{
  "type": "conditional",
  "parameters": {
    "condition": {
      "operator": "AND",
      "rules": [
        {
          "field": "issue.labels",
          "operator": "contains",
          "value": "security"
        }
      ]
    },
    "onTrue": [
      {
        "type": "slack_message",
        "parameters": {
          "channel": "#security-alerts",
          "message": "Security issue detected!"
        }
      }
    ],
    "onFalse": [
      {
        "type": "github_issue_label",
        "parameters": {
          "labels": ["needs-triage"],
          "mode": "add"
        }
      }
    ]
  }
}
```

#### Loop Execution
```json
{
  "type": "loop",
  "parameters": {
    "items": "{{pull_request.requested_reviewers}}",
    "itemVariable": "reviewer",
    "maxIterations": 10,
    "actions": [
      {
        "type": "slack_dm",
        "parameters": {
          "user": "{{reviewer.login}}",
          "message": "Please review PR #{{pull_request.number}}"
        }
      }
    ]
  }
}
```

## Template Variables

Workflows support dynamic template variables that are resolved at runtime:

### GitHub Context Variables
- `{{repository.name}}` - Repository name
- `{{repository.owner}}` - Repository owner
- `{{issue.number}}` - Issue number
- `{{issue.title}}` - Issue title
- `{{issue.body}}` - Issue description
- `{{issue.user.login}}` - Issue author
- `{{pull_request.number}}` - PR number
- `{{pull_request.title}}` - PR title
- `{{pull_request.head.ref}}` - Source branch

### Workflow Context Variables
- `{{workflow.name}}` - Workflow name
- `{{workflow.id}}` - Workflow ID
- `{{execution.id}}` - Execution ID
- `{{execution.startTime}}` - Execution start time
- `{{trigger.event}}` - Triggering event

### Action Results
- `{{previousAction.result}}` - Result from previous action
- `{{actionId.result}}` - Result from specific action by ID

### Secrets and Configuration
- `{{secrets.API_TOKEN}}` - Secret values
- `{{config.ENVIRONMENT}}` - Configuration values

## Error Handling

### Workflow-Level Error Handling
```json
{
  "errorHandling": {
    "onFailure": "continue",
    "maxRetries": 3,
    "retryDelay": 60,
    "continueOnError": true,
    "notifyOnError": {
      "channels": [
        {
          "type": "slack",
          "target": "#dev-alerts"
        }
      ],
      "message": "Workflow {{workflow.name}} failed: {{error.message}}"
    }
  }
}
```

### Action-Level Error Handling
```json
{
  "type": "github_issue_assign",
  "parameters": {
    "assignee": "@team-lead"
  },
  "onError": "retry",
  "retryPolicy": {
    "maxAttempts": 3,
    "delay": 30,
    "backoff": "exponential"
  },
  "timeout": 120
}
```

### Error Actions
- `stop` - Stop workflow execution
- `continue` - Continue with next action
- `retry` - Retry the failed action
- `rollback` - Undo previous actions
- `escalate` - Notify administrators

## Action Dependencies

Actions can depend on other actions to create complex workflows:

```json
{
  "actions": [
    {
      "id": "create-branch",
      "type": "github_create_branch",
      "parameters": {
        "name": "hotfix-{{issue.number}}",
        "from": "main"
      }
    },
    {
      "id": "create-pr",
      "type": "github_create_pr",
      "parameters": {
        "title": "Fix for issue #{{issue.number}}",
        "head": "hotfix-{{issue.number}}",
        "base": "main"
      },
      "dependsOn": ["create-branch"]
    },
    {
      "id": "notify-team",
      "type": "slack_message",
      "parameters": {
        "channel": "#dev-team",
        "message": "Hotfix PR created: {{createPr.result.html_url}}"
      },
      "dependsOn": ["create-pr"]
    }
  ]
}
```

## Performance Considerations

### Timeouts
- Workflow timeout: Maximum total execution time
- Action timeout: Maximum time per action
- Default action timeout: 60 seconds

### Async Execution
```json
{
  "type": "slack_message",
  "parameters": {
    "channel": "#notifications",
    "message": "Processing started..."
  },
  "runAsync": true
}
```

### Parallel Execution
```json
{
  "type": "parallel",
  "parameters": {
    "actions": [
      {
        "type": "slack_message",
        "parameters": {
          "channel": "#team-a",
          "message": "Deployment started"
        }
      },
      {
        "type": "slack_message",
        "parameters": {
          "channel": "#team-b",
          "message": "Deployment started"
        }
      }
    ]
  }
}
```

## Validation

Workflows are validated against:
1. JSON Schema compliance
2. Business logic rules
3. Dependency cycles
4. Performance constraints

### Common Validation Errors
- Missing required fields
- Invalid action types
- Circular dependencies
- Unknown dependency references
- Invalid regex patterns
- Malformed cron expressions

### Best Practices
1. Use descriptive names and descriptions
2. Set appropriate timeouts
3. Handle errors gracefully
4. Use conditions to avoid unnecessary actions
5. Break complex workflows into smaller ones
6. Test workflows in development environment
7. Monitor workflow execution and performance

## Examples

See `/examples/workflow-examples.ts` for comprehensive examples including:
- Critical issue auto-assignment
- Smart PR review workflows
- Scheduled cleanup tasks
- Security vulnerability response
- Multi-stage deployment pipelines

## Migration Guide

When updating workflows:
1. Always increment the version number
2. Test changes in development environment
3. Use gradual rollout for critical workflows
4. Keep backup of previous versions
5. Monitor execution after deployment