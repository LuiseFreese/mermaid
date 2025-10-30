# Local Development Setup

**Zero configuration required!** Just clone, install, and run.

> **Multi-Environment Support**: The application supports deploying to multiple Dataverse environments (dev/test/prod). In local development, you can test against any configured environment. See [Azure Multi-Environment Guide](./AZURE-MULTI-ENVIRONMENT.md) for setup details.

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

## Multi-Environment Testing (Optional)

Want to test deploying to different environments (dev/test/prod) locally?

### Setup

**1. Configure your environments** in `data/environments.json`:

```json
{
  "version": "1.0.0",
  "environments": [
    {
      "id": "env-guid-1",
      "name": "dev-local",
      "url": "https://your-dev-org.crm.dynamics.com",
      "powerPlatformEnvironmentId": "env-guid-1",
      "color": "blue",
      "isDefault": true
    },
    {
      "id": "env-guid-2",
      "name": "test-local",
      "url": "https://your-test-org.crm.dynamics.com",
      "powerPlatformEnvironmentId": "env-guid-2",
      "color": "yellow"
    }
  ],
  "defaultEnvironmentId": "env-guid-1"
}
```

**2. Create `.env.local` with credentials** that have access to all environments:

```bash
# Authentication Method
USE_CLIENT_SECRET=true
USE_MANAGED_IDENTITY=false

# Microsoft Entra Configuration
TENANT_ID=your-tenant-id
CLIENT_ID=your-app-registration-id
CLIENT_SECRET=your-client-secret

# Default environment (can be overridden by user selection)
DATAVERSE_URL=https://your-dev-org.crm.dynamics.com
POWER_PLATFORM_ENVIRONMENT_ID=env-guid-1

# Authentication still disabled for local dev
AUTH_ENABLED=false
```

**3. Start the dev server:**

```powershell
npm run dev
```

**4. Test environment selection:**
- Open `http://localhost:3003/wizard`
- Navigate to Solution Setup step
- You'll see the environment dropdown with your configured environments
- Select an environment and deploy
- Backend will dynamically route to the selected environment

### How It Works

1. **User selects environment** from dropdown in UI
2. **Frontend sends** `targetEnvironment` with the deployment request
3. **Backend reads** `data/environments.json` to find the environment details
4. **Backend authenticates** using the credentials from `.env.local`
5. **Deployment proceeds** to the selected environment URL

**Note**: Your app registration needs API permissions for all environments you want to test against. See [Azure Multi-Environment Guide](./AZURE-MULTI-ENVIRONMENT.md) for complete setup.

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
1. Deploy to Azure first (creates App Registration):
   ```powershell
   # Configure environments first
   Copy-Item data/environments.example.json data/environments.json
   # Edit data/environments.json with your Dataverse environments
   
   # Run setup
   .\scripts\setup-secretless.ps1 -EnvironmentSuffix "dev" -Unattended
   ```
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

**Without Auth (default)**: Loads immediately  
**With Auth (optional)**: Redirects to Microsoft login first

## Advanced: Testing with Dev Proxy (Optional)

Want to test how your app handles API failures, rate limiting, and network issues? Use **Microsoft Dev Proxy**!

### What is Dev Proxy?

Dev Proxy intercepts your API calls to Dataverse and simulates:
- ❌ **API Failures** (503, 500 errors)
- ⏱️ **Rate Limiting** (429 Too Many Requests)
- 🔄 **Mock Responses** (offline development)

**No code changes needed** - it works as a network proxy!

### Quick Setup

**1. Install Dev Proxy:**
```powershell
winget install Microsoft.DevProxy
```

**🔐 First-Time Certificate Setup:**

The first time you run Dev Proxy, you'll be prompted for administrator password to install a trusted root certificate. This is required to intercept HTTPS traffic securely.

**Click "Yes"** when prompted - this is a one-time setup and the certificate is only used for local development.

**2. Choose Your Method:**

#### Option A: npm Scripts (Easiest! ⚡)

Just run one command - everything is automated:

```powershell
# Test API error handling (50% failure rate)
npm run dev:proxy

# Offline development with mocks (no Dataverse needed)
npm run dev:mock

# Test rate limiting
npm run dev:proxy:ratelimit


```

These scripts automatically:
- Start Dev Proxy with the right config
- Start your dev server
- Clean up on exit (Ctrl+C stops both)

#### Option B: PowerShell Wrapper (More Control)

Interactive menu with these testing scenarios:

