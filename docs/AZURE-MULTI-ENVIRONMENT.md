# Azure Multi-Environment Deployment Guide

## Overview

This document explains how the multi-environment feature works in Azure App Service and what's needed for successful deployment.

## Architecture

### Local Development
- **Authentication**: Client Secret (stored in `.env` or `.env.local`)
- **Environment Config**: `data/environments.json` (loaded at runtime)
- **Environment Selection**: User selects from dropdown in UI

### Azure App Service
- **Authentication**: User-Assigned Managed Identity + Federated Credentials
- **Environment Config**: `data/environments.json` (included in deployment package)
- **Environment Selection**: User selects from dropdown in UI
- **No Secrets Required**: Managed identity handles authentication automatically

## What Gets Deployed

The `deploy-secretless.ps1` script packages these files:

```
deploy.zip
├── server.js                    # Entry point (sets AUTH_MODE=managed_identity)
├── package.json                 # Dependencies
├── backend/                     # Backend code
│   ├── server.js
│   ├── dataverse-client.js     # Handles 3 auth modes
│   ├── environment-manager.js  # Reads data/environments.json
│   └── ... (all backend files)
├── data/                        # ✅ NOW INCLUDED
│   └── environments.json       # Multi-environment configuration
├── shared/                      # Shared utilities
└── public/                      # Frontend build (from src/frontend/dist)
```

## Authentication Flow

### DataverseClient Authentication Modes

The `dataverse-client.js` supports 3 authentication modes:

1. **Client Secret** (Local Development)
   ```javascript
   useClientSecret: true
   clientId: from .env
   clientSecret: from .env
   tenantId: from .env
   ```

2. **Managed Identity Only** (Azure IMDS)
   ```javascript
   useManagedIdentity: true
   // Gets token from: http://169.254.169.254/metadata/identity/oauth2/token
   ```

3. **Managed Identity + Federated Credentials** (Azure App Service - **THIS IS WHAT WE USE**)
   ```javascript
   useManagedIdentity: true
   useFederatedCredential: true
   // Two-step process:
   // 1. Get Azure token from App Service managed identity endpoint
   // 2. Exchange for Dataverse token using federated credentials
   ```

### How Environment Selection Works

When user selects an environment from dropdown:

```
User selects "test-princess" in UI
  ↓
Frontend sends: { targetEnvironment: "test-princess", ... }
  ↓
Backend deployment-service.js:
  - Reads data/environments.json
  - Finds environment by name
  - Creates dataverseConfig with URL override:
    {
      dataverseUrl: "https://org32dda8c3.crm4.dynamics.com",
      useManagedIdentity: true,
      useFederatedCredential: true
    }
  ↓
DataverseClient:
  - Uses provided dataverseUrl (test-princess)
  - Authenticates via managed identity + FIC
  - Gets token for THAT specific environment
  ↓
Deployment proceeds to selected environment
```

## Prerequisites for Azure Deployment

### 1. Managed Identity Setup

The managed identity (service principal) must have **application users** in **ALL environments**:

```powershell
# Run this for each environment
.\scripts\setup-dataverse-user.ps1 `
  -DataverseUrl "https://orgXXXXXXXX.crm4.dynamics.com" `
  -ServicePrincipalId "c834e8fa-acbd-4fa4-8a0d-d6c832d0f4ab" `
  -SecurityRole "System Administrator"
```

**Required Settings:**
- `accessmode`: 4 (Non-interactive)
- Security Role: System Administrator (or appropriate role)
- User status: Enabled

### 2. Federated Identity Credentials

The app registration must have federated credentials configured for the App Service:

```powershell
# This is set up by setup-secretless.ps1
az ad app federated-credential create `
  --id <APP_OBJECT_ID> `
  --parameters '{
    "name": "app-mermaid-princess-fic",
    "issuer": "https://login.microsoftonline.com/<TENANT_ID>/v2.0",
    "subject": "api://AzureADTokenExchange",
    "audiences": ["api://AzureADTokenExchange"]
  }'
```

### 3. Azure App Service Configuration

**Managed Identity:**
```bicep
identity: {
  type: 'UserAssigned'
  userAssignedIdentities: {
    '${managedIdentity.id}': {}
  }
}
```

**Application Settings:**
```bicep
appSettings: [
  {
    name: 'NODE_ENV'
    value: 'production'
  }
  // No DATAVERSE_URL needed! Comes from environments.json + user selection
]
```

**Environment Variables (Auto-Set by App Service):**
- `IDENTITY_ENDPOINT`: Managed identity endpoint
- `IDENTITY_HEADER`: Authentication header for managed identity

## Key Concepts

### Why No DATAVERSE_URL in App Settings?

Unlike single-environment deployments, multi-environment support means the target URL is **dynamic based on user selection**:

1. User selects environment in UI
2. Frontend sends `targetEnvironment` name
3. Backend looks up URL in `data/environments.json`
4. Backend creates client with that specific URL
5. Managed identity authenticates to THAT environment

### Why Managed Identity Works for Multiple Environments?

The managed identity (service principal) is **organization-wide**, not environment-specific. As long as it has application users in each environment, it can authenticate to all of them.

### Why Include environments.json in Deployment?

The file contains:
- Environment names 
- Environment URLs 
- Environment metadata (colors, owners, purposes)
- Deployment settings (resource naming patterns)

This allows the app to dynamically connect to any configured environment without code changes.

## Related Documentation

- [Local Development Guide](LOCAL-DEVELOPMENT.md)
- [Deployment Guide](DEPLOYMENT.md)
- [Developer Architecture](DEVELOPER_ARCHITECTURE.md)
- [Testing Scenarios](TESTING-SCENARIOS.md)
