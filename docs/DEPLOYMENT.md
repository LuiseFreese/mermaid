# Deployment Guide - Azure Production Deployment

This guide explains how to deploy the Mermaid to Dataverse Converter to Azure for production use with enterprise-grade security.

> **Note**: For local development setup, see [Local Development Guide](./LOCAL-DEVELOPMENT.md)
> 
> **Multi-Environment Support**: This application supports deploying to multiple Dataverse environments (dev/test/prod). See [Azure Multi-Environment Guide](./AZURE-MULTI-ENVIRONMENT.md) for details.

## Table of Contents

1. [Quick Start - Azure Deployment](#quick-start---azure-deployment)
2. [Multi-Environment Support](#multi-environment-support)
3. [Prerequisites](#prerequisites)
4. [Security Architecture](#security-architecture)
5. [Deployment Process](#deployment-process)
6. [Authentication & Authorization](#authentication--authorization)
7. [Post-Deployment Configuration](#post-deployment-configuration)
8. [Troubleshooting](#troubleshooting)

## Quick Start - Azure Deployment

**Three steps to deploy everything:**

```powershell
# Clone the repository
git clone https://github.com/LuiseFreese/mermaid.git
cd mermaid

# Step 1: Configure your environments (REQUIRED)
Copy-Item data/environments.example.json data/environments.json
# Edit data/environments.json with your Dataverse environment(s)

# Step 2: Create Azure infrastructure and identity setup
.\scripts\setup-secretless.ps1 -EnvironmentSuffix "prod" -Unattended

# Step 3: Deploy the application code
.\scripts\deploy-secretless.ps1 -EnvironmentSuffix "prod"
```

**The setup script will:**
- **Validate that `data/environments.json` exists** (required!)
- Create Backend App Registration with federated credentials (linked to managed identity)
- Create Frontend App Registration with Microsoft Entra authentication for user sign-in
- Deploy Azure infrastructure (App Service, Managed Identity, etc.)
- Configure secure managed identity authentication for backend
- **Automatically create Application Users in ALL configured environments** from `data/environments.json`
- Assign System Customizer security role to all Application Users (grants table access)
- Enable Azure App Service authentication for frontend protection
- Configure SPA platform for frontend authentication (MSAL integration)

**The deployment script will:**
- Build the React frontend locally using Vite
- Package backend files and **multi-environment configuration** (`data/environments.json`)
- Deploy to Azure App Service with proper static file serving
- Configure runtime settings for optimal performance
- Enable deployment history tracking with Power Platform integration
- Inject Azure AD authentication configuration into frontend build

## Multi-Environment Support

The application supports deploying to multiple Dataverse environments from a single Azure deployment. Users can select the target environment at deployment time.

### How It Works

1. **Environment Configuration**: `data/environments.json` contains all configured environments
2. **User Selection**: Environment dropdown in the Solution Setup wizard step
3. **Dynamic Routing**: Backend routes deployments to the selected environment
4. **Managed Identity**: Single managed identity with application users in each environment

### Quick Setup for Multiple Environments

```powershell
# Configure all environments in config/environments.json
# Then run setup to create application users in each environment
.\scripts\setup-from-config.ps1
```

**Key Features:**
- Select target environment from dropdown (dev/test/prod)
- Single Azure deployment serves all environments
- No secrets needed - managed identity authenticates to all environments
- **Environment-specific deployment tracking** with colored badges
- **Multi-environment rollback** - safely undo deployments from any environment
- Easy to add new environments - just update configuration

**Deployment History & Rollback:**
- View deployment history filtered by environment (Dev/Test/Prod)
- Each deployment shows colored environment badge for easy identification
- Rollback feature automatically targets the correct environment
- Environment-specific deployment history stored separately
- "All Environments" view merges history from all configured environments

For complete details, see [Azure Multi-Environment Guide](./AZURE-MULTI-ENVIRONMENT.md) and [Usage Guide](./USAGE-GUIDE.md#deployment-history--multi-environment-management).
- Configure authentication middleware for API protection

## Local Development Setup

**For local development with real Dataverse authentication:**

```powershell
# Clone the repository
git clone https://github.com/LuiseFreese/mermaid.git
cd mermaid

# Step 1: Create App Registration and Dataverse Application User
.\scripts\setup-local-dataverse-user.ps1

# Step 2: Start development servers
.\scripts\dev-local.ps1
```

**The local setup process will:**
- Create App Registration with a client secret (if needed)
- Set up Dataverse Application User with a System Customizer role
- Generate `.env.local` file with authentication configuration
- Configure local environment for development

**The dev script will:**
- Load environment variables from `.env.local`
- Start a backend server with real Dataverse authentication
- Start a frontend development server with hot reload
- Enable API proxy for seamless development
=======
- Configure authentication middleware for API protection
>>>>>>> feature/github-pages-docs

## Prerequisites

1. **Azure subscription** with permissions to create resources
2. **PowerShell 7+** (recommended) or Windows PowerShell 5.1
3. **Azure CLI** installed and logged in (`az login`)
4. **Node.js 18+** (required for local frontend build)
5. **Access to Dataverse environment** where you want to create entities
6. **Appropriate permissions**:
   - **Azure**: Contributor or Owner on subscription
   - **Microsoft Entra ID**: Application Administrator (to create app registrations)
   - **Dataverse**: System Administrator (to create application users and assign System Customizer role)

## Security Architecture

The deployment implements **defense-in-depth** with multiple layers of security:

### 1. Frontend Protection - Azure App Service Authentication

**User Sign-In with Microsoft Entra:**
- Users must sign in with their Microsoft Entra (Azure AD) account to access the application
- Azure App Service Easy Auth provides automatic authentication
- JWT tokens are issued to authenticated users
- No anonymous access to the application

> Learn more: [Azure App Service Authentication and Authorization](https://learn.microsoft.com/en-us/azure/app-service/overview-authentication-authorization)

**Configuration:**
```json
{
  "platform": {
    "enabled": true
  },
  "globalValidation": {
    "requireAuthentication": true,
    "unauthenticatedClientAction": "RedirectToLoginPage"
  },
  "identityProviders": {
    "azureActiveDirectory": {
      "enabled": true,
      "registration": {
        "clientId": "your-frontend-app-id"
      }
    }
  }
}
```

**Key point**: No client secret needed! Azure App Service Easy Auth handles authentication without storing secrets.

### 2. Backend Protection - JWT Token Validation

**API Endpoint Security:**
- All API endpoints require valid JWT tokens from authenticated users
- JWT middleware validates tokens on every request
- Token validation includes:
  - Signature verification
  - Expiration check
  - Issuer validation
  - Audience validation

**Protected Endpoints:**
```javascript
// Authentication middleware on all API routes
app.use('/api/*', authenticateToken);
app.use('/upload', authenticateToken);
app.use('/wizard', authenticateToken);
```

**JWT Token Flow:**
1. User signs in via Azure App Service authentication
2. Azure issues JWT token to the user
3. Frontend sends JWT token with every API request (via `X-MS-TOKEN-AAD-ACCESS-TOKEN` header)
4. Backend validates JWT token before processing request
5. Invalid or missing tokens receive 401 Unauthorized response

### 3. Backend-to-Dataverse - Managed Identity

**Passwordless Authentication:**
- Backend uses User-Assigned Managed Identity for Dataverse access
- Federated credentials enable secure token exchange with backend App Registration
- Backend App Registration linked to Dataverse Application User
- Access to tables controlled by System Customizer security role (not API permissions)
- Automatic token refresh and management

**Token Flow:**
1. Backend requests token from Azure Managed Identity endpoint
2. Managed Identity exchanges federated credential for Dataverse token
3. Backend calls Dataverse API with access token
4. Dataverse validates token and maps to Application User
5. Security role (System Customizer) determines what tables/operations are allowed


## Deployment Process

### Step 1: Infrastructure Setup

The setup script creates all necessary Azure resources and configures authentication:

```powershell
# Interactive mode (prompts for configuration if needed)
.\scripts\setup-secretless.ps1 -EnvironmentSuffix "prod"

# OR unattended mode (CI/CD friendly)
.\scripts\setup-secretless.ps1 -EnvironmentSuffix "prod" -Unattended
```

**Prerequisites:**
- `data/environments.json` must be configured with your Dataverse environments BEFORE running setup
- The script will validate this file exists and contains valid environment configurations
- See `data/environments.example.json` for the required format

**What gets created:**
1. **Frontend App Registration** - For user sign-in with Microsoft Entra
   - Configured for web application authentication
   - Redirect URIs set for your App Service
   - Integrated with Azure App Service Easy Auth (no client secret needed)

2. **Backend App Registration** - For Dataverse authentication
   - Configured with federated credentials (passwordless)
   - Linked to managed identity for token exchange
   - No API permissions needed (access controlled by Dataverse Application User security role)

3. **Azure Resources**:
   - Resource Group
   - App Service + App Service Plan (Linux, Node.js 20)
   - User-Assigned Managed Identity

4. **Dataverse Configuration** (for ALL environments in `data/environments.json`):
   - Application Users created (one per environment, linked to backend App Registration)
   - System Customizer security role assigned to each Application User
   - Security role determines what tables and operations are allowed

5. **App Service Authentication**:
   - Azure App Service Easy Auth configured
   - Microsoft Entra identity provider enabled
   - Requires authentication for all requests

### Step 2: Application Deployment

Deploy your application code to the configured infrastructure:

```powershell
# Deploy code to existing infrastructure
.\scripts\deploy-secretless.ps1 -EnvironmentSuffix "prod"
```

**Deployment steps:**
1. **Build Frontend**: Vite builds React app for production
2. **Package Backend**: Excludes node_modules and source files
3. **Package Configuration**: Includes `data/environments.json` for multi-environment routing
4. **Deploy to App Service**: Uses Azure CLI with ZIP deploy
5. **Configure Settings**: Updates App Service configuration
6. **Validate**: Tests endpoints and authentication



## Authentication & Authorization

### Frontend Authentication Flow

```mermaid
sequenceDiagram
    participant User
    participant Browser
    participant AppService as App Service
    participant Entra as Microsoft Entra
    participant Backend
    
    User->>Browser: Access application
    Browser->>AppService: HTTP Request
    AppService->>AppService: Check authentication
    AppService->>Entra: Redirect to sign-in
    User->>Entra: Enter credentials
    Entra->>AppService: Return JWT token
    AppService->>Browser: Set authentication cookie
    Browser->>Backend: API Request + JWT token
    Backend->>Backend: Validate JWT
    Backend->>Browser: API Response
```

### Backend Authentication Flow

```mermaid
sequenceDiagram
    participant Frontend
    participant Backend
    participant ManagedId as Managed Identity
    participant Entra as Microsoft Entra
    participant Dataverse
    
    Frontend->>Backend: API Request + User JWT
    Backend->>Backend: Validate User JWT
    Backend->>ManagedId: Request Dataverse token
    ManagedId->>Entra: Exchange federated credential
    Entra->>ManagedId: Return Dataverse token
    Backend->>Dataverse: API Call + Dataverse token
    Dataverse->>Backend: API Response
    Backend->>Frontend: Return data
```

### Authentication Middleware

The backend implements three levels of authentication:

**1. Token Validation (authenticateToken)**
```javascript
// Validates JWT token on every request
// Extracts user information from token
// Attaches user to request object
```

**2. Optional Authentication (optionalAuth)**
```javascript
// Allows both authenticated and anonymous requests
// Used for health checks and public endpoints
// Still validates token if present
```

**3. Role-Based Authorization (requireRole)**
```javascript
// Requires specific roles for access
// Returns 403 Forbidden if role not present
// Supports multiple role requirements
```

### Token Headers

The application uses standard Azure App Service authentication headers:

```http
X-MS-TOKEN-AAD-ACCESS-TOKEN: <user-jwt-token>
X-MS-CLIENT-PRINCIPAL-ID: <user-object-id>
X-MS-CLIENT-PRINCIPAL-NAME: <user-email>
```

## Post-Deployment Configuration

### Configure Allowed Users

By default, any user in your Azure tenant can sign in. To restrict access:

**Option 1: App Registration (Recommended)**
1. Go to Azure Portal → App Registrations
2. Select your frontend App Registration
3. Go to "Enterprise applications" → "Properties"
4. Set "User assignment required?" to **Yes**
5. Go to "Users and groups"
6. Add specific users or groups

**Option 2: App Service Access Restrictions**
1. Go to Azure Portal → App Service
2. Navigate to "Authentication" → "Microsoft"
3. Configure "Allowed token audiences"
4. Add specific user groups

### Enable Deployment History

💡 Only in case you did not provide the Power Platform Environment ID during deployment: 


1. **Find your Environment ID**:
   - Go to [make.powerapps.com](https://make.powerapps.com)
   - Click settings gear → "Session details"
   - Copy the "Environment ID"

2. **Add to App Service Configuration**:
   ```powershell
   az webapp config appsettings set `
     --name "app-mermaid-dv-we-{suffix}" `
     --resource-group "rg-mermaid-dv-we-{suffix}" `
     --settings POWER_PLATFORM_ENVIRONMENT_ID="your-environment-id"
   ```

### View Deployment History & Rollback

After deploying solutions, users can:

1. **View Deployment History**:
   - Click "View History" button in the application
   - Filter by environment (All/Dev/Test/Prod)
   - See colored environment badges on each deployment
   - View deployment details including entities, relationships, and status

2. **Rollback Deployments**:
   - Select a deployment with "success" or "partial" status
   - Click "Rollback" button
   - Rollback automatically targets the correct environment
   - Monitor real-time progress as components are removed
   - Deployment history updates to show rollback status

**Multi-Environment Features**:
- Each environment maintains separate deployment history
- Rollback operations are environment-aware
- "All Environments" view merges history from all environments
- Environment badges provide visual confirmation of target environment

For user instructions, see [Usage Guide - Deployment History](./USAGE-GUIDE.md#deployment-history--multi-environment-management).


## Updating the Application

### Deploy Code Changes

After making code changes, deploy updates:

```powershell
# Rebuild and redeploy
.\scripts\deploy-secretless.ps1 -EnvironmentSuffix "prod"
```

**The deployment is idempotent:**
- Safe to run multiple times
- Only updates application code
- Preserves configuration and environment settings
- No downtime during deployment

### Update Environment Configuration

If you need to add or modify Dataverse environments after initial setup:

```powershell
# Step 1: Edit data/environments.json with new environments

# Step 2: Add application users to new environments
.\scripts\add-app-user-to-all-envs.ps1 -AppRegistrationClientId "your-backend-app-id"

# Step 3: Redeploy to include updated configuration
.\scripts\deploy-secretless.ps1 -EnvironmentSuffix "prod"
```

### Update Configuration

Update App Service settings without redeployment:

```powershell
# Update environment variables
az webapp config appsettings set `
  --name "app-mermaid-dv-we-{suffix}" `
  --resource-group "rg-mermaid-dv-we-{suffix}" `
  --settings LOG_LEVEL="debug"
```

### Rotate Credentials

**No secrets to rotate!** This deployment is completely passwordless:
- **Frontend authentication**: Handled by Azure App Service Easy Auth (no client secrets)
- **Backend-to-Dataverse authentication**: Uses managed identity with federated credentials (no secrets)

The only credentials that exist are Azure-managed and rotate automatically.

## Troubleshooting

### Authentication Issues

**Problem: "401 Unauthorized" when accessing the application**
- **Cause**: Azure App Service authentication not configured correctly
- **Solution**:
  ```powershell
  # Check authentication configuration
  az webapp auth show `
    --name "app-mermaid-dv-we-{suffix}" `
    --resource-group "rg-mermaid-dv-we-{suffix}"
  
  # Verify App Registration exists and has correct redirect URIs
  az ad app show --id "your-frontend-app-id"
  ```

**Problem: "Invalid JWT token" in backend logs**
- **Cause**: Token validation failing
- **Solution**: Check that the JWT token headers are being sent correctly and the token hasn't expired

**Problem: Users can't sign in**
- **Cause**: App Registration not configured for user assignment
- **Solution**: Go to Enterprise Application → Properties → Set "User assignment required" and add users

### Deployment Issues

**Problem: Build fails during deployment**
- **Cause**: Node.js version mismatch or missing dependencies
- **Solution**:
  ```powershell
  # Ensure Node.js 18+ is installed locally
  node --version
  
  # Clean and reinstall dependencies
  Remove-Item -Path "node_modules" -Recurse -Force
  npm install
  
  # Try deployment again
  .\scripts\deploy-secretless.ps1 -EnvironmentSuffix "myapp"
  ```

**Problem: "Managed Identity not found"**
- **Cause**: Infrastructure setup didn't complete successfully
- **Solution**:
  ```powershell
  # Verify data/environments.json exists and is valid
  Get-Content data/environments.json | ConvertFrom-Json
  
  # Re-run infrastructure setup
  .\scripts\setup-secretless.ps1 -EnvironmentSuffix "prod" -Unattended
  ```

### Dataverse Issues

**Problem: "Application User not found" in Dataverse calls**
- **Cause**: Application User not created or not linked correctly
- **Solution**:
  ```powershell
  # Verify Application User exists in Power Platform Admin Center
  # Go to Environments → Your Environment → Settings → Users + permissions → Application users
  
  # Check which environments are configured
  Get-Content data/environments.json | ConvertFrom-Json | Select-Object -ExpandProperty environments
  
  # Add application users to all configured environments
  .\scripts\add-app-user-to-all-envs.ps1 -AppRegistrationClientId "your-backend-app-id"
  ```

**Problem: "Insufficient permissions" when creating tables**
- **Cause**: Application User doesn't have System Customizer role in the target environment
- **Solution**: In Power Platform Admin Center, verify the Application User has System Customizer role assigned in each environment

**Problem: "Environment not found in configuration"**
- **Cause**: Selected environment isn't in `data/environments.json`
- **Solution**:
  ```powershell
  # Add the environment to data/environments.json
  # Then add application user for the new environment
  .\scripts\add-app-user-to-all-envs.ps1 -AppRegistrationClientId "your-backend-app-id"
  
  # Redeploy to include updated configuration
  .\scripts\deploy-secretless.ps1 -EnvironmentSuffix "prod"
  ```

### Monitoring and Diagnostics

**Enable detailed logging:**
```powershell
az webapp config appsettings set `
  --name "app-mermaid-dv-we-{suffix}" `
  --resource-group "rg-mermaid-dv-we-{suffix}" `
  --settings LOG_LEVEL="debug" LOG_REQUEST_BODY="true"
```

**View application logs:**
```powershell
# Stream logs in real-time
az webapp log tail `
  --name "app-mermaid-dv-we-{suffix}" `
  --resource-group "rg-mermaid-dv-we-{suffix}"

# Download logs
az webapp log download `
  --name "app-mermaid-dv-we-{suffix}" `
  --resource-group "rg-mermaid-dv-we-{suffix}" `
  --log-file "app-logs.zip"
```

## Security Best Practices

1. **No Secrets to Manage**: This deployment is completely passwordless - both frontend and backend use managed authentication
2. **Monitor Authentication**: Use Application Insights to track authentication failures
3. **Restrict User Access**: Only assign access to users who need it
4. **Enable Audit Logging**: Track who deploys what and when
5. **Keep Dependencies Updated**: Regularly update npm packages for security patches
6. **Review Access Control**: Periodically review user assignments and roles

## Related Documentation

- [Local Development Guide](./LOCAL-DEVELOPMENT.md) - Set up local development environment
- [Architecture Guide](./DEVELOPER_ARCHITECTURE.md) - Understanding the system design
- [Testing Guide](./TESTING.md) - Running and writing tests

## Getting Help

If you encounter issues not covered here:

1. **Check the logs**: Azure App Service logs contain detailed error messages
2. **Verify prerequisites**: Ensure all required tools and permissions are available
3. **Review security configuration**: Check both frontend and backend authentication settings
4. **Test authentication flow**: Use browser dev tools to inspect JWT tokens
5. **Consult documentation**: Review related documentation for specific features


