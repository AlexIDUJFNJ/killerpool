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

// Sizes packed into favicon.ico: the tab icon, its 2x, and the Windows
// desktop shortcut size
const icoSizes = [16, 32, 48];

const svgPath = path.join(__dirname, '../public/icon.svg');
const publicPath = path.join(__dirname, '../public');

function renderPng(size) {
  return sharp(svgPath).resize(size, size).png().toBuffer();
}

/**
 * Wraps PNG images in an ICO container.
 *
 * sharp has no ICO encoder: asked for favicon.ico it wrote a plain PNG under
 * that name, byte for byte the same as favicon-32x32.png. Browsers sniff and
 * cope; anything that reads the extension (Windows, some crawlers) does not.
 * An ICO may hold PNG images as they are (Windows Vista onwards, every current
 * browser), so the whole format is a 6-byte header plus one 16-byte directory
 * entry per image.
 */
function encodeIco(images) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(images.length, 4);

  let offset = header.length + 16 * images.length;
  const entries = images.map(({ size, png }) => {
    const entry = Buffer.alloc(16);
    entry.writeUInt8(size >= 256 ? 0 : size, 0); // width, 0 means 256
    entry.writeUInt8(size >= 256 ? 0 : size, 1); // height
    entry.writeUInt8(0, 2); // palette size: none
    entry.writeUInt8(0, 3); // reserved
    entry.writeUInt16LE(1, 4); // colour planes
    entry.writeUInt16LE(32, 6); // bits per pixel
    entry.writeUInt32LE(png.length, 8);
    entry.writeUInt32LE(offset, 12);
    offset += png.length;
    return entry;
  });

  return Buffer.concat([header, ...entries, ...images.map(({ png }) => png)]);
}

async function generateIcons() {
  console.log('🎨 Generating PWA icons...\n');
  let failures = 0;

  for (const { size, name } of sizes) {
    try {
      await fs.promises.writeFile(path.join(publicPath, name), await renderPng(size));
      console.log(`✅ Generated ${name} (${size}x${size})`);
    } catch (error) {
      failures++;
      console.error(`❌ Error generating ${name}:`, error.message);
    }
  }

  try {
    const images = await Promise.all(
      icoSizes.map(async (size) => ({ size, png: await renderPng(size) }))
    );
    await fs.promises.writeFile(path.join(publicPath, 'favicon.ico'), encodeIco(images));
    console.log(`✅ Generated favicon.ico (${icoSizes.map((s) => `${s}x${s}`).join(', ')})`);
  } catch (error) {
    failures++;
    console.error(`❌ Error generating favicon.ico:`, error.message);
  }

  // Not fatal for the build: the icons are committed, so a failure here
  // leaves the previous copies in public/ in place
  if (failures > 0) {
    console.warn(`\n⚠️  ${failures} icon(s) not regenerated; public/ keeps the committed copies.`);
  } else {
    console.log('\n🎉 All icons generated successfully!');
  }
}

generateIcons().catch(console.error);
