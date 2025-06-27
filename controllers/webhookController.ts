import { Request, Response } from 'express';
import { isSignatureValid } from '../utils/webhookSecurity';
import { deduplicationService } from '../services/deduplicationService';
import { eventQueue } from '../services/eventQueue';
import { GitHubWebhookEvent, GitHubWebhookHeaders } from '../types/github';
import logger from '../utils/logger';

export class WebhookController {
  private readonly webhookSecret: string;

  constructor(webhookSecret?: string) {
    this.webhookSecret = webhookSecret || process.env.GITHUB_WEBHOOK_SECRET || '';
    
    if (!this.webhookSecret) {
      logger.warn('No webhook secret configured. Webhook signature validation will fail.');
    }
  }

  public async handleWebhook(req: Request, res: Response): Promise<void> {
    try {
      // Extract headers
      const eventType = req.headers['x-github-event'] as string;
      const deliveryId = req.headers['x-github-delivery'] as string;
      const signature = req.headers['x-hub-signature-256'] as string;
      const userAgent = req.headers['user-agent'] as string;
      const contentType = req.headers['content-type'] as string;

      // Validate required headers
      if (!eventType) {
        res.status(400).json({ error: 'Missing x-github-event header' });
        return;
      }

      if (!deliveryId) {
        res.status(400).json({ error: 'Missing x-github-delivery header' });
        return;
      }

      // Get raw body for signature validation
      const rawBody = JSON.stringify(req.body);

      // Validate webhook signature
      if (this.webhookSecret && !isSignatureValid(rawBody, signature, this.webhookSecret)) {
        logger.error('Webhook signature validation failed', {
          deliveryId,
          eventType,
          hasSignature: !!signature,
          hasSecret: !!this.webhookSecret
        });
        res.status(401).json({ error: 'Invalid signature' });
        return;
      }

      // Check for duplicate delivery
      if (deduplicationService.isDuplicate(rawBody, deliveryId)) {
        logger.info('Duplicate webhook delivery detected', {
          deliveryId,
          eventType
        });
        res.status(200).json({ message: 'Duplicate delivery ignored' });
        return;
      }

      // Create webhook event
      const webhookEvent: GitHubWebhookEvent = {
        eventType,
        deliveryId,
        payload: req.body,
        headers: {
          'x-github-event': eventType,
          'x-github-delivery': deliveryId,
          'x-hub-signature-256': signature || '',
          'user-agent': userAgent || '',
          'content-type': contentType || ''
        } as GitHubWebhookHeaders,
        signature: signature || '',
        timestamp: Date.now()
      };

      // Queue event for processing
      await eventQueue.enqueue(
        eventType,
        req.body,
        webhookEvent.headers,
        deliveryId
      );

      logger.info('Webhook event queued successfully', {
        deliveryId,
        eventType,
        queueSize: eventQueue.getQueueSize()
      });

      // Respond quickly to GitHub
      res.status(200).json({ 
        message: 'Webhook received and queued for processing',
        deliveryId,
        eventType,
        queueSize: eventQueue.getQueueSize()
      });

    } catch (error) {
      logger.error('Error processing webhook', { error: error instanceof Error ? error.message : error });
      
      // Log error details for debugging
      logger.error('Webhook error details', {
        deliveryId: req.headers['x-github-delivery'],
        eventType: req.headers['x-github-event'],
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined
      });

      res.status(500).json({ 
        error: 'Internal server error processing webhook',
        deliveryId: req.headers['x-github-delivery']
      });
    }
  }

  public async getWebhookStats(req: Request, res: Response): Promise<void> {
    try {
      const queueStats = eventQueue.getQueueStats();
      const deduplicationStats = deduplicationService.getStats();

      res.json({
        queue: queueStats,
        deduplication: deduplicationStats,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      logger.error('Error getting webhook stats', { error: error instanceof Error ? error.message : error });
      res.status(500).json({ error: 'Failed to get webhook stats' });
    }
  }

  public async healthCheck(req: Request, res: Response): Promise<void> {
    try {
      const queueStats = eventQueue.getQueueStats();
      const isHealthy = queueStats.size < queueStats.maxSize * 0.9; // Consider unhealthy if queue is 90% full

      res.status(isHealthy ? 200 : 503).json({
        status: isHealthy ? 'healthy' : 'unhealthy',
        queue: queueStats,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      logger.error('Error in webhook health check', { error: error instanceof Error ? error.message : error });
      res.status(503).json({ 
        status: 'unhealthy',
        error: 'Health check failed',
        timestamp: new Date().toISOString()
      });
    }
  }
}

// Create singleton instance
export const webhookController = new WebhookController();