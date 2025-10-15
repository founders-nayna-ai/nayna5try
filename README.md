# Message Buffer API v2 (Wati Full Payload + 6s Debounce)

This version keeps the **entire Wati webhook payload** exactly as-is — all headers, fields, and metadata remain untouched.  
It only merges multiple messages' `body.text` fields (for the same `body.waId` within 6 seconds) into one combined string.

## How it works
1. Wati sends each inbound message (array with one object) → `/ingest`.
2. The service buffers messages per `body.waId` for 6 seconds.
3. After 6s of silence, it takes the **last full payload**, merges all texts with `\n`, and replaces `body.text` in that last payload.
4. The **entire array** (like Wati's original) is sent to your `CALLBACK_URL` webhook (usually n8n).

### Example Output to n8n
```json
[
  {
    "headers": {...},
    "params": {},
    "query": {},
    "body": {
      "waId": "918178840644",
      "text": "Hey\nHow are you\nNeed updates",
      "type": "text",
      "...": "other unchanged fields"
    },
    "webhookUrl": "...",
    "executionMode": "production",
    "source": "message-buffer-api",
    "firstTimestamp": 1728850000000,
    "lastTimestamp": 1728850007000
  }
]
```

### Environment Variables
| Key | Description |
|-----|--------------|
| `CALLBACK_URL` | n8n webhook URL that should receive the final combined payload |
| `WINDOW_MS` | Debounce window in ms (default 6000) |
| `SHARED_SECRET` | Optional security header |
| `PORT` | Default 3000 |

### Deployment (same as v1)
1. Upload files to a new GitHub repo.
2. Deploy on Render or Railway:
   - **Start command:** `node index.js`
   - Add env vars: CALLBACK_URL, WINDOW_MS=6000, SHARED_SECRET.
3. Set Wati webhook → `https://your-app.onrender.com/ingest`