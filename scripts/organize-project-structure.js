/**
 * Project Structure Organization Script
 * 
 * This script reorganizes the project files into a more logical structure:
 * - bin/ for deployment/CLI scripts
 * - src/ for core library code
 * - scripts/ for utility scripts
 * - tests/ for test files
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Get the directory name for relative paths
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = path.join(__dirname, '..');

// Define file moves: [source, destination]
const filesToMove = [
  // Move deployment scripts to bin/
  ['deploy-mermaid-cli.js', 'bin/deploy-mermaid-cli.js'],
  ['deploy-mermaid-improved.js', 'bin/deploy-mermaid-improved.js'],
  
  // Move test files to tests/
  ['test-schema-generation.js', 'tests/test-schema-generation.js'],
  ['test-direct-choice.js', 'tests/test-direct-choice.js'],
  ['test-global-choice.js', 'tests/test-global-choice.js'],
];

// Function to move a file with proper error handling
function moveFile(source, destination) {
  const sourcePath = path.join(rootDir, source);
  const destPath = path.join(rootDir, destination);
  
  try {
    if (fs.existsSync(sourcePath)) {
      // Create the directory if it doesn't exist
      const destDir = path.dirname(destPath);
      if (!fs.existsSync(destDir)) {
        fs.mkdirSync(destDir, { recursive: true });
      }
      
      // Read the file content
      const content = fs.readFileSync(sourcePath, 'utf8');
      
      // Write to new location
      fs.writeFileSync(destPath, content, 'utf8');
      
      // Delete the original file
      fs.unlinkSync(sourcePath);
      
      return `✅ Moved: ${source} → ${destination}`;
    } else {
      return `⚠️ Source file not found: ${source}`;
    }
  } catch (error) {
    return `❌ Error moving ${source}: ${error.message}`;
  }
}

// Update imports in a file
function updateImports(filePath, rootRelative = false) {
  try {
    if (fs.existsSync(filePath)) {
      let content = fs.readFileSync(filePath, 'utf8');
      
      // Calculate relative path to root
      const dirDepth = filePath.split(path.sep).length - rootDir.split(path.sep).length;
      const pathPrefix = rootRelative ? '../'.repeat(dirDepth) : '';
      
      // Update import paths
      content = content.replace(
        /from ['"]\.\/src\/(.*?)['"]/g,
        (match, p1) => `from '${pathPrefix}../src/${p1}'`
      );
      
      content = content.replace(
        /from ['"]\.\.\/src\/(.*?)['"]/g,
        (match, p1) => `from '${pathPrefix}../src/${p1}'`
      );
      
      // Update require paths if any
      content = content.replace(
        /require\(['"]\.\/src\/(.*?)['"]\)/g,
        (match, p1) => `require('${pathPrefix}../src/${p1}')`
      );
      
      fs.writeFileSync(filePath, content, 'utf8');
      return `✅ Updated imports in ${filePath}`;
    } else {
      return `⚠️ File not found for import updates: ${filePath}`;
    }
  } catch (error) {
    return `❌ Error updating imports in ${filePath}: ${error.message}`;
  }
}

// Update package.json to reflect new paths
function updatePackageJson() {
  const packageJsonPath = path.join(rootDir, 'package.json');
  
  try {
    if (fs.existsSync(packageJsonPath)) {
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
      
      // Update bin entries if they exist
      if (packageJson.bin) {
        const updatedBin = {};
        for (const [key, value] of Object.entries(packageJson.bin)) {
          if (value.startsWith('./deploy-mermaid')) {
            updatedBin[key] = value.replace('./deploy-mermaid', './bin/deploy-mermaid');
          } else {
            updatedBin[key] = value;
          }
        }
        packageJson.bin = updatedBin;
      }
      
      // Update scripts section
      if (packageJson.scripts) {
        const updatedScripts = {};
        for (const [key, value] of Object.entries(packageJson.scripts)) {
          if (value.includes('./deploy-mermaid')) {
            updatedScripts[key] = value.replace('./deploy-mermaid', './bin/deploy-mermaid');
          } else if (value.includes('./test-')) {
            updatedScripts[key] = value.replace('./test-', './tests/test-');
          } else {
            updatedScripts[key] = value;
          }
        }
        packageJson.scripts = updatedScripts;
      }
      
      // Write updated package.json
      fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2), 'utf8');
      return '✅ Updated package.json';
    } else {
      return '⚠️ package.json not found';
    }
  } catch (error) {
    return `❌ Error updating package.json: ${error.message}`;
  }
}

// Function to update documentation
function updateDocs() {
  const docsDir = path.join(rootDir, 'docs');
  let results = [];
  
  if (fs.existsSync(docsDir)) {
    const mdFiles = fs.readdirSync(docsDir).filter(file => file.endsWith('.md'));
    
    for (const mdFile of mdFiles) {
      const filePath = path.join(docsDir, mdFile);
      let content = fs.readFileSync(filePath, 'utf8');
      
      // Update paths in code blocks and references
      content = content.replace(
        /node deploy-mermaid-/g,
        'node bin/deploy-mermaid-'
      );
      
      fs.writeFileSync(filePath, content, 'utf8');
      results.push(`✅ Updated paths in ${mdFile}`);
    }
  }
  
  // Also update README.md if it exists
  const readmePath = path.join(rootDir, 'README.md');
  if (fs.existsSync(readmePath)) {
    let content = fs.readFileSync(readmePath, 'utf8');
    
    content = content.replace(
      /node deploy-mermaid-/g,
      'node bin/deploy-mermaid-'
    );
    
    fs.writeFileSync(readmePath, content, 'utf8');
    results.push('✅ Updated paths in README.md');
  }
  
  return results;
}

// Import path.dirname for use later
import { dirname } from 'path';

// Main function to execute the reorganization
function reorganizeProject() {
  console.log('🔄 Reorganizing project structure...');
  
  // Move files
  console.log('\n📂 Moving files to appropriate directories:');
  for (const [source, destination] of filesToMove) {
    const result = moveFile(source, destination);
    console.log(result);
  }
  
  // Update imports in moved files
  console.log('\n📝 Updating import paths:');
  for (const [_, destination] of filesToMove) {
    const fullPath = path.join(rootDir, destination);
    if (fs.existsSync(fullPath)) {
      const result = updateImports(fullPath, true);
      console.log(result);
    }
  }
  
  // Update package.json
  console.log('\n📄 Updating package.json:');
  console.log(updatePackageJson());
  
  // Update documentation
  console.log('\n📚 Updating documentation references:');
  const docResults = updateDocs();
  docResults.forEach(result => console.log(result));
  
  console.log('\n✅ Project reorganization complete!');
}

// Execute the reorganization
reorganizeProject();
