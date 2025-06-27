import { RetryPolicy, BackoffStrategy, ActionResult } from '../types/workflow-schema';
import logger from '../utils/logger';

export interface RetryContext {
  actionId: string;
  actionType: string;
  executionId: string;
  attempt: number;
  maxAttempts: number;
  lastError?: Error | undefined;
  startTime: Date;
  totalRetryTime: number;
}

export interface RetryResult {
  shouldRetry: boolean;
  delay: number;
  reason?: string;
}

export interface RetryStatistics {
  totalRetries: number;
  successfulRetries: number;
  failedRetries: number;
  averageRetryDelay: number;
  maxRetryDelay: number;
  mostRetriedAction: string;
  retrySuccessRate: number;
}

export class RetryManager {
  private retryHistory: Map<string, RetryContext[]> = new Map();
  private activeRetries: Map<string, RetryContext> = new Map();
  private retryStats: RetryStatistics = {
    totalRetries: 0,
    successfulRetries: 0,
    failedRetries: 0,
    averageRetryDelay: 0,
    maxRetryDelay: 0,
    mostRetriedAction: '',
    retrySuccessRate: 0
  };

  /**
   * Determine if an action should be retried and calculate delay
   */
  public shouldRetry(
    actionId: string,
    actionType: string,
    executionId: string,
    error: Error,
    attempt: number,
    retryPolicy?: RetryPolicy
  ): RetryResult {
    // No retry policy means no retries
    if (!retryPolicy) {
      return { shouldRetry: false, delay: 0, reason: 'No retry policy configured' };
    }

    // Check if we've exceeded max attempts
    if (attempt >= retryPolicy.maxAttempts) {
      return { 
        shouldRetry: false, 
        delay: 0, 
        reason: `Max attempts (${retryPolicy.maxAttempts}) exceeded` 
      };
    }

    // Check if error type is retryable
    if (retryPolicy.retryOn && retryPolicy.retryOn.length > 0) {
      const errorType = error.constructor.name;
      if (!retryPolicy.retryOn.includes(errorType)) {
        return { 
          shouldRetry: false, 
          delay: 0, 
          reason: `Error type '${errorType}' not in retryable errors` 
        };
      }
    }

    // Check for circuit breaker conditions
    const circuitBreakerResult = this.evaluateCircuitBreaker(actionType, error);
    if (!circuitBreakerResult.shouldRetry) {
      return circuitBreakerResult;
    }

    // Calculate retry delay
    const delay = this.calculateRetryDelay(retryPolicy, attempt);
    
    // Check if delay exceeds reasonable limits (prevent infinite delays)
    const maxReasonableDelay = 5 * 60 * 1000; // 5 minutes
    if (delay > maxReasonableDelay) {
      return { 
        shouldRetry: false, 
        delay: 0, 
        reason: `Calculated delay (${delay}ms) exceeds maximum reasonable delay` 
      };
    }

    logger.debug(`Action will be retried`, {
      actionId,
      executionId,
      attempt: attempt + 1,
      delay: `${delay}ms`,
      error: error.message
    });

    return { shouldRetry: true, delay };
  }

  /**
   * Calculate retry delay with different backoff strategies
   */
  public calculateRetryDelay(retryPolicy: RetryPolicy, attempt: number): number {
    const baseDelay = retryPolicy.delay * 1000; // Convert to milliseconds
    const backoff = retryPolicy.backoff || 'fixed';
    let delay: number;

    switch (backoff) {
      case 'exponential':
        // Exponential backoff: delay * (2 ^ attempt) with jitter
        delay = baseDelay * Math.pow(2, attempt);
        // Add jitter (±25% randomization)
        const jitter = delay * 0.25 * (Math.random() - 0.5) * 2;
        delay = Math.floor(delay + jitter);
        break;

      case 'linear':
        // Linear backoff: delay * (attempt + 1)
        delay = baseDelay * (attempt + 1);
        break;

      case 'fixed':
      default:
        // Fixed delay
        delay = baseDelay;
        break;
    }

    // Ensure minimum delay of 100ms
    return Math.max(100, delay);
  }

  /**
   * Start tracking a retry attempt
   */
  public startRetry(
    actionId: string,
    actionType: string,
    executionId: string,
    attempt: number,
    maxAttempts: number,
    error?: Error
  ): void {
    const context: RetryContext = {
      actionId,
      actionType,
      executionId,
      attempt,
      maxAttempts,
      lastError: error,
      startTime: new Date(),
      totalRetryTime: 0
    };

    this.activeRetries.set(actionId, context);

    // Update retry history
    if (!this.retryHistory.has(executionId)) {
      this.retryHistory.set(executionId, []);
    }
    this.retryHistory.get(executionId)!.push(context);

    this.retryStats.totalRetries++;

    logger.debug(`Started retry tracking`, {
      actionId,
      executionId,
      attempt,
      maxAttempts
    });
  }

