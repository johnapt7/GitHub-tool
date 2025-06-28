import { IntegrationError, RetryContext } from '../../types/integration';
import logger from '../../utils/logger';

export enum ErrorCategory {
  AUTHENTICATION = 'authentication',
  AUTHORIZATION = 'authorization',
  RATE_LIMIT = 'rate_limit',
  NETWORK = 'network',
  VALIDATION = 'validation',
  SERVER_ERROR = 'server_error',
  TIMEOUT = 'timeout',
  UNKNOWN = 'unknown'
}

export interface ErrorPattern {
  category: ErrorCategory;
  codes: string[];
  statusCodes: number[];
  messagePatterns: RegExp[];
  isRetryable: boolean;
  retryAfter?: number; // seconds
}

export class IntegrationErrorHandler {
  private static readonly ERROR_PATTERNS: ErrorPattern[] = [
    {
      category: ErrorCategory.AUTHENTICATION,
      codes: ['OAUTH2_CODE_EXCHANGE_ERROR', 'OAUTH2_TOKEN_REFRESH_ERROR', 'INVALID_TOKEN'],
      statusCodes: [401],
      messagePatterns: [
        /invalid.?token/i,
        /expired.?token/i,
        /unauthorized/i,
        /authentication.?failed/i,
        /invalid.?credentials/i
      ],
      isRetryable: false
    },
    {
      category: ErrorCategory.AUTHORIZATION,
      codes: ['INSUFFICIENT_PERMISSIONS', 'ACCESS_DENIED'],
      statusCodes: [403],
      messagePatterns: [
        /forbidden/i,
        /access.?denied/i,
        /insufficient.?permissions/i,
        /not.?authorized/i
      ],
      isRetryable: false
    },
    {
      category: ErrorCategory.RATE_LIMIT,
      codes: ['RATE_LIMIT_EXCEEDED', 'TOO_MANY_REQUESTS'],
      statusCodes: [429],
      messagePatterns: [
        /rate.?limit/i,
        /too.?many.?requests/i,
        /quota.?exceeded/i,
        /throttled/i
      ],
      isRetryable: true,
      retryAfter: 60
    },
    {
      category: ErrorCategory.VALIDATION,
      codes: ['INVALID_REQUEST', 'BAD_REQUEST', 'VALIDATION_ERROR'],
      statusCodes: [400, 422],
      messagePatterns: [
        /bad.?request/i,
        /invalid.?request/i,
        /validation.?error/i,
        /malformed/i,
        /invalid.?parameter/i
      ],
      isRetryable: false
    },
    {
      category: ErrorCategory.NETWORK,
      codes: ['NETWORK_ERROR', 'CONNECTION_ERROR', 'DNS_ERROR'],
      statusCodes: [],
      messagePatterns: [
        /network.?error/i,
        /connection.?failed/i,
        /connection.?refused/i,
        /dns.?error/i,
        /enotfound/i,
        /econnrefused/i
      ],
      isRetryable: true
    },
    {
      category: ErrorCategory.TIMEOUT,
      codes: ['TIMEOUT_ERROR', 'REQUEST_TIMEOUT'],
      statusCodes: [408, 504],
      messagePatterns: [
        /timeout/i,
        /timed.?out/i,
        /gateway.?timeout/i
      ],
      isRetryable: true
    },
    {
      category: ErrorCategory.SERVER_ERROR,
      codes: ['INTERNAL_SERVER_ERROR', 'SERVICE_UNAVAILABLE'],
      statusCodes: [500, 502, 503],
      messagePatterns: [
        /internal.?server.?error/i,
        /service.?unavailable/i,
        /bad.?gateway/i,
        /server.?error/i
      ],
      isRetryable: true
    }
  ];

  /**
   * Categorize an integration error
   */
  static categorizeError(error: IntegrationError): ErrorCategory {
    for (const pattern of this.ERROR_PATTERNS) {
      if (this.matchesPattern(error, pattern)) {
        return pattern.category;
      }
    }
    return ErrorCategory.UNKNOWN;
  }

  /**
   * Create a standardized integration error
   */
  static createError(
    message: string,
    code: string,
    statusCode?: number,
    originalError?: Error,
    context?: Record<string, any>
  ): IntegrationError {
    const error = new Error(message) as IntegrationError;
    error.code = code;
    if (statusCode !== undefined) {
      error.statusCode = statusCode;
    }
    if (originalError !== undefined) {
      error.originalError = originalError;
    }
    if (context !== undefined) {
      error.context = context;
    }

    // Determine if error is retryable based on patterns
    const category = this.categorizeError(error);
    const pattern = this.ERROR_PATTERNS.find(p => p.category === category);
    error.isRetryable = pattern?.isRetryable ?? false;

    return error;
  }

  /**
   * Enhance an existing error with integration-specific information
   */
  static enhanceError(
    error: Error,
    code: string,
    context?: Record<string, any>
  ): IntegrationError {
    const integrationError = error as IntegrationError;
    
    if (!integrationError.code) {
      integrationError.code = code;
    }
    
    if (context) {
      integrationError.context = {
        ...integrationError.context,
        ...context
      };
    }

    // Set retryable flag if not already set
    if (integrationError.isRetryable === undefined) {
      const category = this.categorizeError(integrationError);
      const pattern = this.ERROR_PATTERNS.find(p => p.category === category);
      integrationError.isRetryable = pattern?.isRetryable ?? false;
    }

    return integrationError;
  }

