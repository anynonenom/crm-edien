const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

const sizes = [72, 96, 128, 144, 152, 192, 384, 512];
const input = path.join(__dirname, '../public/icon.png');
const outDir = path.join(__dirname, '../public/icons');

if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

Promise.all(
  sizes.map(size =>
    sharp(input)
      .resize(size, size)
      .toFile(path.join(outDir, `icon-${size}.png`))
      .then(() => console.log(`✓ icon-${size}.png`))
  )
).then(() => console.log('\nAll icons generated in public/icons/'));