  /**
   * Complete a retry attempt (success or failure)
   */
  public completeRetry(actionId: string, success: boolean): void {
    const context = this.activeRetries.get(actionId);
    if (!context) {
      return;
    }

    const endTime = new Date();
    context.totalRetryTime = endTime.getTime() - context.startTime.getTime();

    if (success) {
      this.retryStats.successfulRetries++;
      logger.debug(`Retry succeeded`, {
        actionId: context.actionId,
        executionId: context.executionId,
        attempt: context.attempt,
        retryTime: `${context.totalRetryTime}ms`
      });
    } else {
      this.retryStats.failedRetries++;
      logger.debug(`Retry failed`, {
        actionId: context.actionId,
        executionId: context.executionId,
        attempt: context.attempt,
        retryTime: `${context.totalRetryTime}ms`
      });
    }

    this.activeRetries.delete(actionId);
    this.updateRetryStatistics();
  }

  /**
   * Evaluate circuit breaker pattern to prevent cascading failures
   */
  private evaluateCircuitBreaker(actionType: string, error: Error): RetryResult {
    const timeWindow = 5 * 60 * 1000; // 5 minutes
    const failureThreshold = 5; // 5 failures in time window
    const now = Date.now();

    // Get recent failures for this action type
    const recentFailures = Array.from(this.retryHistory.values())
      .flat()
      .filter(context => 
        context.actionType === actionType &&
        context.lastError &&
        (now - context.startTime.getTime()) < timeWindow
      );

    if (recentFailures.length >= failureThreshold) {
      logger.warn(`Circuit breaker activated for action type`, {
        actionType,
        recentFailures: recentFailures.length,
        timeWindow: `${timeWindow}ms`
      });

      return {
        shouldRetry: false,
        delay: 0,
        reason: `Circuit breaker activated: ${recentFailures.length} failures in ${timeWindow}ms`
      };
    }

    return { shouldRetry: true, delay: 0 };
  }

  /**
   * Update retry statistics
   */
  private updateRetryStatistics(): void {
    const allRetries = Array.from(this.retryHistory.values()).flat();
    
    if (allRetries.length === 0) {
      return;
    }

    // Calculate average retry delay
    const totalDelay = allRetries.reduce((sum, context) => sum + context.totalRetryTime, 0);
    this.retryStats.averageRetryDelay = totalDelay / allRetries.length;

    // Find max retry delay
    this.retryStats.maxRetryDelay = Math.max(...allRetries.map(c => c.totalRetryTime));

    // Find most retried action
    const actionRetryCount = new Map<string, number>();
    allRetries.forEach(context => {
      const count = actionRetryCount.get(context.actionType) || 0;
      actionRetryCount.set(context.actionType, count + 1);
    });

    let maxRetries = 0;
    let mostRetriedAction = '';
    actionRetryCount.forEach((count, actionType) => {
      if (count > maxRetries) {
        maxRetries = count;
        mostRetriedAction = actionType;
      }
    });

    this.retryStats.mostRetriedAction = mostRetriedAction;

    // Calculate success rate
    const totalAttempts = this.retryStats.successfulRetries + this.retryStats.failedRetries;
    this.retryStats.retrySuccessRate = totalAttempts > 0 
      ? this.retryStats.successfulRetries / totalAttempts 
      : 0;
  }

  /**
   * Get retry statistics
   */
  public getRetryStatistics(): RetryStatistics {
    return { ...this.retryStats };
  }

  /**
   * Get retry history for an execution
   */
  public getRetryHistory(executionId: string): RetryContext[] {
    return this.retryHistory.get(executionId) || [];
  }

  /**
   * Get currently active retries
   */
  public getActiveRetries(): RetryContext[] {
    return Array.from(this.activeRetries.values());
  }

  /**
   * Clear retry history (for cleanup)
   */
  public clearHistory(olderThanMs?: number): number {
    if (!olderThanMs) {
      const count = this.retryHistory.size;
      this.retryHistory.clear();
      return count;
    }

    const cutoff = Date.now() - olderThanMs;
    let cleared = 0;

    this.retryHistory.forEach((contexts, executionId) => {
      const recentContexts = contexts.filter(
        context => context.startTime.getTime() > cutoff
      );
      
      if (recentContexts.length === 0) {
        this.retryHistory.delete(executionId);
        cleared++;
      } else if (recentContexts.length < contexts.length) {
        this.retryHistory.set(executionId, recentContexts);
      }
    });

    logger.debug(`Cleared retry history`, {
      entriesCleared: cleared,
      olderThanMs
    });

    return cleared;
  }

