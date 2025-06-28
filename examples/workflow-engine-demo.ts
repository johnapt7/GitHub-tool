import { WorkflowService } from '../services/workflow-service';
import { WorkflowDefinition } from '../types/workflow-schema';
import { criticalIssueWorkflow, prReviewWorkflow } from './workflow-examples';
import logger from '../utils/logger';

/**
 * Comprehensive demonstration of the Workflow Engine
 * Shows execution of complex workflows with dependencies, retries, and error handling
 */
export class WorkflowEngineDemo {
  private workflowService: WorkflowService;

  constructor() {
    this.workflowService = new WorkflowService({
      enableMetrics: true,
      maxConcurrentExecutions: 5,
      defaultTimeout: 300
    });

    this.setupEventListeners();
  }

  /**
   * Run the complete demo
   */
  public async runDemo(): Promise<void> {
    logger.info('🚀 Starting Workflow Engine Demo\n');
    logger.info('🚀 Starting Workflow Engine Demo\n');

    try {
      // Step 1: Register workflows
      await this.registerDemoWorkflows();

      // Step 2: Demonstrate simple workflow execution
      await this.demonstrateSimpleExecution();

      // Step 3: Demonstrate complex workflow with dependencies
      await this.demonstrateComplexWorkflow();

      // Step 4: Demonstrate retry mechanisms
      await this.demonstrateRetryLogic();

      // Step 5: Demonstrate parallel execution
      await this.demonstrateParallelExecution();

      // Step 6: Show execution history and metrics
      await this.demonstrateHistoryAndMetrics();

      // Step 7: Demonstrate error handling
      await this.demonstrateErrorHandling();

      logger.info('\n✅ Demo completed successfully!');
      logger.info('\n✅ Demo completed successfully!');

    } catch (error) {
      logger.error('❌ Demo failed:', error);
      logger.error('❌ Demo failed:', error);
    }
  }

  /**
   * Register demo workflows
   */
  private async registerDemoWorkflows(): Promise<void> {
    logger.info('📋 Registering demo workflows...\n');
    logger.info('📋 Registering demo workflows...\n');

    const workflows: WorkflowDefinition[] = [
      criticalIssueWorkflow,
      prReviewWorkflow,
      this.createSimpleWorkflow(),
      this.createRetryDemoWorkflow(),
      this.createParallelWorkflow(),
      this.createErrorHandlingWorkflow()
    ];

    for (const workflow of workflows) {
      try {
        await this.workflowService.registerWorkflow(workflow);
        logger.info(`✅ Registered: ${workflow.name}`);
        logger.info(`✅ Registered: ${workflow.name}`);
      } catch (error) {
        logger.error(`❌ Failed to register ${workflow.name}:`, error);
        logger.error(`❌ Failed to register ${workflow.name}:`, error);
      }
    }

    logger.info(`\n📊 Total workflows registered: ${this.workflowService.listWorkflows().length}\n`);
    logger.info(`\n📊 Total workflows registered: ${this.workflowService.listWorkflows().length}\n`);
  }

  /**
   * Demonstrate simple workflow execution
   */
  private async demonstrateSimpleExecution(): Promise<void> {
    logger.info('🏃 Demonstrating Simple Workflow Execution\n');
    logger.info('🏃 Demonstrating Simple Workflow Execution\n');

    const triggerEvent = {
      event: 'manual',
      payload: {
        user: 'demo-user',
        message: 'Hello from simple workflow!'
      }
    };

    try {
      const result = await this.workflowService.executeWorkflow({
        workflowName: 'Simple Demo Workflow',
        triggerEvent,
        variables: { environment: 'demo' }
      });

      logger.info(`✅ Execution completed: ${result.executionId}`);
      logger.info(`   Status: ${result.status}`);
      logger.info(`   Duration: ${result.duration}ms`);
      logger.info(`   Actions: ${result.actionResults.length}\n`);
      
      logger.info(`✅ Execution completed: ${result.executionId}`);
      logger.info(`   Status: ${result.status}`);
      logger.info(`   Duration: ${result.duration}ms`);
      logger.info(`   Actions: ${result.actionResults.length}\n`);

    } catch (error) {
      logger.error('❌ Simple execution failed:', error);
      logger.error('❌ Simple execution failed:', error);
    }
  }

