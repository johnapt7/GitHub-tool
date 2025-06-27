// Integration Framework Exports
export * from '../../types/integration';
export { BaseIntegrationAdapter } from './BaseIntegrationAdapter';
export { HttpIntegrationAdapter } from './HttpIntegrationAdapter';
export { OAuth2Service } from './OAuth2Service';
export { IntegrationErrorHandler, ErrorCategory } from './IntegrationErrorHandler';
export { IntegrationManager, integrationManager } from './IntegrationManager';

// Example adapters
export { SlackIntegrationAdapter } from './examples/SlackIntegrationAdapter';

// Re-export types for convenience
export type {
  IntegrationConfig,
  OAuth2Config,
  OAuth2Credentials,
  IntegrationError,
  TokenRefreshResponse,
  RequestContext,
  ResponseData,
  IntegrationMetrics,
  RateLimitInfo,
  RetryContext
} from '../../types/integration';

export type {
  IntegrationRegistry,
  IntegrationHealth
} from './IntegrationManager';