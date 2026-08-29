import ExifReader from 'exifreader';

// ─── GPS helpers ──────────────────────────────────────────────────────────────

/**
 * Convert an ExifReader GPS tag (degrees/minutes/seconds array) + ref to a
 * signed decimal degree number. Returns null if the value cannot be resolved.
 */
function toDecimalDeg(tag, refTag) {
  try {
    if (!tag) return null;

    // ExifReader exposes GPS values as an array of { numerator, denominator } or [numerator, denominator]
    const val = tag.value;
    if (!Array.isArray(val) || val.length < 3) return null;

    const toNum = (v) => {
      if (Array.isArray(v)) {
        if (v.length === 2 && typeof v[0] === 'number' && typeof v[1] === 'number') {
          return v[1] === 0 ? 0 : v[0] / v[1];
        }
        return Number(v[0]);
      }
      if (typeof v === 'object' && v !== null && 'numerator' in v) {
        return v.numerator / v.denominator;
      }
      return Number(v);
    };

    const deg = toNum(val[0]);
    const min = toNum(val[1]);
    const sec = toNum(val[2]);

    if ([deg, min, sec].some(isNaN)) return null;

    let decimal = deg + min / 60 + sec / 3600;

    const ref = refTag?.value?.[0] ?? refTag?.description ?? '';
    if (ref === 'S' || ref === 'W') decimal = -decimal;

    return parseFloat(decimal.toFixed(6));
  } catch {
    return null;
  }
}

/**
 * Try to parse altitude in metres. Returns null on failure.
 */
function toAltitude(tag, refTag) {
  try {
    if (!tag) return null;

    const raw = tag.value;
    const metres =
      typeof raw === 'object' && 'numerator' in raw
        ? raw.numerator / raw.denominator
        : Number(tag.description);

    if (isNaN(metres)) return null;

    // ref 1 means below sea level
    const belowSea = refTag?.value?.[0] === 1 || refTag?.value?.[0] === '1';
    return parseFloat((belowSea ? -metres : metres).toFixed(2));
  } catch {
    return null;
  }
}

/**
 * Safely grab the string description of a tag.
 * Returns null when the tag is absent or its description is an empty string.
 */
function str(tag) {
  if (!tag) return null;
  const d = tag.description ?? tag.value ?? null;
  if (!d) return null;
  const s = String(d).trim();
  return s.length > 0 ? s : null;
}

function emptyMetadata() {
  return {
    gps: { present: false, latitude: null, longitude: null, altitude: null },
    timestamp: { present: false, value: null },
    device: { present: false, make: null, model: null },
    software: { present: false, value: null },
    author: { present: false, value: null },
    camera: {
      iso: null,
      fNumber: null,
      exposureTime: null,
      focalLength: null,
      focalLength35: null,
      flash: null,
      whiteBalance: null,
      metering: null,
      exposureProgram: null,
      sceneCapture: null,
      lensModel: null,
      orientation: null,
      imageWidth: null,
      imageHeight: null,
    },
  };
}

/**
 * Extract and normalise EXIF / IPTC / XMP metadata from an image buffer.
 * Returns an empty, well-formed object when tags are missing or unreadable.
 */
