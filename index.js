/**
 * Message Buffer API (v2) — Wati full payload version (6s debounce)
 * Combines consecutive messages (same waId) and forwards full Wati payload (array of 1 object).
 */

import express from 'express';
import cors from 'cors';
import fetch from 'node-fetch';
import dotenv from 'dotenv';

dotenv.config();
const app = express();
app.use(cors());
app.use(express.json({ limit: '2mb' }));

const WINDOW_MS = parseInt(process.env.WINDOW_MS || '6000', 10);
const CALLBACK_URL = process.env.CALLBACK_URL;
const SHARED_SECRET = process.env.SHARED_SECRET || '';

// store per waId
const store = new Map();

async function postToCallback(finalPayload) {
  if (!CALLBACK_URL) return;
  try {
    const res = await fetch(CALLBACK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-shared-secret': SHARED_SECRET,
      },
      body: JSON.stringify(finalPayload),
    });
    console.log('Callback sent. Status:', res.status);
  } catch (err) {
    console.error('Callback error:', err);
  }
}

function extractWaId(payload) {
  try {
    return payload?.[0]?.body?.waId || null;
  } catch {
    return null;
  }
}

function extractText(payload) {
  try {
    return payload?.[0]?.body?.text?.trim() || '';
  } catch {
    return '';
  }
}

app.post('/ingest', async (req, res) => {
  try {
    const incomingSecret = req.header('x-shared-secret') || '';
    if (SHARED_SECRET && incomingSecret !== SHARED_SECRET) {
      return res.status(401).json({ ok: false, error: 'Unauthorized' });
    }

    const fullPayload = req.body;
    const waId = extractWaId(fullPayload);
    const text = extractText(fullPayload);
    const now = Date.now();

    if (!waId) return res.status(400).json({ ok: false, error: 'Missing waId' });

    const current = store.get(waId) || {
      texts: [],
      lastPayload: null,
      timer: null,
      firstTimestamp: now,
    };

    if (text && !current.texts.includes(text)) {
      current.texts.push(text);
    }
    current.lastPayload = fullPayload;
    current.lastTimestamp = now;

    if (current.timer) clearTimeout(current.timer);

    current.timer = setTimeout(() => {
      try {
        const combinedText = current.texts.filter(t => t && t.length > 0).join('\n');
        const lastObj = JSON.parse(JSON.stringify(current.lastPayload)); // deep clone
        if (Array.isArray(lastObj) && lastObj.length > 0) {
          lastObj[0].body.text = combinedText;
          lastObj[0].source = 'message-buffer-api';
          lastObj[0].firstTimestamp = current.firstTimestamp;
          lastObj[0].lastTimestamp = current.lastTimestamp;
        }
        postToCallback(lastObj);
      } catch (err) {
        console.error('Combine error:', err);
      } finally {
        store.delete(waId);
      }
    }, WINDOW_MS);

    store.set(waId, current);
    res.json({ ok: true, buffered: true, windowMs: WINDOW_MS });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: 'Internal error' });
  }
});

app.get('/health', (_req, res) => {
  res.json({ ok: true, windowMs: WINDOW_MS, hasCallback: !!CALLBACK_URL });
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Message Buffer API v2 running on :${port}`));