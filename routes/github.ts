import { Router, Request, Response } from 'express';
import { GitHubAuthService } from '../services/githubAuth';
import { GitHubAuthMiddleware, GitHubWebhookRequest } from '../middleware/githubAuth';
import { createError } from '../middleware/errorHandler';
import logger from '../utils/logger';

const router = Router();

// Initialize GitHub Auth Service (this would typically be done in a factory or DI container)
let githubAuth: GitHubAuthService | undefined;
let githubAuthMiddleware: GitHubAuthMiddleware | undefined;

// Initialize GitHub services
export const initializeGitHubServices = (authService: GitHubAuthService, middleware: GitHubAuthMiddleware): void => {
  githubAuth = authService;
  githubAuthMiddleware = middleware;
};

// Middleware wrapper to ensure GitHub services are initialized
const requireGitHubAuth = (req: GitHubWebhookRequest, res: Response, next: any) => {
  if (!githubAuthMiddleware) {
    return res.status(500).json({ error: 'GitHub services not initialized' });
  }
  return githubAuthMiddleware.attachGitHubAuth(req, res, next);
};

// Middleware wrapper for installation access
const requireInstallationAccess = (paramName: string) => (req: GitHubWebhookRequest, res: Response, next: any) => {
  if (!githubAuthMiddleware) {
    return res.status(500).json({ error: 'GitHub services not initialized' });
  }
  return githubAuthMiddleware.requireInstallationAccess(paramName)(req, res, next);
};

// Webhook middleware wrapper
const getWebhookMiddleware = () => {
  if (!githubAuthMiddleware) {
    return [(req: any, res: any, next: any) => res.status(500).json({ error: 'GitHub services not initialized' })];
  }
  return githubAuthMiddleware.webhookHandler();
};

