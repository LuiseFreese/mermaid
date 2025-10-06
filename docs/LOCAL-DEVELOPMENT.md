# Local Development Setup

**Zero configuration required!** Just clone, install, and run.

## Quick Start (3 Commands)

```powershell
# 1. Clone the repository
git clone https://github.com/LuiseFreese/mermaid.git
cd mermaid

# 2. Install dependencies
npm install

# 3. Start development server
npm run dev
```

**That's it!** 🎉

- Frontend: `http://localhost:3003`
- Backend API: `http://localhost:8080`
- Authentication: **Disabled** (no Azure AD needed for local dev)

## What's Running?

When you run `npm run dev`, two servers start automatically:

### Frontend (Port 3003)
- **Vite dev server** with hot module replacement
- React application with real-time updates
- No build step needed during development

### Backend (Port 8080)
- **Express API server** 
- Mock data for rapid development
- No Dataverse connection needed (unless you want to test against real data)

### Authentication
- **Disabled by default** (`AUTH_ENABLED=false`)
- No Azure AD configuration required
- No login prompts
- Perfect for rapid feature development

## Prerequisites

- **Node.js 20+** (required)
- **PowerShell 7+** or Windows PowerShell 5.1 (for scripts)

That's all! No Azure setup needed for local development.

## Advanced: Testing with Real Dataverse (Optional)

Want to test against a real Dataverse environment? Create a `.env.local` file:

```bash
# Authentication Method
USE_CLIENT_SECRET=true
USE_MANAGED_IDENTITY=false

# Microsoft Entra Configuration  
TENANT_ID=your-tenant-id
CLIENT_ID=your-app-registration-id
CLIENT_SECRET=your-client-secret

# Optional: Connect to real Dataverse
DATAVERSE_URL=https://your-org.crm.dynamics.com

# Authentication still disabled for local dev
AUTH_ENABLED=false
```

**Note**: You'll need to create an App Registration with a client secret for local Dataverse access. See [DEPLOYMENT.md](./DEPLOYMENT.md) for production deployment (which uses managed identity, no secrets!).

## Advanced: Testing with Azure AD Authentication (Optional)

Want to test the full authentication flow locally?

### Prerequisites
1. Deploy to Azure first: `.\scripts\setup-secretless.ps1`
2. This creates the Azure AD App Registration you need

### Configuration

**1. Add localhost redirect URI to your Azure AD App Registration:**

```powershell
# Get your environment suffix (e.g., "owspth")
$envSuffix = "your-env-suffix"

# Get App Registration ID
$appId = az ad app list --display-name "mermaid-user-auth-$envSuffix" --query "[0].appId" -o tsv

# Get Object ID
$objectId = az ad app list --display-name "mermaid-user-auth-$envSuffix" --query "[0].id" -o tsv

# Add localhost redirect URI (for local dev)
$spaConfig = @{ spa = @{ redirectUris = @(
    "https://app-mermaid-$envSuffix.azurewebsites.net",
    "http://localhost:3003"
) } } | ConvertTo-Json -Depth 3 | Out-File spa-config.json

az rest --method PATCH `
  --uri "https://graph.microsoft.com/v1.0/applications/$objectId" `
  --headers "Content-Type=application/json" `
  --body "@spa-config.json"

Remove-Item spa-config.json
```

**2. Create `.env.local` in project root:**

```bash
# Enable authentication
AUTH_ENABLED=true

# Azure AD Configuration (from your deployed environment)
AZURE_AD_TENANT_ID=your-tenant-id
AZURE_AD_CLIENT_ID=your-azure-ad-client-id

# Optional: Test with real Dataverse
DATAVERSE_URL=https://your-org.crm.dynamics.com
```

**3. Create `src/frontend/.env.local`:**

```bash
VITE_AZURE_AD_CLIENT_ID=your-azure-ad-client-id
VITE_AZURE_AD_TENANT_ID=your-tenant-id
VITE_AZURE_AD_REDIRECT_URI=http://localhost:3003
```

**4. Restart dev server:**

```powershell
npm run dev
```

Now you'll see the Microsoft login page when accessing `http://localhost:3003`!

