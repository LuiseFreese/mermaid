# Automated Dataverse Application User Setup

## Overview

This documentation describes the fully automated setup script that solves the "chicken and egg" problem of creating Dataverse Application Users. The script can bootstrap a complete environment from scratch without any manual intervention.

## Features

### 🔄 Complete Automation
- **App Registration Management**: Automatically creates or updates Azure AD app registrations
- **Credential Management**: Generates fresh client secrets and updates `.env` file automatically  
- **Service Principal Creation**: Creates and configures service principals
- **Application User Bootstrap**: Uses admin credentials to create the first Application User when needed
- **Role Assignment**: Automatically assigns System Administrator role
- **Self-Healing**: Handles stale credentials and authentication failures gracefully

### 🛡️ Chicken-and-Egg Problem Solution
The script intelligently handles the bootstrap scenario:

1. **Service Principal First**: Tries to authenticate using existing service principal credentials
2. **Admin Fallback**: If service principal auth fails (first-time setup), automatically falls back to Azure CLI admin authentication
3. **Bootstrap Creation**: Uses admin credentials to create the Application User for the service principal
4. **Validation**: Tests that service principal authentication works after Application User creation
5. **Future Runs**: Subsequent runs use service principal authentication (no admin required)

### ⚡ Idempotent Operations
- **No Duplicates**: Checks for existing resources and avoids creating duplicates
- **Safe Re-runs**: Can be run multiple times safely
- **Credential Refresh**: Automatically generates fresh secrets when needed
- **State Recovery**: Handles partially completed setups gracefully

## Prerequisites

Before running the script, ensure you have:

```bash
# 1. Azure CLI installed and logged in as admin
az login

# 2. Verify admin access
az account show

# 3. .env file with minimum required variables
DATAVERSE_URL=https://your-org.crm4.dynamics.com
TENANT_ID=your-tenant-id
```

The script will automatically create `CLIENT_ID` and `CLIENT_SECRET` if they don't exist.

## Usage

### Basic Usage
```bash
# Run the complete automation
node scripts/setup-application-user.cjs
```

### What the Script Does

#### Phase 1: App Registration Management
1. **Check Existing**: Searches for existing "Mermaid Luise Auto" app registration
2. **Create if Missing**: Creates new app registration, service principal, and secret if none exists
3. **Update Credentials**: Generates fresh client secret if app registration exists
4. **Update .env**: Automatically updates the `.env` file with new credentials
5. **MSAL Refresh**: Reinitializes authentication client with new credentials

#### Phase 2: Authentication Strategy
1. **Service Principal Auth**: Attempts to authenticate using service principal
2. **Admin Fallback**: If service principal fails, uses Azure CLI admin authentication
3. **Bootstrap Mode**: Clearly indicates when using admin credentials for first-time setup

#### Phase 3: Application User Management
1. **Cleanup Duplicates**: Removes any existing duplicate Application Users
2. **Check Existing**: Verifies if Application User already exists for the service principal
3. **Create User**: Creates Application User if it doesn't exist
4. **Assign Role**: Assigns System Administrator role to the Application User
5. **Validate**: Tests that service principal authentication now works

#### Phase 4: Verification
1. **Authentication Test**: Calls the publishers endpoint to verify full access
2. **Success Confirmation**: Provides clear feedback about the automation status
3. **Future Guidance**: Explains that future runs will use service principal authentication

## Output Examples

