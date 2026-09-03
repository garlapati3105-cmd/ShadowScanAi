import './env.js';
import os from 'os';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import scanRouter from './routes/scan.js';
import sanitizeRouter from './routes/sanitize.js';
import { getOpenRouterKeys, isGeminiConfigured, isGroqConfigured, isGrokConfigured, isOpenRouterConfigured, resolveVisionProvider } from './lib/visionProvider.js';

const serverLogs = [];
const originalLog = console.log;
const originalWarn = console.warn;
const originalError = console.error;

const formatLog = (args) => {
  return args
    .map((a) => {
      if (a instanceof Error) return a.message;
      if (typeof a === 'object') {
        try {
          return JSON.stringify(a).slice(0, 280);
        } catch {
          return '[object]';
        }
      }
      return String(a).slice(0, 280);
    })
    .join(' ')
    .slice(0, 400);
};

console.log = (...args) => {
  serverLogs.push(`[LOG] [${new Date().toISOString()}] ${formatLog(args)}`);
  if (serverLogs.length > 20) serverLogs.shift();
  originalLog.apply(console, args);
};

console.warn = (...args) => {
  serverLogs.push(`[WARN] [${new Date().toISOString()}] ${formatLog(args)}`);
  if (serverLogs.length > 20) serverLogs.shift();
  originalWarn.apply(console, args);
};

console.error = (...args) => {
  serverLogs.push(`[ERROR] [${new Date().toISOString()}] ${formatLog(args)}`);
  if (serverLogs.length > 20) serverLogs.shift();
  originalError.apply(console, args);
};

const app = express();
const PORT = process.env.PORT || 5000;

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
      if (origins.includes('*')) return callback(null, true);
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
  const openRouterOk = isOpenRouterConfigured();
  const geminiOk = isGeminiConfigured();
  const activeProvider = resolveVisionProvider();
  const rssMb = Math.round(process.memoryUsage().rss / 1024 / 1024);
  let openRouterErr = null;

  // Render hits this often. Skip the live OpenRouter ping unless ?deep=1.
  if (openRouterOk && String(req.query.deep) === '1') {
    try {
      const apiKey = getOpenRouterKeys()[0];
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
    memoryMb: rssMb,
    logs: serverLogs,
    openrouter: {
      configured: openRouterOk,
      testStatus: openRouterOk
        ? (String(req.query.deep) === '1' ? (openRouterErr ? 'failed' : 'ok') : 'skipped')
        : 'disabled',
      error: openRouterErr,
    },
    gemini: {
      configured: geminiOk,
    },
    grok: {
      configured: isGrokConfigured(),
    },
    groq: {
      configured: isGroqConfigured(),
    },
    activeProvider,
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

  const provider = resolveVisionProvider();
  console.log(`Groq mode: ${isGroqConfigured() ? 'enabled' : 'disabled'}`);
  console.log(`Grok mode: ${isGrokConfigured() ? 'enabled' : 'disabled'}`);
  console.log(
    `OpenRouter mode: ${isOpenRouterConfigured() ? `enabled (${getOpenRouterKeys().length} key${getOpenRouterKeys().length === 1 ? '' : 's'})` : 'disabled'}`
  );
  console.log(`Gemini mode: ${isGeminiConfigured() ? 'enabled' : 'disabled'}`);
  console.log(`Active Visual Provider: ${provider}`);
});


export default app;
