/**
 * Find phone/laptop SCREEN rectangles from pixels (high text contrast, not skin).
 * Used to snap Gemini's oversized "chat" boxes onto the display only.
 */
function isSkin(r, g, b) {
  return r > 90 && g > 40 && b > 20 && r > g && r > b && r - g > 12;
}

function cellStats(data, width, height, x0, y0, cell) {
  let sum = 0;
  let sum2 = 0;
  let n = 0;
  let skin = 0;
  const x1 = Math.min(width, x0 + cell);
  const y1 = Math.min(height, y0 + cell);
  for (let y = y0; y < y1; y += 1) {
    let i = (y * width + x0) * 4;
    for (let x = x0; x < x1; x += 1) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const luma = 0.299 * r + 0.587 * g + 0.114 * b;
      sum += luma;
      sum2 += luma * luma;
      if (isSkin(r, g, b)) skin += 1;
      n += 1;
      i += 4;
    }
  }
  if (n < 8) return { score: 0 };
  const mean = sum / n;
  const variance = Math.max(0, sum2 / n - mean * mean);
  const skinRatio = skin / n;
  const score = Math.sqrt(variance) * (1 - skinRatio);
  return { score, mean, skinRatio };
}

function flood(mask, cols, rows, sx, sy, visited) {
  const stack = [[sx, sy]];
  const cells = [];
  visited[sy * cols + sx] = 1;
  while (stack.length) {
    const [x, y] = stack.pop();
    cells.push([x, y]);
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
      const idx = ny * cols + nx;
      if (visited[idx] || !mask[idx]) continue;
      visited[idx] = 1;
      stack.push([nx, ny]);
    }
  }
  return cells;
}

/**
 * @returns {{ x: number, y: number, width: number, height: number } | null} percent box
 */
export function findLikelyScreenBox(pixels) {
  const { data, width, height } = pixels || {};
  if (!data || !width || !height) return null;

  const cell = Math.max(8, Math.round(Math.min(width, height) / 36));
  const cols = Math.max(4, Math.floor(width / cell));
  const rows = Math.max(4, Math.floor(height / cell));
  const scores = new Float32Array(cols * rows);
  let maxScore = 0;

  for (let cy = 0; cy < rows; cy += 1) {
    for (let cx = 0; cx < cols; cx += 1) {
      const { score } = cellStats(data, width, height, cx * cell, cy * cell, cell);
      scores[cy * cols + cx] = score;
      if (score > maxScore) maxScore = score;
    }
  }

  if (maxScore < 8) return null;
  const thresh = Math.max(10, maxScore * 0.42);
  const mask = new Uint8Array(cols * rows);
  for (let i = 0; i < mask.length; i += 1) {
    mask[i] = scores[i] >= thresh ? 1 : 0;
  }

  const visited = new Uint8Array(cols * rows);
  const candidates = [];

  for (let cy = 0; cy < rows; cy += 1) {
    for (let cx = 0; cx < cols; cx += 1) {
      const idx = cy * cols + cx;
      if (!mask[idx] || visited[idx]) continue;
      const cells = flood(mask, cols, rows, cx, cy, visited);
      if (cells.length < 8) continue;

      let minX = cols;
      let minY = rows;
      let maxX = 0;
      let maxY = 0;
      let energy = 0;
      for (const [x, y] of cells) {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
        energy += scores[y * cols + x];
      }

      const fill = cells.length / Math.max(1, (maxX - minX + 1) * (maxY - minY + 1));
      if (fill < 0.42) continue;

      const box = {
        x: (minX * cell / width) * 100,
        y: (minY * cell / height) * 100,
        width: (((maxX - minX + 1) * cell) / width) * 100,
        height: (((maxY - minY + 1) * cell) / height) * 100,
      };
      const area = (box.width * box.height) / 10000;
      const ratio = box.height / Math.max(1, box.width);
      const cxPct = box.x + box.width / 2;

      if (area < 0.012 || area > 0.55) continue;
      if (box.width > 72) continue;
      if (ratio < 0.85 || ratio > 5.2) continue;
      if (box.y < 8 && box.height > 70 && cxPct < 48) continue;

      candidates.push({ box, energy, cxPct, area, fill, ratio });
    }
  }

  if (!candidates.length) return null;

  candidates.sort((a, b) => {
    const aFacePenalty = a.cxPct < 46 && a.box.y < 36 ? 0.5 : 1;
    const bFacePenalty = b.cxPct < 46 && b.box.y < 36 ? 0.5 : 1;
    return b.energy * b.fill * bFacePenalty - a.energy * a.fill * aFacePenalty;
  });

  const picked = candidates[0];
  const injectOk =
    picked.area >= 0.02 &&
    picked.area <= 0.38 &&
    picked.box.width <= 48 &&
    picked.ratio >= 1.15 &&
    picked.ratio <= 4.6 &&
    picked.fill >= 0.45;

  console.log('[SCREEN LOCALIZER]', { box: picked.box, candidates: candidates.length, injectOk });
  return { ...picked.box, injectOk };
}
