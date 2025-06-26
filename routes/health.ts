import { Router, Request, Response } from 'express';

const router = Router();

router.get('/health', (req: Request, res: Response): void => {
  res.status(200).json({
    success: true,
    message: 'Server is healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development',
  });
});

router.get('/health/ready', (req: Request, res: Response): void => {
  res.status(200).json({
    success: true,
    message: 'Server is ready',
    timestamp: new Date().toISOString(),
  });
});

export default router;