  /**
   * Demonstrate complex workflow with dependencies
   */
  private async demonstrateComplexWorkflow(): Promise<void> {
    logger.info('🔗 Demonstrating Complex Workflow with Dependencies\n');
    logger.info('🔗 Demonstrating Complex Workflow with Dependencies\n');

    const triggerEvent = {
      event: 'pull_request.opened',
      payload: {
        pull_request: {
          number: 123,
          title: 'Add new feature',
          changed_files: 15,
          base: { ref: 'main' },
          user: { type: 'User' },
          author_association: 'CONTRIBUTOR',
          draft: false
        },
        repository: {
          full_name: 'company/demo-repo'
        }
      }
    };

    try {
      const result = await this.workflowService.executeWorkflow({
        workflowName: 'Smart PR Review Assignment',
        triggerEvent,
        variables: { 
          reviewTeam: 'senior-developers',
          autoAssign: true
        }
      });

      logger.info(`✅ Complex execution completed: ${result.executionId}`);
      logger.info(`   Status: ${result.status}`);
      logger.info(`   Duration: ${result.duration}ms`);
      logger.info(`   Actions executed: ${result.actionResults.length}`);
      
      if (result.metrics) {
        logger.info(`   Success rate: ${((result.metrics.successfulActions / result.metrics.totalActions) * 100).toFixed(1)}%`);
        logger.info(`   Avg action duration: ${result.metrics.averageActionDuration.toFixed(0)}ms`);
      }
      logger.info('');
      
      logger.info(`✅ Complex execution completed: ${result.executionId}`);
      logger.info(`   Status: ${result.status}`);
      logger.info(`   Duration: ${result.duration}ms`);
      logger.info(`   Actions executed: ${result.actionResults.length}`);
      
      if (result.metrics) {
        logger.info(`   Success rate: ${((result.metrics.successfulActions / result.metrics.totalActions) * 100).toFixed(1)}%`);
        logger.info(`   Avg action duration: ${result.metrics.averageActionDuration.toFixed(0)}ms`);
      }
      logger.info();

    } catch (error) {
      logger.error('❌ Complex execution failed:', error);
      logger.error('❌ Complex execution failed:', error);
    }
  }

  /**
   * Demonstrate retry logic with exponential backoff
   */
  private async demonstrateRetryLogic(): Promise<void> {
    logger.info('🔄 Demonstrating Retry Logic with Exponential Backoff\n');
    logger.info('🔄 Demonstrating Retry Logic with Exponential Backoff\n');

    const triggerEvent = {
      event: 'test_retry',
      payload: {
        should_fail: true,
        failure_count: 2 // Fail first 2 attempts, succeed on 3rd
      }
    };

    try {
      const result = await this.workflowService.executeWorkflow({
        workflowName: 'Retry Demo Workflow',
        triggerEvent,
        variables: { simulateFailure: true }
      });

      logger.info(`✅ Retry execution completed: ${result.executionId}`);
      logger.info(`   Status: ${result.status}`);
      logger.info(`   Total retries: ${result.metrics?.totalRetries || 0}`);
      
      result.actionResults.forEach((action, index) => {
        if (action.retryCount > 0) {
          logger.info(`   Action ${index + 1}: ${action.retryCount} retries`);
        }
      });
      logger.info('');
      
      logger.info(`✅ Retry execution completed: ${result.executionId}`);
      logger.info(`   Status: ${result.status}`);
      logger.info(`   Total retries: ${result.metrics?.totalRetries || 0}`);
      
      result.actionResults.forEach((action, index) => {
        if (action.retryCount > 0) {
          logger.info(`   Action ${index + 1}: ${action.retryCount} retries`);
        }
      });
      logger.info();

    } catch (error) {
      logger.error('❌ Retry demonstration failed:', error);
      logger.error('❌ Retry demonstration failed:', error);
    }
  }

