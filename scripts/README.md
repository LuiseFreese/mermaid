# Mermaid-to-Dataverse Scripts

This directory contains utility scripts for the Mermaid-to-Dataverse project.

## Available Scripts

### `cleanup-repo.ps1`

Performs repository cleanup operations:
- Removes unused server variants
- Cleans up temporary files
- Removes empty directories
- Archives old log files
- Runs Node.js-specific cleanup tasks

**Usage:**

```powershell
# Run from project root
.\scripts\cleanup-repo.ps1

# Or via npm
npm run cleanup

# Dry run (no changes made)
.\scripts\cleanup-repo.ps1 -DryRun
# Or via npm
npm run cleanup:dry

# Skip backup creation
.\scripts\cleanup-repo.ps1 -SkipBackup

# Force cleanup even if backup fails
.\scripts\cleanup-repo.ps1 -Force
```

### `cleanup.js`

JavaScript-based cleanup script that performs Node.js specific operations:
- Cleans up old log files
- Archives logs older than 7 days

**Usage:**
This script is called automatically by `cleanup-repo.ps1` but can be run directly:

```bash
node scripts/cleanup.js
```

### `setup.cjs`

Project setup script.

### `test-keyvault.js`

Tests Azure Key Vault connectivity.

## Archive Folder

The `archive` folder contains backed up files from cleanup operations.
