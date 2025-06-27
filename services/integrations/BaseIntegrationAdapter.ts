import {
  IntegrationConfig,
  OAuth2Credentials,
  IntegrationError,
  TokenRefreshResponse,
  RetryContext,
  RequestContext,
  ResponseData,
  IntegrationMetrics,
  RateLimitInfo
} from '../../types/integration';
import logger from '../../utils/logger';

export abstract class BaseIntegrationAdapter {
  protected readonly config: IntegrationConfig;
  protected credentials?: OAuth2Credentials;
  protected metrics: IntegrationMetrics;
  protected rateLimitInfo?: RateLimitInfo;

  constructor(config: IntegrationConfig) {
    this.config = config;
    this.metrics = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      averageResponseTime: 0,
      tokenRefreshCount: 0
    };
  }

  // Abstract methods that must be implemented by concrete adapters
  abstract authenticate(): Promise<OAuth2Credentials>;
  abstract refreshToken(): Promise<TokenRefreshResponse>;
  abstract isAuthenticated(): boolean;
  abstract handleRateLimit(response: ResponseData): Promise<void>;

  // Template method for making authenticated requests
  async request<T = any>(context: RequestContext): Promise<ResponseData<T>> {
    const startTime = Date.now();
    
    try {
      // Ensure we have valid authentication
      await this.ensureAuthenticated();
      
      // Check rate limits before making request
      await this.checkRateLimit();
      
      // Add authentication headers
      const enrichedContext = await this.enrichRequestContext(context);
      
      // Make the actual request with retry logic
      const response = await this.executeWithRetry<T>(enrichedContext);
      
      // Update rate limit information
      await this.updateRateLimitInfo(response);
      
      // Update metrics
      this.updateMetrics(true, Date.now() - startTime);
      
      return response;
    } catch (error) {
      this.updateMetrics(false, Date.now() - startTime);
      throw this.createIntegrationError(error, context);
    }
  }

  // Authentication management
  async ensureAuthenticated(): Promise<void> {
    if (!this.isAuthenticated()) {
      if (this.credentials?.refreshToken && this.isTokenExpired()) {
        await this.performTokenRefresh();
      } else {
        this.credentials = await this.authenticate();
      }
    }
  }

  protected async performTokenRefresh(): Promise<void> {
    try {
      logger.info('Refreshing OAuth2 token', { 
        integration: this.config.name,
        credentialsExist: !!this.credentials
      });

      const refreshResponse = await this.refreshToken();
      
      this.credentials = {
        accessToken: refreshResponse.accessToken,
        refreshToken: refreshResponse.refreshToken || this.credentials?.refreshToken,
        expiresAt: refreshResponse.expiresIn ? 
          new Date(Date.now() + refreshResponse.expiresIn * 1000) : 
          this.credentials?.expiresAt,
        tokenType: refreshResponse.tokenType || this.credentials?.tokenType || 'Bearer',
        scope: refreshResponse.scope || this.credentials?.scope
      };

      this.metrics.tokenRefreshCount++;
      
      logger.info('OAuth2 token refreshed successfully', {
        integration: this.config.name,
        expiresAt: this.credentials.expiresAt
      });
    } catch (error) {
      logger.error('Failed to refresh OAuth2 token', {
        integration: this.config.name,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      
      // Clear credentials to force re-authentication
      this.credentials = undefined;
      throw this.createIntegrationError(error, { method: 'POST', url: 'token_refresh' });
    }
  }

  protected isTokenExpired(): boolean {
    if (!this.credentials?.expiresAt) {
      return false; // No expiration info, assume valid
    }
    
    // Add 5-minute buffer for token refresh
    const bufferTime = 5 * 60 * 1000; // 5 minutes in milliseconds
    return new Date().getTime() > (this.credentials.expiresAt.getTime() - bufferTime);
  }

  // Request context enrichment
  protected async enrichRequestContext(context: RequestContext): Promise<RequestContext> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'User-Agent': `${this.config.name}-adapter/1.0.0`,
      ...this.config.headers,
      ...context.headers
    };

    // Add authentication header
    if (this.credentials?.accessToken) {
      const tokenType = this.credentials.tokenType || 'Bearer';
      headers['Authorization'] = `${tokenType} ${this.credentials.accessToken}`;
    } else if (this.config.apiKey) {
      headers['Authorization'] = `Bearer ${this.config.apiKey}`;
    }

    return {
      ...context,
      url: this.buildFullUrl(context.url),
      headers,
      timeout: context.timeout || this.config.timeout || 30000
    };
  }

  protected buildFullUrl(path: string): string {
    if (path.startsWith('http')) {
      return path;
    }
    
    const baseUrl = this.config.baseUrl.endsWith('/') ? 
      this.config.baseUrl.slice(0, -1) : 
      this.config.baseUrl;
    
    const cleanPath = path.startsWith('/') ? path : `/${path}`;
    
    return `${baseUrl}${cleanPath}`;
  }

  // Retry logic
  protected async executeWithRetry<T>(context: RequestContext): Promise<ResponseData<T>> {
    const retryConfig = this.config.retryConfig || {
      maxRetries: 3,
      backoffMultiplier: 2,
      maxBackoffDelay: 10000
    };

    let lastError: IntegrationError | undefined;

    for (let attempt = 0; attempt <= retryConfig.maxRetries; attempt++) {
      try {
        return await this.executeRequest<T>(context);
      } catch (error) {
        const integrationError = this.createIntegrationError(error, context);
        lastError = integrationError;

        if (attempt === retryConfig.maxRetries || !this.shouldRetry(integrationError)) {
          throw integrationError;
        }

        const delay = this.calculateBackoffDelay(attempt, retryConfig);
        
        logger.warn('Request failed, retrying', {
          integration: this.config.name,
          attempt: attempt + 1,
          maxRetries: retryConfig.maxRetries,
          delay,
          error: integrationError.message
        });

        await this.sleep(delay);
      }
    }

    throw lastError!;
  }

  protected calculateBackoffDelay(attempt: number, retryConfig: NonNullable<IntegrationConfig['retryConfig']>): number {
    const baseDelay = 1000; // 1 second
    const delay = baseDelay * Math.pow(retryConfig.backoffMultiplier, attempt);
    return Math.min(delay, retryConfig.maxBackoffDelay);
  }

  protected shouldRetry(error: IntegrationError): boolean {
    // Don't retry authentication errors or bad requests
    if (error.statusCode === 401 || error.statusCode === 403 || error.statusCode === 400) {
      return false;
    }

    // Retry on server errors and rate limits
    return error.isRetryable !== false && (
      !error.statusCode || 
      error.statusCode >= 500 || 
      error.statusCode === 429
    );
  }

  protected async sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Abstract method for actual HTTP execution - to be implemented by concrete adapters
  protected abstract executeRequest<T>(context: RequestContext): Promise<ResponseData<T>>;

  // Rate limit management
  protected async checkRateLimit(): Promise<void> {
    if (this.rateLimitInfo?.isLimited) {
      const waitTime = this.rateLimitInfo.resetTime.getTime() - Date.now();
      if (waitTime > 0) {
        logger.warn('Rate limit active, waiting', {
          integration: this.config.name,
          waitTime: Math.ceil(waitTime / 1000)
        });
        await this.sleep(waitTime);
      }
    }
  }

  protected async updateRateLimitInfo(response: ResponseData): Promise<void> {
    try {
      await this.handleRateLimit(response);
    } catch (error) {
      logger.warn('Failed to update rate limit info', {
        integration: this.config.name,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  // Error handling
  protected createIntegrationError(error: unknown, context: RequestContext): IntegrationError {
    const baseMessage = `Integration error for ${this.config.name}`;
    
    if (error instanceof Error) {
      const integrationError = error as IntegrationError;
      
      if (!integrationError.code) {
        integrationError.code = 'INTEGRATION_ERROR';
      }
      
      integrationError.context = {
        integration: this.config.name,
        method: context.method,
        url: context.url,
        ...integrationError.context
      };
      
      return integrationError;
    }

    const newError: IntegrationError = new Error(`${baseMessage}: ${String(error)}`);
    newError.code = 'UNKNOWN_ERROR';
    newError.context = {
      integration: this.config.name,
      method: context.method,
      url: context.url
    };

    return newError;
  }

  // Metrics and monitoring
  protected updateMetrics(success: boolean, responseTime: number): void {
    this.metrics.totalRequests++;
    this.metrics.lastRequestTime = new Date();
    
    if (success) {
      this.metrics.successfulRequests++;
    } else {
      this.metrics.failedRequests++;
    }
    
    // Update average response time
    const totalTime = this.metrics.averageResponseTime * (this.metrics.totalRequests - 1) + responseTime;
    this.metrics.averageResponseTime = totalTime / this.metrics.totalRequests;
  }

  // Public methods for monitoring and management
  getMetrics(): IntegrationMetrics {
    return { ...this.metrics };
  }

  getRateLimitInfo(): RateLimitInfo | undefined {
    return this.rateLimitInfo ? { ...this.rateLimitInfo } : undefined;
  }

  isHealthy(): boolean {
    const recentFailureRate = this.metrics.totalRequests > 0 ? 
      this.metrics.failedRequests / this.metrics.totalRequests : 0;
    
    return recentFailureRate < 0.5 && this.isAuthenticated();
  }

  async disconnect(): Promise<void> {
    logger.info('Disconnecting integration adapter', { integration: this.config.name });
    this.credentials = undefined;
    this.rateLimitInfo = undefined;
  }
}