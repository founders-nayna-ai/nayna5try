/**
 * Message Buffer API (v2.3)
 * ---------------------------------------------------------
 * - Works with both flat & array Wati payloads
 * - Combines messages for same waId within WINDOW_MS
 * - Replaces only the `text` field
 * - Normalizes //ingest → /ingest
 * - Always responds 200 (prevents Wati retries/disable)
 */

import express from 'express';
import cors from 'cors';
import fetch from 'node-fetch';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();
const app = express();

// ✅ Normalize double slashes (//ingest → /ingest)
app.use((req, res, next) => {
  req.url = req.url.replace(/\/{2,}/g, '/');
  next();
});

app.use(cors());
app.use(express.json({ limit: '2mb' }));

const WINDOW_MS = parseInt(process.env.WINDOW_MS || '6000', 10);
const CALLBACK_URL = process.env.CALLBACK_URL;
const SHARED_SECRET = process.env.SHARED_SECRET || '';

// Store message buffers by waId
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

// Extract waId and text from either payload style
function extractData(payload) {
  let waId = null;
  let text = '';
  let type = 'flat';

  if (Array.isArray(payload)) {
    // Old style [ { body: {...} } ]
    waId = payload?.[0]?.body?.waId || null;
    text = payload?.[0]?.body?.text?.trim() || '';
    type = 'array';
  } else if (typeof payload === 'object') {
    // Flat style { id, waId, text, ... }
    waId = payload?.waId || null;
    text = payload?.text?.trim() || '';
    type = 'flat';
  }
  return { waId, text, type };
}

app.post('/ingest', async (req, res) => {
  try {
    const incomingSecret = req.header('x-shared-secret') || '';
    if (SHARED_SECRET && incomingSecret !== SHARED_SECRET) {
      return res.status(401).json({ ok: false, error: 'Unauthorized' });
    }

    const fullPayload = req.body;
    const { waId, text, type } = extractData(fullPayload);
    const now = Date.now();

    if (!waId) return res.status(400).json({ ok: false, error: 'Missing waId' });

    const current = store.get(waId) || {
      texts: [],
      lastPayload: null,
      timer: null,
      firstTimestamp: now,
      type,
    };

    if (text && !current.texts.includes(text)) current.texts.push(text);
    current.lastPayload = fullPayload;
    current.lastTimestamp = now;

    if (current.timer) clearTimeout(current.timer);

    current.timer = setTimeout(() => {
      try {
        const combinedText = current.texts.filter(t => t && t.length > 0).join('\n');
        let finalPayload;

        if (current.type === 'array' && Array.isArray(current.lastPayload)) {
          finalPayload = JSON.parse(JSON.stringify(current.lastPayload));
          finalPayload[0].body.text = combinedText;
        } else {
          finalPayload = JSON.parse(JSON.stringify(current.lastPayload));
          finalPayload.text = combinedText;
        }

        postToCallback(finalPayload);
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

// ✅ Catch-all: ensures Wati never gets a 404
app.post('*', (req, res) => res.status(200).json({ ok: true }));

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Message Buffer API v2.3 running on :${port}`));
