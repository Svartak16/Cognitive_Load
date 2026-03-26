## Gemini proxy (Express)

This server keeps the Gemini API key **server-side** and exposes a single endpoint for the extension:

- `POST /gemini` → returns `{ "text": "..." }`
- `GET /healthz` → returns `{ "ok": true }`

### Run locally

```bash
cd server
npm install
cp .env.example .env
# edit .env and set GEMINI_API_KEY
npm run dev
```

### Request format

**Text**

```json
{ "kind": "text", "prompt": "..." }
```

**Vision**

```json
{ "kind": "vision", "prompt": "...", "mimeType": "image/png", "imageBase64": "..." }
```

### Hooking the extension to the proxy

The extension expects a proxy URL in `geminiProxyUrl` (preferred via `chrome.storage.managed`, otherwise `chrome.storage.local`).

For production, deploy this server and set the managed policy to your deployed URL (so end users never enter keys).

