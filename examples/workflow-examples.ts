import { WorkflowDefinition } from '../types/workflow-schema';

// Example 1: Auto-assign Critical Issues (from your example)
export const criticalIssueWorkflow: WorkflowDefinition = {
  name: "Auto-assign Critical Issues",
  description: "Automatically assign critical issues to on-call developer and notify team",
  version: "1.0.0",
  trigger: {
    type: "webhook",
    event: "issues.labeled",
    repository: "org/*",
    filters: [
      {
        field: "label.name",
        operator: "equals",
        value: "critical"
      }
    ]
  },
  conditions: {
    operator: "AND",
    rules: [
      {
        field: "issue.assignee",
        operator: "is_null"
      },
      {
        field: "issue.state",
        operator: "equals",
        value: "open"
      }
    ]
  },
  actions: [
    {
      id: "assign-issue",
      type: "github_issue_assign",
      name: "Assign to on-call developer",
      parameters: {
        assignee: "@oncall-dev"
      },
      onError: "stop",
      timeout: 30
    },
    {
      id: "notify-team",
      type: "slack_message",
      name: "Notify critical issues channel",
      parameters: {
        channel: "#critical-issues",
        message: "🚨 Critical issue {{issue.number}} has been assigned to {{issue.assignee.login}}\n\n**Title:** {{issue.title}}\n**URL:** {{issue.html_url}}"
      },
      dependsOn: ["assign-issue"],
      onError: "continue"
    }
  ],
  errorHandling: {
    onFailure: "continue",
    maxRetries: 2,
    retryDelay: 30,
    notifyOnError: {
      channels: [
        {
          type: "slack",
          target: "#dev-alerts"
        }
      ],
      message: "Workflow '{{workflow.name}}' failed for issue {{issue.number}}"
    }
  },
  timeout: 300
};

// Example 2: Complex PR Review Workflow
export const prReviewWorkflow: WorkflowDefinition = {
  name: "Smart PR Review Assignment",
  description: "Intelligently assign reviewers based on file changes and team expertise",
  version: "2.1.0",
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
        operator: "OR",
        rules: [
          {
            field: "pull_request.base.ref",
            operator: "equals",
            value: "main"
          },
          {
            field: "pull_request.base.ref",
            operator: "equals",
            value: "develop"
          }
        ]
      }
    ]
  },
  actions: [
    {
      id: "analyze-changes",
      type: "script_execute",
      name: "Analyze file changes",
      parameters: {
        script: "analyze-pr-changes.js",
        timeout: 60
      },
      runAsync: false
    },
    {
      id: "assign-reviewers",
      type: "github_pr_request_review",
      name: "Request reviews from experts",
      parameters: {
        reviewers: "{{analysis.suggested_reviewers}}",
        teams: "{{analysis.suggested_teams}}"
      },
      dependsOn: ["analyze-changes"],
      condition: {
        operator: "AND",
        rules: [
          {
            field: "analysis.confidence",
            operator: "greater_than",
            value: 0.7
          }
        ]
      }
    },
    {
      id: "add-labels",
      type: "github_pr_label",
      name: "Add relevant labels",
      parameters: {
        labels: "{{analysis.suggested_labels}}",
        mode: "add"
      },
      dependsOn: ["analyze-changes"],
      runAsync: true
    },
    {
      id: "notify-author",
      type: "github_pr_comment",
      name: "Welcome comment for author",
      parameters: {
        body: "## 🎉 Thanks for your contribution!\n\n**Auto-assigned reviewers:** {{analysis.reviewer_rationale}}\n\n**Testing checklist:**\n- [ ] Unit tests pass\n- [ ] Integration tests pass\n- [ ] Documentation updated\n\n*This comment was generated automatically by our PR workflow.*"
      },
      dependsOn: ["assign-reviewers"],
      condition: {
        operator: "AND",
        rules: [
          {
            field: "pull_request.user.type",
            operator: "equals",
            value: "User"
          },
          {
            field: "pull_request.author_association",
            operator: "in",
            values: ["FIRST_TIME_CONTRIBUTOR", "CONTRIBUTOR"]
          }
        ]
      }
    }
  ],
  errorHandling: {
    onFailure: "continue",
    maxRetries: 1,
    retryDelay: 60
  },
  timeout: 600
};

