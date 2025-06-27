/**
 * Integration Framework Usage Examples
 * 
 * This file demonstrates how to use the new integration framework
 * with OAuth2 authentication, token refresh, and standardized error handling.
 */

import {
  IntegrationConfig,
  IntegrationManager,
  HttpIntegrationAdapter,
  SlackIntegrationAdapter,
  integrationManager
} from '../services/integrations';

// Example 1: Basic HTTP Integration with OAuth2
async function createGenericOAuth2Integration() {
  const config: IntegrationConfig = {
    id: 'google-api',
    name: 'Google API Integration',
    baseUrl: 'https://www.googleapis.com',
    oauth2: {
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      authorizationUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
      tokenUrl: 'https://oauth2.googleapis.com/token',
      scope: 'https://www.googleapis.com/auth/userinfo.profile'
    },
    retryConfig: {
      maxRetries: 3,
      backoffMultiplier: 2,
      maxBackoffDelay: 10000
    }
  };

  // Register the integration
  integrationManager.register(config);

  // Get authorization URL for user to visit
  const authUrl = integrationManager.getAuthorizationUrl('google-api', 'random-state-123');
  console.log('Visit this URL to authorize:', authUrl);

  // After user authorizes and we get the code, authenticate
  // integrationManager.authenticateWithCode('google-api', 'authorization-code-from-callback');

  // Use the integration
  const googleApi = integrationManager.get('google-api');
  
  try {
    const userInfo = await googleApi.request({
      method: 'GET',
      url: '/oauth2/v2/userinfo'
    });
    
    console.log('User info:', userInfo.data);
  } catch (error) {
    console.error('Failed to get user info:', error);
  }
}

// Example 2: Slack Integration with Bot Token
async function createSlackBotIntegration() {
  const slackBot = SlackIntegrationAdapter.createWithBotToken(
    process.env.SLACK_BOT_TOKEN!
  );

  // Register with integration manager
  integrationManager.register(slackBot.config, slackBot);

  try {
    // Test authentication
    const authTest = await slackBot.testAuth();
    console.log('Slack bot authenticated:', authTest.name);

    // Get channels
    const channels = await slackBot.getChannels();
    console.log('Available channels:', channels.map(c => c.name));

    // Send a message
    const result = await slackBot.sendFormattedMessage(
      '#general',
      'Hello from the integration framework! 🚀',
      { username: 'Integration Bot', iconEmoji: ':robot_face:' }
    );
    
    console.log('Message sent:', result);

  } catch (error) {
    console.error('Slack integration error:', error);
  }
}

// Example 3: Slack Integration with OAuth2
async function createSlackOAuth2Integration() {
  const slackOAuth = SlackIntegrationAdapter.createWithOAuth2(
    process.env.SLACK_CLIENT_ID!,
    process.env.SLACK_CLIENT_SECRET!,
    ['chat:write', 'channels:read', 'users:read']
  );

  integrationManager.register(slackOAuth.config, slackOAuth);

  // Get authorization URL
  const authUrl = integrationManager.getAuthorizationUrl('slack-oauth2', 'slack-state-456');
  console.log('Slack OAuth2 URL:', authUrl);

  // After OAuth2 flow completion:
  // await integrationManager.authenticateWithCode('slack-oauth2', 'oauth-code-from-slack');
}

// Example 4: Custom Integration Adapter
class CustomApiAdapter extends HttpIntegrationAdapter {
  constructor() {
    super({
      id: 'custom-api',
      name: 'Custom API',
      baseUrl: 'https://api.example.com',
      apiKey: process.env.CUSTOM_API_KEY,
      headers: {
        'X-API-Version': '2023-01-01'
      }
    });
  }

  // Custom method for this specific API
  async getCustomData(userId: string) {
    return this.get(`/users/${userId}/data`);
  }

  async createCustomResource(data: any) {
    return this.post('/resources', data);
  }
}

// Example 5: Integration Health Monitoring
async function monitorIntegrationsHealth() {
  // Get health status for all integrations
  const healthStatus = await integrationManager.getHealthStatus();
  
  healthStatus.forEach(status => {
    console.log(`Integration: ${status.name}`);
    console.log(`  Healthy: ${status.isHealthy}`);
    console.log(`  Authenticated: ${status.isAuthenticated}`);
    console.log(`  Total Requests: ${status.metrics.totalRequests}`);
    console.log(`  Success Rate: ${
      status.metrics.totalRequests > 0 
        ? (status.metrics.successfulRequests / status.metrics.totalRequests * 100).toFixed(2)
        : 0
    }%`);
    
    if (status.rateLimitInfo?.isLimited) {
      console.log(`  Rate Limited until: ${status.rateLimitInfo.resetTime}`);
    }
    
    console.log('---');
  });

  // Get aggregated metrics
  const aggregatedMetrics = integrationManager.getAggregatedMetrics();
  console.log('Aggregated Metrics:', aggregatedMetrics);
}

// Example 6: Error Handling Demonstration
async function demonstrateErrorHandling() {
  const integration = integrationManager.get('google-api');
  
  try {
    // This will likely fail and demonstrate error handling
    await integration.request({
      method: 'GET',
      url: '/nonexistent-endpoint'
    });
  } catch (error) {
    // The error will be automatically categorized and enhanced
    console.log('Error caught:', {
      message: error.message,
      code: error.code,
      category: error.category,
      isRetryable: error.isRetryable,
      statusCode: error.statusCode
    });
  }
}

// Example 7: Using Integration Manager for Centralized Management
async function integrationsManagementExample() {
  // List all registered integrations
  const integrationIds = integrationManager.list();
  console.log('Registered integrations:', integrationIds);

  // Update configuration
  integrationManager.updateConfig('google-api', {
    timeout: 60000, // Increase timeout to 60 seconds
    retryConfig: {
      maxRetries: 5,
      backoffMultiplier: 1.5,
      maxBackoffDelay: 15000
    }
  });

  // Check health of specific integration
  const googleHealth = await integrationManager.getIntegrationHealth('google-api');
  console.log('Google API Health:', googleHealth);

  // Cleanup (usually called during app shutdown)
  // await integrationManager.cleanup();
}

// Example usage
async function runExamples() {
  try {
    console.log('=== Integration Framework Examples ===\n');

    // Only run examples that don't require actual API keys
    await monitorIntegrationsHealth();
    
    console.log('\n=== Framework successfully demonstrated! ===');
    console.log('To use with real APIs:');
    console.log('1. Set environment variables for API credentials');
    console.log('2. Uncomment the actual API calls');
    console.log('3. Handle OAuth2 callback flows in your web routes');
    
  } catch (error) {
    console.error('Example error:', error);
  }
}

// Export for potential use in other files
export {
  createGenericOAuth2Integration,
  createSlackBotIntegration,
  createSlackOAuth2Integration,
  CustomApiAdapter,
  monitorIntegrationsHealth,
  demonstrateErrorHandling,
  integrationsManagementExample,
  runExamples
};

// Run examples if this file is executed directly
if (require.main === module) {
  runExamples().catch(console.error);
}