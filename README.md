# Message Buffer API v2.1 — Wati Flat Payload Support (6s Debounce)

### 🔧 What it does
- Works with **flat Wati payloads** (e.g. `{ id, waId, text, ... }`)
- Also supports older **array style** (`[{ body: {...}}]`)
- Buffers messages for 6 seconds per `waId`
- Combines only the `text` field → replaces `text` in the last message
- Forwards the **exact same JSON structure** to your `CALLBACK_URL`

### Example
Input (3 messages within 6 seconds):
```json
{ "waId": "91817...", "text": "Hi" }
{ "waId": "91817...", "text": "How are you" }
{ "waId": "91817...", "text": "Need updates" }
```

Output to your n8n webhook:
```json
{
  "waId": "91817...",
  "text": "Hi\nHow are you\nNeed updates",
  "type": "text",
  "senderName": "Sagar",
  "id": "...",
  "...": "other unchanged fields"
}
```

### Environment Variables
| Key | Description |
|-----|--------------|
| `CALLBACK_URL` | n8n webhook that receives combined payload |
| `WINDOW_MS` | debounce window in ms (default 6000) |
| `SHARED_SECRET` | optional shared secret (disabled if empty) |
| `PORT` | default 3000 |

### Deployment
1. Replace old files in your existing repo with these.
2. Push commit → Render redeploys automatically.
3. Confirm `/health` → `{ ok: true }`
4. Wati webhook → `https://your-app.onrender.com/ingest`
5. n8n receives full payload after 6s of silence.