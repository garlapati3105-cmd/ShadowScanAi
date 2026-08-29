# 🕵️‍♂️ ShadowScan AI — Metadata & EXIF Privacy Scanner

An enterprise-grade, high-end digital privacy workspace sandbox built to analyze metadata, detect visual privacy triggers with Gemini AI, and sanitize assets to preserve online anonymity.

---

## 📂 Project Structure

```text
ShadowScan AI/
├── frontend/
│   ├── src/
│   │   ├── components/        # Scan UI widgets
│   │   ├── lib/               # Shared visual helpers
│   │   ├── services/api.js   # Backend client
│   │   ├── App.jsx            # Main workspace
│   │   ├── index.css
│   │   └── main.jsx
│   └── .env.example           # VITE_API_BASE_URL
│
└── backend/
    ├── lib/                   # Shared upload + finding-type helpers
    ├── routes/                # /api/scan and /api/sanitize
    ├── services/              # Gemini, metadata, scoring, attacker copy
    ├── validation/schema.js  # Zod schemas
    ├── .env.example           # PORT, GEMINI_API_KEY, ALLOWED_ORIGINS
    └── index.js
```

---

## ⚡ Tech Stack Integration

### Frontend
- **React & Vite**: Hyper-fast Hot Module Replacement and production bundling.
- **Tailwind CSS**: Engineered with Tailwind v4 for premium dark interfaces.
- **Axios**: Promise-based network calls for file uploads.
- **Framer Motion**: Smooth entry layouts and score updates animations.
- **Lucide React**: Vector layouts icons system.

### Backend
- **Node.js & Express.js**: Safe and lightweight REST engine.
- **Multer**: Memory-based multipart uploads processor.
- **Zod**: Secure schema checks for runtime data integrity.
- **Gemini API (`@google/generative-ai`)**: Scans files for structural triggers (credentials, license plates, face templates).
- **ExifReader**: Full depth EXIF, IPTC, and camera settings reader.
- **Sharp**: High-grade server graphics processing to strip tags and sanitize images on the fly.

---

## 🚀 Quick Start Guide

### Prerequisites
- [Node.js](https://nodejs.org/) (version `v16` or higher, recommended `v24.x` or `v20.x`)
- [NPM](https://www.npmjs.com/)

### Step 1: Set Up Backend

1. Navigate to the backend directory:
   ```bash
   cd backend
   ```
2. Install the backend dependencies:
   ```bash
   npm install
   ```
3. Copy `backend/.env.example` to `backend/.env` and set:
   ```env
   PORT=5000
   GEMINI_API_KEY=your_gemini_api_key_here
   ALLOWED_ORIGINS=http://localhost:5173
   ```
   > **Note:** If no key is provided, the application falls back to mock visual analysis. Never put `GEMINI_API_KEY` in frontend env files.
4. Launch the backend:
   ```bash
   npm run dev
   ```
   The backend server will launch on: **`http://localhost:5000`**

### Step 2: Set Up Frontend

1. Open a new terminal command line and navigate to the frontend directory:
   ```bash
   cd frontend
   ```
2. Install the client packages:
   ```bash
   npm install
   ```
3. Spin up the Vite development server:
   ```bash
   npm run dev
   ```
   Open your browser client navigation to: **`http://localhost:5173`**

---

## 🛡️ Privacy Principles & Secure Metadata Sanitization
1. **Zero Disk Storage**: Uploads are processed in memory (multer memory storage). Files are not written to disk.
2. **No image history**: The live client does not persist original images in `localStorage`.
3. **Lossless Purifying**: Sanitization runs Sharp in memory and returns a metadata-stripped copy. The original file on disk is not overwritten.
