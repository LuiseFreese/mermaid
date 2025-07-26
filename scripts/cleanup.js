#!/usr/bin/env node
/**
 * Cleanup Script for Mermaid to Dataverse Converter
 * Removes temporary files, debug scripts, and schema outputs
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.join(__dirname, '..');

console.log('🧹 Cleaning up Mermaid to Dataverse Converter...');

// Patterns of files to remove
const cleanupPatterns = [
  // Debug and test files
  'debug-*.js',
  'debug-*.mjs',
  'check-*.js',
  'verify-*.js',
  'verify-*.cjs',
  'add-*.js',
  'test-*.js',
  
  // Schema output files
  '*-schema.json',
  'schema-*.json',
  
  // Temporary .env files
  '.env.generated',
  '.env.updated',
  '.env.temp',
  
  // Test files in root
  'check-ultimate-test.cjs',
  'test-*.cjs'
];

// Files to keep (whitelist)
const keepFiles = [
  'package.json',
  'package-lock.json',
  '.env',
  '.env.example',
  '.gitignore',
  'README.md'
];

// Directories to skip
const skipDirs = [
  'node_modules',
  '.git',
  'src',
  'docs',
  'scripts/archive' // Keep archive for reference
];

function matchesPattern(filename, patterns) {
  return patterns.some(pattern => {
    const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
    return regex.test(filename);
  });
}

function cleanDirectory(dirPath) {
  if (!fs.existsSync(dirPath)) return;
  
  const items = fs.readdirSync(dirPath);
  let cleaned = 0;
  
  for (const item of items) {
    const fullPath = path.join(dirPath, item);
    const stat = fs.statSync(fullPath);
    
    if (stat.isDirectory()) {
      // Skip certain directories
      if (skipDirs.includes(item) || skipDirs.includes(path.relative(rootDir, fullPath))) {
        continue;
      }
      // Recursively clean subdirectories
      cleaned += cleanDirectory(fullPath);
    } else {
      // Check if file should be removed
      if (matchesPattern(item, cleanupPatterns) && !keepFiles.includes(item)) {
        console.log(`  🗑️  Removing: ${path.relative(rootDir, fullPath)}`);
        fs.unlinkSync(fullPath);
        cleaned++;
      }
    }
  }
  
  return cleaned;
}

// Clean the repository
const totalCleaned = cleanDirectory(rootDir);

// Clean examples (keep only the main ones)
const examplesDir = path.join(rootDir, 'examples');
if (fs.existsSync(examplesDir)) {
  const examples = fs.readdirSync(examplesDir);
  const keepExamples = ['ecommerce-erd.mmd', 'hr-system-erd.mmd'];
  
  for (const example of examples) {
    if (!keepExamples.includes(example)) {
      const fullPath = path.join(examplesDir, example);
      if (fs.statSync(fullPath).isFile()) {
        console.log(`  🗑️  Removing example: ${example}`);
        fs.unlinkSync(fullPath);
      }
    }
  }
}

console.log(`✅ Cleanup completed! Removed ${totalCleaned} temporary files.`);
console.log('📁 Repository is now clean and ready for production use.');
