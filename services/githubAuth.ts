import { Octokit } from '@octokit/rest';
import { createAppAuth } from '@octokit/auth-app';
import { 
  GitHubAppConfig, 
  InstallationToken, 
  GitHubApiError, 
  InstallationInfo,
  TokenRefreshResult 
} from '../types/github';
import { JWTService } from './jwt';
import { TokenCache } from './tokenCache';
import { RateLimitTracker } from './rateLimitTracker';
import logger from '../utils/logger';

export class GitHubAuthService {
  private readonly jwtService: JWTService;
  private readonly tokenCache: TokenCache;
  private readonly rateLimitTracker: RateLimitTracker;
  private readonly config: GitHubAppConfig;
  private readonly octokit: Octokit;

  constructor(config: GitHubAppConfig) {
    this.config = config;
    this.jwtService = new JWTService(config);
    this.tokenCache = new TokenCache();
    this.rateLimitTracker = new RateLimitTracker();

    // Initialize Octokit with app authentication
    this.octokit = new Octokit({
      authStrategy: createAppAuth,
      auth: {
        appId: config.appId,
        privateKey: config.privateKey,
        clientId: config.clientId,
        clientSecret: config.clientSecret,
      },
    });

    // Set up response interceptor to track rate limits
    this.setupRateLimitTracking();
  }

  async getInstallationToken(installationId: number, forceRefresh = false): Promise<InstallationToken> {
    try {
      // Check cache first (unless force refresh is requested)
      if (!forceRefresh) {
        const cachedToken = this.tokenCache.get(installationId);
        if (cachedToken) {
          logger.debug('Using cached installation token', { installationId });
          return cachedToken;
        }
      }

      // Check rate limits before making API call
      const coreRateLimit = this.rateLimitTracker.getRateLimit('core');
      if (coreRateLimit && this.rateLimitTracker.isRateLimited('core')) {
        const waitTime = this.rateLimitTracker.getWaitTime('core');
        throw new Error(`Rate limit exceeded. Wait ${Math.ceil(waitTime / 1000)} seconds before retrying.`);
      }

      logger.info('Fetching new installation token', { installationId });

      // Generate fresh installation token
      const response = await this.octokit.rest.apps.createInstallationAccessToken({
        installation_id: installationId,
      });

      const token: InstallationToken = {
        token: response.data.token,
        expiresAt: new Date(response.data.expires_at),
        permissions: response.data.permissions || {},
        repositorySelection: response.data.repository_selection as 'all' | 'selected',
      };

      // Cache the token
      this.tokenCache.set(installationId, token);

      logger.info('Installation token created and cached', {
        installationId,
        expiresAt: token.expiresAt,
        permissions: Object.keys(token.permissions),
      });

      return token;
    } catch (error) {
      const gitHubError = this.handleGitHubError(error, 'getInstallationToken');
      logger.error('Failed to get installation token', {
        installationId,
        error: gitHubError.message,
        status: gitHubError.status,
      });
      throw gitHubError;
    }
  }

  async refreshInstallationToken(installationId: number): Promise<TokenRefreshResult> {
    try {
      const cachedToken = this.tokenCache.get(installationId);
      
      // If token doesn't exist or is near expiration, refresh it
      const needsRefresh = !cachedToken || this.tokenCache.isTokenNearExpiration(installationId, 10);
      
      if (!needsRefresh) {
        return {
          token: cachedToken!.token,
          expiresAt: cachedToken!.expiresAt,
          refreshed: false,
        };
      }

      logger.info('Refreshing installation token', { installationId });

      const newToken = await this.getInstallationToken(installationId, true);

      return {
        token: newToken.token,
        expiresAt: newToken.expiresAt,
        refreshed: true,
      };
    } catch (error) {
      const gitHubError = this.handleGitHubError(error, 'refreshInstallationToken');
      return {
        token: '',
        expiresAt: new Date(),
        refreshed: false,
        error: gitHubError.message,
      };
    }
  }

  async getInstallationInfo(installationId: number): Promise<InstallationInfo> {
    try {
      const response = await this.octokit.rest.apps.getInstallation({
        installation_id: installationId,
      });

      return {
        id: response.data.id,
        account: {
          login: response.data.account?.login || '',
          id: response.data.account?.id || 0,
          type: (response.data.account?.type as 'User' | 'Organization') || 'User',
        },
        repositorySelection: response.data.repository_selection as 'all' | 'selected',
        permissions: response.data.permissions,
        events: response.data.events,
      };
    } catch (error) {
      const gitHubError = this.handleGitHubError(error, 'getInstallationInfo');
      logger.error('Failed to get installation info', {
        installationId,
        error: gitHubError.message,
      });
      throw gitHubError;
    }
  }

