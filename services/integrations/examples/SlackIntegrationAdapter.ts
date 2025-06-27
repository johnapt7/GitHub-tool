import { IntegrationConfig, ResponseData } from '../../../types/integration';
import { HttpIntegrationAdapter } from '../HttpIntegrationAdapter';
import { IntegrationErrorHandler } from '../IntegrationErrorHandler';
import logger from '../../../utils/logger';

interface SlackUser {
  id: string;
  name: string;
  real_name: string;
  email?: string;
  is_bot: boolean;
  is_admin: boolean;
}

interface SlackChannel {
  id: string;
  name: string;
  is_channel: boolean;
  is_private: boolean;
  is_member: boolean;
  topic?: {
    value: string;
    creator: string;
    last_set: number;
  };
}

interface SlackMessage {
  channel: string;
  text: string;
  user?: string;
  as_user?: boolean;
  username?: string;
  icon_emoji?: string;
  icon_url?: string;
  attachments?: any[];
  blocks?: any[];
  thread_ts?: string;
}

interface SlackApiResponse<T = any> {
  ok: boolean;
  error?: string;
  warning?: string;
  data?: T;
}

/**
 * Example Slack integration adapter demonstrating the framework
 * Supports both OAuth2 and Bot Token authentication
 */
export class SlackIntegrationAdapter extends HttpIntegrationAdapter {
  constructor(config: Omit<IntegrationConfig, 'baseUrl'>) {
    super({
      ...config,
      baseUrl: 'https://slack.com/api',
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        ...config.headers
      }
    });
  }

  /**
   * Create Slack adapter with OAuth2 configuration
   */
  static createWithOAuth2(
    clientId: string,
    clientSecret: string,
    scopes: string[] = ['chat:write', 'channels:read', 'users:read']
  ): SlackIntegrationAdapter {
    return new SlackIntegrationAdapter({
      id: 'slack-oauth2',
      name: 'Slack OAuth2',
      oauth2: {
        clientId,
        clientSecret,
        authorizationUrl: 'https://slack.com/oauth/v2/authorize',
        tokenUrl: 'https://slack.com/api/oauth.v2.access',
        scope: scopes.join(',')
      },
      retryConfig: {
        maxRetries: 3,
        backoffMultiplier: 2,
        maxBackoffDelay: 30000
      }
    });
  }

  /**
   * Create Slack adapter with Bot Token
   */
  static createWithBotToken(botToken: string): SlackIntegrationAdapter {
    return new SlackIntegrationAdapter({
      id: 'slack-bot',
      name: 'Slack Bot Token',
      apiKey: botToken,
      retryConfig: {
        maxRetries: 3,
        backoffMultiplier: 2,
        maxBackoffDelay: 30000
      }
    });
  }

  // Override rate limit handling for Slack-specific headers
  async handleRateLimit(response: ResponseData): Promise<void> {
    const headers = response.headers;
    
    // Slack uses different rate limit headers
    const retryAfter = headers['retry-after'];
    if (retryAfter) {
      const resetTime = new Date(Date.now() + parseInt(retryAfter, 10) * 1000);
      
      this.rateLimitInfo = {
        limit: 1,
        remaining: 0,
        resetTime,
        isLimited: true
      };

      logger.warn('Slack rate limit exceeded', {
        integration: this.config.name,
        retryAfter: parseInt(retryAfter, 10),
        resetTime
      });
    }
  }

  // Slack API wrapper methods

  /**
   * Test authentication and connection
   */
  async testAuth(): Promise<SlackUser> {
    try {
      const response = await this.get<SlackApiResponse<SlackUser>>('/auth.test');
      
      if (!response.data.ok) {
        throw IntegrationErrorHandler.createError(
          `Slack auth test failed: ${response.data.error}`,
          'SLACK_AUTH_TEST_FAILED',
          401
        );
      }

      logger.info('Slack authentication test successful', {
        integration: this.config.name,
        user: response.data.data?.name
      });

      return response.data.data!;
    } catch (error) {
      logger.error('Slack authentication test failed', {
        integration: this.config.name,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  /**
   * Get list of channels
   */
  async getChannels(excludeArchived = true): Promise<SlackChannel[]> {
    try {
      const params = new URLSearchParams({
        exclude_archived: excludeArchived.toString(),
        limit: '1000'
      });

      const response = await this.get<SlackApiResponse<{ channels: SlackChannel[] }>>(
        `/conversations.list?${params.toString()}`
      );

      if (!response.data.ok) {
        throw IntegrationErrorHandler.createError(
          `Failed to get channels: ${response.data.error}`,
          'SLACK_GET_CHANNELS_FAILED'
        );
      }

      return response.data.data?.channels || [];
    } catch (error) {
      logger.error('Failed to get Slack channels', {
        integration: this.config.name,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  /**
   * Send a message to a channel
   */
  async sendMessage(message: SlackMessage): Promise<{ ts: string; channel: string }> {
    try {
      logger.info('Sending Slack message', {
        integration: this.config.name,
        channel: message.channel,
        hasText: !!message.text,
        hasBlocks: !!message.blocks?.length
      });

      const response = await this.post<SlackApiResponse<{ ts: string; channel: string }>>(
        '/chat.postMessage',
        message
      );

      if (!response.data.ok) {
        throw IntegrationErrorHandler.createError(
          `Failed to send message: ${response.data.error}`,
          'SLACK_SEND_MESSAGE_FAILED'
        );
      }

      logger.info('Slack message sent successfully', {
        integration: this.config.name,
        channel: response.data.data?.channel,
        timestamp: response.data.data?.ts
      });

      return response.data.data!;
    } catch (error) {
      logger.error('Failed to send Slack message', {
        integration: this.config.name,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  /**
   * Update an existing message
   */
  async updateMessage(
    channel: string,
    ts: string,
    text?: string,
    blocks?: any[]
  ): Promise<{ ts: string; channel: string }> {
    try {
      const updateData: any = {
        channel,
        ts
      };

      if (text) updateData.text = text;
      if (blocks) updateData.blocks = blocks;

      const response = await this.post<SlackApiResponse<{ ts: string; channel: string }>>(
        '/chat.update',
        updateData
      );

      if (!response.data.ok) {
        throw IntegrationErrorHandler.createError(
          `Failed to update message: ${response.data.error}`,
          'SLACK_UPDATE_MESSAGE_FAILED'
        );
      }

      return response.data.data!;
    } catch (error) {
      logger.error('Failed to update Slack message', {
        integration: this.config.name,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  /**
   * Delete a message
   */
  async deleteMessage(channel: string, ts: string): Promise<void> {
    try {
      const response = await this.post<SlackApiResponse>('/chat.delete', {
        channel,
        ts
      });

      if (!response.data.ok) {
        throw IntegrationErrorHandler.createError(
          `Failed to delete message: ${response.data.error}`,
          'SLACK_DELETE_MESSAGE_FAILED'
        );
      }

      logger.info('Slack message deleted successfully', {
        integration: this.config.name,
        channel,
        timestamp: ts
      });
    } catch (error) {
      logger.error('Failed to delete Slack message', {
        integration: this.config.name,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  /**
   * Get user information
   */
  async getUser(userId: string): Promise<SlackUser> {
    try {
      const response = await this.get<SlackApiResponse<{ user: SlackUser }>>(
        `/users.info?user=${encodeURIComponent(userId)}`
      );

      if (!response.data.ok) {
        throw IntegrationErrorHandler.createError(
          `Failed to get user info: ${response.data.error}`,
          'SLACK_GET_USER_FAILED'
        );
      }

      return response.data.data!.user;
    } catch (error) {
      logger.error('Failed to get Slack user', {
        integration: this.config.name,
        userId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  /**
   * Create a channel
   */
  async createChannel(name: string, isPrivate = false): Promise<SlackChannel> {
    try {
      const endpoint = isPrivate ? '/conversations.create' : '/conversations.create';
      const response = await this.post<SlackApiResponse<{ channel: SlackChannel }>>(endpoint, {
        name,
        is_private: isPrivate
      });

      if (!response.data.ok) {
        throw IntegrationErrorHandler.createError(
          `Failed to create channel: ${response.data.error}`,
          'SLACK_CREATE_CHANNEL_FAILED'
        );
      }

      logger.info('Slack channel created successfully', {
        integration: this.config.name,
        channelName: name,
        channelId: response.data.data?.channel.id,
        isPrivate
      });

      return response.data.data!.channel;
    } catch (error) {
      logger.error('Failed to create Slack channel', {
        integration: this.config.name,
        channelName: name,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  /**
   * Helper method to send formatted messages
   */
  async sendFormattedMessage(
    channel: string,
    text: string,
    options: {
      username?: string;
      iconEmoji?: string;
      threadTs?: string;
      asUser?: boolean;
    } = {}
  ): Promise<{ ts: string; channel: string }> {
    const message: SlackMessage = {
      channel,
      text,
      ...options.username && { username: options.username },
      ...options.iconEmoji && { icon_emoji: options.iconEmoji },
      ...options.threadTs && { thread_ts: options.threadTs },
      ...options.asUser !== undefined && { as_user: options.asUser }
    };

    return this.sendMessage(message);
  }

  /**
   * Helper method to send rich block messages
   */
  async sendBlockMessage(
    channel: string,
    blocks: any[],
    text?: string
  ): Promise<{ ts: string; channel: string }> {
    return this.sendMessage({
      channel,
      blocks,
      text: text || 'This message contains interactive elements'
    });
  }
}