#!/usr/bin/env node

/**
 * Repository Cleanup Script
 * Organizes the Mermaid to Dataverse repository by moving temporary files to appropriate locations
 */

import { promises as fs } from 'fs';
import path from 'path';
import process from 'process';

const repoRoot = process.cwd();

// Files that should be kept in the root
const keepInRoot = [
  '.env',
  '.env.example', 
  '.gitignore',
  'package.json',
  'package-lock.json',
  'README.md',
  'RELATIONSHIP_FIX.md'
];

// Directories that should be kept in the root
const keepDirsInRoot = [
  '.git',
  'node_modules',
  'src',
  'examples',
  'docs',
  'scripts',
  'output'
];

// Files to archive (move to scripts/archive/temp-files/)
const filesToArchive = [
  'add-existing-choices-to-solution.js',
  'all-datatypes-schema.json',
  'check-entities.js',
  'check-entity-keys.js',
  'check-entity-metadata.js',
  'check-global-choices.js',
  'check-solution-components.js',
  'check-ultimate-test.cjs',
  'debug-relationship.js',
  'debug-schema.js',
  'input.txt',
  'manual-relationship-test.js',
  'simple-rel-test.mmd',
  'simple-test.mmd',
  'test-ecommerce.mmd',
  'test-full-relationships.js',
  'test-hardcoded-relationship.js',
  'test-input-spaces.txt',
  'test-input.txt',
  'test-minimal-rel.js',
  'test-naming.js',
  'test-rel.js',
  'test-relationship.mmd',
  'test-sanitization.js',
  'test-simple.mmd',
  'validate-relationships.js',
  'verify-solution.js'
];

async function ensureDir(dirPath) {
  try {
    await fs.access(dirPath);
  } catch {
    await fs.mkdir(dirPath, { recursive: true });
    console.log(`📁 Created directory: ${dirPath}`);
  }
}

async function moveFile(from, to) {
  try {
    await fs.access(from);
    await ensureDir(path.dirname(to));
    await fs.rename(from, to);
    console.log(`📦 Moved: ${from} → ${to}`);
  } catch (error) {
    if (error.code !== 'ENOENT') {
      console.log(`⚠️  Could not move ${from}: ${error.message}`);
    }
  }
}

async function cleanupRepo() {
  console.log('🧹 Starting repository cleanup...\n');

  // Create archive directory for temporary files
  const tempArchiveDir = path.join(repoRoot, 'scripts', 'archive', 'temp-files');
  await ensureDir(tempArchiveDir);

  // Move temporary files to archive
  console.log('📦 Moving temporary files to archive...');
  for (const file of filesToArchive) {
    const from = path.join(repoRoot, file);
    const to = path.join(tempArchiveDir, file);
    await moveFile(from, to);
  }

  // Check for any remaining files in root that shouldn't be there
  console.log('\n🔍 Checking for other temporary files in root...');
  try {
    const rootFiles = await fs.readdir(repoRoot);
    const shouldArchive = rootFiles.filter(file => {
      // Skip directories and files that should be kept
      if (keepDirsInRoot.includes(file) || keepInRoot.includes(file)) {
        return false;
      }
      
      // Check if it's a file (not directory)
      const fullPath = path.join(repoRoot, file);
      try {
        const stats = fs.stat(fullPath);
        return stats.then(s => s.isFile());
      } catch {
        return false;
      }
    });

    for (const file of shouldArchive) {
      const fullPath = path.join(repoRoot, file);
      try {
        const stats = await fs.stat(fullPath);
        if (stats.isFile()) {
          const to = path.join(tempArchiveDir, file);
          await moveFile(fullPath, to);
        }
      } catch {
        // Ignore errors for files that might have been moved already
      }
    }
  } catch (error) {
    console.log(`⚠️  Error checking root directory: ${error.message}`);
  }

  console.log('\n✅ Repository cleanup completed!');
  console.log('\n📂 Current repository structure:');
  console.log(`
  mermaid/
  ├── 📄 .env.example              # Environment configuration template
  ├── 📄 .gitignore               # Git ignore rules
  ├── 📄 package.json             # Node.js dependencies
  ├── 📄 README.md                # Main documentation
  ├── 📄 RELATIONSHIP_FIX.md      # Relationship documentation
  ├── 📁 src/                     # Core application source code
  │   ├── 📄 index.js             # CLI entry point
  │   ├── 📄 parser.js            # Mermaid ERD parser
  │   ├── 📄 schema-generator.js  # Dataverse schema generator
  │   ├── 📄 relationship-validator.js # Relationship validator
  │   └── 📄 dataverse-client.js  # Dataverse API client
  ├── 📁 examples/                # Example Mermaid ERD files
  ├── 📁 docs/                    # Documentation
  ├── 📁 scripts/                 # Setup and utility scripts
  │   ├── 📄 setup.cjs            # Environment setup
  │   └── 📁 archive/             # Archived files
  └── 📁 output/                  # Generated output files
  `);

  console.log('\n🎯 All temporary test files have been moved to scripts/archive/temp-files/');
  console.log('📚 Core application files remain in their proper locations.');
}

// Run cleanup
cleanupRepo().catch(console.error);