  async getAllInstallations(): Promise<InstallationInfo[]> {
    try {
      const response = await this.octokit.rest.apps.listInstallations();
      
      return response.data.map(installation => ({
        id: installation.id,
        account: {
          login: installation.account?.login || '',
          id: installation.account?.id || 0,
          type: (installation.account?.type as 'User' | 'Organization') || 'User',
        },
        repositorySelection: installation.repository_selection as 'all' | 'selected',
        permissions: installation.permissions,
        events: installation.events,
      }));
    } catch (error) {
      const gitHubError = this.handleGitHubError(error, 'getAllInstallations');
      logger.error('Failed to get all installations', {
        error: gitHubError.message,
      });
      throw gitHubError;
    }
  }

  createInstallationClient(installationId: number): Octokit {
    return new Octokit({
      auth: async () => {
        const token = await this.getInstallationToken(installationId);
        return token.token;
      },
    });
  }

  async revokeInstallationToken(installationId: number): Promise<void> {
    try {
      const cachedToken = this.tokenCache.get(installationId);
      if (cachedToken) {
        // Create a temporary Octokit instance with the installation token
        const installationOctokit = new Octokit({
          auth: cachedToken.token,
        });

        await installationOctokit.rest.apps.revokeInstallationAccessToken();
        this.tokenCache.delete(installationId);

        logger.info('Installation token revoked', { installationId });
      }
    } catch (error) {
      const gitHubError = this.handleGitHubError(error, 'revokeInstallationToken');
      logger.error('Failed to revoke installation token', {
        installationId,
        error: gitHubError.message,
      });
      throw gitHubError;
    }
  }

  // Background task to refresh tokens that are near expiration
  async refreshExpiringTokens(): Promise<void> {
    const installationIds = this.tokenCache.getInstallationIds();
    const refreshPromises = installationIds
      .filter(id => this.tokenCache.isTokenNearExpiration(id, 15)) // 15-minute buffer
      .map(async id => {
        try {
          await this.refreshInstallationToken(id);
          logger.info('Proactively refreshed token', { installationId: id });
        } catch (error) {
          logger.warn('Failed to proactively refresh token', {
            installationId: id,
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        }
      });

    await Promise.allSettled(refreshPromises);
  }

  // Utility methods
  getAppJWT(): string {
    return this.jwtService.generateAppJWT();
  }

  getCacheStats(): ReturnType<TokenCache['getStats']> {
    return this.tokenCache.getStats();
  }

  getRateLimitStatus(): ReturnType<RateLimitTracker['getGlobalStatus']> {
    return this.rateLimitTracker.getGlobalStatus();
  }

  clearCache(): void {
    this.tokenCache.clear();
  }

  private setupRateLimitTracking(): void {
    // Intercept responses to track rate limits
    this.octokit.hook.after('request', (response) => {
      const resource = this.determineResource(response.url);
      this.rateLimitTracker.updateRateLimit(resource, response.headers as Record<string, string>);
    });
  }

  private determineResource(url: string): string {
    // Determine the resource type based on the API endpoint
    if (url.includes('/installations/')) return 'installations';
    if (url.includes('/repos/')) return 'repos';
    if (url.includes('/orgs/')) return 'orgs';
    if (url.includes('/users/')) return 'users';
    if (url.includes('/search/')) return 'search';
    return 'core';
  }

  private handleGitHubError(error: unknown, context: string): GitHubApiError {
    if (error instanceof Error) {
      const gitHubError: GitHubApiError = error as GitHubApiError;
      
      // Enhanced error information
      if (gitHubError.status) {
        logger.error(`GitHub API Error in ${context}`, {
          status: gitHubError.status,
          message: gitHubError.message,
          url: gitHubError.request?.url,
          method: gitHubError.request?.method,
        });
      }

      return gitHubError;
    }

    // Fallback for unknown error types
    const fallbackError: GitHubApiError = new Error(`Unknown error in ${context}: ${String(error)}`);
    return fallbackError;
  }

  // Cleanup method for graceful shutdown
  async cleanup(): Promise<void> {
    logger.info('Cleaning up GitHub Auth Service');
    this.tokenCache.clear();
    this.rateLimitTracker.clearExpiredRateLimits();
  }
}