  /**
   * Demonstrate parallel execution
   */
  private async demonstrateParallelExecution(): Promise<void> {
    logger.info('⚡ Demonstrating Parallel Action Execution\n');
    logger.info('⚡ Demonstrating Parallel Action Execution\n');

    const triggerEvent = {
      event: 'deployment',
      payload: {
        environment: 'staging',
        version: '1.2.3',
        services: ['api', 'web', 'worker']
      }
    };

    try {
      const result = await this.workflowService.executeWorkflow({
        workflowName: 'Parallel Demo Workflow',
        triggerEvent,
        variables: { enableParallel: true }
      });

      logger.info(`✅ Parallel execution completed: ${result.executionId}`);
      logger.info(`   Status: ${result.status}`);
      logger.info(`   Duration: ${result.duration}ms`);
      logger.info(`   Parallel efficiency demonstrated`);
      logger.info('');
      
      logger.info(`✅ Parallel execution completed: ${result.executionId}`);
      logger.info(`   Status: ${result.status}`);
      logger.info(`   Duration: ${result.duration}ms`);
      logger.info(`   Parallel efficiency demonstrated`);
      logger.info();

    } catch (error) {
      logger.error('❌ Parallel execution failed:', error);
      logger.error('❌ Parallel execution failed:', error);
    }
  }

  /**
   * Demonstrate execution history and metrics
   */
  private async demonstrateHistoryAndMetrics(): Promise<void> {
    logger.info('📊 Demonstrating Execution History and Metrics\n');
    logger.info('📊 Demonstrating Execution History and Metrics\n');

    try {
      // Get recent executions
      const executions = await this.workflowService.getExecutionHistory({
        limit: 10,
        includeActions: true
      });

      logger.info(`📈 Recent Executions (${executions.length}):`);
      executions.slice(0, 5).forEach((exec, index) => {
        logger.info(`   ${index + 1}. ${exec.workflowName} - ${exec.status} (${exec.duration || 0}ms)`);
      });
      
      logger.info(`📈 Recent Executions (${executions.length}):`);
      executions.slice(0, 5).forEach((exec, index) => {
        logger.info(`   ${index + 1}. ${exec.workflowName} - ${exec.status} (${exec.duration || 0}ms)`);
      });

      // Get aggregated metrics
      const aggregation = await this.workflowService.getExecutionAggregation();
      
      logger.info(`\n📊 Overall Metrics:`);
      logger.info(`   Total executions: ${aggregation.totalExecutions}`);
      logger.info(`   Success rate: ${(aggregation.successRate * 100).toFixed(1)}%`);
      logger.info(`   Average duration: ${aggregation.averageDuration.toFixed(0)}ms`);
      
      if (aggregation.mostFrequentErrors.length > 0) {
        logger.info(`   Most common error: ${aggregation.mostFrequentErrors[0]!.error}`);
      }
      logger.info('');
      
      logger.info(`\n📊 Overall Metrics:`);
      logger.info(`   Total executions: ${aggregation.totalExecutions}`);
      logger.info(`   Success rate: ${(aggregation.successRate * 100).toFixed(1)}%`);
      logger.info(`   Average duration: ${aggregation.averageDuration.toFixed(0)}ms`);
      
      if (aggregation.mostFrequentErrors.length > 0) {
        logger.info(`   Most common error: ${aggregation.mostFrequentErrors[0]!.error}`);
      }
      logger.info();

    } catch (error) {
      logger.error('❌ Failed to get history/metrics:', error);
      logger.error('❌ Failed to get history/metrics:', error);
    }
  }