  /**
   * Check if an error should be retried
   */
  static shouldRetry(error: IntegrationError, retryContext: RetryContext): boolean {
    // Don't retry if explicitly marked as non-retryable
    if (error.isRetryable === false) {
      return false;
    }

    // Don't retry if max attempts reached
    if (retryContext.attempt >= retryContext.maxRetries) {
      return false;
    }

    const category = this.categorizeError(error);
    
    // Special handling for specific error categories
    switch (category) {
      case ErrorCategory.AUTHENTICATION:
      case ErrorCategory.AUTHORIZATION:
      case ErrorCategory.VALIDATION:
        return false;
        
      case ErrorCategory.RATE_LIMIT:
        return true; // Always retry rate limits (after delay)
        
      case ErrorCategory.NETWORK:
      case ErrorCategory.TIMEOUT:
      case ErrorCategory.SERVER_ERROR:
        return true;
        
      default:
        return error.isRetryable === true;
    }
  }

  /**
   * Calculate retry delay for an error
   */
  static calculateRetryDelay(error: IntegrationError, retryContext: RetryContext): number {
    const category = this.categorizeError(error);
    const pattern = this.ERROR_PATTERNS.find(p => p.category === category);

    // Use pattern-specific retry delay if available
    if (pattern?.retryAfter) {
      return pattern.retryAfter * 1000; // Convert to milliseconds
    }

    // Rate limit specific handling
    if (category === ErrorCategory.RATE_LIMIT) {
      // Try to extract retry-after from error context
      const retryAfter = this.extractRetryAfter(error);
      if (retryAfter) {
        return retryAfter * 1000;
      }
      
      // Default rate limit delay
      return 60000; // 60 seconds
    }

    // Use exponential backoff for other retryable errors
    return retryContext.delay;
  }

  /**
   * Log error with appropriate level based on category
   */
  static logError(error: IntegrationError, context?: Record<string, any>): void {
    const category = this.categorizeError(error);
    const logContext = {
      error: {
        message: error.message,
        code: error.code,
        category,
        statusCode: error.statusCode,
        isRetryable: error.isRetryable
      },
      context: {
        ...error.context,
        ...context
      }
    };

    switch (category) {
      case ErrorCategory.AUTHENTICATION:
      case ErrorCategory.AUTHORIZATION:
        logger.warn('Integration authentication/authorization error', logContext);
        break;
        
      case ErrorCategory.RATE_LIMIT:
        logger.warn('Integration rate limit exceeded', logContext);
        break;
        
      case ErrorCategory.VALIDATION:
        logger.error('Integration validation error', logContext);
        break;
        
      case ErrorCategory.NETWORK:
      case ErrorCategory.TIMEOUT:
        logger.warn('Integration network/timeout error', logContext);
        break;
        
      case ErrorCategory.SERVER_ERROR:
        logger.error('Integration server error', logContext);
        break;
        
      default:
        logger.error('Integration unknown error', logContext);
    }
  }

  /**
   * Create user-friendly error message
   */
  static createUserFriendlyMessage(error: IntegrationError): string {
    const category = this.categorizeError(error);
    
    switch (category) {
      case ErrorCategory.AUTHENTICATION:
        return 'Authentication failed. Please check your credentials and try again.';
        
      case ErrorCategory.AUTHORIZATION:
        return 'Access denied. You don\'t have permission to perform this action.';
        
      case ErrorCategory.RATE_LIMIT:
        return 'Too many requests. Please wait a moment and try again.';
        
      case ErrorCategory.VALIDATION:
        return 'Invalid request. Please check your input and try again.';
        
      case ErrorCategory.NETWORK:
        return 'Network error. Please check your connection and try again.';
        
      case ErrorCategory.TIMEOUT:
        return 'Request timed out. Please try again.';
        
      case ErrorCategory.SERVER_ERROR:
        return 'Service temporarily unavailable. Please try again later.';
        
      default:
        return 'An unexpected error occurred. Please try again.';
    }
  }

  private static matchesPattern(error: IntegrationError, pattern: ErrorPattern): boolean {
    // Check error codes
    if (pattern.codes.includes(error.code)) {
      return true;
    }

    // Check status codes
    if (error.statusCode && pattern.statusCodes.includes(error.statusCode)) {
      return true;
    }

    // Check message patterns
    const message = error.message.toLowerCase();
    return pattern.messagePatterns.some(regex => regex.test(message));
  }

  private static extractRetryAfter(error: IntegrationError): number | null {
    // Try to extract retry-after from error context or headers
    const context = error.context;
    
    if (context?.headers?.['retry-after']) {
      const retryAfter = parseInt(context.headers['retry-after'], 10);
      return isNaN(retryAfter) ? null : retryAfter;
    }
    
    if (context?.retryAfter && typeof context.retryAfter === 'number') {
      return context.retryAfter;
    }
    
    // Try to parse from error message
    const match = error.message.match(/retry.?after:?\s*(\d+)/i);
    if (match && match[1]) {
      const parsed = parseInt(match[1], 10);
      return isNaN(parsed) ? null : parsed;
    }
    
    return null;
  }
}