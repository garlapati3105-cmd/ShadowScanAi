# 🕵️‍♂️ ShadowScan AI — Metadata & EXIF Privacy Scanner

An enterprise-grade, high-end digital privacy workspace sandbox built to analyze metadata, detect visual privacy leaks, simulate malicious vectors, and sanitize media to preserve online anonymity.

---

## 🔍 Features & Architecture

ShadowScan AI is a modern **full-stack privacy-sanitization pipeline** that runs fully in-memory to audit and de-identify uploaded media.

### 1. Multi-Stage Inspection Pipeline
*   **EXIF & Metadata Stripping**: Extracts deep EXIF, IPTC, GPS coordinates, camera specs, software markers, and hardware signatures via `ExifReader`.
*   **Barcode & QR Code Detection**: Scans and decodes visible barcodes, UPC codes, and QR codes using `@zxing/library` to prevent data leakage from embedded links or tokens.
*   **Exclusive AI Visual Auditing**: Analyzes visual risks (faces, institution lanyards, private chats, emails, passports, OTPs) exclusively through **OpenRouter** (configured by default using `google/gemini-2.5-flash` for high-speed, cost-effective multimodal scanning).
*   **Request-Scoped OCR Fallback**: If OpenRouter returns zero visual findings or fails, the backend fires up a request-scoped local **Tesseract.js** OCR instance to parse embedded text.
*   **Attacker Perspective Simulation**: Simulates potential social engineering, phishing, or correlation attack vectors based on the cumulative scan findings.

### 2. High-Performance Engineering & Optimization
*   **Zero-Leak Memory Management**: Tesseract workers are initialized and terminated per request inside a strict `finally` block, releasing WASM heaps back to the OS memory and preventing Render container (OOM) crashes.
*   **Downscaled Upload buffers**: Visual buffer uploads are resized to a maximum dimension of `1024px` at 80% JPEG quality before hitting OpenRouter. This reduces payload sizes by up to 98% (e.g. from 1.7MB to ~80KB), resolving transmission timeouts.
*   **Aesthetic Face Protection**: Implements a face-clipping geometry coordinator. If a face boundary overlaps with a pixelated/blurred sensitive region (like an ID card, lanyard, or chat), the face is mathematically subtracted from the sanitization path so it remains clear while the secret content is blurred.
*   **Live Health Diagnostics**: The endpoint `/api/health` queries active OpenRouter pings and reveals the last 100 in-memory system logs (errors & connection warnings) for easy debugging.

---

## 📂 Project Structure

```text
ShadowScan AI/
├── backend/
│   ├── lib/                       # Coordinate clipping and helper libraries
│   ├── routes/                    # API routing (/api/scan, /api/sanitize)
│   ├── services/                  # Business logic (openRouter, ocr, riskScoring, metadata)
│   ├── validation/schema.js       # Zod schemas for sanitization requests
│   ├── .env.example               # Backend API credential templates
│   ├── index.js                   # Express application entry & diagnostics server
│   └── package.json               # Backend dependencies
│
├── frontend/
│   ├── public/                    # Audio indicators and static assets
│   ├── src/
│   │   ├── components/            # UI components (Scan UI, Heatmap, Bounding boxes)
│   │   ├── lib/                   # Styling tools and utility functions
│   │   ├── services/api.js        # Axios instance configured for CORS communication
│   │   ├── App.jsx                # Main workspace application
│   │   └── index.css              # Core typography and custom design rules
│   ├── tailwind.config.js         # Styling definitions (Tailwind v4 framework)
│   └── package.json               # Frontend dependencies
│
├── README.md                      # Comprehensive user documentation
└── diag_out.txt                   # Diagnostic report output logs
```

---

## 🚀 Quick Start Guide

### Prerequisites
*   [Node.js](https://nodejs.org/) (`v18.x` or `v20.x` LTS recommended)
*   [NPM](https://www.npmjs.com/)

---

### Step 1: Set Up and Run the Backend

1. Navigate to the backend directory:
   ```bash
   cd backend
   ```
2. Install the server dependencies:
   ```bash
   npm install
   ```
3. Copy `.env.example` to create your local `.env`:
   ```bash
   cp .env.example .env
   ```
4. Configure your environment variables in `.env`:
   ```env
   PORT=5000
   OPENROUTER_API_KEY=your_openrouter_api_key_here
   OPENROUTER_MODEL=google/gemini-2.5-flash           # Optional customize model
   ALLOWED_ORIGINS=http://localhost:5173
   ```
5. Run the backend development server:
   ```bash
   npm run dev
   ```
   The backend will bootstrap and listen on: **`http://localhost:5000`**

---

### Step 2: Set Up and Run the Frontend

1. Navigate to the frontend directory:
   ```bash
   cd frontend
   ```
2. Install the client-side packages:
   ```bash
   npm install
   ```
3. Copy `.env.example` to create your local configuration:
   ```bash
   cp .env.example .env
   ```
4. Set the backend endpoint URL in `.env`:
   ```env
   VITE_API_BASE_URL=http://localhost:5000/api
   ```
5. Spin up the Vite development server:
   ```bash
   npm run dev
   ```
   Open your browser and navigate to the developer server: **`http://localhost:5173`**

---

## ☁️ Deployment Configurations

### Frontend (Vercel)
Assign your environment variables in the Vercel dashboard:
*   `VITE_API_BASE_URL`: Point this to your Render production API, including `/api` (e.g. `https://shadowscanai.onrender.com/api`).

### Backend (Render Web Service)
Ensure the following configurations are added under the Render Environment tab:
*   **Build Command**: `npm install`
*   **Start Command**: `node index.js`
*   **Environment Variables**:
    *   `OPENROUTER_API_KEY`: *Your valid OpenRouter credential key* (optional if `GEMINI_API_KEY` is set)
    *   `OPENROUTER_MODEL`: `google/gemini-2.5-flash`
    *   `GEMINI_API_KEY`: *Fallback Google AI Studio key when OpenRouter is not configured*
    *   `ALLOWED_ORIGINS`: Set to your production Vercel URL (e.g., `https://shadow-scan-ai.vercel.app`)

---

## 🛡️ Core Security Architecture
1. **Zero Permanent Storage**: All file processing happens in-memory inside custom Multipart arrays. Uploaded logs are processed immediately and never cached on disk.
2. **CORS Isolation**: The Express API rejects requests coming from unauthorized origins. Correct CORS handshakes ensure external agents cannot query scanning functions.
3. **WASM Core Containment**: OCR workflows clean up memory handles immediately after text extracting to circumvent virtual server heap leaks.
