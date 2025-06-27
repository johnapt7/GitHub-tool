import {
  IntegrationConfig,
  OAuth2Credentials,
  TokenRefreshResponse,
  RequestContext,
  ResponseData,
  RateLimitInfo
} from '../../types/integration';
import { BaseIntegrationAdapter } from './BaseIntegrationAdapter';
import { OAuth2Service } from './OAuth2Service';
import { IntegrationErrorHandler } from './IntegrationErrorHandler';
import logger from '../../utils/logger';

/**
 * HTTP-based integration adapter with OAuth2 support
 * This is a concrete implementation of BaseIntegrationAdapter using fetch API
 */
export class HttpIntegrationAdapter extends BaseIntegrationAdapter {
  private readonly oauth2Service?: OAuth2Service;
  private authorizationCode?: string;
  private tokenRefreshPromise?: Promise<TokenRefreshResponse>;

  constructor(config: IntegrationConfig) {
    super(config);
    
    if (config.oauth2) {
      this.oauth2Service = new OAuth2Service(config.oauth2);
    }
  }

  /**
   * Set authorization code for OAuth2 flow
   */
  setAuthorizationCode(code: string): void {
    this.authorizationCode = code;
  }

  /**
   * Generate OAuth2 authorization URL
   */
  generateAuthUrl(state?: string): string {
    if (!this.oauth2Service) {
      throw IntegrationErrorHandler.createError(
        'OAuth2 not configured for this integration',
        'OAUTH2_NOT_CONFIGURED'
      );
    }
    
    return this.oauth2Service.generateAuthUrl(state);
  }

  // Implementation of abstract methods from BaseIntegrationAdapter

  async authenticate(): Promise<OAuth2Credentials> {
    if (!this.oauth2Service) {
      throw IntegrationErrorHandler.createError(
        'OAuth2 service not available',
        'OAUTH2_NOT_AVAILABLE'
      );
    }

    if (this.authorizationCode) {
      // Use authorization code flow
      logger.info('Authenticating using authorization code', {
        integration: this.config.name
      });
      
      return await this.oauth2Service.exchangeCodeForToken(this.authorizationCode);
    } else {
      // Use client credentials flow
      logger.info('Authenticating using client credentials', {
        integration: this.config.name
      });
      
      return await this.oauth2Service.getClientCredentialsToken();
    }
  }

  async refreshToken(): Promise<TokenRefreshResponse> {
    if (!this.oauth2Service) {
      throw IntegrationErrorHandler.createError(
        'OAuth2 service not available',
        'OAUTH2_NOT_AVAILABLE'
      );
    }

    if (!this.credentials?.refreshToken) {
      throw IntegrationErrorHandler.createError(
        'No refresh token available',
        'NO_REFRESH_TOKEN'
      );
    }

    // Prevent concurrent token refresh attempts
    if (this.tokenRefreshPromise) {
      logger.info('Token refresh already in progress, waiting for completion');
      return await this.tokenRefreshPromise;
    }

    try {
      this.tokenRefreshPromise = this.oauth2Service.refreshAccessToken(this.credentials.refreshToken);
      const result = await this.tokenRefreshPromise;
      
      logger.info('Token refreshed successfully', {
        integration: this.config.name,
        expiresIn: result.expiresIn
      });
      
      return result;
    } finally {
      delete this.tokenRefreshPromise;
    }
  }

  isAuthenticated(): boolean {
    if (!this.credentials?.accessToken) {
      return false;
    }

    // Check if token is expired (with 5-minute buffer)
    if (OAuth2Service.isTokenExpired(this.credentials, 5)) {
      return !!this.credentials.refreshToken; // Can refresh if we have refresh token
    }

    return true;
  }

  async handleRateLimit(response: ResponseData): Promise<void> {
    const headers = response.headers;
    
    // Extract rate limit information from headers
    const limit = this.parseHeaderValue(headers['x-ratelimit-limit'] || headers['x-rate-limit-limit']);
    const remaining = this.parseHeaderValue(headers['x-ratelimit-remaining'] || headers['x-rate-limit-remaining']);
    const resetHeader = headers['x-ratelimit-reset'] || headers['x-rate-limit-reset'];
    
    if (limit !== null || remaining !== null || resetHeader) {
      let resetTime: Date;
      
      if (resetHeader) {
        // Reset time can be Unix timestamp or seconds from now
        const resetValue = parseInt(resetHeader, 10);
        if (resetValue > 1000000000) {
          // Unix timestamp
          resetTime = new Date(resetValue * 1000);
        } else {
          // Seconds from now
          resetTime = new Date(Date.now() + resetValue * 1000);
        }
      } else {
        // Default to 1 hour from now if no reset time
        resetTime = new Date(Date.now() + 3600000);
      }

      this.rateLimitInfo = {
        limit: limit || 0,
        remaining: remaining || 0,
        resetTime,
        isLimited: remaining !== null && remaining <= 0
      };

      if (this.rateLimitInfo.isLimited) {
        logger.warn('Rate limit exceeded', {
          integration: this.config.name,
          limit: this.rateLimitInfo.limit,
          resetTime: this.rateLimitInfo.resetTime
        });
      }
    }
  }

