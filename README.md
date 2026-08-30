# ShadowScan AI

Inspect an image **before you share it**.

ShadowScan finds what a photo can leak — hidden file metadata, visible IDs and chats, QR codes — then blurs sensitive regions and **checks the safe copy again** for leftover readable text.

**Detect → Protect → Verify**

---

## What it does

| Step | What happens |
| --- | --- |
| **Detect** | Reads EXIF (GPS, device, capture time, camera). Runs vision AI on the pixels. Scans QR / barcodes. OCR only if vision finds nothing. |
| **Protect** | Pixelates verified secrets (chats, IDs, codes, screens). Faces stay visible. Metadata is treated as stripped on the safe score. |
| **Verify** | A second vision pass on the blurred image reports only **still-readable** leaks. UI shows blur recheck PASS / FAIL. |

Upload **JPG / JPEG / PNG**, max **20 MB**. Processing is **in-memory** — files are not kept on disk.

---

## Who does what (important)

Vision AI **cannot read hidden GPS**. Those live in file headers.

| Job | Engine |
| --- | --- |
| Hidden GPS, device, timestamp, camera settings | `ExifReader` (code) |
| Visible leaks, overlays, leftover readable text | OpenRouter (`google/gemini-2.5-flash`) |
| QR / barcodes | Local detectors |
| Tiny text if vision returns nothing | Tesseract OCR |
| Blur / keep faces clear | Sharp + box geometry |
| Exposure score 0–100 | Deterministic scoring |

**If GPS shows “Not detected”:** that file has no location tags. Camera EXIF (ISO, lens) can still be present. Location must be on for Camera when the shot was taken, and the file must be the original — WhatsApp and similar apps often strip GPS.

---

## Stack

- **Frontend:** React, Vite, Tailwind — typically **Vercel**
- **Backend:** Node, Express — typically **Render**
- **Vision:** OpenRouter (preferred). Gemini if OpenRouter is unset. Optional Grok.

---

## Local setup

Needs **Node 18+**.

### Backend

```bash
cd backend
npm install
cp .env.example .env
```

Edit `backend/.env`:

```env
PORT=5000
OPENROUTER_API_KEY=your_openrouter_key
OPENROUTER_MODEL=google/gemini-2.5-flash
ALLOWED_ORIGINS=http://localhost:5173
```

Local-only alternative: set `GEMINI_API_KEY` instead of OpenRouter.

```bash
npm run dev
```

API: `http://localhost:5000`  
Health: `http://localhost:5000/api/health`

### Frontend

```bash
cd frontend
npm install
cp .env.example .env
```

```env
VITE_API_BASE_URL=http://localhost:5000/api
```

The `/api` suffix is required.

```bash
npm run dev
```

App: `http://localhost:5173`

---

## Deploy

### Frontend (Vercel)

| Variable | Example |
| --- | --- |
| `VITE_API_BASE_URL` | `https://your-service.onrender.com/api` |

Redeploy after changing this. It is baked in at **build** time.

Do **not** put OpenRouter or Gemini keys on Vercel.

### Backend (Render)

| Setting | Value |
| --- | --- |
| Root / build | `backend` folder · `npm install` |
| Start | `node index.js` |
| `OPENROUTER_API_KEY` | Your key (production) |
| `OPENROUTER_MODEL` | `google/gemini-2.5-flash` |
| `ALLOWED_ORIGINS` | Your Vercel origin, no trailing slash, e.g. `https://your-app.vercel.app` |

---

## API

| Method | Path |
| --- | --- |
| `POST` | `/api/scan` |
| `POST` | `/api/sanitize` |
| `GET` | `/api/analysis/:id/safe-image` |
| `GET` | `/api/health` |

---

## Project layout

```text
backend/           Express API, pipeline, vision prompts
  lib/            Boxes, CORS/vision helpers, in-memory safe-image store
  routes/         /scan, /sanitize
  services/       metadata, OpenRouter, OCR, sanitize, scoring
frontend/         Vite React app
```

---

## Limits and ethics

- Awareness only. The “observer view” is **not** a prediction or an attack guide.
- Models can miss things. Verify still matters for humans.
- Faces are detected, not blurred, by design.
- Safe images are held briefly in RAM (limited slots). Restarting the server clears downloads.

---

## License

Use and extend for privacy inspection. Do not use this project to harm others or to extract data from images you do not have the right to process.
