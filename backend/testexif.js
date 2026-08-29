import ExifReader from 'exifreader';
import fs from 'fs';

const filePath = 'C:\\Users\\hp\\.gemini\\antigravity\\brain\\0b08f888-9b5a-40a4-9e50-7de580effc08\\media__1787925682936.jpg';

try {
  const buffer = fs.readFileSync(filePath);
  const tags = ExifReader.load(buffer, { expanded: true });
  console.log('--- KEYS ---');
  console.log(Object.keys(tags));
  
  if (tags.gps) {
    console.log('--- GPS ---');
    console.log(tags.gps);
  }
  
  console.log('--- FLAT KEYS ---');
  const flat = {};
  for (const ns of Object.values(tags)) {
    if (ns && typeof ns === 'object' && !Array.isArray(ns)) {
      Object.assign(flat, ns);
    }
  }
  console.log(Object.keys(flat));
  
  if (flat.Make) console.log('Make:', flat.Make);
  if (flat.Model) console.log('Model:', flat.Model);
  if (flat.GPSLatitude) console.log('GPSLatitude:', flat.GPSLatitude);
  if (flat.GPSLatitudeRef) console.log('GPSLatitudeRef:', flat.GPSLatitudeRef);
  if (flat.GPSLongitude) console.log('GPSLongitude:', flat.GPSLongitude);
  if (flat.GPSLongitudeRef) console.log('GPSLongitudeRef:', flat.GPSLongitudeRef);
} catch (err) {
  console.error('Error:', err.message);
}
