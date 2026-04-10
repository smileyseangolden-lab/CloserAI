import { Router } from 'express';
import { validateBody } from '../../middleware/validate.js';
import { loginSchema, refreshSchema, registerSchema } from './auth.schemas.js';
import * as authService from './auth.service.js';

export const authRouter = Router();

authRouter.post('/register', validateBody(registerSchema), async (req, res, next) => {
  try {
    const tokens = await authService.register(req.body);
    res.status(201).json(tokens);
  } catch (err) {
    next(err);
  }
});

authRouter.post('/login', validateBody(loginSchema), async (req, res, next) => {
  try {
    const tokens = await authService.login(req.body);
    res.json(tokens);
  } catch (err) {
    next(err);
  }
});

authRouter.post('/refresh', validateBody(refreshSchema), async (req, res, next) => {
  try {
    const tokens = await authService.refresh(req.body.refreshToken);
    res.json(tokens);
  } catch (err) {
    next(err);
  }
});

authRouter.post('/logout', (_req, res) => {
  // JWT is stateless; client should drop tokens. If we add a server-side
  // revocation list this is where we'd push the jti.
  res.json({ success: true });
});
