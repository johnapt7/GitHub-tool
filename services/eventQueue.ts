import { EventEmitter } from 'events';
import logger from '../utils/logger';

export interface QueuedEvent {
  id: string;
  eventType: string;
  payload: any;
  headers: Record<string, string>;
  deliveryId: string;
  timestamp: number;
  retryCount: number;
  maxRetries: number;
}

export interface EventProcessor {
  process(event: QueuedEvent): Promise<void>;
}

export class EventQueue extends EventEmitter {
  private queue: QueuedEvent[] = [];
  private processing = false;
  private processors = new Map<string, EventProcessor>();
  private readonly maxQueueSize: number;
  private readonly defaultMaxRetries: number;

  constructor(maxQueueSize: number = 1000, defaultMaxRetries: number = 3) {
    super();
    this.maxQueueSize = maxQueueSize;
    this.defaultMaxRetries = defaultMaxRetries;
  }

  public registerProcessor(eventType: string, processor: EventProcessor): void {
    this.processors.set(eventType, processor);
  }

  public async enqueue(
    eventType: string,
    payload: any,
    headers: Record<string, string>,
    deliveryId: string,
    maxRetries?: number
  ): Promise<void> {
    if (this.queue.length >= this.maxQueueSize) {
      throw new Error(`Queue is full (${this.maxQueueSize} events)`);
    }

    const event: QueuedEvent = {
      id: this.generateEventId(),
      eventType,
      payload,
      headers,
      deliveryId,
      timestamp: Date.now(),
      retryCount: 0,
      maxRetries: maxRetries ?? this.defaultMaxRetries
    };

    this.queue.push(event);
    this.emit('eventQueued', event);

    // Start processing if not already running
    if (!this.processing) {
      setImmediate(() => this.processQueue());
    }
  }

  private generateEventId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  private async processQueue(): Promise<void> {
    if (this.processing || this.queue.length === 0) {
      return;
    }

    this.processing = true;

    try {
      while (this.queue.length > 0) {
        const event = this.queue.shift()!;
        await this.processEvent(event);
      }
    } catch (error) {
      this.emit('processingError', error);
    } finally {
      this.processing = false;
    }
  }

  private async processEvent(event: QueuedEvent): Promise<void> {
    const processor = this.processors.get(event.eventType);
    
    if (!processor) {
      this.emit('noProcessor', event);
      return;
    }

    try {
      await processor.process(event);
      this.emit('eventProcessed', event);
    } catch (error) {
      event.retryCount++;
      this.emit('eventProcessingFailed', event, error);

      if (event.retryCount <= event.maxRetries) {
        // Re-queue for retry with exponential backoff
        const delay = Math.min(1000 * Math.pow(2, event.retryCount - 1), 30000); // Max 30s delay
        setTimeout(() => {
          this.queue.unshift(event); // Add to front of queue
          if (!this.processing) {
            setImmediate(() => this.processQueue());
          }
        }, delay);
        this.emit('eventRetrying', event, delay);
      } else {
        this.emit('eventFailed', event, error);
      }
    }
  }

  public getQueueSize(): number {
    return this.queue.length;
  }

  public getQueueStats(): {
    size: number;
    maxSize: number;
    processing: boolean;
    processorCount: number;
  } {
    return {
      size: this.queue.length,
      maxSize: this.maxQueueSize,
      processing: this.processing,
      processorCount: this.processors.size
    };
  }

  public clear(): void {
    this.queue = [];
    this.processing = false;
  }
}

// Default event processor for GitHub webhooks
export class GitHubEventProcessor implements EventProcessor {
  async process(event: QueuedEvent): Promise<void> {
    // Default implementation - log the event
    logger.info(`Processing GitHub webhook: ${event.eventType}`, {
      deliveryId: event.deliveryId,
      timestamp: new Date(event.timestamp).toISOString(),
      retryCount: event.retryCount
    });

    // Add your specific event processing logic here
    // For example, you might want to:
    // - Store the event in a database
    // - Trigger specific workflows based on event type
    // - Send notifications
    // - Update external systems
    
    await this.handleSpecificEvent(event);
  }

  private async handleSpecificEvent(event: QueuedEvent): Promise<void> {
    switch (event.eventType) {
      case 'push':
        await this.handlePushEvent(event);
        break;
      case 'pull_request':
        await this.handlePullRequestEvent(event);
        break;
      case 'issues':
        await this.handleIssuesEvent(event);
        break;
      case 'release':
        await this.handleReleaseEvent(event);
        break;
      default:
        logger.info(`No specific handler for event type: ${event.eventType}`);
    }
  }

  private async handlePushEvent(event: QueuedEvent): Promise<void> {
    logger.info('Handling push event:', event.payload.ref);
  }

  private async handlePullRequestEvent(event: QueuedEvent): Promise<void> {
    logger.info('Handling pull request event:', event.payload.action);
  }

  private async handleIssuesEvent(event: QueuedEvent): Promise<void> {
    logger.info('Handling issues event:', event.payload.action);
  }

  private async handleReleaseEvent(event: QueuedEvent): Promise<void> {
    logger.info('Handling release event:', event.payload.action);
  }
}

// Singleton instances
export const eventQueue = new EventQueue();
export const gitHubEventProcessor = new GitHubEventProcessor();

// Register the default processor for all GitHub events
eventQueue.registerProcessor('push', gitHubEventProcessor);
eventQueue.registerProcessor('pull_request', gitHubEventProcessor);
eventQueue.registerProcessor('issues', gitHubEventProcessor);
eventQueue.registerProcessor('release', gitHubEventProcessor);
eventQueue.registerProcessor('create', gitHubEventProcessor);
eventQueue.registerProcessor('delete', gitHubEventProcessor);
eventQueue.registerProcessor('fork', gitHubEventProcessor);
eventQueue.registerProcessor('watch', gitHubEventProcessor);
eventQueue.registerProcessor('star', gitHubEventProcessor);