### First-Time Setup (Bootstrap)
```
Starting Application User setup...
Checking for existing app registration...
No app registration found, creating from scratch...
Creating new app registration...
App registration created: 12345678-1234-1234-1234-123456789abc
Creating service principal...
Service principal created
Client secret generated
New app registration created and configured
CLIENT_ID: 12345678-1234-1234-1234-123456789abc
CLIENT_SECRET: AbCdEf1234...

⚠️ Service principal authentication failed (expected for first-time setup)
🔄 Switching to admin authentication to bootstrap Application User...
🔐 Falling back to admin authentication via Azure CLI...
This is needed to create the first Application User (chicken-and-egg problem)
✅ Admin access token obtained

👤 Creating Application User for service principal...
Application User created
System Administrator role assigned
🎉 Application User setup completed successfully!

🔄 Testing service principal authentication after Application User creation...
✅ Service principal authentication is now working!
🔧 Chicken-and-egg problem resolved - future runs will use service principal auth

Authentication test successful
📋 Dataverse Publishers
=======================
✅ Found 12 publishers
```

### Subsequent Runs
```
Starting Application User setup...
Checking for existing app registration...
Found existing app registration
App registration exists, generating fresh secret...
Fresh secret generated
Credentials updated, restarting process with fresh authentication...
✅ Service principal authentication successful
✅ Application User already exists
Authentication test successful
```

## Error Handling

The script includes comprehensive error handling:

### Common Scenarios
- **Missing Azure CLI**: Clear error message with installation instructions
- **Not Logged In**: Prompts to run `az login`
- **Insufficient Permissions**: Explains admin requirements
- **Network Issues**: Timeout handling for Azure CLI commands
- **Stale Credentials**: Automatic credential refresh and retry
- **Partial Setup**: Recovery from incomplete previous runs

### Troubleshooting

#### Script Hangs During App Registration Creation
```bash
# Check Azure CLI connectivity
az account show

# Try manual app creation to test
az ad app create --display-name "TestApp" --query "appId" --output tsv
```

#### Service Principal Authentication Fails
The script automatically handles this by falling back to admin authentication. If issues persist:
```bash
# Verify admin login
az account show

# Check Dataverse URL is correct
echo $DATAVERSE_URL
```

#### Application User Creation Fails
```bash
# Verify you have admin permissions in Dataverse
# Check that the Dataverse URL is accessible
# Ensure Azure CLI has the correct tenant context
```

## File Structure

```
scripts/
├── setup-application-user.cjs     # Main automation script
├── admin-create-application-user.cjs  # Admin-only bootstrap script (legacy)
└── simple-application-user-setup.cjs  # Simplified script (legacy)

.env                                # Configuration file (auto-updated)
```

## Security Considerations

### Credential Management
- **Automatic Rotation**: Client secrets are regenerated on each run
- **Secure Storage**: Credentials stored only in `.env` file (add to `.gitignore`)
- **Minimal Permissions**: Service principal gets only necessary Dataverse access
- **Admin Separation**: Admin credentials only used for initial bootstrap

### Best Practices
1. **Add .env to .gitignore**: Never commit credentials to source control
2. **Regular Rotation**: Re-run script periodically to refresh credentials
3. **Audit Access**: Monitor Application User activity in Dataverse
4. **Principle of Least Privilege**: Service principal has only required permissions

## Integration with Mermaid to Dataverse Converter

After successful setup, you can use the Mermaid to Dataverse converter:

```bash
# Convert ERD to Dataverse solution
node src/index.js convert --input your-diagram.mmd --solution "YourSolution"

# List available publishers
node src/index.js publishers

# Create custom entities
node src/index.js convert --input your-diagram.mmd --solution "YourSolution" --publisher-prefix "your"
```

## Summary

This automation script provides:

✅ **Zero Manual Steps**: Complete automation from app registration to working authentication  
✅ **Bootstrap Capability**: Can create everything from scratch  
✅ **Admin-Free Future Runs**: Only requires admin for initial bootstrap  
✅ **Self-Healing**: Automatically handles credential and authentication issues  
✅ **Idempotent**: Safe to run multiple times  
✅ **Clear Feedback**: Detailed logging and status updates  
✅ **Error Recovery**: Comprehensive error handling and troubleshooting guidance  

The script eliminates the need for any manual Power Platform Admin Center configuration and provides a fully automated CI/CD-ready solution for Dataverse integration.
