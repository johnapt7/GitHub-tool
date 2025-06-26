import NodeCache from 'node-cache';
import { CachedToken, InstallationToken } from '../types/github';
import logger from '../utils/logger';

export class TokenCache {
  private cache: NodeCache;
  private readonly defaultTTL: number;

  constructor(ttlSeconds = 3300) { // 55 minutes (tokens expire in 1 hour)
    this.defaultTTL = ttlSeconds;
    this.cache = new NodeCache({
      stdTTL: ttlSeconds,
      checkperiod: 120, // Check for expired keys every 2 minutes
      useClones: false,
    });

    // Set up event listeners
    this.cache.on('expired', (key: string) => {
      logger.debug('Token cache entry expired', { key });
    });

    this.cache.on('del', (key: string) => {
      logger.debug('Token cache entry deleted', { key });
    });

    this.cache.on('set', (key: string) => {
      logger.debug('Token cache entry set', { key });
    });
  }

  private generateCacheKey(installationId: number): string {
    return `installation_token_${installationId}`;
  }

  set(installationId: number, token: InstallationToken, customTTL?: number): void {
    const cacheKey = this.generateCacheKey(installationId);
    const cachedToken: CachedToken = {
      ...token,
      installationId,
      cachedAt: new Date(),
    };

    // Calculate TTL based on token expiration
    const now = new Date();
    const expiresIn = Math.floor((token.expiresAt.getTime() - now.getTime()) / 1000);
    const ttl = customTTL ?? Math.min(expiresIn - 300, this.defaultTTL); // 5-minute buffer

    this.cache.set(cacheKey, cachedToken, ttl);

    logger.info('Installation token cached', {
      installationId,
      expiresAt: token.expiresAt,
      ttl,
    });
  }

  get(installationId: number): CachedToken | null {
    const cacheKey = this.generateCacheKey(installationId);
    const cachedToken = this.cache.get<CachedToken>(cacheKey);

    if (!cachedToken) {
      logger.debug('Token cache miss', { installationId });
      return null;
    }

    // Double-check expiration
    const now = new Date();
    const buffer = 300000; // 5-minute buffer in milliseconds
    
    if (cachedToken.expiresAt.getTime() - now.getTime() < buffer) {
      logger.warn('Cached token is near expiration, removing from cache', {
        installationId,
        expiresAt: cachedToken.expiresAt,
        now,
      });
      this.delete(installationId);
      return null;
    }

    logger.debug('Token cache hit', {
      installationId,
      cachedAt: cachedToken.cachedAt,
      expiresAt: cachedToken.expiresAt,
    });

    return cachedToken;
  }

  delete(installationId: number): boolean {
    const cacheKey = this.generateCacheKey(installationId);
    const deleted = this.cache.del(cacheKey);

    if (deleted) {
      logger.info('Installation token removed from cache', { installationId });
    }

    return deleted > 0;
  }

  has(installationId: number): boolean {
    const cacheKey = this.generateCacheKey(installationId);
    return this.cache.has(cacheKey);
  }

  clear(): void {
    this.cache.flushAll();
    logger.info('Token cache cleared');
  }

  getStats(): {
    keys: number;
    hits: number;
    misses: number;
    hitRate: number;
  } {
    const stats = this.cache.getStats();
    const hitRate = stats.hits > 0 ? (stats.hits / (stats.hits + stats.misses)) * 100 : 0;

    return {
      keys: stats.keys,
      hits: stats.hits,
      misses: stats.misses,
      hitRate: Math.round(hitRate * 100) / 100,
    };
  }

  getAllKeys(): string[] {
    return this.cache.keys();
  }

  getInstallationIds(): number[] {
    return this.cache.keys()
      .filter(key => key.startsWith('installation_token_'))
      .map(key => parseInt(key.replace('installation_token_', ''), 10))
      .filter(id => !isNaN(id));
  }

  isTokenNearExpiration(installationId: number, bufferMinutes = 5): boolean {
    const token = this.get(installationId);
    if (!token) {
      return true; // Consider missing token as expired
    }

    const now = new Date();
    const buffer = bufferMinutes * 60 * 1000; // Convert to milliseconds
    
    return token.expiresAt.getTime() - now.getTime() < buffer;
  }

  getRemainingTTL(installationId: number): number {
    const cacheKey = this.generateCacheKey(installationId);
    return this.cache.getTtl(cacheKey) || 0;
  }

  refreshTTL(installationId: number, ttl?: number): boolean {
    const token = this.get(installationId);
    if (!token) {
      return false;
    }

    // Calculate new TTL if not provided
    const newTTL = ttl ?? Math.floor((token.expiresAt.getTime() - Date.now()) / 1000) - 300;
    
    if (newTTL > 0) {
      this.set(installationId, token, newTTL);
      return true;
    }

    return false;
  }
}