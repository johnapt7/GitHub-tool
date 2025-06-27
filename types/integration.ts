export interface OAuth2Config {
  clientId: string;
  clientSecret: string;
  authorizationUrl: string;
  tokenUrl: string;
  scope?: string;
  redirectUri?: string;
}

export interface OAuth2Credentials {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: Date;
  tokenType?: string;
  scope?: string;
}

export interface IntegrationConfig {
  id: string;
  name: string;
  baseUrl: string;
  oauth2?: OAuth2Config;
  apiKey?: string;
  headers?: Record<string, string>;
  timeout?: number;
  retryConfig?: {
    maxRetries: number;
    backoffMultiplier: number;
    maxBackoffDelay: number;
  };
}

export interface IntegrationError extends Error {
  code: string;
  statusCode?: number;
  isRetryable?: boolean;
  context?: Record<string, any>;
  originalError?: Error;
}

export interface TokenRefreshResponse {
  accessToken: string;
  refreshToken?: string;
  expiresIn?: number;
  tokenType?: string;
  scope?: string;
}

export interface RetryContext {
  attempt: number;
  maxRetries: number;
  delay: number;
  error: IntegrationError;
}

export interface RequestContext {
  method: string;
  url: string;
  headers?: Record<string, string>;
  body?: any;
  timeout?: number;
}

export interface ResponseData<T = any> {
  data: T;
  status: number;
  headers: Record<string, string>;
  url: string;
}

export interface IntegrationMetrics {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  averageResponseTime: number;
  lastRequestTime?: Date;
  tokenRefreshCount: number;
}

export interface RateLimitInfo {
  limit: number;
  remaining: number;
  resetTime: Date;
  isLimited: boolean;
}