import { GitHubRateLimit } from '../types/github';
import logger from '../utils/logger';

export class RateLimitTracker {
  private rateLimits: Map<string, GitHubRateLimit> = new Map();
  private readonly warningThreshold: number;
  private readonly criticalThreshold: number;

  constructor(warningThreshold = 100, criticalThreshold = 10) {
    this.warningThreshold = warningThreshold;
    this.criticalThreshold = criticalThreshold;
  }

  updateRateLimit(resource: string, headers: Record<string, string>): GitHubRateLimit {
    const rateLimit: GitHubRateLimit = {
      limit: this.parseHeaderInt(headers['x-ratelimit-limit']) || 5000,
      remaining: this.parseHeaderInt(headers['x-ratelimit-remaining']) || 0,
      reset: new Date((this.parseHeaderInt(headers['x-ratelimit-reset']) || 0) * 1000),
      used: this.parseHeaderInt(headers['x-ratelimit-used']) || 0,
      resource,
    };

    this.rateLimits.set(resource, rateLimit);

    // Log rate limit status
    this.logRateLimitStatus(rateLimit);

    return rateLimit;
  }

  getRateLimit(resource: string): GitHubRateLimit | null {
    return this.rateLimits.get(resource) || null;
  }

  getAllRateLimits(): Map<string, GitHubRateLimit> {
    return new Map(this.rateLimits);
  }

  isRateLimited(resource: string): boolean {
    const rateLimit = this.rateLimits.get(resource);
    return rateLimit ? rateLimit.remaining <= 0 : false;
  }

  getTimeUntilReset(resource: string): number {
    const rateLimit = this.rateLimits.get(resource);
    if (!rateLimit) {
      return 0;
    }

    const now = new Date();
    const resetTime = rateLimit.reset.getTime();
    const currentTime = now.getTime();

    return Math.max(0, resetTime - currentTime);
  }

  shouldWaitForRateLimit(resource: string, minimumRemaining = 1): boolean {
    const rateLimit = this.rateLimits.get(resource);
    if (!rateLimit) {
      return false;
    }

    return rateLimit.remaining < minimumRemaining;
  }

  getWaitTime(resource: string): number {
    if (!this.isRateLimited(resource)) {
      return 0;
    }

    return this.getTimeUntilReset(resource);
  }

  getRateLimitPercentageUsed(resource: string): number {
    const rateLimit = this.rateLimits.get(resource);
    if (!rateLimit || rateLimit.limit === 0) {
      return 0;
    }

    return (rateLimit.used / rateLimit.limit) * 100;
  }

  isNearRateLimit(resource: string, threshold?: number): boolean {
    const rateLimit = this.rateLimits.get(resource);
    if (!rateLimit) {
      return false;
    }

    const effectiveThreshold = threshold || this.warningThreshold;
    return rateLimit.remaining <= effectiveThreshold;
  }

  isCriticalRateLimit(resource: string): boolean {
    return this.isNearRateLimit(resource, this.criticalThreshold);
  }

  getOptimalBatchSize(resource: string, maxBatchSize = 100): number {
    const rateLimit = this.rateLimits.get(resource);
    if (!rateLimit) {
      return maxBatchSize;
    }

    // Reserve some buffer for other operations
    const availableRequests = Math.max(0, rateLimit.remaining - this.criticalThreshold);
    return Math.min(maxBatchSize, availableRequests);
  }

  estimateTimeToReset(resource: string): string {
    const waitTime = this.getTimeUntilReset(resource);
    if (waitTime === 0) {
      return 'Rate limit not active';
    }

    const minutes = Math.ceil(waitTime / (1000 * 60));
    if (minutes < 60) {
      return `${minutes} minute${minutes === 1 ? '' : 's'}`;
    }

    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    return `${hours} hour${hours === 1 ? '' : 's'}${remainingMinutes > 0 ? ` ${remainingMinutes} minute${remainingMinutes === 1 ? '' : 's'}` : ''}`;
  }

  getResourceStatus(resource: string): {
    status: 'healthy' | 'warning' | 'critical' | 'rate_limited';
    message: string;
    remaining: number;
    resetTime: string;
  } {
    const rateLimit = this.rateLimits.get(resource);
    
    if (!rateLimit) {
      return {
        status: 'healthy',
        message: 'No rate limit data available',
        remaining: 0,
        resetTime: 'Unknown',
      };
    }

    let status: 'healthy' | 'warning' | 'critical' | 'rate_limited';
    let message: string;

    if (rateLimit.remaining <= 0) {
      status = 'rate_limited';
      message = 'Rate limit exceeded';
    } else if (rateLimit.remaining <= this.criticalThreshold) {
      status = 'critical';
      message = `Critical: Only ${rateLimit.remaining} requests remaining`;
    } else if (rateLimit.remaining <= this.warningThreshold) {
      status = 'warning';
      message = `Warning: ${rateLimit.remaining} requests remaining`;
    } else {
      status = 'healthy';
      message = `${rateLimit.remaining} requests remaining`;
    }

    return {
      status,
      message,
      remaining: rateLimit.remaining,
      resetTime: this.estimateTimeToReset(resource),
    };
  }

  private parseHeaderInt(value: string | undefined): number | null {
    if (!value) return null;
    const parsed = parseInt(value, 10);
    return isNaN(parsed) ? null : parsed;
  }

  private logRateLimitStatus(rateLimit: GitHubRateLimit): void {
    const percentageUsed = this.getRateLimitPercentageUsed(rateLimit.resource);
    
    if (rateLimit.remaining <= 0) {
      logger.error('GitHub API rate limit exceeded', {
        resource: rateLimit.resource,
        limit: rateLimit.limit,
        remaining: rateLimit.remaining,
        reset: rateLimit.reset,
        percentageUsed,
      });
    } else if (rateLimit.remaining <= this.criticalThreshold) {
      logger.warn('GitHub API rate limit critical', {
        resource: rateLimit.resource,
        remaining: rateLimit.remaining,
        reset: rateLimit.reset,
        percentageUsed,
      });
    } else if (rateLimit.remaining <= this.warningThreshold) {
      logger.warn('GitHub API rate limit warning', {
        resource: rateLimit.resource,
        remaining: rateLimit.remaining,
        reset: rateLimit.reset,
        percentageUsed,
      });
    } else {
      logger.debug('GitHub API rate limit updated', {
        resource: rateLimit.resource,
        remaining: rateLimit.remaining,
        percentageUsed,
      });
    }
  }

  clearExpiredRateLimits(): number {
    const now = new Date();
    let cleared = 0;

    for (const [resource, rateLimit] of this.rateLimits.entries()) {
      if (rateLimit.reset < now) {
        this.rateLimits.delete(resource);
        cleared++;
        logger.debug('Cleared expired rate limit data', { resource });
      }
    }

    return cleared;
  }

  getGlobalStatus(): {
    totalResources: number;
    healthyResources: number;
    warningResources: number;
    criticalResources: number;
    rateLimitedResources: number;
  } {
    let healthy = 0;
    let warning = 0;
    let critical = 0;
    let rateLimited = 0;

    for (const [resource] of this.rateLimits.entries()) {
      const status = this.getResourceStatus(resource);
      switch (status.status) {
        case 'healthy':
          healthy++;
          break;
        case 'warning':
          warning++;
          break;
        case 'critical':
          critical++;
          break;
        case 'rate_limited':
          rateLimited++;
          break;
      }
    }

    return {
      totalResources: this.rateLimits.size,
      healthyResources: healthy,
      warningResources: warning,
      criticalResources: critical,
      rateLimitedResources: rateLimited,
    };
  }
}