  /**
   * Analyze retry patterns for optimization
   */
  public analyzeRetryPatterns(): RetryPatternAnalysis {
    const allRetries = Array.from(this.retryHistory.values()).flat();
    
    if (allRetries.length === 0) {
      return {
        totalAnalyzed: 0,
        commonFailurePatterns: [],
        avgRetriesPerAction: 0,
        retryEffectiveness: 0,
        recommendations: []
      };
    }

    // Group by action type
    const actionGroups = new Map<string, RetryContext[]>();
    allRetries.forEach(context => {
      if (!actionGroups.has(context.actionType)) {
        actionGroups.set(context.actionType, []);
      }
      actionGroups.get(context.actionType)!.push(context);
    });

    // Analyze failure patterns
    const failurePatterns = new Map<string, number>();
    allRetries.forEach(context => {
      if (context.lastError) {
        const errorType = context.lastError.constructor.name;
        failurePatterns.set(errorType, (failurePatterns.get(errorType) || 0) + 1);
      }
    });

    const commonFailurePatterns = Array.from(failurePatterns.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([error, count]) => ({ error, count }));

    // Calculate averages
    const avgRetriesPerAction = allRetries.length / actionGroups.size;
    
    // Calculate effectiveness (how often retries eventually succeed)
    const successful = allRetries.filter(c => 
      this.retryStats.successfulRetries > 0
    ).length;
    const retryEffectiveness = allRetries.length > 0 ? successful / allRetries.length : 0;

    // Generate recommendations
    const recommendations: string[] = [];
    
    if (retryEffectiveness < 0.5) {
      recommendations.push('Low retry success rate - consider reviewing retry policies');
    }
    
    if (this.retryStats.averageRetryDelay > 30000) {
      recommendations.push('High average retry delays - consider optimizing backoff strategies');
    }

    if (commonFailurePatterns.length > 0 && commonFailurePatterns[0].count > allRetries.length * 0.5) {
      recommendations.push(`Dominant error type '${commonFailurePatterns[0].error}' - focus on preventing this error`);
    }

    return {
      totalAnalyzed: allRetries.length,
      commonFailurePatterns,
      avgRetriesPerAction,
      retryEffectiveness,
      recommendations
    };
  }

  /**
   * Create optimized retry policy based on historical data
   */
  public suggestOptimalRetryPolicy(actionType: string): RetryPolicy | null {
    const actionRetries = Array.from(this.retryHistory.values())
      .flat()
      .filter(context => context.actionType === actionType);

    if (actionRetries.length < 5) {
      return null; // Not enough data
    }

    // Analyze success patterns
    const successfulRetries = actionRetries.filter(c => 
      // This would need integration with success tracking
      true // Placeholder
    );

    const avgSuccessAttempt = successfulRetries.length > 0
      ? successfulRetries.reduce((sum, c) => sum + c.attempt, 0) / successfulRetries.length
      : 3;

    // Suggest policy based on analysis
    return {
      maxAttempts: Math.min(Math.ceil(avgSuccessAttempt * 1.5), 5),
      delay: Math.max(1, Math.floor(this.retryStats.averageRetryDelay / 1000)),
      backoff: this.retryStats.retrySuccessRate > 0.7 ? 'exponential' : 'linear',
      retryOn: this.getCommonRetryableErrors(actionType)
    };
  }

  /**
   * Get common retryable errors for an action type
   */
  private getCommonRetryableErrors(actionType: string): string[] {
    const actionRetries = Array.from(this.retryHistory.values())
      .flat()
      .filter(context => context.actionType === actionType && context.lastError);

    const errorCounts = new Map<string, number>();
    actionRetries.forEach(context => {
      if (context.lastError) {
        const errorType = context.lastError.constructor.name;
        errorCounts.set(errorType, (errorCounts.get(errorType) || 0) + 1);
      }
    });

    return Array.from(errorCounts.entries())
      .filter(([_, count]) => count >= 2) // At least 2 occurrences
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3) // Top 3 error types
      .map(([errorType, _]) => errorType);
  }
}

export interface RetryPatternAnalysis {
  totalAnalyzed: number;
  commonFailurePatterns: { error: string; count: number }[];
  avgRetriesPerAction: number;
  retryEffectiveness: number;
  recommendations: string[];
}