# Mermaid Dataverse Application User Setup Scripts

## Overview

This folder contains scripts for automating the complete setup of a Microsoft Dataverse Application User with proper authentication. The main challenge this solves is the "chicken-and-egg problem" described below.

## The Chicken-and-Egg Problem

When setting up automated access to Microsoft Dataverse, you encounter a classic bootstrapping problem:

1. **You need a Service Principal** to authenticate to Dataverse programmatically
2. **The Service Principal needs an Application User** in Dataverse to have permissions  
3. **To create an Application User**, you need to authenticate to Dataverse
4. **But you can't authenticate** until the Application User exists!

This circular dependency is what we call the "chicken-and-egg problem."

## The Solution

Our script solves this by using a **dual authentication strategy**:

1. **Admin Authentication (Azure CLI)**: Uses your admin credentials via Azure CLI to bootstrap the first Application User
2. **Service Principal Authentication (MSAL)**: Once the Application User exists, switches to service principal authentication for all future operations

The script intelligently detects which authentication method to use based on whether the Application User already exists.

## Primary Script

### `setup-application-user.cjs` - Main Automation Script

This fully automated script handles the complete bootstrap process:

**Key Features:**
- **App Registration Management**: Detects existing registrations or creates new ones
- **Service Principal Creation**: Automatically creates and configures service principals  
- **Secret Management**: Generates fresh client secrets and updates .env automatically
- **Application User Creation**: Creates Dataverse Application User with System Administrator role
- **Chicken-and-Egg Resolution**: Uses admin auth to bootstrap, then switches to service principal
- **Idempotent Operation**: Safe to run multiple times without creating duplicates
- **Automatic Testing**: Verifies setup by testing authentication

**Usage:**
```bash
node scripts/setup-application-user.cjs
```

**Prerequisites:**
1. Azure CLI installed and logged in as admin (`az login`)
2. Node.js with required packages (`npm install`)
3. `.env` file with `DATAVERSE_URL` and `TENANT_ID`
4. Admin permissions in your Dataverse environment

## How It Works

### First-Time Setup (Bootstrap)
1. **Detects missing credentials** in .env file
2. **Creates Azure app registration** with "Mermaid Luise Auto" name
3. **Creates service principal** from the app registration
4. **Generates client secret** and updates .env file
5. **Uses admin authentication** (Azure CLI) to access Dataverse
6. **Creates Application User** for the service principal
7. **Assigns System Administrator role** to the Application User
8. **Tests service principal authentication** to confirm everything works

### Subsequent Runs (Maintenance)
1. **Detects existing app registration**
2. **Generates fresh client secret** (for security)
3. **Updates .env file** with new credentials
4. **Uses service principal authentication** directly
5. **Verifies Application User** still exists and has proper permissions

## Archive Folder

The `archive/` folder contains development iterations and alternative approaches that were tried during development. These scripts are preserved for reference but should not be used:

- Various test scripts (`test-*.cjs`)
- Alternative setup approaches (`setup-*.cjs`)
- Debug utilities (`debug-*.cjs`)
- PowerShell variants (`*.ps1`)

**Always use the main `setup-application-user.cjs` script for production setups.**

## Troubleshooting

### Common Issues

1. **"Service principal authentication failed"**
   - This is normal on first run - the script will automatically fall back to admin auth
   - After Application User is created, service principal auth should work

2. **"Invalid access token"**
   - Ensure you're logged in with Azure CLI: `az login`
   - Verify you have admin permissions in the Dataverse environment

3. **"Application User already exists"**
   - The script detects this and skips creation - this is normal behavior
   - It will still test authentication to ensure everything works

### Azure AD Propagation Delays

Sometimes Azure AD takes a few minutes to propagate changes. If service principal authentication fails immediately after Application User creation, wait 2-3 minutes and run the script again.

## Environment Variables

The script automatically manages these variables in your `.env` file:

```bash
# Required (must be set manually)
DATAVERSE_URL=https://yourorg.crm.dynamics.com
TENANT_ID=your-tenant-id-here

# Managed automatically by the script
CLIENT_ID=auto-generated-app-id
CLIENT_SECRET=auto-generated-secret
```

## Security Notes

- The script generates fresh client secrets on each run for security
- Old secrets are automatically invalidated when new ones are created
- All credentials are stored locally in the .env file (never committed to git)
- The script requires admin privileges only for the initial bootstrap
   - Creates Dataverse application user
   - Assigns System Administrator role
   - Updates `.env` file
   - Tests authentication

## Output

The script provides clear feedback and automatically:
- Updates your `.env` file with the correct credentials
- Shows you the new App ID and Client Secret
- Verifies authentication works by listing publishers

No more manual copy-pasting of secrets! 🎉
