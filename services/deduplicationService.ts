import crypto from 'crypto';

interface DeduplicationEntry {
  hash: string;
  timestamp: number;
  deliveryId: string;
}

export class DeduplicationService {
  private cache = new Map<string, DeduplicationEntry>();
  private readonly ttlMs: number;
  private readonly maxEntries: number;
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor(ttlMs: number = 300000, maxEntries: number = 10000) { // 5 minutes TTL, 10k max entries
    this.ttlMs = ttlMs;
    this.maxEntries = maxEntries;
    this.startCleanup();
  }

  private createHash(payload: string, deliveryId: string): string {
    return crypto
      .createHash('sha256')
      .update(`${deliveryId}:${payload}`)
      .digest('hex');
  }

  private startCleanup(): void {
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, Math.min(this.ttlMs / 2, 60000)); // Cleanup every half TTL or 1 minute, whichever is smaller
  }

  private cleanup(): void {
    const now = Date.now();
    const expiredKeys: string[] = [];

    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp > this.ttlMs) {
        expiredKeys.push(key);
      }
    }

    expiredKeys.forEach(key => this.cache.delete(key));

    // If still over max entries, remove oldest entries
    if (this.cache.size > this.maxEntries) {
      const entries = Array.from(this.cache.entries());
      entries.sort((a, b) => a[1].timestamp - b[1].timestamp);
      
      const toRemove = entries.slice(0, this.cache.size - this.maxEntries);
      toRemove.forEach(([key]) => this.cache.delete(key));
    }
  }

  public isDuplicate(payload: string, deliveryId: string): boolean {
    const hash = this.createHash(payload, deliveryId);
    const existing = this.cache.get(hash);

    if (existing) {
      // Check if entry is still valid
      if (Date.now() - existing.timestamp <= this.ttlMs) {
        return true;
      } else {
        // Remove expired entry
        this.cache.delete(hash);
      }
    }

    // Store new entry
    this.cache.set(hash, {
      hash,
      timestamp: Date.now(),
      deliveryId
    });

    return false;
  }

  public getStats(): { size: number; maxEntries: number; ttlMs: number } {
    return {
      size: this.cache.size,
      maxEntries: this.maxEntries,
      ttlMs: this.ttlMs
    };
  }

  public clear(): void {
    this.cache.clear();
  }

  public destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    this.clear();
  }
}

// Singleton instance
export const deduplicationService = new DeduplicationService();