#!/usr/bin/env node

/**
 * Bundle Size Analysis Script
 *
 * Run this script to analyze the bundle size of the application
 * Usage: node scripts/analyze-bundle.js
 */

const { execSync } = require('child_process')
const fs = require('fs')
const path = require('path')

console.log('🔍 Analyzing bundle size...\n')

// Build the application
console.log('📦 Building application...')
try {
  execSync('npm run build', { stdio: 'inherit' })
} catch (error) {
  console.error('❌ Build failed')
  process.exit(1)
}

// Analyze .next directory
const nextDir = path.join(process.cwd(), '.next')
const buildDir = path.join(nextDir, 'static')

if (!fs.existsSync(buildDir)) {
  console.error('❌ Build directory not found')
  process.exit(1)
}

// Get file sizes
function getDirectorySize(dir) {
  let size = 0
  const files = fs.readdirSync(dir, { withFileTypes: true })

  for (const file of files) {
    const filePath = path.join(dir, file.name)

    if (file.isDirectory()) {
      size += getDirectorySize(filePath)
    } else {
      const stats = fs.statSync(filePath)
      size += stats.size
    }
  }

  return size
}

function formatBytes(bytes) {
  if (bytes === 0) return '0 Bytes'
  const k = 1024
  const sizes = ['Bytes', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i]
}

// Calculate sizes
const staticSize = getDirectorySize(buildDir)
const chunksDir = path.join(buildDir, 'chunks')
const chunksSize = fs.existsSync(chunksDir) ? getDirectorySize(chunksDir) : 0

console.log('\n📊 Bundle Size Report:\n')
console.log(`Total static size: ${formatBytes(staticSize)}`)
console.log(`JavaScript chunks: ${formatBytes(chunksSize)}`)

// Check for large files
console.log('\n📦 Large files (>100KB):\n')

function findLargeFiles(dir, prefix = '') {
  const files = fs.readdirSync(dir, { withFileTypes: true })

  for (const file of files) {
    const filePath = path.join(dir, file.name)
    const relativePath = path.join(prefix, file.name)

    if (file.isDirectory()) {
      findLargeFiles(filePath, relativePath)
    } else {
      const stats = fs.statSync(filePath)
      if (stats.size > 100 * 1024) {
        // >100KB
        console.log(`  ${relativePath}: ${formatBytes(stats.size)}`)
      }
    }
  }
}

findLargeFiles(buildDir)

console.log('\n✅ Analysis complete!')
console.log('\n💡 Tips:')
console.log('  - Use dynamic imports for large components')
console.log('  - Optimize images with Next.js Image component')
console.log('  - Remove unused dependencies')
console.log('  - Consider code splitting for routes\n')
