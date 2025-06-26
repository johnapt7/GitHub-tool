import { Router } from 'express';
import { webhookController } from '../controllers/webhookController';
import { requestLogger } from '../middleware/requestLogger';

const router = Router();

// Middleware to parse raw body for signature validation
router.use('/webhook', (req, res, next) => {
  // Ensure we have the raw body for signature validation
  if (!req.body || typeof req.body !== 'object') {
    return res.status(400).json({ error: 'Invalid request body' });
  }
  next();
});

// GitHub webhook endpoint
router.post('/webhook', 
  requestLogger, // Log the request
  async (req, res) => {
    await webhookController.handleWebhook(req, res);
  }
);

// Webhook statistics endpoint (for monitoring)
router.get('/webhook/stats', async (req, res) => {
  await webhookController.getWebhookStats(req, res);
});

// Webhook health check endpoint
router.get('/webhook/health', async (req, res) => {
  await webhookController.healthCheck(req, res);
});

export { router as webhookRouter };