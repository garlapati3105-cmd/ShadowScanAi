import './env.js';
import os from 'os';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { GoogleGenerativeAI } from '@google/generative-ai';
import scanRouter from './routes/scan.js';
import sanitizeRouter from './routes/sanitize.js';

const serverLogs = [];
const originalLog = console.log;
const originalWarn = console.warn;
const originalError = console.error;

const formatLog = (args) => {
  return args.map((a) => {
    if (a instanceof Error) return a.stack || a.message;
    return typeof a === 'object' ? JSON.stringify(a) : String(a);
  }).join(' ');
};

console.log = (...args) => {
  serverLogs.push(`[LOG] [${new Date().toISOString()}] ${formatLog(args)}`);
  if (serverLogs.length > 100) serverLogs.shift();
  originalLog.apply(console, args);
};

console.warn = (...args) => {
  serverLogs.push(`[WARN] [${new Date().toISOString()}] ${formatLog(args)}`);
  if (serverLogs.length > 100) serverLogs.shift();
  originalWarn.apply(console, args);
};

console.error = (...args) => {
  serverLogs.push(`[ERROR] [${new Date().toISOString()}] ${formatLog(args)}`);
  if (serverLogs.length > 100) serverLogs.shift();
  originalError.apply(console, args);
};

const app = express();
const PORT = process.env.PORT || 5000;

function isGeminiConfigured() {
  const apiKey = process.env.GEMINI_API_KEY;
  return Boolean(apiKey && apiKey !== 'YOUR_GEMINI_API_KEY' && apiKey.trim() !== '');
}

function isGrokConfigured() {
  const apiKey = process.env.XAI_API_KEY || process.env.GROK_API_KEY;
  return Boolean(apiKey && apiKey.trim() !== '');
}

function isOpenRouterConfigured() {
  const apiKey = process.env.OPENROUTER_API_KEY;
  return Boolean(apiKey && apiKey.trim() !== '');
}

function lanIpv4() {
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] || []) {
      if (net.family === 'IPv4' && !net.internal) return net.address;
    }
  }
  return null;
}

function isDevLanOrigin(origin) {
  return /^https?:\/\/(localhost|127\.0\.0\.1|192\.168\.\d{1,3}\.\d{1,3}|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3})(:\d+)?$/.test(
    origin
  );
}

function allowedOrigins() {
  const raw = process.env.ALLOWED_ORIGINS;
  if (!raw || raw.trim() === '') {
    if (process.env.NODE_ENV === 'production') return ['*'];
    return ['http://localhost:5173', 'http://localhost:5174'];
  }
  return raw.split(',').map((origin) => origin.trim().replace(/\/$/, '')).filter(Boolean);
}

const origins = allowedOrigins();

app.use(
  helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  })
);
app.use(
  cors({
    origin(origin, callback) {
      if (!origin) return callback(null, true);
      if (origins.includes(origin)) return callback(null, true);
      if (process.env.NODE_ENV !== 'production' && isDevLanOrigin(origin)) {
        return callback(null, true);
      }
      return callback(null, false);
    },
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type'],
  })
);

app.use(express.json({ limit: '32kb' }));
app.use(express.urlencoded({ extended: true, limit: '32kb' }));

app.get('/api/health', async (req, res) => {
  const geminiOk = isGeminiConfigured();
  const grokOk = isGrokConfigured();
  const openRouterOk = isOpenRouterConfigured();
  let geminiErr = null;
  let grokErr = null;
  let openRouterErr = null;

  if (geminiOk) {
    try {
      const apiKeys = (process.env.GEMINI_API_KEY || '').split(',').map((s) => s.trim()).filter((s) => s && s !== 'YOUR_GEMINI_API_KEY');
      if (apiKeys.length === 0) throw new Error("No Gemini API keys configured");

      const genAI = new GoogleGenerativeAI(apiKeys[0]);
      const model = genAI.getGenerativeModel({ model: 'gemini-3.6-flash' });
      await model.generateContent("ping");
    } catch (e) {
      geminiErr = e.message;
    }
  }

  if (grokOk) {
    try {
      const apiKey = process.env.XAI_API_KEY || process.env.GROK_API_KEY;
      const testRes = await fetch('https://api.x.ai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: 'grok-2-1212',
          messages: [{ role: 'user', content: 'ping' }],
          max_tokens: 5
        })
      });
      if (!testRes.ok) {
        grokErr = `HTTP ${testRes.status}: ${await testRes.text()}`;
      }
    } catch (e) {
      grokErr = e.message;
    }
  }

  if (openRouterOk) {
    try {
      const apiKey = process.env.OPENROUTER_API_KEY;
      const model = process.env.OPENROUTER_MODEL || 'google/gemini-2.5-flash';
      const testRes = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
          'HTTP-Referer': 'https://shadowscanai.onrender.com',
          'X-Title': 'ShadowScan AI'
        },
        body: JSON.stringify({
          model,
          messages: [{ role: 'user', content: 'ping' }],
          max_tokens: 5
        })
      });
      if (!testRes.ok) {
        openRouterErr = `HTTP ${testRes.status}: ${await testRes.text()}`;
      }
    } catch (e) {
      openRouterErr = e.message;
    }
  }

  res.json({
    success: true,
    message: 'ShadowScan backend is running',
    logs: serverLogs,
    gemini: {
      configured: geminiOk,
      testStatus: geminiOk ? (geminiErr ? 'failed' : 'ok') : 'disabled',
      error: geminiErr,
    },
    grok: {
      configured: grokOk,
      testStatus: grokOk ? (grokErr ? 'failed' : 'ok') : 'disabled',
      error: grokErr,
    },
    openrouter: {
      configured: openRouterOk,
      testStatus: openRouterOk ? (openRouterErr ? 'failed' : 'ok') : 'disabled',
      error: openRouterErr,
    },
    activeProvider: openRouterOk && !openRouterErr ? 'openrouter' : (grokOk && !grokErr ? 'grok' : (geminiOk && !geminiErr ? 'gemini' : 'none')),
  });
});

app.use('/api', scanRouter);
app.use('/api/sanitize', sanitizeRouter);

app.use((err, req, res, next) => {
  console.error('[Error]', err.message);
  const status = Number(err.status) >= 400 && Number(err.status) < 600 ? Number(err.status) : 500;
  res.status(status).json({
    success: false,
    error: status >= 500 ? 'Internal server error' : (err.publicMessage || 'Request could not be processed.'),
  });
});

app.listen(PORT, '0.0.0.0', () => {
  const lan = lanIpv4();
  console.log(`ShadowScan backend listening on http://localhost:${PORT}`);
  if (lan) console.log(`LAN: http://${lan}:${PORT}`);

  const geminiOk = isGeminiConfigured();
  const grokOk = isGrokConfigured();
  console.log(`Gemini mode: ${geminiOk ? 'live' : 'detectors-only'}`);
  console.log(`Grok mode: ${grokOk ? 'live' : 'disabled'}`);
  console.log(`Active Visual Provider: ${grokOk ? 'grok' : (geminiOk ? 'gemini' : 'none')}`);
});


export default app;
