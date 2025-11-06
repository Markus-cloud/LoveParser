import { Router } from 'express';
import { upsertUser, getUserById } from '../lib/users.js';

export const userRouter = Router();

userRouter.post('/login', (req, res) => {
  const { user } = req.body || {};
  if (!user || !user.id) return res.status(400).json({ success: false, error: 'Invalid user' });
  try {
    const profile = upsertUser(user);
    res.json({ success: true, user: profile });
  } catch (e) {
    res.status(500).json({ success: false, error: String(e?.message || e) });
  }
});

userRouter.get('/:id', (req, res) => {
  const profile = getUserById(req.params.id);
  if (!profile) return res.status(404).json({ error: 'Not found' });
  res.json(profile);
});


