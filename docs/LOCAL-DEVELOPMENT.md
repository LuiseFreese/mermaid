# Local Development Setup

This guide helps you set up a local development environment for the Mermaid to Dataverse application using client secret authentication.

## Why Local Development?

- **Faster debugging**: No need to deploy to Azure for every change
- **Real authentication**: Uses actual Dataverse connection (not mocked data)
- **Full feature testing**: Test deployment history and other features locally

## Prerequisites

**For Option 1 (Create new App Registration):**
- Azure CLI logged in with permissions to create App Registrations
- Dataverse environment URL
- Dataverse System Administrator role (for creating Application User)

**For Option 2/3 (Use existing App Registration):**
1. **App Registration** with Dataverse permissions:
   - `Dynamics CRM (user_impersonation)`
   - Optional: `Microsoft Graph (User.Read)`

2. **Dataverse Application User**:
   - Created in Power Platform Admin Center
   - Assigned System Customizer role
   - Linked to your App Registration

3. **Client Secret**:
   - Generated in Azure Portal → App Registration → Certificates & secrets

## Quick Setup

**Option 1: Create new App Registration (Recommended)**
```powershell
# Creates App Registration + Client Secret + Dataverse Application User + .env.local
.\scripts\setup-local-dev.ps1 -CreateAppRegistration -DataverseUrl "https://your-org.crm.dynamics.com"
```

**Option 2: Use existing App Registration**
```powershell
# Manual configuration with existing credentials
.\scripts\setup-local-dev.ps1
```

**Option 3: Advanced - Create App Registration separately**
```powershell
# Create App Registration with detailed control
.\scripts\create-local-dev-app.ps1 -DataverseUrl "https://your-org.crm.dynamics.com" -CreateEnvFile
```

## Manual Setup

If you prefer manual configuration, create a `.env.local` file:

```bash
# Authentication Method
USE_CLIENT_SECRET=true
USE_MANAGED_IDENTITY=false

# Azure AD Configuration  
TENANT_ID=your-tenant-id
CLIENT_ID=your-client-id
CLIENT_SECRET=your-client-secret

# Dataverse Configuration
DATAVERSE_URL=https://your-org.crm.dynamics.com

# Development Settings
NODE_ENV=development
PORT=8080
LOG_REQUEST_BODY=true
```

## Running Locally

### Option 1: Backend Only (for API testing)
```bash
npm run dev:local
```

### Option 2: Full Stack (backend + frontend)
```bash
# Terminal 1: Backend with local config
npm run dev:local

# Terminal 2: Frontend dev server
cd src/frontend && npm run dev
```

## Testing the Setup

1. **Health Check**:
   ```bash
   curl http://localhost:8080/health
   ```

2. **Dataverse Connection**:
   ```bash
   curl http://localhost:8080/api/publishers
   ```

3. **Deployment History**:
   ```bash
   curl "http://localhost:8080/api/deployments/history?environmentSuffix=default&limit=50"
   ```

## Authentication Flow

1. **Local Development**: Uses client secret → Azure AD → Dataverse
2. **Azure Production**: Uses managed identity → Azure AD → Dataverse

The DataverseClient automatically detects the environment and uses the appropriate authentication method.

## Troubleshooting

### "Failed to get client secret token"
- Check your Tenant ID, Client ID, and Client Secret
- Verify the App Registration has Dataverse permissions
- Ensure permissions are admin consented

### "Application User not found"
- Create Application User in Power Platform Admin Center
- Use the exact Client ID from your App Registration
- Assign System Customizer or appropriate role

### "CORS errors in frontend"
- Make sure both backend (8080) and frontend (3004) are running
- Check Vite proxy configuration in `src/frontend/vite.config.ts`

### "Environment variables not loading"
- Ensure `.env.local` is in the project root
- Check for typos in environment variable names
- Verify the file is not committed to git

## Security Notes

- ⚠️ **Never commit** `.env.local` or any file containing client secrets
- The setup script automatically adds `.env.local` to `.gitignore`
- Use different App Registrations for development vs production
- Rotate client secrets regularly

## Benefits vs Azure Deployment

| Feature | Local Dev | Azure Deploy |
|---------|-----------|--------------|
| Speed | ⚡ Seconds | 🐌 Minutes |
| Auth Method | Client Secret | Managed Identity |
| Debugging | 🔍 Full logs | 📝 Limited logs |
| Cost | Free | Usage-based |
| Real Data | ✅ Yes | ✅ Yes |

Now you can iterate quickly on deployment history and other features without waiting for Azure deployments!
