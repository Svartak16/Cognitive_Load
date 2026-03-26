import 'dotenv/config';
import express from 'express';
import cors from 'cors';

const app = express();

const PORT = Number(process.env.PORT || 8787);
const GEMINI_API_KEY = String(process.env.GEMINI_API_KEY || '');
const GEMINI_MODEL = String(process.env.GEMINI_MODEL || 'gemini-2.5-flash');
const CORS_ORIGIN = process.env.CORS_ORIGIN ? String(process.env.CORS_ORIGIN) : '*';
const SAFE_BROWSING_API_KEY = String(process.env.SAFE_BROWSING_API_KEY || '');

if (!GEMINI_API_KEY) {
  // eslint-disable-next-line no-console
  console.warn('[gemini-proxy] GEMINI_API_KEY is not set. /gemini will return 500.');
}

app.use(cors({ origin: CORS_ORIGIN }));
app.use(express.json({ limit: '12mb' }));

app.get('/healthz', (_req, res) => {
  res.json({ ok: true });
});

function buildGeminiContents(body) {
  const kind = body?.kind;
  const prompt = String(body?.prompt || '');
  if (!prompt) return { error: 'MISSING_PROMPT' };

  if (kind === 'vision') {
    const mimeType = String(body?.mimeType || '');
    const imageBase64 = String(body?.imageBase64 || '');
    if (!mimeType || !imageBase64) return { error: 'MISSING_IMAGE' };

    return {
      contents: [
        {
          parts: [
            { text: prompt },
            { inline_data: { mime_type: mimeType, data: imageBase64 } }
          ]
        }
      ]
    };
  }

  // default to text
  return {
    contents: [{ role: 'user', parts: [{ text: prompt }] }]
  };
}

app.post('/gemini', async (req, res) => {
  if (!GEMINI_API_KEY) {
    return res.status(500).json({ error: 'SERVER_MISCONFIGURED' });
  }

  const payload = buildGeminiContents(req.body);
  if (payload?.error) return res.status(400).json({ error: payload.error });

  try {
    const url = `https://generativelanguage.googleapis.com/v1/models/${encodeURIComponent(GEMINI_MODEL)}:generateContent?key=${encodeURIComponent(GEMINI_API_KEY)}`;
    const upstream = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await upstream.json().catch(() => ({}));

    if (!upstream.ok) {
      const msg = data?.error?.message || `Upstream HTTP ${upstream.status}`;
      return res.status(502).json({ error: msg });
    }

    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    return res.json({ text });
  } catch (e) {
    return res.status(502).json({ error: e?.message || 'UPSTREAM_ERROR' });
  }
});

app.post('/safebrowsing', async (req, res) => {
  if (!SAFE_BROWSING_API_KEY) {
    return res.status(500).json({ error: 'SERVER_MISCONFIGURED' });
  }

  const { url } = req.body;
  if (!url) {
    return res.status(400).json({ error: 'MISSING_URL' });
  }

  try {
    const upstream = await fetch(`https://safebrowsing.googleapis.com/v4/threatMatches:find?key=${encodeURIComponent(SAFE_BROWSING_API_KEY)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client: {
          clientId: 'phishing-detector',
          clientVersion: '1.0'
        },
        threatInfo: {
          threatTypes: ['MALWARE', 'SOCIAL_ENGINEERING'],
          platformTypes: ['ANY_PLATFORM'],
          threatEntryTypes: ['URL'],
          threatEntries: [{ url }],
        },
      })
    });

    const data = await upstream.json().catch(() => ({}));

    if (!upstream.ok) {
      const msg = data?.error?.message || `Upstream HTTP ${upstream.status}`;
      return res.status(502).json({ error: msg });
    }

    // Return whether there are matches
    const isDangerous = data.matches && data.matches.length > 0;
    return res.json({ isDangerous });
  } catch (e) {
    return res.status(502).json({ error: e?.message || 'UPSTREAM_ERROR' });
  }
});
app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`[gemini-proxy] listening on http://localhost:${PORT}`);
});