  // HTTP request execution using fetch API
  protected async executeRequest<T>(context: RequestContext): Promise<ResponseData<T>> {
    const controller = new AbortController();
    const timeoutId = context.timeout ? 
      setTimeout(() => controller.abort(), context.timeout) : 
      null;

    try {
      logger.debug('Making HTTP request', {
        integration: this.config.name,
        method: context.method,
        url: context.url,
        hasBody: !!context.body
      });

      const fetchOptions: RequestInit = {
        method: context.method,
        headers: context.headers,
        signal: controller.signal
      };
      
      if (context.body) {
        fetchOptions.body = JSON.stringify(context.body);
      }

      const response = await fetch(context.url, fetchOptions);

      if (timeoutId) {
        clearTimeout(timeoutId);
      }

      // Convert headers to plain object
      const responseHeaders: Record<string, string> = {};
      response.headers.forEach((value, key) => {
        responseHeaders[key] = value;
      });

      // Parse response body
      let responseData: T;
      const contentType = response.headers.get('content-type') || '';
      
      if (contentType.includes('application/json')) {
        const text = await response.text();
        responseData = text ? JSON.parse(text) : null;
      } else {
        responseData = await response.text() as unknown as T;
      }

      const result: ResponseData<T> = {
        data: responseData,
        status: response.status,
        headers: responseHeaders,
        url: response.url
      };

      if (!response.ok) {
        throw IntegrationErrorHandler.createError(
          `HTTP ${response.status}: ${response.statusText}`,
          'HTTP_ERROR',
          response.status,
          undefined,
          {
            method: context.method,
            url: context.url,
            responseData,
            headers: responseHeaders
          }
        );
      }

      logger.debug('HTTP request completed successfully', {
        integration: this.config.name,
        status: response.status,
        url: context.url
      });

      return result;
    } catch (error) {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }

      if (error instanceof Error && error.name === 'AbortError') {
        throw IntegrationErrorHandler.createError(
          'Request timeout',
          'TIMEOUT_ERROR',
          408,
          error,
          { method: context.method, url: context.url }
        );
      }

      if (error instanceof TypeError && error.message.includes('fetch')) {
        throw IntegrationErrorHandler.createError(
          'Network error',
          'NETWORK_ERROR',
          undefined,
          error,
          { method: context.method, url: context.url }
        );
      }

      throw error;
    }
  }

  private parseHeaderValue(value: string | undefined): number | null {
    if (!value) return null;
    const parsed = parseInt(value, 10);
    return isNaN(parsed) ? null : parsed;
  }

  // Convenience methods for common HTTP operations

  async get<T = any>(path: string, headers?: Record<string, string>): Promise<ResponseData<T>> {
    return this.request<T>({
      method: 'GET',
      url: path,
      headers: headers || {}
    });
  }

  async post<T = any>(
    path: string, 
    body?: any, 
    headers?: Record<string, string>
  ): Promise<ResponseData<T>> {
    return this.request<T>({
      method: 'POST',
      url: path,
      body,
      headers: headers || {}
    });
  }

  async put<T = any>(
    path: string, 
    body?: any, 
    headers?: Record<string, string>
  ): Promise<ResponseData<T>> {
    return this.request<T>({
      method: 'PUT',
      url: path,
      body,
      headers: headers || {}
    });
  }

  async patch<T = any>(
    path: string, 
    body?: any, 
    headers?: Record<string, string>
  ): Promise<ResponseData<T>> {
    return this.request<T>({
      method: 'PATCH',
      url: path,
      body,
      headers: headers || {}
    });
  }

  async delete<T = any>(path: string, headers?: Record<string, string>): Promise<ResponseData<T>> {
    return this.request<T>({
      method: 'DELETE',
      url: path,
      headers: headers || {}
    });
  }

  // Token management utilities

  async validateCurrentToken(): Promise<boolean> {
    if (!this.oauth2Service || !this.credentials?.accessToken) {
      return false;
    }

    try {
      // Make a simple API call to validate the token
      await this.get('/user'); // Most APIs have a user endpoint
      return true;
    } catch (error) {
      const integrationError = error as any;
      if (integrationError.statusCode === 401) {
        return false;
      }
      // For other errors, assume token is valid
      return true;
    }
  }

  async revokeToken(): Promise<void> {
    if (!this.oauth2Service || !this.credentials?.accessToken) {
      return;
    }

    try {
      await this.oauth2Service.revokeToken(this.credentials.accessToken);
      logger.info('Token revoked successfully', { integration: this.config.name });
    } catch (error) {
      logger.warn('Failed to revoke token', {
        integration: this.config.name,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    } finally {
      delete this.credentials;
    }
  }
}