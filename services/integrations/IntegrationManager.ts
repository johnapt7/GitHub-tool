import {
  IntegrationConfig,
  IntegrationError,
  IntegrationMetrics
} from '../../types/integration';
import { BaseIntegrationAdapter } from './BaseIntegrationAdapter';
import { HttpIntegrationAdapter } from './HttpIntegrationAdapter';
import { IntegrationErrorHandler } from './IntegrationErrorHandler';
import logger from '../../utils/logger';

export interface IntegrationRegistry {
  [key: string]: {
    adapter: BaseIntegrationAdapter;
    config: IntegrationConfig;
    createdAt: Date;
    lastUsed?: Date;
  };
}

export interface IntegrationHealth {
  id: string;
  name: string;
  isHealthy: boolean;
  isAuthenticated: boolean;
  lastError?: string;
  metrics: IntegrationMetrics;
  rateLimitInfo?: any;
}

/**
 * Central manager for all integrations
 * Handles registration, lifecycle management, and monitoring
 */
export class IntegrationManager {
  private readonly integrations: IntegrationRegistry = {};
  private readonly healthCheckInterval: NodeJS.Timeout;
  private readonly tokenRefreshInterval: NodeJS.Timeout;

  constructor(
    private readonly healthCheckIntervalMs = 300000, // 5 minutes
    private readonly tokenRefreshIntervalMs = 900000   // 15 minutes
  ) {
    // Set up periodic health checks
    this.healthCheckInterval = setInterval(
      () => this.performHealthChecks(),
      this.healthCheckIntervalMs
    );

    // Set up periodic token refresh
    this.tokenRefreshInterval = setInterval(
      () => this.refreshExpiringTokens(),
      this.tokenRefreshIntervalMs
    );

    logger.info('Integration Manager initialized', {
      healthCheckInterval: this.healthCheckIntervalMs,
      tokenRefreshInterval: this.tokenRefreshIntervalMs
    });
  }

  /**
   * Register a new integration
   */
  register(config: IntegrationConfig, adapter?: BaseIntegrationAdapter): void {
    if (this.integrations[config.id]) {
      throw IntegrationErrorHandler.createError(
        `Integration with id '${config.id}' already exists`,
        'INTEGRATION_ALREADY_EXISTS',
        400
      );
    }

    const integrationAdapter = adapter || new HttpIntegrationAdapter(config);

    this.integrations[config.id] = {
      adapter: integrationAdapter,
      config,
      createdAt: new Date()
    };

    logger.info('Integration registered', {
      id: config.id,
      name: config.name,
      hasOAuth2: !!config.oauth2,
      hasApiKey: !!config.apiKey
    });
  }

  /**
   * Get an integration adapter by ID
   */
  get(id: string): BaseIntegrationAdapter {
    const integration = this.integrations[id];
    if (!integration) {
      throw IntegrationErrorHandler.createError(
        `Integration with id '${id}' not found`,
        'INTEGRATION_NOT_FOUND',
        404
      );
    }

    // Update last used timestamp
    integration.lastUsed = new Date();

    return integration.adapter;
  }

