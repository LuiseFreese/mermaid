# Dataverse Setup Scripts

## Main Script

### `setup.cjs` - Complete Automated Setup

This is the main script that handles everything you need for Dataverse authentication and Application User setup.

**What it does:**
- **App Registration Management** - Creates or updates Azure app registrations automatically
- **Service Principal Creation** - Creates Azure service principal with proper permissions  
- **Client Secret Generation** - Generates fresh client secrets automatically
- **Application User Setup** - Creates Dataverse Application User with System Administrator role
- **Automatic .env Updates** - Updates your `.env` file with new credentials automatically
- **Dual Authentication** - Handles both service principal and admin authentication
- **Chicken-and-Egg Problem Solving** - Bootstraps authentication from scratch
- **Authentication Testing** - Tests the complete setup by calling Dataverse APIs
- **Idempotent Operation** - Safe to run multiple times, won't create duplicates

**Usage:**
```bash
node scripts/setup.cjs
```

**Prerequisites:**
1. Azure CLI installed and logged in as admin (`az login`)
2. Node.js with dependencies installed (`npm install`)
3. `.env` file with `DATAVERSE_URL` and `TENANT_ID`
4. Admin permissions in your Dataverse environment

**The Chicken-and-Egg Problem:**
This script solves the classic Dataverse authentication bootstrap problem:
- **Problem**: You need a Service Principal to authenticate, but you need to authenticate to create the Application User for that Service Principal!
- **Solution**: The script uses dual authentication - admin fallback (Azure CLI) to bootstrap the first Application User, then service principal authentication for all future operations.


## Setup Process

1. **Creates/Updates App Registration** - Detects existing "Mermaid Luise Auto" app or creates new one
2. **Generates Fresh Credentials** - Creates new client secrets and updates `.env` automatically  
3. **Handles Authentication** - Uses service principal auth when possible, falls back to admin auth when needed
4. **Creates Application User** - Creates Dataverse Application User with proper permissions
5. **Tests Everything** - Verifies the complete setup by calling Dataverse publishers endpoint


## Security

- Client secrets are automatically generated and updated
- Credentials are stored securely in your `.env` file
- The script never exposes full secrets in logs (only partial previews)
- Old/duplicate Application Users are automatically cleaned up
