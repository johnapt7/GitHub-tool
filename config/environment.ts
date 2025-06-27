import dotenv from 'dotenv';

dotenv.config();

interface Environment {
  PORT: number;
  NODE_ENV: string;
  LOG_LEVEL: string;
  CORS_ORIGIN: string;
  RATE_LIMIT_WINDOW_MS: number;
  RATE_LIMIT_MAX_REQUESTS: number;
  
  // GitHub App Configuration
  GITHUB_APP_ID?: number | undefined;
  GITHUB_PRIVATE_KEY?: string | undefined;
  GITHUB_WEBHOOK_SECRET?: string | undefined;
  GITHUB_CLIENT_ID?: string | undefined;
  GITHUB_CLIENT_SECRET?: string | undefined;
  
  // GitHub App Features
  GITHUB_TOKEN_CACHE_TTL: number;
  GITHUB_RATE_LIMIT_WARNING_THRESHOLD: number;
  GITHUB_RATE_LIMIT_CRITICAL_THRESHOLD: number;
  GITHUB_AUTO_REFRESH_TOKENS: boolean;
  GITHUB_AUTO_REFRESH_INTERVAL: number;
  
  // Webhook Configuration
  WEBHOOK_QUEUE_MAX_SIZE: number;
  WEBHOOK_QUEUE_MAX_RETRIES: number;
  WEBHOOK_DEDUPLICATION_TTL: number;
  WEBHOOK_DEDUPLICATION_MAX_ENTRIES: number;
}

const environment: Environment = {
  PORT: parseInt(process.env.PORT || '3000', 10),
  NODE_ENV: process.env.NODE_ENV || 'development',
  LOG_LEVEL: process.env.LOG_LEVEL || 'info',
  CORS_ORIGIN: process.env.CORS_ORIGIN || '*',
  RATE_LIMIT_WINDOW_MS: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000', 10), // 15 minutes
  RATE_LIMIT_MAX_REQUESTS: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100', 10),
  
  // GitHub App Configuration
  GITHUB_APP_ID: process.env.GITHUB_APP_ID ? parseInt(process.env.GITHUB_APP_ID, 10) : undefined,
  GITHUB_PRIVATE_KEY: process.env.GITHUB_PRIVATE_KEY,
  GITHUB_WEBHOOK_SECRET: process.env.GITHUB_WEBHOOK_SECRET,
  GITHUB_CLIENT_ID: process.env.GITHUB_CLIENT_ID,
  GITHUB_CLIENT_SECRET: process.env.GITHUB_CLIENT_SECRET,
  
  // GitHub App Features
  GITHUB_TOKEN_CACHE_TTL: parseInt(process.env.GITHUB_TOKEN_CACHE_TTL || '3300', 10), // 55 minutes
  GITHUB_RATE_LIMIT_WARNING_THRESHOLD: parseInt(process.env.GITHUB_RATE_LIMIT_WARNING_THRESHOLD || '100', 10),
  GITHUB_RATE_LIMIT_CRITICAL_THRESHOLD: parseInt(process.env.GITHUB_RATE_LIMIT_CRITICAL_THRESHOLD || '10', 10),
  GITHUB_AUTO_REFRESH_TOKENS: process.env.GITHUB_AUTO_REFRESH_TOKENS === 'true',
  GITHUB_AUTO_REFRESH_INTERVAL: parseInt(process.env.GITHUB_AUTO_REFRESH_INTERVAL || '300000', 10), // 5 minutes
  
  // Webhook Configuration
  WEBHOOK_QUEUE_MAX_SIZE: parseInt(process.env.WEBHOOK_QUEUE_MAX_SIZE || '1000', 10),
  WEBHOOK_QUEUE_MAX_RETRIES: parseInt(process.env.WEBHOOK_QUEUE_MAX_RETRIES || '3', 10),
  WEBHOOK_DEDUPLICATION_TTL: parseInt(process.env.WEBHOOK_DEDUPLICATION_TTL || '300000', 10), // 5 minutes
  WEBHOOK_DEDUPLICATION_MAX_ENTRIES: parseInt(process.env.WEBHOOK_DEDUPLICATION_MAX_ENTRIES || '10000', 10)
};

export default environment;