// GitHub App information endpoint
router.get('/app/info', requireGitHubAuth, async (req: GitHubWebhookRequest, res: Response): Promise<void> => {
  try {
    if (!req.githubAuth) {
      throw createError('GitHub authentication not available', 500);
    }

    const installations = await req.githubAuth.getAllInstallations();
    const cacheStats = req.githubAuth.getCacheStats();
    const rateLimitStatus = req.githubAuth.getRateLimitStatus();

    res.json({
      success: true,
      data: {
        totalInstallations: installations.length,
        installations: installations.map(inst => ({
          id: inst.id,
          account: inst.account,
          repositorySelection: inst.repositorySelection,
          permissions: Object.keys(inst.permissions),
          events: inst.events,
        })),
        cache: cacheStats,
        rateLimits: rateLimitStatus,
      },
    });
  } catch (error) {
    logger.error('Failed to get GitHub app info', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    throw createError('Failed to retrieve app information', 500);
  }
});

// Get specific installation info
router.get('/installations/:installationId', 
  requireInstallationAccess('installationId'), 
  async (req: GitHubWebhookRequest, res: Response): Promise<void> => {
    try {
      if (!req.githubAuth || !req.installationId) {
        throw createError('GitHub authentication or installation ID not available', 500);
      }

      const installation = await req.githubAuth.getInstallationInfo(req.installationId);
      const tokenInfo = req.githubAuth['tokenCache'].get(req.installationId);

      res.json({
        success: true,
        data: {
          installation,
          token: tokenInfo ? {
            expiresAt: tokenInfo.expiresAt,
            cachedAt: tokenInfo.cachedAt,
            permissions: tokenInfo.permissions,
            repositorySelection: tokenInfo.repositorySelection,
          } : null,
        },
      });
    } catch (error) {
      logger.error('Failed to get installation info', {
        installationId: req.installationId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw createError('Failed to retrieve installation information', 500);
    }
  }
);

// Refresh installation token
router.post('/installations/:installationId/refresh-token',
  requireInstallationAccess('installationId'),
  async (req: GitHubWebhookRequest, res: Response): Promise<void> => {
    try {
      if (!req.githubAuth || !req.installationId) {
        throw createError('GitHub authentication or installation ID not available', 500);
      }

      const refreshResult = await req.githubAuth.refreshInstallationToken(req.installationId);

      if (refreshResult.error) {
        throw createError(`Token refresh failed: ${refreshResult.error}`, 500);
      }

      res.json({
        success: true,
        data: {
          refreshed: refreshResult.refreshed,
          expiresAt: refreshResult.expiresAt,
          message: refreshResult.refreshed ? 'Token refreshed successfully' : 'Token was already fresh',
        },
      });
    } catch (error) {
      logger.error('Failed to refresh installation token', {
        installationId: req.installationId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw createError('Failed to refresh token', 500);
    }
  }
);

// Revoke installation token
router.delete('/installations/:installationId/token',
  requireInstallationAccess('installationId'),
  async (req: GitHubWebhookRequest, res: Response): Promise<void> => {
    try {
      if (!req.githubAuth || !req.installationId) {
        throw createError('GitHub authentication or installation ID not available', 500);
      }

      await req.githubAuth.revokeInstallationToken(req.installationId);

      res.json({
        success: true,
        message: 'Installation token revoked successfully',
      });
    } catch (error) {
      logger.error('Failed to revoke installation token', {
        installationId: req.installationId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw createError('Failed to revoke token', 500);
    }
  }
);

// GitHub webhook endpoint
router.post('/webhooks',
  ...getWebhookMiddleware(),
  async (req: GitHubWebhookRequest, res: Response): Promise<void> => {
    try {
      const { githubEvent, githubDelivery, githubPayload, installationId } = req;

      logger.info('Processing GitHub webhook', {
        event: githubEvent,
        delivery: githubDelivery,
        installationId,
      });

      // Handle different webhook events
      switch (githubEvent) {
        case 'installation':
          await handleInstallationEvent(req, res);
          break;
        case 'installation_repositories':
          await handleInstallationRepositoriesEvent(req, res);
          break;
        case 'push':
          await handlePushEvent(req, res);
          break;
        case 'pull_request':
          await handlePullRequestEvent(req, res);
          break;
        case 'issues':
          await handleIssuesEvent(req, res);
          break;
        default:
          logger.info('Unhandled webhook event', { event: githubEvent });
          res.json({
            success: true,
            message: `Webhook received but not handled: ${githubEvent}`,
          });
      }
    } catch (error) {
      logger.error('Webhook processing failed', {
        event: req.githubEvent,
        delivery: req.githubDelivery,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw createError('Webhook processing failed', 500);
    }
  }
);

// Rate limit status endpoint
router.get('/rate-limits', requireGitHubAuth, (req: GitHubWebhookRequest, res: Response): void => {
  if (!req.githubAuth) {
    throw createError('GitHub authentication not available', 500);
  }

  const rateLimitStatus = req.githubAuth.getRateLimitStatus();
  const allRateLimits = req.githubAuth['rateLimitTracker'].getAllRateLimits();

  const rateLimitDetails = Array.from(allRateLimits.entries()).map(([resource, rateLimit]) => ({
    resource,
    limit: rateLimit.limit,
    remaining: rateLimit.remaining,
    reset: rateLimit.reset,
    used: rateLimit.used,
    percentageUsed: Math.round((rateLimit.used / rateLimit.limit) * 100),
  }));

  res.json({
    success: true,
    data: {
      summary: rateLimitStatus,
      details: rateLimitDetails,
    },
  });
});

// Cache management endpoints
router.get('/cache/stats', requireGitHubAuth, (req: GitHubWebhookRequest, res: Response): void => {
  if (!req.githubAuth) {
    throw createError('GitHub authentication not available', 500);
  }

  const stats = req.githubAuth.getCacheStats();
  const installationIds = req.githubAuth['tokenCache'].getInstallationIds();

  res.json({
    success: true,
    data: {
      ...stats,
      cachedInstallations: installationIds.length,
      installationIds,
    },
  });
});

router.delete('/cache', requireGitHubAuth, (req: GitHubWebhookRequest, res: Response): void => {
  if (!req.githubAuth) {
    throw createError('GitHub authentication not available', 500);
  }

  req.githubAuth.clearCache();

  res.json({
    success: true,
    message: 'Cache cleared successfully',
  });
});

// Webhook event handlers
async function handleInstallationEvent(req: GitHubWebhookRequest, res: Response): Promise<void> {
  const payload = req.githubPayload as Record<string, unknown>;
  const action = payload.action as string;

  logger.info('Installation event received', {
    action,
    installationId: req.installationId,
  });

  // Handle installation/uninstallation
  if (action === 'deleted' && req.installationId && req.githubAuth) {
    // Clean up cached tokens when app is uninstalled
    req.githubAuth['tokenCache'].delete(req.installationId);
    logger.info('Cleaned up cache for uninstalled app', {
      installationId: req.installationId,
    });
  }

  res.json({
    success: true,
    message: `Installation ${action} processed successfully`,
  });
}

async function handleInstallationRepositoriesEvent(req: GitHubWebhookRequest, res: Response): Promise<void> {
  const payload = req.githubPayload as Record<string, unknown>;
  const action = payload.action as string;

  logger.info('Installation repositories event received', {
    action,
    installationId: req.installationId,
  });

  res.json({
    success: true,
    message: `Installation repositories ${action} processed successfully`,
  });
}

async function handlePushEvent(req: GitHubWebhookRequest, res: Response): Promise<void> {
  const payload = req.githubPayload as Record<string, unknown>;
  
  logger.info('Push event received', {
    installationId: req.installationId,
    repository: (payload.repository as Record<string, unknown>)?.full_name,
    ref: payload.ref,
  });

  res.json({
    success: true,
    message: 'Push event processed successfully',
  });
}

async function handlePullRequestEvent(req: GitHubWebhookRequest, res: Response): Promise<void> {
  const payload = req.githubPayload as Record<string, unknown>;
  const action = payload.action as string;

  logger.info('Pull request event received', {
    action,
    installationId: req.installationId,
    repository: (payload.repository as Record<string, unknown>)?.full_name,
  });

  res.json({
    success: true,
    message: `Pull request ${action} processed successfully`,
  });
}

async function handleIssuesEvent(req: GitHubWebhookRequest, res: Response): Promise<void> {
  const payload = req.githubPayload as Record<string, unknown>;
  const action = payload.action as string;

  logger.info('Issues event received', {
    action,
    installationId: req.installationId,
    repository: (payload.repository as Record<string, unknown>)?.full_name,
  });

  res.json({
    success: true,
    message: `Issues ${action} processed successfully`,
  });
}

export default router;