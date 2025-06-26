import { GitHubAuthService } from './githubAuth';
import { GitHubAuthMiddleware } from '../middleware/githubAuth';
import { GitHubAppConfig } from '../types/github';
import environment from '../config/environment';
import logger from '../utils/logger';

export class GitHubServiceFactory {
  private static authService: GitHubAuthService | null = null;
  private static authMiddleware: GitHubAuthMiddleware | null = null;
  private static refreshInterval: NodeJS.Timeout | null = null;

  static createGitHubAuthService(): GitHubAuthService | null {
    if (this.authService) {
      return this.authService;
    }

    const config = this.getGitHubConfig();
    if (!config) {
      logger.warn('GitHub App configuration is incomplete. GitHub features will be disabled.');
      return null;
    }

    try {
      this.authService = new GitHubAuthService(config);
      logger.info('GitHub Auth Service initialized successfully', {
        appId: config.appId,
        hasWebhookSecret: !!config.webhookSecret,
        hasClientCredentials: !!(config.clientId && config.clientSecret),
      });

      // Set up automatic token refresh if enabled
      if (environment.GITHUB_AUTO_REFRESH_TOKENS) {
        this.setupTokenRefresh();
      }

      return this.authService;
    } catch (error) {
      logger.error('Failed to initialize GitHub Auth Service', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return null;
    }
  }

  static createGitHubAuthMiddleware(): GitHubAuthMiddleware | null {
    if (this.authMiddleware) {
      return this.authMiddleware;
    }

    const authService = this.createGitHubAuthService();
    if (!authService) {
      return null;
    }

    try {
      this.authMiddleware = new GitHubAuthMiddleware(
        authService,
        environment.GITHUB_WEBHOOK_SECRET
      );

      logger.info('GitHub Auth Middleware initialized successfully');
      return this.authMiddleware;
    } catch (error) {
      logger.error('Failed to initialize GitHub Auth Middleware', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return null;
    }
  }

  static getGitHubAuthService(): GitHubAuthService | null {
    return this.authService;
  }

  static getGitHubAuthMiddleware(): GitHubAuthMiddleware | null {
    return this.authMiddleware;
  }

  static isGitHubEnabled(): boolean {
    return this.authService !== null;
  }

  static async cleanup(): Promise<void> {
    logger.info('Cleaning up GitHub services');

    // Clear token refresh interval
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
      this.refreshInterval = null;
    }

    // Cleanup auth service
    if (this.authService) {
      await this.authService.cleanup();
      this.authService = null;
    }

    this.authMiddleware = null;
  }

  private static getGitHubConfig(): GitHubAppConfig | null {
    const { GITHUB_APP_ID, GITHUB_PRIVATE_KEY } = environment;

    if (!GITHUB_APP_ID || !GITHUB_PRIVATE_KEY) {
      logger.debug('GitHub App ID and Private Key are required for GitHub integration');
      return null;
    }

    // Validate private key format
    if (!this.validatePrivateKey(GITHUB_PRIVATE_KEY)) {
      logger.error('Invalid GitHub private key format');
      return null;
    }

    return {
      appId: GITHUB_APP_ID,
      privateKey: GITHUB_PRIVATE_KEY,
      webhookSecret: environment.GITHUB_WEBHOOK_SECRET,
      clientId: environment.GITHUB_CLIENT_ID,
      clientSecret: environment.GITHUB_CLIENT_SECRET,
    };
  }

  private static validatePrivateKey(privateKey: string): boolean {
    try {
      // Basic format validation
      const pemRegex = /^-----BEGIN (RSA )?PRIVATE KEY-----[\s\S]*-----END (RSA )?PRIVATE KEY-----$/;
      return pemRegex.test(privateKey.trim());
    } catch (error) {
      logger.warn('Private key validation failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return false;
    }
  }

  private static setupTokenRefresh(): void {
    if (this.refreshInterval || !this.authService) {
      return;
    }

    const intervalMs = environment.GITHUB_AUTO_REFRESH_INTERVAL;

    this.refreshInterval = setInterval(async () => {
      try {
        await this.authService!.refreshExpiringTokens();
        logger.debug('Automatic token refresh completed');
      } catch (error) {
        logger.error('Automatic token refresh failed', {
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }, intervalMs);

    logger.info('Automatic token refresh configured', {
      intervalMs,
      intervalMinutes: Math.round(intervalMs / 60000),
    });
  }

  // Utility method to validate GitHub configuration at startup
  static validateConfiguration(): {
    isValid: boolean;
    errors: string[];
    warnings: string[];
  } {
    const errors: string[] = [];
    const warnings: string[] = [];

    const { 
      GITHUB_APP_ID, 
      GITHUB_PRIVATE_KEY, 
      GITHUB_WEBHOOK_SECRET,
      GITHUB_CLIENT_ID,
      GITHUB_CLIENT_SECRET 
    } = environment;

    // Required for basic functionality
    if (!GITHUB_APP_ID) {
      errors.push('GITHUB_APP_ID is required');
    }

    if (!GITHUB_PRIVATE_KEY) {
      errors.push('GITHUB_PRIVATE_KEY is required');
    } else if (!this.validatePrivateKey(GITHUB_PRIVATE_KEY)) {
      errors.push('GITHUB_PRIVATE_KEY has invalid format');
    }

    // Optional but recommended
    if (!GITHUB_WEBHOOK_SECRET) {
      warnings.push('GITHUB_WEBHOOK_SECRET is recommended for webhook security');
    }

    if (!GITHUB_CLIENT_ID || !GITHUB_CLIENT_SECRET) {
      warnings.push('GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET are recommended for OAuth flows');
    }

    // Validate numeric settings
    if (environment.GITHUB_TOKEN_CACHE_TTL < 300) {
      warnings.push('GITHUB_TOKEN_CACHE_TTL should be at least 300 seconds (5 minutes)');
    }

    if (environment.GITHUB_RATE_LIMIT_CRITICAL_THRESHOLD >= environment.GITHUB_RATE_LIMIT_WARNING_THRESHOLD) {
      warnings.push('GITHUB_RATE_LIMIT_CRITICAL_THRESHOLD should be less than WARNING_THRESHOLD');
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
    };
  }
}