  /**
   * Demonstrate error handling strategies
   */
  private async demonstrateErrorHandling(): Promise<void> {
    logger.info('🛡️ Demonstrating Error Handling Strategies\n');
    logger.info('🛡️ Demonstrating Error Handling Strategies\n');

    const triggerEvent = {
      event: 'error_test',
      payload: {
        force_error: true,
        error_type: 'ActionExecutionError'
      }
    };

    try {
      const result = await this.workflowService.executeWorkflow({
        workflowName: 'Error Handling Demo Workflow',
        triggerEvent,
        variables: { testErrorHandling: true }
      });

      logger.info(`✅ Error handling execution completed: ${result.executionId}`);
      logger.info(`   Status: ${result.status}`);
      logger.info(`   Errors handled gracefully: ${result.actionResults.filter(a => a.status === 'failed').length}`);
      logger.info(`   Actions continued: ${result.actionResults.filter(a => a.status === 'completed').length}`);
      logger.info('');
      
      logger.info(`✅ Error handling execution completed: ${result.executionId}`);
      logger.info(`   Status: ${result.status}`);
      logger.info(`   Errors handled gracefully: ${result.actionResults.filter(a => a.status === 'failed').length}`);
      logger.info(`   Actions continued: ${result.actionResults.filter(a => a.status === 'completed').length}`);
      logger.info();

    } catch (error) {
      logger.info(`✅ Expected error handled: ${error instanceof Error ? error.message : error}`);
      logger.info(`   Error handling strategy worked correctly\n`);
      
      logger.info(`✅ Expected error handled: ${error instanceof Error ? error.message : error}`);
      logger.info(`   Error handling strategy worked correctly\n`);
    }
  }

  /**
   * Create simple demo workflow
   */
  private createSimpleWorkflow(): WorkflowDefinition {
    return {
      name: 'Simple Demo Workflow',
      description: 'A simple workflow to demonstrate basic execution',
      version: '1.0.0',
      trigger: {
        type: 'manual',
        event: 'manual'
      },
      actions: [
        {
          id: 'log-start',
          type: 'audit_log',
          name: 'Log workflow start',
          parameters: {
            message: 'Workflow started by {{trigger.payload.user}}',
            level: 'info'
          }
        },
        {
          id: 'delay-action',
          type: 'delay',
          name: 'Short delay',
          parameters: {
            duration: 1000
          },
          dependsOn: ['log-start']
        },
        {
          id: 'log-complete',
          type: 'audit_log',
          name: 'Log workflow completion',
          parameters: {
            message: 'Simple workflow completed successfully',
            level: 'info'
          },
          dependsOn: ['delay-action']
        }
      ],
      errorHandling: {
        onFailure: 'continue'
      },
      timeout: 30
    };
  }

  /**
   * Create retry demonstration workflow
   */
  private createRetryDemoWorkflow(): WorkflowDefinition {
    return {
      name: 'Retry Demo Workflow',
      description: 'Demonstrates retry logic with exponential backoff',
      version: '1.0.0',
      trigger: {
        type: 'manual',
        event: 'test_retry'
      },
      actions: [
        {
          id: 'flaky-action',
          type: 'http_request',
          name: 'Flaky HTTP request',
          parameters: {
            url: 'https://httpstat.us/500', // Simulates server error
            method: 'GET'
          },
          retryPolicy: {
            maxAttempts: 3,
            delay: 1,
            backoff: 'exponential',
            retryOn: ['Error', 'HTTPError']
          },
          onError: 'retry'
        },
        {
          id: 'retry-success',
          type: 'audit_log',
          name: 'Log retry success',
          parameters: {
            message: 'Action succeeded after retries',
            level: 'info'
          },
          dependsOn: ['flaky-action']
        }
      ],
      errorHandling: {
        onFailure: 'continue',
        maxRetries: 2
      }
    };
  }

