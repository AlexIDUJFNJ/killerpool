const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const sizes = [
  { size: 192, name: 'icon-192.png' },
  { size: 512, name: 'icon-512.png' },
  { size: 180, name: 'apple-touch-icon.png' },
  { size: 32, name: 'favicon-32x32.png' },
  { size: 16, name: 'favicon-16x16.png' },
];

const svgPath = path.join(__dirname, '../public/icon.svg');
const publicPath = path.join(__dirname, '../public');

async function generateIcons() {
  console.log('🎨 Generating PWA icons...\n');

  for (const { size, name } of sizes) {
    try {
      await sharp(svgPath)
        .resize(size, size)
        .png()
        .toFile(path.join(publicPath, name));

      console.log(`✅ Generated ${name} (${size}x${size})`);
    } catch (error) {
      console.error(`❌ Error generating ${name}:`, error.message);
    }
  }

  // Generate favicon.ico (using 32x32 as base)
  try {
    await sharp(svgPath)
      .resize(32, 32)
      .toFile(path.join(publicPath, 'favicon.ico'));
    console.log(`✅ Generated favicon.ico (32x32)`);
  } catch (error) {
    console.error(`❌ Error generating favicon.ico:`, error.message);
  }

  console.log('\n🎉 All icons generated successfully!');
}

generateIcons().catch(console.error);