// Example 3: Scheduled Cleanup Workflow
export const weeklyCleanupWorkflow: WorkflowDefinition = {
  name: "Weekly Repository Cleanup",
  description: "Clean up stale branches and close inactive issues",
  version: "1.0.0",
  trigger: {
    type: "schedule",
    event: "schedule.weekly",
    schedule: {
      cron: "0 9 * * 1", // Every Monday at 9 AM
      timezone: "UTC"
    }
  },
  actions: [
    {
      id: "find-stale-branches",
      type: "script_execute",
      name: "Find stale branches",
      parameters: {
        script: "find-stale-branches.js",
        staleDays: 30
      }
    },
    {
      id: "notify-branch-owners",
      type: "loop",
      name: "Notify branch owners",
      parameters: {
        items: "{{staleBranches}}",
        itemVariable: "branch",
        maxIterations: 50,
        actions: [
          {
            type: "github_issue_comment",
            parameters: {
              repository: "{{branch.repository}}",
              issueNumber: "{{branch.associatedPR}}",
              body: "⚠️ Branch `{{branch.name}}` appears to be stale ({{branch.daysSinceLastCommit}} days old). Please consider merging or closing this PR."
            },
            condition: {
              operator: "AND",
              rules: [
                {
                  field: "branch.associatedPR",
                  operator: "is_not_null"
                }
              ]
            }
          }
        ]
      },
      dependsOn: ["find-stale-branches"]
    },
    {
      id: "close-inactive-issues",
      type: "script_execute",
      name: "Close inactive issues",
      parameters: {
        script: "close-inactive-issues.js",
        inactiveDays: 90,
        excludeLabels: ["keep-open", "long-term"]
      },
      runAsync: true
    },
    {
      id: "generate-report",
      type: "slack_message",
      name: "Send cleanup report",
      parameters: {
        channel: "#dev-ops",
        message: "📊 Weekly cleanup completed:\n• {{staleBranches.length}} stale branches found\n• {{closedIssues.length}} inactive issues closed\n• {{notifiedPRs.length}} PR owners notified"
      },
      dependsOn: ["notify-branch-owners", "close-inactive-issues"]
    }
  ],
  errorHandling: {
    onFailure: "continue",
    continueOnError: true,
    notifyOnError: {
      channels: [
        {
          type: "slack",
          target: "#dev-ops"
        }
      ]
    }
  },
  timeout: 1800 // 30 minutes
};

// Example 4: Security Vulnerability Response
export const securityResponseWorkflow: WorkflowDefinition = {
  name: "Security Vulnerability Response",
  description: "Automated response to security vulnerability alerts",
  version: "1.0.0",
  trigger: {
    type: "webhook",
    event: "repository_vulnerability_alert",
    repository: "company/*"
  },
  actions: [
    {
      id: "assess-severity",
      type: "script_execute",
      name: "Assess vulnerability severity",
      parameters: {
        script: "assess-vulnerability.js"
      }
    },
    {
      id: "create-security-issue",
      type: "github_create_issue",
      name: "Create security tracking issue",
      parameters: {
        title: "🔒 Security Alert: {{vulnerability.package}} ({{vulnerability.severity}})",
        body: "## Security Vulnerability Detected\n\n**Package:** {{vulnerability.package}}\n**Severity:** {{vulnerability.severity}}\n**CVSS Score:** {{vulnerability.cvss_score}}\n\n**Description:**\n{{vulnerability.description}}\n\n**Affected Versions:** {{vulnerability.affected_versions}}\n**Fixed Version:** {{vulnerability.fixed_version}}\n\n**Action Required:**\n- [ ] Review impact on our codebase\n- [ ] Test fix in development environment\n- [ ] Deploy fix to production\n- [ ] Verify resolution\n\n**References:**\n{{vulnerability.references}}",
        labels: ["security", "vulnerability", "{{vulnerability.severity}}"],
        assignees: ["@security-team"]
      },
      dependsOn: ["assess-severity"]
    },
    {
      id: "notify-security-team",
      type: "slack_message",
      name: "Alert security team",
      parameters: {
        channel: "#security-alerts",
        message: "🚨 **SECURITY ALERT** 🚨\n\nNew vulnerability detected in {{vulnerability.package}}\n**Severity:** {{vulnerability.severity}}\n**CVSS Score:** {{vulnerability.cvss_score}}\n\n**Tracking Issue:** {{issue.html_url}}\n\n<!channel>"
      },
      dependsOn: ["create-security-issue"],
      condition: {
        operator: "OR",
        rules: [
          {
            field: "vulnerability.severity",
            operator: "equals",
            value: "critical"
          },
          {
            field: "vulnerability.severity",  
            operator: "equals",
            value: "high"
          }
        ]
      }
    },
    {
      id: "create-jira-ticket",
      type: "jira_create_ticket",
      name: "Create JIRA security ticket",
      parameters: {
        project: "SEC",
        issueType: "Bug",
        summary: "Security vulnerability: {{vulnerability.package}}",
        description: "Security vulnerability detected in {{vulnerability.package}}. See GitHub issue: {{issue.html_url}}",
        priority: "{{vulnerability.jira_priority}}",
        labels: ["security", "vulnerability"]
      },
      dependsOn: ["create-security-issue"],
      condition: {
        operator: "AND",
        rules: [
          {
            field: "vulnerability.cvss_score",
            operator: "greater_equal",
            value: 7.0
          }
        ]
      }
    }
  ],
  errorHandling: {
    onFailure: "escalate",
    maxRetries: 3,
    retryDelay: 30,
    notifyOnError: {
      channels: [
        {
          type: "slack",
          target: "#security-alerts"
        },
        {
          type: "email",
          target: "security-team@company.com"
        }
      ],
      message: "🚨 CRITICAL: Security workflow failed for vulnerability {{vulnerability.package}}"
    }
  },
  timeout: 900
};