  /**
   * Create parallel execution workflow
   */
  private createParallelWorkflow(): WorkflowDefinition {
    return {
      name: 'Parallel Demo Workflow',
      description: 'Demonstrates parallel action execution',
      version: '1.0.0',
      trigger: {
        type: 'manual',
        event: 'deployment'
      },
      actions: [
        {
          id: 'prepare',
          type: 'audit_log',
          name: 'Prepare deployment',
          parameters: {
            message: 'Preparing deployment for {{trigger.payload.environment}}',
            level: 'info'
          }
        },
        {
          id: 'deploy-api',
          type: 'http_request',
          name: 'Deploy API service',
          parameters: {
            url: 'https://api.deployment.com/deploy/api',
            method: 'POST',
            body: { version: '{{trigger.payload.version}}' }
          },
          dependsOn: ['prepare'],
          runAsync: true
        },
        {
          id: 'deploy-web',
          type: 'http_request',
          name: 'Deploy Web service',
          parameters: {
            url: 'https://api.deployment.com/deploy/web',
            method: 'POST',
            body: { version: '{{trigger.payload.version}}' }
          },
          dependsOn: ['prepare'],
          runAsync: true
        },
        {
          id: 'deploy-worker',
          type: 'http_request',
          name: 'Deploy Worker service',
          parameters: {
            url: 'https://api.deployment.com/deploy/worker',
            method: 'POST',
            body: { version: '{{trigger.payload.version}}' }
          },
          dependsOn: ['prepare'],
          runAsync: true
        },
        {
          id: 'verify-deployment',
          type: 'audit_log',
          name: 'Verify deployment',
          parameters: {
            message: 'All services deployed successfully',
            level: 'info'
          },
          dependsOn: ['deploy-api', 'deploy-web', 'deploy-worker']
        }
      ]
    };
  }

  /**
   * Create error handling demonstration workflow
   */
  private createErrorHandlingWorkflow(): WorkflowDefinition {
    return {
      name: 'Error Handling Demo Workflow',
      description: 'Demonstrates various error handling strategies',
      version: '1.0.0',
      trigger: {
        type: 'manual',
        event: 'error_test'
      },
      actions: [
        {
          id: 'failing-action',
          type: 'http_request',
          name: 'Action that will fail',
          parameters: {
            url: 'https://httpstat.us/404',
            method: 'GET'
          },
          onError: 'continue'
        },
        {
          id: 'error-handler',
          type: 'audit_log',
          name: 'Handle error gracefully',
          parameters: {
            message: 'Previous action failed, but workflow continues',
            level: 'warn'
          },
          dependsOn: ['failing-action']
        },
        {
          id: 'recovery-action',
          type: 'http_request',
          name: 'Recovery action',
          parameters: {
            url: 'https://httpstat.us/200',
            method: 'GET'
          },
          dependsOn: ['error-handler']
        }
      ],
      errorHandling: {
        onFailure: 'continue',
        continueOnError: true
      }
    };
  }

  /**
   * Setup event listeners for demo
   */
  private setupEventListeners(): void {
    this.workflowService.on('execution:started', (data) => {
      logger.info(`🏁 Execution started: ${data.executionId} (${data.workflow})`);
      logger.info(`🏁 Execution started: ${data.executionId} (${data.workflow})`);
    });

    this.workflowService.on('execution:completed', (data) => {
      logger.info(`✅ Execution completed: ${data.executionId} - ${data.status}`);
      logger.info(`✅ Execution completed: ${data.executionId} - ${data.status}`);
    });

    this.workflowService.on('execution:failed', (data) => {
      logger.info(`❌ Execution failed: ${data.executionId}`);
      logger.info(`❌ Execution failed: ${data.executionId}`);
    });

    this.workflowService.on('workflow:registered', (data) => {
      // logger.info(`📋 Workflow registered: ${data.workflowName}`);
      // logger.info(`📋 Workflow registered: ${data.workflowName}`);
    });
  }
}

/**
 * Run the demo if this file is executed directly
 */
if (require.main === module) {
  const demo = new WorkflowEngineDemo();
  demo.runDemo().catch((error) => {
    logger.error('Failed to run workflow demo:', error);
    logger.error(error);
  });
}

