import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { GitHubAuthService } from '../services/githubAuth';
import { createError } from './errorHandler';
import logger from '../utils/logger';

export interface GitHubWebhookRequest extends Request {
  githubPayload?: unknown;
  githubEvent?: string;
  githubDelivery?: string;
  installationId?: number;
  githubAuth?: GitHubAuthService;
}

export class GitHubAuthMiddleware {
  constructor(private readonly githubAuth: GitHubAuthService, private readonly webhookSecret?: string) {}

  // Middleware to verify GitHub webhook signatures
  verifyWebhookSignature = (req: GitHubWebhookRequest, res: Response, next: NextFunction): void => {
    if (!this.webhookSecret) {
      logger.warn('Webhook secret not configured, skipping signature verification');
      return next();
    }

    const signature = req.get('X-Hub-Signature-256');
    if (!signature) {
      logger.warn('Missing webhook signature header');
      return next(createError('Missing webhook signature', 401));
    }

    const payload = JSON.stringify(req.body);
    const expectedSignature = 'sha256=' + crypto
      .createHmac('sha256', this.webhookSecret)
      .update(payload, 'utf8')
      .digest('hex');

    if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature))) {
      logger.error('Invalid webhook signature', {
        received: signature,
        expected: expectedSignature.substring(0, 20) + '...',
      });
      return next(createError('Invalid webhook signature', 401));
    }

    logger.debug('Webhook signature verified successfully');
    next();
  };

  // Middleware to parse GitHub webhook headers and payload
  parseWebhookHeaders = (req: GitHubWebhookRequest, res: Response, next: NextFunction): void => {
    try {
      req.githubEvent = req.get('X-GitHub-Event');
      req.githubDelivery = req.get('X-GitHub-Delivery');
      req.githubPayload = req.body;

      // Extract installation ID from payload if available
      if (req.body && typeof req.body === 'object') {
        const payload = req.body as Record<string, unknown>;
        if (payload.installation && typeof payload.installation === 'object') {
          const installation = payload.installation as Record<string, unknown>;
          if (typeof installation.id === 'number') {
            req.installationId = installation.id;
          }
        }
      }

      logger.debug('Parsed GitHub webhook headers', {
        event: req.githubEvent,
        delivery: req.githubDelivery,
        installationId: req.installationId,
      });

      next();
    } catch (error) {
      logger.error('Failed to parse GitHub webhook headers', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      next(createError('Failed to parse webhook headers', 400));
    }
  };

  // Middleware to validate installation access
  validateInstallationAccess = async (req: GitHubWebhookRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.installationId) {
        return next(createError('Installation ID not found in request', 400));
      }

      // Verify that we can access this installation
      const installationInfo = await this.githubAuth.getInstallationInfo(req.installationId);
      
      logger.debug('Installation access validated', {
        installationId: req.installationId,
        account: installationInfo.account.login,
        permissions: Object.keys(installationInfo.permissions),
      });

      // Attach GitHub auth service to request for downstream use
      req.githubAuth = this.githubAuth;

      next();
    } catch (error) {
      logger.error('Installation access validation failed', {
        installationId: req.installationId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      next(createError('Installation access denied', 403));
    }
  };

  // Middleware to ensure installation token is available and fresh
  ensureInstallationToken = async (req: GitHubWebhookRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.installationId) {
        return next(createError('Installation ID required', 400));
      }

      // Get or refresh the installation token
      const tokenResult = await this.githubAuth.refreshInstallationToken(req.installationId);
      
      if (tokenResult.error) {
        logger.error('Failed to ensure installation token', {
          installationId: req.installationId,
          error: tokenResult.error,
        });
        return next(createError('Failed to obtain installation token', 500));
      }

      logger.debug('Installation token ensured', {
        installationId: req.installationId,
        refreshed: tokenResult.refreshed,
        expiresAt: tokenResult.expiresAt,
      });

      next();
    } catch (error) {
      logger.error('Error ensuring installation token', {
        installationId: req.installationId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      next(createError('Token management error', 500));
    }
  };

  // Middleware to check rate limits before processing
  checkRateLimits = (resource = 'core') => {
    return (req: GitHubWebhookRequest, res: Response, next: NextFunction): void => {
      const rateLimitStatus = this.githubAuth.getRateLimitStatus();
      
      if (rateLimitStatus.rateLimitedResources > 0) {
        logger.warn('Rate limit exceeded for resource', {
          resource,
          status: rateLimitStatus,
        });
        
        // Add rate limit headers to response
        const rateLimit = this.githubAuth['rateLimitTracker'].getRateLimit(resource);
        if (rateLimit) {
          res.set({
            'X-RateLimit-Limit': rateLimit.limit.toString(),
            'X-RateLimit-Remaining': rateLimit.remaining.toString(),
            'X-RateLimit-Reset': Math.floor(rateLimit.reset.getTime() / 1000).toString(),
          });
        }

        return next(createError('Rate limit exceeded', 429));
      }

      if (rateLimitStatus.criticalResources > 0) {
        logger.warn('Critical rate limit status detected', {
          resource,
          status: rateLimitStatus,
        });
      }

      next();
    };
  };

  // Middleware to log webhook events
  logWebhookEvent = (req: GitHubWebhookRequest, res: Response, next: NextFunction): void => {
    logger.info('GitHub webhook received', {
      event: req.githubEvent,
      delivery: req.githubDelivery,
      installationId: req.installationId,
      userAgent: req.get('User-Agent'),
      ip: req.ip,
    });

    // Log response when finished
    res.on('finish', () => {
      logger.info('GitHub webhook processed', {
        event: req.githubEvent,
        delivery: req.githubDelivery,
        statusCode: res.statusCode,
        responseTime: res.get('X-Response-Time'),
      });
    });

    next();
  };

  // Combined middleware for complete webhook processing
  webhookHandler = (): Array<(req: GitHubWebhookRequest, res: Response, next: NextFunction) => void> => {
    return [
      this.logWebhookEvent,
      this.verifyWebhookSignature,
      this.parseWebhookHeaders,
      this.validateInstallationAccess,
      this.ensureInstallationToken,
      this.checkRateLimits(),
    ];
  };

  // Middleware for API endpoints that need GitHub installation access
  requireInstallationAccess = (installationIdParam = 'installationId') => {
    return async (req: GitHubWebhookRequest, res: Response, next: NextFunction): Promise<void> => {
      try {
        const installationId = parseInt(req.params[installationIdParam], 10);
        
        if (isNaN(installationId)) {
          return next(createError('Invalid installation ID', 400));
        }

        req.installationId = installationId;
        req.githubAuth = this.githubAuth;

        // Validate access and ensure token
        await this.validateInstallationAccess(req, res, () => {});
        await this.ensureInstallationToken(req, res, next);
      } catch (error) {
        logger.error('Installation access middleware failed', {
          error: error instanceof Error ? error.message : 'Unknown error',
          installationId: req.params[installationIdParam],
        });
        next(createError('Installation access error', 500));
      }
    };
  };

  // Middleware to add GitHub auth service to request
  attachGitHubAuth = (req: GitHubWebhookRequest, res: Response, next: NextFunction): void => {
    req.githubAuth = this.githubAuth;
    next();
  };
}