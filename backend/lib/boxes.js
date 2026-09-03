/**
 * Convert model/detector boxes into top-left percentages of the full image.
 * Gemini often emits [ymin, xmin, ymax, xmax] on a 0–1000 scale.
 */
export function toTopLeftPercent(raw, imageWidth = 0, imageHeight = 0) {
  if (!raw) return { x: 0, y: 0, width: 8, height: 8 };

  if (Array.isArray(raw) && raw.length >= 4) {
    return fromYminXminYmaxXmax(raw[0], raw[1], raw[2], raw[3]);
  }

  if (Array.isArray(raw.box_2d) && raw.box_2d.length >= 4) {
    return fromYminXminYmaxXmax(raw.box_2d[0], raw.box_2d[1], raw.box_2d[2], raw.box_2d[3]);
  }

  let x = Number(raw.x ?? raw.xmin ?? raw.left);
  let y = Number(raw.y ?? raw.ymin ?? raw.top);
  let w = Number(raw.width ?? raw.w ?? raw.xmax);
  let h = Number(raw.height ?? raw.h ?? raw.ymax);

  if (![x, y, w, h].every((n) => Number.isFinite(n))) {
    return { x: 0, y: 0, width: 8, height: 8 };
  }

  const maxVal = Math.max(x, y, w, h);
  if (imageWidth > 0 && imageHeight > 0 && maxVal > 100 && maxVal > 1000) {
    return clampBox({
      x: (x / imageWidth) * 100,
      y: (y / imageHeight) * 100,
      width: (w / imageWidth) * 100,
      height: (h / imageHeight) * 100,
    });
  }

  if (maxVal > 100 && maxVal <= 1000) {
    x /= 10;
    y /= 10;
    w /= 10;
    h /= 10;
  }

  // Values already in top-left percentage format – clamp to image bounds
  return clampBox({ x, y, width: w, height: h });
}

function fromYminXminYmaxXmax(ymin, xmin, ymax, xmax) {
  let a = Number(ymin);
  let b = Number(xmin);
  let c = Number(ymax);
  let d = Number(xmax);
  if ([a, b, c, d].some((n) => n > 100 && n <= 1000)) {
    a /= 10;
    b /= 10;
    c /= 10;
    d /= 10;
  }
  return clampBox({
    x: b,
    y: a,
    width: d - b,
    height: c - a,
  });
}

function clampBox(box) {
  const x = Math.min(99, Math.max(0, box.x));
  const y = Math.min(99, Math.max(0, box.y));
  const width = Math.min(100 - x, Math.max(1, box.width));
  const height = Math.min(100 - y, Math.max(1, box.height));
  return { x, y, width, height };
}

export function expandBox(box, padPct = 8) {
  if (!box) return box;
  const pad = padPct / 2;
  return clampBox({
    x: box.x - pad,
    y: box.y - pad,
    width: box.width + pad,
    height: box.height + pad,
  });
}

export function unionBoxes(boxes = []) {
  const valid = boxes.filter((b) => b && Number.isFinite(b.x));
  if (!valid.length) return null;
  if (valid.length === 1) return clampBox(valid[0]);
  let x1 = Infinity;
  let y1 = Infinity;
  let x2 = -Infinity;
  let y2 = -Infinity;
  for (const b of valid) {
    x1 = Math.min(x1, b.x);
    y1 = Math.min(y1, b.y);
    x2 = Math.max(x2, b.x + b.width);
    y2 = Math.max(y2, b.y + b.height);
  }
  return clampBox({ x: x1, y: y1, width: x2 - x1, height: y2 - y1 });
}

export function boxCenterDistance(a, b) {
  const ax = a.x + a.width / 2;
  const ay = a.y + a.height / 2;
  const bx = b.x + b.width / 2;
  const by = b.y + b.height / 2;
  return Math.hypot(ax - bx, ay - by);
}

export function looksLikeFaceCover(box) {
  if (!box) return false;
  const cx = box.x + box.width / 2;
  const tall = box.height >= box.width * 1.3;
  return tall && cx < 48 && box.y < 40 && box.height > 35;
}

/** Prefer a pixel-detected screen if it aligns with the vision finding; otherwise slide a tall face-overlapping strip toward the phone. */
export function snapSensitiveBox(box, screenHint = null) {
  if (!box) return box;
  if (screenHint) {
    const x0 = Math.max(box.x, screenHint.x);
    const y0 = Math.max(box.y, screenHint.y);
    const x1 = Math.min(box.x + box.width, screenHint.x + screenHint.width);
    const y1 = Math.min(box.y + box.height, screenHint.y + screenHint.height);
    if (x1 > x0 && y1 > y0) {
      const intersection = (x1 - x0) * (y1 - y0);
      const union = (box.width * box.height) + (screenHint.width * screenHint.height) - intersection;
      const iou = intersection / union;
      
      const cx1 = box.x + box.width / 2;
      const cy1 = box.y + box.height / 2;
      const cx2 = screenHint.x + screenHint.width / 2;
      const cy2 = screenHint.y + screenHint.height / 2;
      const dist = Math.hypot(cx1 - cx2, cy1 - cy2);

      // Only snap if they overlap significantly or the screenHint is mostly inside the vision box and close
      if (iou > 0.35 || (intersection / (screenHint.width * screenHint.height) > 0.7 && dist < 16)) {
        return expandBox(clampBox(screenHint), 10);
      }
    }
  }
  if (!looksLikeFaceCover(box)) return clampBox(box);
  const cx = box.x + box.width / 2;
  const shift = Math.min(28, 62 - cx);
  return clampBox({
    x: box.x + Math.max(0, shift),
    y: box.y + Math.min(8, box.height * 0.08),
    width: Math.min(box.width, 22),
    height: box.height * 0.82,
  });
}

