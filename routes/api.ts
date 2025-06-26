import { Router, Request, Response } from 'express';

const router = Router();

router.get('/', (req: Request, res: Response): void => {
  res.json({
    success: true,
    message: 'API is working',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
  });
});

router.get('/users', (req: Request, res: Response): void => {
  const users = [
    { id: 1, name: 'John Doe', email: 'john@example.com' },
    { id: 2, name: 'Jane Smith', email: 'jane@example.com' },
  ];

  res.json({
    success: true,
    data: users,
    count: users.length,
  });
});

export default router;