export function extractMetadata(buffer) {
  if (!buffer || buffer.length < 8) {
    return emptyMetadata();
  }

  let tags = {};

  try {
    tags = ExifReader.load(buffer, { expanded: true });
  } catch {
    return emptyMetadata();
  }

  try {
    const flat = {};
  for (const ns of Object.values(tags)) {
    if (ns && typeof ns === 'object' && !Array.isArray(ns)) {
      Object.assign(flat, ns);
    }
  }

  // ── GPS ────────────────────────────────────────────────────────────────────
  const gpsNamespace = tags.gps || {};

  // ExifReader may expose GPS values as plain numbers, objects with .value, or description strings
  function resolveGpsCoord(val) {
    if (typeof val === 'number' && Number.isFinite(val)) return val;
    if (val && typeof val === 'object' && typeof val.value === 'number') return val.value;
    if (val && typeof val === 'object' && val.description) {
      const n = parseFloat(val.description);
      if (Number.isFinite(n)) return n;
    }
    if (typeof val === 'string') {
      const n = parseFloat(val);
      if (Number.isFinite(n)) return n;
    }
    return null;
  }

  let latitude = resolveGpsCoord(gpsNamespace.Latitude);
  let longitude = resolveGpsCoord(gpsNamespace.Longitude);
  let altitude = resolveGpsCoord(gpsNamespace.Altitude);

  // Fallback to manual decoding from Exif IFD if namespace doesn't resolve them as floats directly
  if (latitude === null || longitude === null) {
    const rawLat = toDecimalDeg(flat.GPSLatitude, flat.GPSLatitudeRef);
    const rawLon = toDecimalDeg(flat.GPSLongitude, flat.GPSLongitudeRef);
    if (rawLat !== null && rawLon !== null) {
      latitude = rawLat;
      longitude = rawLon;
      altitude = toAltitude(flat.GPSAltitude, flat.GPSAltitudeRef);
    }
  }

  // Zero coordinates (0, 0) mean empty/uninitialized GPS tags in EXIF
  if (latitude === 0 && longitude === 0) {
    latitude = null;
    longitude = null;
  }

  const gpsPresent = latitude !== null && longitude !== null;

  // ── Timestamp ──────────────────────────────────────────────────────────────
  // Prefer original capture time; fall back to any DateTime tag.
  const rawDateTime =
    str(flat.DateTimeOriginal) ??
    str(flat.DateTimeDigitized) ??
    str(flat.DateTime) ??
    null;

  // Normalise "YYYY:MM:DD HH:MM:SS" → ISO-ish "YYYY-MM-DDTHH:MM:SS"
  const timestampValue = rawDateTime
    ? rawDateTime.replace(/^(\d{4}):(\d{2}):(\d{2})/, '$1-$2-$3').replace(' ', 'T')
    : null;

  // ── Device ─────────────────────────────────────────────────────────────────
  const make  = str(flat.Make);
  const model = str(flat.Model);
  const devicePresent = make !== null || model !== null;

  // ── Software ───────────────────────────────────────────────────────────────
  const softwareValue = str(flat.Software);

  // ── Author / copyright ─────────────────────────────────────────────────────
  //  Try Artist, then XMP Creator, then IPTC By-line, then Copyright.
  const authorValue =
    str(flat.Artist) ??
    str(flat['dc:creator']) ??
    str(flat.ByLine) ??
    str(flat.Copyright) ??
    null;

  // ── Camera settings ─────────────────────────────────────────────────────────
  const isoValue          = flat.ISOSpeedRatings?.value ?? flat.ISOSpeedRatings?.description ?? null;
  const fNumberValue      = str(flat.FNumber);      // e.g. "f/1.8"
  const exposureTimeValue = str(flat.ExposureTime); // e.g. "1/60"
  const focalLengthValue  = str(flat.FocalLength);  // e.g. "4.5 mm"
  const focalLength35Value= str(flat.FocalLengthIn35mmFilm); // e.g. "26 mm"
  const flashValue        = str(flat.Flash);
  const whiteBalValue     = str(flat.WhiteBalance);
  const meteringValue     = str(flat.MeteringMode);
  const expProgramValue   = str(flat.ExposureProgram);
  const sceneCaptureValue = str(flat.SceneCaptureType);
  const lensModelValue    = str(flat.LensModel);
  const orientationValue  = str(flat.Orientation);
  const imageWidthValue   = flat['ImageWidth']?.description ?? flat['Image Width']?.description ?? null;
  const imageHeightValue  = flat['ImageLength']?.description ?? flat['Image Height']?.description ?? null;

  // ── Assemble normalised response ───────────────────────────────────────────
  return {
    gps: {
      present: gpsPresent,
      latitude:  gpsPresent ? latitude  : null,
      longitude: gpsPresent ? longitude : null,
      altitude:  gpsPresent ? altitude  : null,
    },
    timestamp: {
      present: timestampValue !== null,
      value:   timestampValue,
    },
    device: {
      present: devicePresent,
      make,
      model,
    },
    software: {
      present: softwareValue !== null,
      value:   softwareValue,
    },
    author: {
      present: authorValue !== null,
      value:   authorValue,
    },
    camera: {
      iso:          isoValue  !== null ? String(isoValue) : null,
      fNumber:      fNumberValue,
      exposureTime: exposureTimeValue,
      focalLength:  focalLengthValue,
      focalLength35: focalLength35Value,
      flash:        flashValue,
      whiteBalance: whiteBalValue,
      metering:     meteringValue,
      exposureProgram: expProgramValue,
      sceneCapture: sceneCaptureValue,
      lensModel:    lensModelValue,
      orientation:  orientationValue,
      imageWidth:   imageWidthValue,
      imageHeight:  imageHeightValue,
    },
  };
  } catch {
    return emptyMetadata();
  }
}

