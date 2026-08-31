export function stripCodeFences(text) {
  return String(text || '')
    .replace(/^\s*```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/i, '')
    .trim();
}

function salvageFindings(text) {
  const startMatch = text.match(/"findings"\s*:\s*\[/);
  if (!startMatch) return { findings: [], recommendations: [] };

  const start = startMatch.index + startMatch[0].length;
  const findings = [];
  let depth = 0;
  let begin = -1;
  let inString = false;
  let escape = false;

  for (let i = start; i < text.length; i += 1) {
    const ch = text[i];
    if (inString) {
      if (escape) escape = false;
      else if (ch === '\\') escape = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === '{') {
      if (depth === 0) begin = i;
      depth += 1;
    } else if (ch === '}') {
      depth -= 1;
      if (depth === 0 && begin >= 0) {
        try {
          findings.push(JSON.parse(text.slice(begin, i + 1)));
        } catch {
          // skip incomplete object
        }
        begin = -1;
      }
    } else if (ch === ']' && depth === 0) {
      break;
    }
  }

  return { findings, recommendations: [] };
}

export function parseModelJson(text) {
  const raw = stripCodeFences(text);
  try {
    return JSON.parse(raw);
  } catch {
    const salvaged = salvageFindings(raw);
    if (salvaged.findings.length) {
      console.warn(`[visionJson] Salvaged ${salvaged.findings.length} findings from truncated JSON`);
      return { ...salvaged, truncated: true };
    }
    throw new Error('Model JSON was truncated or invalid.');
  }
}