```powershell
# Run interactive menu
.\devproxy\start-with-devproxy.ps1

# Or specify mode directly:
.\devproxy\start-with-devproxy.ps1 -Mode errors -FailureRate 75
.\devproxy\start-with-devproxy.ps1 -Mode mocks
.\devproxy\start-with-devproxy.ps1 -Mode ratelimit

```

#### Option C: VS Code Tasks (One-Click)

Press `Ctrl+Shift+P` → "Tasks: Run Task" → Select:
- **Dev Proxy: Error Simulation** - Test API failures
- **Dev Proxy: Rate Limiting** - Test 429 responses
- **Dev Proxy: Mock Mode** - Offline development


#### Option D: Manual (Two Terminals)

```powershell
# Terminal 1: Start Dev Proxy
devproxy --config-file devproxy/devproxyrc.json

# Terminal 2: Start your app
npm run dev
```

### Common Testing Scenarios

**1. Test API Error Handling:**
```powershell
# Using npm (recommended)
npm run dev:proxy

# Upload an ERD and deploy
# Verify your app shows helpful error messages
```

**2. Test Rate Limiting:**
```powershell
# Using npm
npm run dev:proxy:ratelimit

# Deploy a large ERD (50+ entities)
# Watch how your app handles 429 responses
```


**3. Offline Development (No Dataverse Needed):**
```powershell
# Using npm
npm run dev:mock

# Now you can develop without:
# - VPN connection
# - Dataverse environment
# - Internet access
# Perfect for airplane coding! ✈️
```

**5. Custom Failure Rate:**
```powershell
# Using PowerShell wrapper
.\devproxy\start-with-devproxy.ps1 -Mode errors -FailureRate 75

# 75% of API calls will fail
# Test how your app handles extreme conditions
```

### Configuration Files

All Dev Proxy configs are in `devproxy/` folder:
- **`devproxyrc.json`** - Error simulation (default)
- **`devproxyrc-mocks.json`** - Mock mode for offline dev
- **`devproxyrc-ratelimit.json`** - Rate limiting simulation
- **`dataverse-errors.json`** - Define error responses
- **`dataverse-mocks.json`** - Mock Dataverse responses
- **`README.md`** - Detailed usage guide

### VS Code Integration

Pre-configured tasks in `.vscode/tasks.json` for easy testing:

**Available Tasks:**
1. Dev Proxy: Error Simulation
2. Dev Proxy: Rate Limiting
3. Dev Proxy: Mock Mode
4. Dev Proxy: Slow API

**Usage:**
- Press `Ctrl+Shift+B` to see all tasks
- Select a task to start
- Press `Ctrl+C` to stop

### Benefits

**Find bugs before production** - Test failure scenarios you can't easily reproduce  
**Faster development** - Use mocks instead of waiting for real API calls  
**Work offline** - No Dataverse needed during initial development  
**Better error handling** - Verify your error messages help users  
**Production confidence** - Know your app handles edge cases  
**Easy to use** - Just run `npm run dev:proxy` and you're testing!  

### Learn More

- [Dev Proxy Testing Guide](./DEV-PROXY-TESTING.md) - Complete testing documentation
- [Testing Scenarios Guide](./TESTING-SCENARIOS.md) - Detailed workflows
- [Microsoft Dev Proxy Documentation](https://learn.microsoft.com/en-us/microsoft-cloud/dev/dev-proxy/overview)

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
| **Authentication** | ❌ Disabled | Azure AD Required |
| **Dataverse** | 🔄 Optional (mock or real) | Required |
| **Hot Reload** | Yes | ❌ No |
| **Debugging** | 🔍 Full (breakpoints, logs) | 📝 Limited (logs only) |
| **Cost** | 💰 Free | 💰 ~$20-50/month |
| **Secrets** | ⚠️ Client secrets OK | Managed Identity (no secrets!) |

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
- Final validation before release

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
# Step 1: Configure environments
Copy-Item data/environments.example.json data/environments.json
# Edit data/environments.json

# Step 2: First time setup
.\scripts\setup-secretless.ps1 -EnvironmentSuffix "prod" -Unattended

# Step 3: Deploy code updates
.\scripts\deploy-secretless.ps1 -EnvironmentSuffix "prod"
```

## Next Steps

- **Build Features**: Start coding! No setup needed.
- **Deploy to Azure**: See [DEPLOYMENT.md](./DEPLOYMENT.md) for production deployment
- **Add Authentication**: See [Advanced: Testing with Azure AD](#advanced-testing-with-azure-ad-authentication-optional) above

**Happy coding!** 🎉
