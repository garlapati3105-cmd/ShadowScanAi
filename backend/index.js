import './env.js';
import os from 'os';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import scanRouter from './routes/scan.js';
import sanitizeRouter from './routes/sanitize.js';

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

app.get('/api/health', (req, res) => {
  const geminiOk = isGeminiConfigured();
  const grokOk = isGrokConfigured();
  res.json({
    success: true,
    message: 'ShadowScan backend is running',
    gemini: {
      configured: geminiOk,
      mode: geminiOk ? 'live' : 'detectors-only',
    },
    grok: {
      configured: grokOk,
      mode: grokOk ? 'live' : 'disabled',
    },
    activeProvider: grokOk ? 'grok' : (geminiOk ? 'gemini' : 'none'),
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
