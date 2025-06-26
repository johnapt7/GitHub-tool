import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import environment from './config/environment';
import logger from './utils/logger';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import { requestLogger } from './middleware/requestLogger';
import healthRoutes from './routes/health';
import apiRoutes from './routes/api';
import githubRoutes, { initializeGitHubServices } from './routes/github';
import { webhookRouter } from './routes/webhook';
import { GitHubServiceFactory } from './services/githubFactory';

const app = express();

// Initialize GitHub services
const initializeGitHub = (): void => {
  const validation = GitHubServiceFactory.validateConfiguration();
  
  if (validation.errors.length > 0) {
    logger.warn('GitHub App configuration errors detected:', { errors: validation.errors });
    logger.info('GitHub features will be disabled');
    return;
  }

  if (validation.warnings.length > 0) {
    logger.warn('GitHub App configuration warnings:', { warnings: validation.warnings });
  }

  const githubAuth = GitHubServiceFactory.createGitHubAuthService();
  const githubMiddleware = GitHubServiceFactory.createGitHubAuthMiddleware();

  if (githubAuth && githubMiddleware) {
    initializeGitHubServices(githubAuth, githubMiddleware);
    logger.info('GitHub App services initialized successfully');
  }
};

// Initialize GitHub services
initializeGitHub();

// Rate limiting
const limiter = rateLimit({
  windowMs: environment.RATE_LIMIT_WINDOW_MS,
  max: environment.RATE_LIMIT_MAX_REQUESTS,
  message: {
    success: false,
    error: {
      message: 'Too many requests from this IP, please try again later.',
    },
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Security middleware
app.use(helmet());
app.use(cors({
  origin: environment.CORS_ORIGIN,
  credentials: true,
}));
app.use(limiter);

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Request logging
app.use(requestLogger);

// Routes
app.use('/', healthRoutes);
app.use('/api/v1', apiRoutes);

// Webhook routes (always enabled for webhook reception)
app.use('/api/v1', webhookRouter);
logger.info('Webhook routes enabled');

// GitHub routes (only if GitHub is enabled)
if (GitHubServiceFactory.isGitHubEnabled()) {
  app.use('/api/v1/github', githubRoutes);
  logger.info('GitHub API routes enabled');
}

// Error handling
app.use(notFoundHandler);
app.use(errorHandler);

// Graceful shutdown
const gracefulShutdown = async (signal: string): Promise<void> => {
  logger.info(`Received ${signal}. Starting graceful shutdown...`);
  
  // Cleanup GitHub services
  try {
    await GitHubServiceFactory.cleanup();
    logger.info('GitHub services cleaned up successfully');
  } catch (error) {
    logger.error('Error cleaning up GitHub services', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }

  server.close(() => {
    logger.info('HTTP server closed.');
    process.exit(0);
  });

  // Force close after 30 seconds
  setTimeout(() => {
    logger.error('Could not close connections in time, forcefully shutting down');
    process.exit(1);
  }, 30000);
};

// Start server
const server = app.listen(environment.PORT, () => {
  logger.info(`Server running on port ${environment.PORT} in ${environment.NODE_ENV} mode`);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason: unknown, promise: Promise<unknown>) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Handle uncaught exceptions
process.on('uncaughtException', (error: Error) => {
  logger.error('Uncaught Exception:', error);
  process.exit(1);
});

// Handle process termination signals
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

export default app;