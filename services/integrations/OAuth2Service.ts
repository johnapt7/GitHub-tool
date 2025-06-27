import {
  OAuth2Config,
  OAuth2Credentials,
  TokenRefreshResponse,
  IntegrationError
} from '../../types/integration';
import logger from '../../utils/logger';

interface OAuth2TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  token_type?: string;
  scope?: string;
  error?: string;
  error_description?: string;
}

export class OAuth2Service {
  private readonly config: OAuth2Config;

  constructor(config: OAuth2Config) {
    this.config = config;
  }

  /**
   * Generate authorization URL for OAuth2 flow
   */
  generateAuthUrl(state?: string, additionalParams?: Record<string, string>): string {
    const params = new URLSearchParams({
      client_id: this.config.clientId,
      response_type: 'code',
      redirect_uri: this.config.redirectUri || '',
      ...(this.config.scope && { scope: this.config.scope }),
      ...(state && { state }),
      ...additionalParams
    });

    return `${this.config.authorizationUrl}?${params.toString()}`;
  }

  /**
   * Exchange authorization code for access token
   */
  async exchangeCodeForToken(
    authorizationCode: string,
    state?: string
  ): Promise<OAuth2Credentials> {
    try {
      logger.info('Exchanging authorization code for token', {
        hasCode: !!authorizationCode,
        state
      });

      const response = await this.makeTokenRequest({
        grant_type: 'authorization_code',
        code: authorizationCode,
        redirect_uri: this.config.redirectUri || '',
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret
      });

      return this.parseTokenResponse(response);
    } catch (error) {
      logger.error('Failed to exchange code for token', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw this.createOAuth2Error(error, 'code_exchange');
    }
  }

  /**
   * Refresh access token using refresh token
   */
  async refreshAccessToken(refreshToken: string): Promise<TokenRefreshResponse> {
    try {
      logger.info('Refreshing access token');

      const response = await this.makeTokenRequest({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret
      });

      const credentials = this.parseTokenResponse(response);

      const response: TokenRefreshResponse = {
        accessToken: credentials.accessToken
      };
      
      if (credentials.refreshToken !== undefined) {
        response.refreshToken = credentials.refreshToken;
      }
      
      if (credentials.expiresAt) {
        response.expiresIn = Math.floor((credentials.expiresAt.getTime() - Date.now()) / 1000);
      }
      
      if (credentials.tokenType !== undefined) {
        response.tokenType = credentials.tokenType;
      }
      
      if (credentials.scope !== undefined) {
        response.scope = credentials.scope;
      }
      
      return response;
    } catch (error) {
      logger.error('Failed to refresh access token', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw this.createOAuth2Error(error, 'token_refresh');
    }
  }

  /**
   * Get client credentials token (for server-to-server auth)
   */
  async getClientCredentialsToken(): Promise<OAuth2Credentials> {
    try {
      logger.info('Getting client credentials token');

      const response = await this.makeTokenRequest({
        grant_type: 'client_credentials',
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
        ...(this.config.scope && { scope: this.config.scope })
      });

      return this.parseTokenResponse(response);
    } catch (error) {
      logger.error('Failed to get client credentials token', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw this.createOAuth2Error(error, 'client_credentials');
    }
  }

  /**
   * Revoke token
   */
  async revokeToken(
    token: string, 
    tokenTypeHint: 'access_token' | 'refresh_token' = 'access_token'
  ): Promise<void> {
    try {
      logger.info('Revoking token', { tokenTypeHint });

      // Construct revocation URL (some providers have different endpoints)
      const revokeUrl = this.config.tokenUrl.replace('/token', '/revoke');

      const params = new URLSearchParams({
        token,
        token_type_hint: tokenTypeHint,
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret
      });

      const response = await fetch(revokeUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Accept': 'application/json'
        },
        body: params.toString()
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      logger.info('Token revoked successfully');
    } catch (error) {
      logger.error('Failed to revoke token', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw this.createOAuth2Error(error, 'token_revocation');
    }
  }

  /**
   * Validate token by making a test request
   */
  async validateToken(token: string, introspectionUrl?: string): Promise<boolean> {
    try {
      if (!introspectionUrl) {
        // If no introspection endpoint, assume token is valid
        // Real validation would require making an API call with the token
        return true;
      }

      const response = await fetch(introspectionUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': `Bearer ${token}`
        },
        body: new URLSearchParams({
          token,
          token_type_hint: 'access_token'
        }).toString()
      });

      if (!response.ok) {
        return false;
      }

      const result = await response.json();
      return result.active === true;
    } catch (error) {
      logger.warn('Token validation failed', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return false;
    }
  }

  private async makeTokenRequest(params: Record<string, string>): Promise<OAuth2TokenResponse> {
    const body = new URLSearchParams(params);

    const response = await fetch(this.config.tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json',
        'User-Agent': 'OAuth2Service/1.0.0'
      },
      body: body.toString()
    });

    const responseText = await response.text();
    
    let responseData: OAuth2TokenResponse;
    try {
      responseData = JSON.parse(responseText);
    } catch (parseError) {
      throw new Error(`Invalid JSON response: ${responseText}`);
    }

    if (!response.ok) {
      const errorMessage = responseData.error_description || 
                          responseData.error || 
                          `HTTP ${response.status}: ${response.statusText}`;
      throw new Error(errorMessage);
    }

    if (responseData.error) {
      throw new Error(responseData.error_description || responseData.error);
    }

    return responseData;
  }

  private parseTokenResponse(response: OAuth2TokenResponse): OAuth2Credentials {
    if (!response.access_token) {
      throw new Error('No access token in response');
    }

    const expiresAt = response.expires_in ? 
      new Date(Date.now() + response.expires_in * 1000) : 
      undefined;

    const credentials: OAuth2Credentials = {
      accessToken: response.access_token,
      tokenType: response.token_type || 'Bearer'
    };
    
    if (response.refresh_token !== undefined) {
      credentials.refreshToken = response.refresh_token;
    }
    
    if (expiresAt !== undefined) {
      credentials.expiresAt = expiresAt;
    }
    
    if (response.scope !== undefined) {
      credentials.scope = response.scope;
    }
    
    return credentials;
  }

  private createOAuth2Error(error: unknown, context: string): IntegrationError {
    const message = error instanceof Error ? error.message : String(error);
    
    const oauthError = new Error(`OAuth2 ${context} failed: ${message}`) as IntegrationError;
    oauthError.code = `OAUTH2_${context.toUpperCase()}_ERROR`;
    oauthError.isRetryable = false; // OAuth2 errors are typically not retryable
    oauthError.context = { context };
    if (error instanceof Error) {
      oauthError.originalError = error;
    }

    // Determine if this is a client error vs server error
    if (message.includes('invalid_client') || 
        message.includes('invalid_grant') || 
        message.includes('unauthorized_client')) {
      oauthError.statusCode = 401;
    } else if (message.includes('invalid_request') || 
               message.includes('unsupported_grant_type')) {
      oauthError.statusCode = 400;
    } else if (message.includes('HTTP 4')) {
      oauthError.statusCode = 400;
    } else if (message.includes('HTTP 5')) {
      oauthError.statusCode = 500;
      oauthError.isRetryable = true; // Server errors might be retryable
    }

    return oauthError;
  }

  /**
   * Utility method to check if credentials are expired
   */
  static isTokenExpired(credentials: OAuth2Credentials, bufferMinutes = 5): boolean {
    if (!credentials.expiresAt) {
      return false; // No expiration info, assume valid
    }
    
    const bufferTime = bufferMinutes * 60 * 1000; // Convert to milliseconds
    return new Date().getTime() > (credentials.expiresAt.getTime() - bufferTime);
  }

  /**
   * Utility method to estimate token lifetime
   */
  static getTokenLifetime(credentials: OAuth2Credentials): number | null {
    if (!credentials.expiresAt) {
      return null;
    }
    
    return Math.max(0, credentials.expiresAt.getTime() - Date.now());
  }
}