  /**
   * Unregister an integration
   */
  async unregister(id: string): Promise<void> {
    const integration = this.integrations[id];
    if (!integration) {
      return; // Already unregistered
    }

    try {
      await integration.adapter.disconnect();
      delete this.integrations[id];
      
      logger.info('Integration unregistered', { id });
    } catch (error) {
      logger.error('Failed to cleanly disconnect integration during unregister', {
        id,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      // Still remove from registry
      delete this.integrations[id];
    }
  }

  /**
   * List all registered integrations
   */
  list(): string[] {
    return Object.keys(this.integrations);
  }

  /**
   * Get health status for all integrations
   */
  async getHealthStatus(): Promise<IntegrationHealth[]> {
    const healthChecks = Object.entries(this.integrations).map(
      async ([id, integration]) => {
        try {
          const adapter = integration.adapter;
          
          return {
            id,
            name: integration.config.name,
            isHealthy: adapter.isHealthy(),
            isAuthenticated: adapter.isAuthenticated(),
            metrics: adapter.getMetrics(),
            rateLimitInfo: adapter.getRateLimitInfo()
          };
        } catch (error) {
          return {
            id,
            name: integration.config.name,
            isHealthy: false,
            isAuthenticated: false,
            lastError: error instanceof Error ? error.message : 'Unknown error',
            metrics: {
              totalRequests: 0,
              successfulRequests: 0,
              failedRequests: 0,
              averageResponseTime: 0,
              tokenRefreshCount: 0
            }
          };
        }
      }
    );

    return Promise.all(healthChecks);
  }

  /**
   * Get health status for a specific integration
   */
  async getIntegrationHealth(id: string): Promise<IntegrationHealth> {
    const integration = this.integrations[id];
    if (!integration) {
      throw IntegrationErrorHandler.createError(
        `Integration with id '${id}' not found`,
        'INTEGRATION_NOT_FOUND',
        404
      );
    }

    try {
      const adapter = integration.adapter;
      
      return {
        id,
        name: integration.config.name,
        isHealthy: adapter.isHealthy(),
        isAuthenticated: adapter.isAuthenticated(),
        metrics: adapter.getMetrics(),
        rateLimitInfo: adapter.getRateLimitInfo()
      };
    } catch (error) {
      return {
        id,
        name: integration.config.name,
        isHealthy: false,
        isAuthenticated: false,
        lastError: error instanceof Error ? error.message : 'Unknown error',
        metrics: {
          totalRequests: 0,
          successfulRequests: 0,
          failedRequests: 0,
          averageResponseTime: 0,
          tokenRefreshCount: 0
        }
      };
    }
  }

  /**
   * Update integration configuration
   */
  updateConfig(id: string, updates: Partial<IntegrationConfig>): void {
    const integration = this.integrations[id];
    if (!integration) {
      throw IntegrationErrorHandler.createError(
        `Integration with id '${id}' not found`,
        'INTEGRATION_NOT_FOUND',
        404
      );
    }

    // Create updated config (immutable update)
    const updatedConfig: IntegrationConfig = {
      ...integration.config,
      ...updates,
      id: integration.config.id // Prevent ID changes
    };

    integration.config = updatedConfig;

    logger.info('Integration configuration updated', {
      id,
      updatedFields: Object.keys(updates)
    });
  }

  /**
   * Authenticate an integration with authorization code
   */
  async authenticateWithCode(id: string, authorizationCode: string): Promise<void> {
    const adapter = this.get(id);
    
    if (!(adapter instanceof HttpIntegrationAdapter)) {
      throw IntegrationErrorHandler.createError(
        'Integration does not support OAuth2 authentication',
        'OAUTH2_NOT_SUPPORTED',
        400
      );
    }

    try {
      adapter.setAuthorizationCode(authorizationCode);
      await adapter.ensureAuthenticated();
      
      logger.info('Integration authenticated with authorization code', { id });
    } catch (error) {
      logger.error('Failed to authenticate integration with code', {
        id,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  /**
   * Get OAuth2 authorization URL for an integration
   */
  getAuthorizationUrl(id: string, state?: string): string {
    const adapter = this.get(id);
    
    if (!(adapter instanceof HttpIntegrationAdapter)) {
      throw IntegrationErrorHandler.createError(
        'Integration does not support OAuth2 authentication',
        'OAUTH2_NOT_SUPPORTED',
        400
      );
    }

    return adapter.generateAuthUrl(state);
  }

  /**
   * Perform health checks on all integrations
   */
  private async performHealthChecks(): Promise<void> {
    logger.debug('Performing integration health checks');

    const integrationIds = Object.keys(this.integrations);
    const healthChecks = integrationIds.map(async (id) => {
      try {
        const integration = this.integrations[id];
        const adapter = integration.adapter;
        
        const isHealthy = adapter.isHealthy();
        const metrics = adapter.getMetrics();
        
        if (!isHealthy) {
          logger.warn('Integration health check failed', {
            id,
            name: integration.config.name,
            metrics
          });
        }
        
        return { id, isHealthy, metrics };
      } catch (error) {
        logger.error('Health check error', {
          id,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
        return { id, isHealthy: false, error };
      }
    });

    const results = await Promise.allSettled(healthChecks);
    const failedChecks = results.filter(result => 
      result.status === 'rejected' || 
      (result.status === 'fulfilled' && !result.value.isHealthy)
    ).length;

    if (failedChecks > 0) {
      logger.warn('Some integrations failed health checks', {
        total: integrationIds.length,
        failed: failedChecks
      });
    }
  }

  /**
   * Refresh tokens that are near expiration
   */
  private async refreshExpiringTokens(): Promise<void> {
    logger.debug('Checking for expiring tokens');

    const refreshPromises = Object.entries(this.integrations).map(
      async ([id, integration]) => {
        try {
          const adapter = integration.adapter;
          
          if (adapter instanceof HttpIntegrationAdapter) {
            // This will check for expiration and refresh if needed
            await adapter.ensureAuthenticated();
          }
        } catch (error) {
          logger.warn('Failed to refresh token during periodic check', {
            id,
            error: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      }
    );

    await Promise.allSettled(refreshPromises);
  }

  /**
   * Get aggregated metrics across all integrations
   */
  getAggregatedMetrics(): IntegrationMetrics {
    const allMetrics = Object.values(this.integrations).map(
      integration => integration.adapter.getMetrics()
    );

    return allMetrics.reduce(
      (acc, metrics) => ({
        totalRequests: acc.totalRequests + metrics.totalRequests,
        successfulRequests: acc.successfulRequests + metrics.successfulRequests,
        failedRequests: acc.failedRequests + metrics.failedRequests,
        averageResponseTime: (acc.averageResponseTime + metrics.averageResponseTime) / 2,
        tokenRefreshCount: acc.tokenRefreshCount + metrics.tokenRefreshCount,
        lastRequestTime: !acc.lastRequestTime || 
          (metrics.lastRequestTime && metrics.lastRequestTime > acc.lastRequestTime) ?
          metrics.lastRequestTime : acc.lastRequestTime
      }),
      {
        totalRequests: 0,
        successfulRequests: 0,
        failedRequests: 0,
        averageResponseTime: 0,
        tokenRefreshCount: 0
      }
    );
  }

  /**
   * Cleanup method for graceful shutdown
   */
  async cleanup(): Promise<void> {
    logger.info('Cleaning up Integration Manager');

    // Clear intervals
    clearInterval(this.healthCheckInterval);
    clearInterval(this.tokenRefreshInterval);

    // Disconnect all integrations
    const disconnectPromises = Object.entries(this.integrations).map(
      async ([id, integration]) => {
        try {
          await integration.adapter.disconnect();
        } catch (error) {
          logger.warn('Failed to disconnect integration during cleanup', {
            id,
            error: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      }
    );

    await Promise.allSettled(disconnectPromises);

    // Clear registry
    Object.keys(this.integrations).forEach(id => {
      delete this.integrations[id];
    });

    logger.info('Integration Manager cleanup completed');
  }
}

// Singleton instance for global use
export const integrationManager = new IntegrationManager();