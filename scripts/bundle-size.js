#!/usr/bin/env node

/**
 * Bundle size report
 *
 * Builds the app and reports how much ends up in .next/static: the total, the
 * JavaScript chunks, and every file over 100 KB. That is a size check, not a
 * bundle analysis — it does not say which module made a chunk big. For that,
 * run `npx next experimental-analyze` (note it analyses a Turbopack build,
 * while production builds with webpack).
 *
 * Usage: npm run size
 */

const { execSync } = require('child_process')
const fs = require('fs')
const path = require('path')

const LARGE_FILE_BYTES = 100 * 1024

console.log('Building application...\n')
try {
  execSync('npm run build', { stdio: 'inherit' })
} catch {
  console.error('Build failed')
  process.exit(1)
}

const staticDir = path.join(process.cwd(), '.next', 'static')
if (!fs.existsSync(staticDir)) {
  console.error(`Build output not found: ${staticDir}`)
  process.exit(1)
}

/** Every file under dir, with its size, relative to dir */
function listFiles(dir, prefix = '') {
  const files = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name)
    const relativePath = path.join(prefix, entry.name)
    if (entry.isDirectory()) {
      files.push(...listFiles(fullPath, relativePath))
    } else {
      files.push({ path: relativePath, size: fs.statSync(fullPath).size })
    }
  }
  return files
}

function formatBytes(bytes) {
  if (bytes === 0) return '0 B'
  const k = 1024
  const units = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + units[i]
}

const files = listFiles(staticDir)
const sum = list => list.reduce((total, file) => total + file.size, 0)
const chunks = files.filter(file => file.path.startsWith(`chunks${path.sep}`))
const large = files.filter(file => file.size > LARGE_FILE_BYTES).sort((a, b) => b.size - a.size)

console.log('\nBundle size (.next/static, uncompressed):\n')
console.log(`  Total:             ${formatBytes(sum(files))}`)
console.log(`  JavaScript chunks: ${formatBytes(sum(chunks))}`)

console.log(`\nFiles over ${formatBytes(LARGE_FILE_BYTES)}:\n`)
if (large.length === 0) {
  console.log('  none')
} else {
  for (const file of large) console.log(`  ${file.path}: ${formatBytes(file.size)}`)
}
console.log('')