## Testing Your Setup

### Health Check
```powershell
curl http://localhost:8080/health
```

**Expected**: `{"status":"ok"}`

### Frontend Access

Open browser to `http://localhost:3003`

**Authentication Methods:**
1. **Local Development**: Uses client secret → Microsoft Entra → Dataverse
2. **Azure Production**: Uses managed identity → Microsoft Entra → Dataverse

**Without Auth (default)**: Loads immediately ✅  
**With Auth (optional)**: Redirects to Microsoft login first ✅

## Troubleshooting

### Port Already in Use

**Error**: `EADDRINUSE: address already in use :::3003`

**Solution**:
```powershell
# Find and kill process on port 3003
Get-NetTCPConnection -LocalPort 3003 -ErrorAction SilentlyContinue | ForEach-Object {
    Stop-Process -Id $_.OwningProcess -Force
}

# Or use a different port
npm run dev -- --port 3004
```

### Module Not Found Errors

**Solution**:
```powershell
# Reinstall dependencies
Remove-Item node_modules -Recurse -Force
Remove-Item package-lock.json -Force
npm install

<<<<<<< HEAD
# Also check frontend
cd src/frontend
Remove-Item node_modules -Recurse -Force
Remove-Item package-lock.json -Force
npm install
cd ../..
```

### Hot Reload Not Working

**Solution**:
```powershell
# Restart the dev server
# Press Ctrl+C to stop, then:
npm run dev
```

### Environment Variables Not Loading

**Common Issue**: Changed `.env.local` but changes not reflected

**Solution**: Restart the dev server (environment variables load on startup only)

### CORS Errors

**Issue**: Frontend can't reach backend API

**Check**:
1. Backend is running on port 8080
2. Frontend is running on port 3003
3. Vite proxy is configured (should be automatic)

**Verify Vite config** (`src/frontend/vite.config.ts`):
```typescript
server: {
  proxy: {
    '/api': 'http://localhost:8080'
  }
}
```

## Development vs Production

| Feature | Local Development | Azure Production |
|---------|-------------------|------------------|
| **Setup Time** | ⚡ 30 seconds | 🐌 5-10 minutes |
| **Authentication** | ❌ Disabled | ✅ Azure AD Required |
| **Dataverse** | 🔄 Optional (mock or real) | ✅ Required |
| **Hot Reload** | ✅ Yes | ❌ No |
| **Debugging** | 🔍 Full (breakpoints, logs) | 📝 Limited (logs only) |
| **Cost** | 💰 Free | 💰 ~$20-50/month |
| **Secrets** | ⚠️ Client secrets OK | ✅ Managed Identity (no secrets!) |

## When to Use What?

### Use Local Development When:
- 🎨 Building UI components
- 🧪 Testing business logic
- � Debugging issues
- ⚡ Need fast iteration
- 📚 Learning the codebase

### Deploy to Azure When:
- � Ready to share with others
- � Testing authentication flow
- 🌐 Need public URL
- 📊 Testing with production Dataverse
- ✅ Final validation before release

## Quick Reference

```powershell
# Start development
npm run dev

# Install dependencies
npm install

# Build for production (test locally)
npm run build

# Run tests
npm test

# Deploy to Azure
.\scripts\setup-secretless.ps1      # First time setup
.\scripts\deploy-secretless.ps1     # Deploy code updates
```

## Next Steps

- **Build Features**: Start coding! No setup needed.
- **Deploy to Azure**: See [DEPLOYMENT.md](./DEPLOYMENT.md) for production deployment
- **Add Authentication**: See [Advanced: Testing with Azure AD](#advanced-testing-with-azure-ad-authentication-optional) above

**Happy coding!** 🎉