// Example 5: Multi-stage Deployment Workflow
export const deploymentWorkflow: WorkflowDefinition = {
  name: "Multi-stage Deployment Pipeline",
  description: "Automated deployment pipeline with approval gates",
  version: "3.0.0",
  trigger: {
    type: "webhook",
    event: "workflow_run.completed",
    filters: [
      {
        field: "workflow_run.name",
        operator: "equals",
        value: "CI/CD Pipeline"
      },
      {
        field: "workflow_run.conclusion",
        operator: "equals",
        value: "success"
      },
      {
        field: "workflow_run.head_branch",
        operator: "equals",
        value: "main"
      }
    ]
  },
  actions: [
    {
      id: "deploy-staging",
      type: "http_request",
      name: "Deploy to staging",
      parameters: {
        url: "https://api.deployment-service.com/deploy",
        method: "POST",
        headers: {
          "Authorization": "Bearer {{secrets.DEPLOY_TOKEN}}",
          "Content-Type": "application/json"
        },
        body: {
          environment: "staging",
          version: "{{workflow_run.head_sha}}",
          repository: "{{repository.full_name}}"
        }
      },
      timeout: 600
    },
    {
      id: "run-smoke-tests",
      type: "http_request",
      name: "Run smoke tests on staging",
      parameters: {
        url: "https://api.testing-service.com/smoke-tests",
        method: "POST",
        body: {
          environment: "staging",
          version: "{{workflow_run.head_sha}}"
        }
      },
      dependsOn: ["deploy-staging"],
      retryPolicy: {
        maxAttempts: 3,
        delay: 60,
        backoff: "exponential"
      }
    },
    {
      id: "request-production-approval",
      type: "slack_message",
      name: "Request production deployment approval",
      parameters: {
        channel: "#deployments",
        message: "🚀 **Production Deployment Ready**\n\n**Version:** {{workflow_run.head_sha}}\n**Repository:** {{repository.full_name}}\n**Staging Tests:** ✅ Passed\n\nReact with ✅ to approve production deployment or ❌ to reject.",
        blocks: [
          {
            type: "actions",
            elements: [
              {
                type: "button",
                text: { type: "plain_text", text: "🚀 Deploy to Production" },
                style: "primary",
                action_id: "approve_deployment",
                value: "{{execution.id}}"
              },
              {
                type: "button",
                text: { type: "plain_text", text: "❌ Reject" },
                style: "danger",
                action_id: "reject_deployment",
                value: "{{execution.id}}"
              }
            ]
          }
        ]
      },
      dependsOn: ["run-smoke-tests"]
    },
    {
      id: "wait-for-approval",
      type: "conditional",
      name: "Wait for deployment approval",
      parameters: {
        condition: {
          operator: "AND",
          rules: [
            {
              field: "approval.status",
              operator: "equals",
              value: "approved"
            }
          ]
        },
        onTrue: [
          {
            type: "http_request",
            parameters: {
              url: "https://api.deployment-service.com/deploy",
              method: "POST",
              body: {
                environment: "production",
                version: "{{workflow_run.head_sha}}",
                repository: "{{repository.full_name}}"
              }
            }
          },
          {
            type: "slack_message",
            parameters: {
              channel: "#deployments",
              message: "✅ **Production Deployment Completed**\n\n**Version:** {{workflow_run.head_sha}}\n**Deployed by:** {{approval.user}}\n**Status:** Success"
            }
          }
        ],
        onFalse: [
          {
            type: "slack_message",
            parameters: {
              channel: "#deployments",
              message: "❌ **Production Deployment Rejected**\n\n**Version:** {{workflow_run.head_sha}}\n**Rejected by:** {{approval.user}}\n**Reason:** {{approval.reason}}"
            }
          }
        ]
      },
      dependsOn: ["request-production-approval"],
      timeout: 3600 // 1 hour timeout for approval
    }
  ],
  errorHandling: {
    onFailure: "stop",
    maxRetries: 1,
    notifyOnError: {
      channels: [
        {
          type: "slack",
          target: "#deployments"
        }
      ]
    }
  },
  timeout: 7200 // 2 hours total
};

export const workflowExamples = {
  criticalIssueWorkflow,
  prReviewWorkflow,
  weeklyCleanupWorkflow,
  securityResponseWorkflow,
  deploymentWorkflow
};