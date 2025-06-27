# Workflow Engine Usage Examples

This document provides comprehensive examples of how to use the Workflow Engine for GitHub automation.

## Table of Contents

1. [Basic Setup](#basic-setup)
2. [Simple Workflow Execution](#simple-workflow-execution)
3. [Complex Workflows with Dependencies](#complex-workflows-with-dependencies)
4. [Retry Logic and Error Handling](#retry-logic-and-error-handling)
5. [Template Variables](#template-variables)
6. [Parallel Execution](#parallel-execution)
7. [Monitoring and Metrics](#monitoring-and-metrics)
8. [Production Deployment](#production-deployment)

## Basic Setup

### Initialize the Workflow Service

```typescript
import { WorkflowService } from './services/workflow-service';
import { WorkflowDefinition } from './types/workflow-schema';

// Initialize the service
const workflowService = new WorkflowService({
  enableMetrics: true,
  maxConcurrentExecutions: 10,
  defaultTimeout: 300, // 5 minutes
  retentionDays: 30
});

// Load existing workflows from database
await workflowService.loadWorkflowsFromDatabase();

// Setup event listeners
workflowService.on('execution:completed', (result) => {
  console.log(`Workflow ${result.workflowId} completed in ${result.duration}ms`);
});

workflowService.on('execution:failed', (result) => {
  console.error(`Workflow ${result.workflowId} failed: ${result.error}`);
});
```

## Simple Workflow Execution

### Auto-label New Issues

```typescript
const issueLabelingWorkflow: WorkflowDefinition = {
  name: "Auto-label New Issues",
  description: "Automatically add labels to new issues based on content",
  version: "1.0.0",
  
  trigger: {
    type: "webhook",
    event: "issues.opened",
    repository: "my-org/*"
  },
  
  actions: [
    {
      id: "analyze-issue",
      type: "script_execute",
      name: "Analyze issue content",
      parameters: {
        script: "analyze-issue-labels.js"
      }
    },
    {
      id: "add-labels",
      type: "github_issue_label",
      name: "Add suggested labels",
      parameters: {
        labels: "{{analysis.suggested_labels}}",
        mode: "add"
      },
      dependsOn: ["analyze-issue"]
    },
    {
      id: "welcome-comment",
      type: "github_issue_comment",
      name: "Welcome new contributor",
      parameters: {
        body: "Thank you for opening this issue! We've automatically added some labels based on the content. A team member will review this soon."
      },
      condition: {
        operator: "AND",
        rules: [
          {
            field: "issue.author_association",
            operator: "equals",
            value: "FIRST_TIME_CONTRIBUTOR"
          }
        ]
      },
      dependsOn: ["add-labels"]
    }
  ],
  
  errorHandling: {
    onFailure: "continue",
    notifyOnError: {
      channels: [
        {
          type: "slack",
          target: "#github-automation"
        }
      ]
    }
  }
};

// Register and execute
await workflowService.registerWorkflow(issueLabelingWorkflow);

// The workflow will automatically execute when issues are opened
```

## Complex Workflows with Dependencies

### Multi-stage PR Review Process

```typescript
const prReviewProcess: WorkflowDefinition = {
  name: "Multi-stage PR Review Process",
  description: "Comprehensive PR review with multiple validation stages",
  version: "2.0.0",
  
  trigger: {
    type: "webhook",
    event: "pull_request.opened",
    repository: "company/*",
    filters: [
      {
        field: "pull_request.draft",
        operator: "equals",
        value: false
      }
    ]
  },
  
  conditions: {
    operator: "AND",
    rules: [
      {
        field: "pull_request.changed_files",
        operator: "greater_than",
        value: 0
      },
      {
        field: "pull_request.base.ref",
        operator: "in",
        values: ["main", "develop", "release/*"]
      }
    ]
  },
  
  actions: [
    // Stage 1: Initial validation
    {
      id: "validate-pr-title",
      type: "script_execute",
      name: "Validate PR title format",
      parameters: {
        script: "validate-pr-title.js",
        titlePattern: "^(feat|fix|docs|style|refactor|test|chore):",
        required: true
      }
    },
    {
      id: "check-branch-protection",
      type: "script_execute",
      name: "Check branch protection rules",
      parameters: {
        script: "check-branch-protection.js"
      },
      runAsync: true
    },
    {
      id: "analyze-changes",
      type: "script_execute",
      name: "Analyze code changes",
      parameters: {
        script: "analyze-pr-changes.js",
        includeTests: true,
        checkSecurity: true
      },
      runAsync: true
    },
    
    // Stage 2: Automated checks
    {
      id: "run-linting",
      type: "http_request",
      name: "Trigger linting checks",
      parameters: {
        url: "{{secrets.CI_API_URL}}/lint",
        method: "POST",
        headers: {
          "Authorization": "Bearer {{secrets.CI_TOKEN}}"
        },
        body: {
          pr_number: "{{pull_request.number}}",
          repository: "{{repository.full_name}}"
        }
      },
      dependsOn: ["validate-pr-title"],
      retryPolicy: {
        maxAttempts: 3,
        delay: 30,
        backoff: "exponential"
      }
    },
    {
      id: "run-tests",
      type: "http_request",
      name: "Trigger test suite",
      parameters: {
        url: "{{secrets.CI_API_URL}}/test",
        method: "POST",
        headers: {
          "Authorization": "Bearer {{secrets.CI_TOKEN}}"
        },
        body: {
          pr_number: "{{pull_request.number}}",
          repository: "{{repository.full_name}}",
          test_types: ["unit", "integration"]
        }
      },
      dependsOn: ["validate-pr-title"],
      timeout: 600 // 10 minutes for tests
    },
    
    // Stage 3: Review assignment
    {
      id: "assign-reviewers",
      type: "github_pr_request_review",
      name: "Assign code reviewers",
      parameters: {
        reviewers: "{{analysis.suggested_reviewers}}",
        teams: "{{analysis.suggested_teams}}"
      },
      dependsOn: ["analyze-changes", "run-linting"],
      condition: {
        operator: "AND",
        rules: [
          {
            field: "linting.passed",
            operator: "equals",
            value: true
          },
          {
            field: "analysis.confidence",
            operator: "greater_than",
            value: 0.8
          }
        ]
      }
    },
    
    // Stage 4: Notifications
    {
      id: "notify-teams",
      type: "loop",
      name: "Notify affected teams",
      parameters: {
        items: "{{analysis.affected_teams}}",
        itemVariable: "team",
        actions: [
          {
            type: "slack_message",
            parameters: {
              channel: "#{{team.slack_channel}}",
              message: "📋 New PR requires {{team.name}} review: {{pull_request.html_url}}\n\n**Changes:** {{analysis.team_changes[team.name].summary}}"
            }
          }
        ]
      },
      dependsOn: ["assign-reviewers"]
    },
    {
      id: "create-checklist",
      type: "github_pr_comment",
      name: "Add review checklist",
      parameters: {
        body: `## Review Checklist
        
**Automated Checks:**
- [x] Title format validation
- [{{if linting.passed}}x{{else}} {{/if}}] Linting passed
- [{{if tests.passed}}x{{else}} {{/if}}] Tests passed
- [x] Security scan completed

**Manual Review:**
- [ ] Code quality and best practices
- [ ] Documentation updated
- [ ] Breaking changes documented
- [ ] Performance implications considered

**Reviewers:** {{join analysis.suggested_reviewers ", "}}

*This checklist was automatically generated.*`
      },
      dependsOn: ["run-tests", "assign-reviewers"]
    }
  ],
  
  errorHandling: {
    onFailure: "continue",
    maxRetries: 2,
    retryDelay: 60,
    notifyOnError: {
      channels: [
        {
          type: "slack",
          target: "#dev-ops"
        }
      ],
      message: "PR review workflow failed for {{pull_request.html_url}}"
    }
  },
  
  timeout: 1800 // 30 minutes
};

await workflowService.registerWorkflow(prReviewProcess);
```

## Retry Logic and Error Handling

### Robust HTTP Integration with Retries

```typescript
const httpIntegrationWorkflow: WorkflowDefinition = {
  name: "Robust HTTP Integration",
  description: "Demonstrates various retry strategies and error handling",
  version: "1.0.0",
  
  trigger: {
    type: "webhook",
    event: "deployment_status",
    filters: [
      {
        field: "deployment_status.state",
        operator: "equals",
        value: "success"
      }
    ]
  },
  
  actions: [
    {
      id: "notify-external-service",
      type: "http_request",
      name: "Notify external deployment service",
      parameters: {
        url: "{{secrets.EXTERNAL_SERVICE_URL}}/deployments",
        method: "POST",
        headers: {
          "Authorization": "Bearer {{secrets.EXTERNAL_SERVICE_TOKEN}}",
          "Content-Type": "application/json"
        },
        body: {
          environment: "{{deployment.environment}}",
          version: "{{deployment.sha}}",
          timestamp: "{{now.iso}}"
        },
        timeout: 30000
      },
      retryPolicy: {
        maxAttempts: 5,
        delay: 2, // Start with 2 seconds
        backoff: "exponential", // 2s, 4s, 8s, 16s
        retryOn: ["HTTPError", "TimeoutError", "NetworkError"]
      },
      onError: "retry"
    },
    {
      id: "update-status-page",
      type: "http_request",
      name: "Update status page",
      parameters: {
        url: "{{secrets.STATUS_PAGE_URL}}/incidents",
        method: "PUT",
        body: {
          incident_id: "{{deployment.incident_id}}",
          status: "resolved",
          message: "Deployment completed successfully"
        }
      },
      dependsOn: ["notify-external-service"],
      retryPolicy: {
        maxAttempts: 3,
        delay: 5,
        backoff: "linear" // 5s, 10s, 15s
      },
      onError: "continue" // Don't fail workflow if status page update fails
    },
    {
      id: "cleanup-on-failure",
      type: "conditional",
      name: "Cleanup if previous actions failed",
      parameters: {
        condition: {
          operator: "OR",
          rules: [
            {
              field: "notify-external-service.status",
              operator: "equals",
              value: "failed"
            }
          ]
        },
        onTrue: [
          {
            type: "http_request",
            parameters: {
              url: "{{secrets.CLEANUP_SERVICE_URL}}/rollback",
              method: "POST",
              body: {
                deployment_id: "{{deployment.id}}"
              }
            }
          },
          {
            type: "slack_message",
            parameters: {
              channel: "#incidents",
              message: "🚨 Deployment notification failed, initiated rollback for {{deployment.environment}}"
            }
          }
        ]
      },
      dependsOn: ["notify-external-service", "update-status-page"]
    }
  ],
  
  errorHandling: {
    onFailure: "escalate",
    maxRetries: 1,
    notifyOnError: {
      channels: [
        {
          type: "slack",
          target: "#critical-alerts"
        },
        {
          type: "email",
          target: "on-call@company.com"
        }
      ],
      message: "Critical: Deployment workflow failed for {{deployment.environment}}"
    }
  }
};
```

## Template Variables

### Advanced Template Usage

```typescript
const templateExampleWorkflow: WorkflowDefinition = {
  name: "Template Variables Demo",
  description: "Demonstrates advanced template variable usage",
  version: "1.0.0",
  
  trigger: {
    type: "webhook",
    event: "release.published"
  },
  
  actions: [
    {
      id: "process-release-notes",
      type: "script_execute",
      name: "Process release notes",
      parameters: {
        script: "process-release-notes.js",
        releaseTag: "{{release.tag_name}}",
        releaseNotes: "{{release.body}}"
      }
    },
    {
      id: "notify-with-templates",
      type: "slack_message",
      name: "Rich notification with templates",
      parameters: {
        channel: "#releases",
        message: `🚀 **{{upper release.name}}** Released!

**Version:** {{release.tag_name}}
**Published:** {{formatDate release.published_at "date"}}
**Author:** {{release.author.login}}

**Changes Summary:**
{{#each processedNotes.categories}}
- **{{this.name}}:** {{length this.items}} changes
{{/each}}

**Download:** {{release.html_url}}
**Total Downloads:** {{add release.assets[0].download_count release.assets[1].download_count}}

{{#if (length processedNotes.breaking_changes)}}
⚠️ **BREAKING CHANGES:** {{length processedNotes.breaking_changes}} breaking changes in this release
{{/if}}`,
        blocks: [
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: "*Release Timeline:*\n• Created: {{formatDate release.created_at 'time'}}\n• Published: {{formatDate release.published_at 'time'}}\n• Duration: {{subtract (now.timestamp) (release.created_at | timestamp)}}ms"
            }
          }
        ]
      },
      dependsOn: ["process-release-notes"]
    },
    {
      id: "update-documentation",
      type: "loop",
      name: "Update documentation sites",
      parameters: {
        items: "{{variables.doc_sites}}",
        itemVariable: "site",
        maxIterations: 5,
        actions: [
          {
            type: "http_request",
            parameters: {
              url: "{{site.webhook_url}}",
              method: "POST",
              headers: {
                "Authorization": "Bearer {{secrets[site.token_name]}}"
              },
              body: {
                version: "{{release.tag_name}}",
                changelog_url: "{{site.base_url}}/changelog/{{lower (replace release.tag_name '.' '_')}}",
                updated_at: "{{now.iso}}"
              }
            }
          }
        ]
      },
      dependsOn: ["notify-with-templates"]
    }
  ]
};

// Execute with variables
await workflowService.executeWorkflow({
  workflowName: "Template Variables Demo",
  triggerEvent: {
    event: "release.published",
    payload: releaseData
  },
  variables: {
    doc_sites: [
      {
        name: "Main Docs",
        webhook_url: "https://docs.company.com/api/update",
        base_url: "https://docs.company.com",
        token_name: "DOCS_TOKEN"
      },
      {
        name: "API Docs",
        webhook_url: "https://api-docs.company.com/webhook",
        base_url: "https://api-docs.company.com",
        token_name: "API_DOCS_TOKEN"
      }
    ]
  },
  secrets: {
    DOCS_TOKEN: "docs_token_value",
    API_DOCS_TOKEN: "api_docs_token_value"
  }
});
```

## Parallel Execution

### Concurrent Deployment Workflow

```typescript
const parallelDeploymentWorkflow: WorkflowDefinition = {
  name: "Parallel Service Deployment",
  description: "Deploy multiple services concurrently",
  version: "1.0.0",
  
  trigger: {
    type: "webhook",
    event: "workflow_run.completed",
    filters: [
      {
        field: "workflow_run.name",
        operator: "equals",
        value: "Build and Test"
      },
      {
        field: "workflow_run.conclusion",
        operator: "equals",
        value: "success"
      }
    ]
  },
  
  actions: [
    // Sequential preparation
    {
      id: "prepare-deployment",
      type: "script_execute",
      name: "Prepare deployment configuration",
      parameters: {
        script: "prepare-deployment.js"
      }
    },
    {
      id: "backup-current",
      type: "http_request",
      name: "Backup current deployment",
      parameters: {
        url: "{{secrets.DEPLOYMENT_API}}/backup",
        method: "POST"
      },
      dependsOn: ["prepare-deployment"]
    },
    
    // Parallel service deployments
    {
      id: "deploy-auth-service",
      type: "http_request",
      name: "Deploy Authentication Service",
      parameters: {
        url: "{{secrets.DEPLOYMENT_API}}/services/auth/deploy",
        method: "POST",
        body: {
          version: "{{workflow_run.head_sha}}",
          config: "{{deployment.auth_config}}"
        }
      },
      dependsOn: ["backup-current"],
      runAsync: true, // Run in parallel
      timeout: 300
    },
    {
      id: "deploy-api-service",
      type: "http_request",
      name: "Deploy API Service",
      parameters: {
        url: "{{secrets.DEPLOYMENT_API}}/services/api/deploy",
        method: "POST",
        body: {
          version: "{{workflow_run.head_sha}}",
          config: "{{deployment.api_config}}"
        }
      },
      dependsOn: ["backup-current"],
      runAsync: true, // Run in parallel
      timeout: 300
    },
    {
      id: "deploy-web-service",
      type: "http_request",
      name: "Deploy Web Service",
      parameters: {
        url: "{{secrets.DEPLOYMENT_API}}/services/web/deploy",
        method: "POST",
        body: {
          version: "{{workflow_run.head_sha}}",
          config: "{{deployment.web_config}}"
        }
      },
      dependsOn: ["backup-current"],
      runAsync: true, // Run in parallel
      timeout: 300
    },
    {
      id: "deploy-worker-service",
      type: "http_request",
      name: "Deploy Worker Service",
      parameters: {
        url: "{{secrets.DEPLOYMENT_API}}/services/worker/deploy",
        method: "POST",
        body: {
          version: "{{workflow_run.head_sha}}",
          config: "{{deployment.worker_config}}"
        }
      },
      dependsOn: ["backup-current"],
      runAsync: true, // Run in parallel
      timeout: 300
    },
    
    // Sequential verification (waits for all parallel deployments)
    {
      id: "verify-deployments",
      type: "script_execute",
      name: "Verify all deployments",
      parameters: {
        script: "verify-deployments.js",
        services: ["auth", "api", "web", "worker"]
      },
      dependsOn: [
        "deploy-auth-service",
        "deploy-api-service", 
        "deploy-web-service",
        "deploy-worker-service"
      ]
    },
    {
      id: "update-load-balancer",
      type: "http_request",
      name: "Update load balancer",
      parameters: {
        url: "{{secrets.LB_API}}/update",
        method: "POST",
        body: {
          version: "{{workflow_run.head_sha}}",
          services: "{{verification.healthy_services}}"
        }
      },
      dependsOn: ["verify-deployments"]
    },
    
    // Parallel notifications
    {
      id: "notify-slack",
      type: "slack_message",
      name: "Notify Slack",
      parameters: {
        channel: "#deployments",
        message: "🚀 Deployment completed successfully!\n\n**Services deployed:** {{join verification.healthy_services ', '}}\n**Version:** {{workflow_run.head_sha}}"
      },
      dependsOn: ["update-load-balancer"],
      runAsync: true
    },
    {
      id: "notify-status-page",
      type: "http_request",
      name: "Update status page",
      parameters: {
        url: "{{secrets.STATUS_API}}/update",
        method: "POST",
        body: {
          status: "operational",
          message: "All services updated successfully"
        }
      },
      dependsOn: ["update-load-balancer"],
      runAsync: true
    }
  ],
  
  errorHandling: {
    onFailure: "stop",
    maxRetries: 1,
    notifyOnError: {
      channels: [
        {
          type: "slack",
          target: "#critical-alerts"
        }
      ]
    }
  }
};
```

## Monitoring and Metrics

### Execution Monitoring

```typescript
// Setup comprehensive monitoring
workflowService.on('execution:started', (data) => {
  console.log(`🏁 Execution started: ${data.executionId}`);
  
  // Send to monitoring system
  sendMetric('workflow.execution.started', 1, {
    workflow: data.workflow,
    executionId: data.executionId
  });
});

workflowService.on('execution:completed', (result) => {
  console.log(`✅ Execution completed: ${result.executionId}`);
  
  // Send detailed metrics
  sendMetric('workflow.execution.completed', 1, {
    workflow: result.workflowId,
    status: result.status,
    duration: result.duration
  });
  
  if (result.metrics) {
    sendMetric('workflow.actions.total', result.metrics.totalActions);
    sendMetric('workflow.actions.successful', result.metrics.successfulActions);
    sendMetric('workflow.actions.failed', result.metrics.failedActions);
    sendMetric('workflow.actions.retried', result.metrics.retriedActions);
  }
});

// Get execution statistics
async function getWorkflowStats() {
  const aggregation = await workflowService.getExecutionAggregation(
    { 
      from: new Date(Date.now() - 24 * 60 * 60 * 1000), // Last 24 hours
      to: new Date() 
    }
  );
  
  console.log('📊 Workflow Statistics (24h):');
  console.log(`  Total executions: ${aggregation.totalExecutions}`);
  console.log(`  Success rate: ${(aggregation.successRate * 100).toFixed(1)}%`);
  console.log(`  Average duration: ${aggregation.averageDuration.toFixed(0)}ms`);
  
  if (aggregation.mostFrequentErrors.length > 0) {
    console.log(`  Most common errors:`);
    aggregation.mostFrequentErrors.slice(0, 3).forEach((error, index) => {
      console.log(`    ${index + 1}. ${error.error} (${error.count} times)`);
    });
  }
  
  return aggregation;
}

// Export execution data
async function exportExecutionData() {
  const executions = await workflowService.getExecutionHistory({
    startTimeRange: {
      from: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // Last week
      to: new Date()
    },
    limit: 1000,
    includeActions: true
  });
  
  // Export as CSV
  const csvData = await workflowService.getExecutionHistory().exportExecutions(
    { 
      startTimeRange: {
        from: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
        to: new Date()
      }
    },
    'csv'
  );
  
  // Save to file
  require('fs').writeFileSync('execution-report.csv', csvData);
  console.log('📁 Execution report saved to execution-report.csv');
}
```

## Production Deployment

### Complete Production Setup

```typescript
import express from 'express';
import { WorkflowService } from './services/workflow-service';

// Production configuration
const app = express();
app.use(express.json());

const workflowService = new WorkflowService({
  enableMetrics: true,
  maxConcurrentExecutions: 20,
  defaultTimeout: 600, // 10 minutes
  retentionDays: 90
});

// Health check endpoint
app.get('/health', async (req, res) => {
  const health = await workflowService.healthCheck();
  res.status(health.status === 'healthy' ? 200 : 503).json(health);
});

// Webhook endpoint for GitHub
app.post('/webhook/github', async (req, res) => {
  try {
    const event = req.headers['x-github-event'];
    const payload = req.body;
    
    // Find workflows that match this event
    const workflows = workflowService.listWorkflows()
      .filter(wf => 
        wf.trigger.type === 'webhook' && 
        wf.trigger.event === event &&
        wf.enabled !== false
      );
    
    // Execute matching workflows
    const executions = await Promise.allSettled(
      workflows.map(workflow => 
        workflowService.queueWorkflowExecution({
          workflowName: workflow.name,
          triggerEvent: {
            event,
            payload,
            repository: payload.repository
          }
        })
      )
    );
    
    res.json({
      message: 'Webhooks processed',
      workflows: workflows.length,
      executions: executions.filter(e => e.status === 'fulfilled').length
    });
    
  } catch (error) {
    console.error('Webhook processing error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// API endpoints
app.get('/api/workflows', (req, res) => {
  const workflows = workflowService.listWorkflows();
  res.json(workflows);
});

app.post('/api/workflows', async (req, res) => {
  try {
    await workflowService.registerWorkflow(req.body);
    res.json({ message: 'Workflow registered successfully' });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.get('/api/executions', async (req, res) => {
  try {
    const { limit = 50, workflow, status } = req.query;
    const executions = await workflowService.getExecutionHistory({
      limit: parseInt(limit as string),
      workflowName: workflow as string,
      status: status ? [status as string] : undefined
    });
    res.json(executions);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/metrics', async (req, res) => {
  try {
    const aggregation = await workflowService.getExecutionAggregation();
    res.json(aggregation);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('Shutting down gracefully...');
  
  // Cancel active executions
  const activeExecutions = workflowService.getActiveExecutions();
  await Promise.all(
    activeExecutions.map(id => workflowService.cancelExecution(id))
  );
  
  process.exit(0);
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => {
  console.log(`🚀 Workflow Engine API running on port ${PORT}`);
  
  // Load workflows from database
  await workflowService.loadWorkflowsFromDatabase();
  console.log(`📋 Loaded ${workflowService.listWorkflows().length} workflows`);
});
```

### Docker Configuration

```dockerfile
# Dockerfile
FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY prisma ./prisma/

# Install dependencies
RUN npm ci --only=production

# Generate Prisma client
RUN npx prisma generate

# Copy application code
COPY dist ./dist/

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3000/health || exit 1

# Start application
EXPOSE 3000
CMD ["node", "dist/index.js"]
```

```yaml
# docker-compose.yml
version: '3.8'

services:
  workflow-engine:
    build: .
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
      - DATABASE_URL=prisma+postgres://accelerate.prisma-data.net/?api_key=${PRISMA_API_KEY}
      - GITHUB_WEBHOOK_SECRET=${GITHUB_WEBHOOK_SECRET}
    volumes:
      - ./logs:/app/logs
    restart: unless-stopped
    depends_on:
      - postgres
      
  postgres:
    image: postgres:15-alpine
    environment:
      - POSTGRES_DB=workflow_engine
      - POSTGRES_USER=postgres
      - POSTGRES_PASSWORD=${POSTGRES_PASSWORD}
    volumes:
      - postgres_data:/var/lib/postgresql/data
    restart: unless-stopped

volumes:
  postgres_data:
```

This comprehensive guide demonstrates how to use the Workflow Engine for various GitHub automation scenarios, from simple tasks to complex multi-stage processes with proper error handling, monitoring, and production deployment.