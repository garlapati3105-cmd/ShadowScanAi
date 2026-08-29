import multer from 'multer';
import path from 'path';

export const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/jpg', 'image/png']);
export const ALLOWED_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png']);
export const MAX_FILE_SIZE_BYTES = 20 * 1024 * 1024;

export function sanitizeFilename(originalname = '') {
  const ext = path.extname(originalname).toLowerCase();
  const safeExt = ALLOWED_EXTENSIONS.has(ext) ? ext : '';
  const base = path
    .basename(originalname, ext)
    .replace(/[^a-zA-Z0-9_\- ]/g, '_')
    .trim()
    .replace(/\s+/g, '_')
    .slice(0, 100);
  return `${base || 'image'}${safeExt}`;
}

export function sniffImageMime(buffer) {
  if (!buffer || buffer.length < 8) return null;
  const isJpeg = buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  const isPng =
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47;
  if (isJpeg) return 'image/jpeg';
  if (isPng) return 'image/png';
  return null;
}

const fileFilter = (req, file, cb) => {
  if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
    return cb(new multer.MulterError('LIMIT_UNEXPECTED_FILE', 'Only JPG, JPEG, and PNG images are accepted.'));
  }
  const ext = path.extname(file.originalname || '').toLowerCase();
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    return cb(new multer.MulterError('LIMIT_UNEXPECTED_FILE', 'File extension is not permitted.'));
  }
  cb(null, true);
};

export const memoryUpload = multer({
  storage: multer.memoryStorage(),
  fileFilter,
  limits: {
    fileSize: MAX_FILE_SIZE_BYTES,
    files: 1,
  },
});
