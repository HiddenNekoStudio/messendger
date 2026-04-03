import express from 'express';
import fetch from 'node-fetch';
import config from '../config/index.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

router.get('/search', authenticate, async (req, res) => {
  try {
    const { q, limit = 20 } = req.query;
    const query = q || 'funny';
    const tenorKey = config.tenor.apiKey;
    
    if (!tenorKey) {
      return res.status(503).json({ error: 'Tenor API not configured' });
    }
    
    const parsedLimit = Math.min(Math.max(parseInt(limit) || 20, 1), 50);
    const response = await fetch(
      `https://tenor.googleapis.com/v2/search?q=${encodeURIComponent(query)}&key=${tenorKey}&limit=${parsedLimit}`
    );
    const data = await response.json();
    
    res.json(data);
  } catch (error) {
    console.error('Tenor API error:', error);
    res.status(500).json({ error: 'Failed to fetch GIFs' });
  }
});

router.get('/trending', authenticate, async (req, res) => {
  try {
    const { limit = 20 } = req.query;
    const tenorKey = config.tenor.apiKey;
    
    if (!tenorKey) {
      return res.status(503).json({ error: 'Tenor API not configured' });
    }
    
    const parsedLimit = Math.min(Math.max(parseInt(limit) || 20, 1), 50);
    const response = await fetch(
      `https://tenor.googleapis.com/v2/featured?key=${tenorKey}&limit=${parsedLimit}`
    );
    const data = await response.json();
    
    res.json(data);
  } catch (error) {
    console.error('Tenor API error:', error);
    res.status(500).json({ error: 'Failed to fetch GIFs' });
  }
});

export default router;
