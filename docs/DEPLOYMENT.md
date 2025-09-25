# Deployment Guide - Mermaid to Dataverse Converter

This guide explains how to deploy and use the Mermaid-to-Dataverse application. Choose between **Azure deployment** with managed identity or **local development** with client secret authentication.

## Table of Contents

1. [Quick Start - Azure Deployment (Recommended)](#quick-start-azure-deployment-recommended)
2. [Local Development Setup](#local-development-setup)
3. [Prerequisites](#prerequisites)
4. [Azure Deployment Process](#azure-deployment-process)
5. [Local Development Process](#local-development-process)

## Quick Start - Azure Deployment (Recommended)

**Two steps to deploy everything:**

```powershell
# Clone the repository
git clone https://github.com/LuiseFreese/mermaid.git
cd mermaid

# Step 1: Create Azure infrastructure and identity setup
.\scripts\setup-secretless.ps1 -EnvironmentSuffix "myapp" -DataverseUrl "https://your-org.crm.dynamics.com" -Unattended

# Step 2: Deploy the application code
.\scripts\deploy-secretless.ps1 -EnvironmentSuffix "myapp"
```

**The setup script will:**
- Create App Registration with federated credentials
- Deploy Azure infrastructure (App Service, Managed Identity, etc.)
- Configure secure managed identity authentication
- Set up Dataverse application user with proper permissions

**The deploy script will:**
- Build the React frontend locally using Vite
- Package only necessary backend files (no node_modules)
- Deploy to Azure App Service with proper static file serving
- Configure runtime settings for optimal performance

## Local Development Setup

**For local development with real Dataverse authentication:**

```powershell
# Clone the repository
git clone https://github.com/LuiseFreese/mermaid.git
cd mermaid

# Step 1: Create App Registration and local environment
.\scripts\setup-local-dev.ps1 -DataverseUrl "https://your-org.crm.dynamics.com"

# Step 2: Start development servers
.\scripts\dev-local.ps1
```

**The local setup script will:**
- Create App Registration with client secret
- Set up Dataverse application user with proper permissions
- Generate `.env.local` file with authentication configuration
- Configure local environment for development

**The dev script will:**
- Start backend server with real Dataverse authentication
- Start frontend development server with hot reload
- Enable API proxy for seamless development

## Prerequisites

### For Azure Deployment:

1. **Azure subscription** with permissions to create resources
2. **PowerShell 7+** (recommended) or Windows PowerShell 5.1
3. **Azure CLI** installed and logged in (`az login`)
4. **Node.js 18+** (required for local frontend build)
5. **Access to Dataverse environment** where you want to create entities
6. **Appropriate permissions**:
   - **Azure**: Contributor or Owner on subscription
   - **Microsoft Entra ID**: Application Administrator (to create app registrations)
   - **Dataverse**: System Administrator (to create application users and assign System Customizer role)

### For Local Development:

1. **PowerShell 7+** (recommended) or Windows PowerShell 5.1
2. **Azure CLI** installed and logged in (`az login`)
3. **Node.js 18+** (required for both frontend and backend)
4. **Access to Dataverse environment** where you want to test
5. **Appropriate permissions**:
   - **Microsoft Entra ID**: Application Administrator (to create app registrations)
   - **Dataverse**: System Administrator (to create application users and assign roles)

## Azure Deployment Process

### Step 1: Infrastructure Setup
```powershell
# Interactive mode (prompts for configuration)
.\scripts\setup-secretless.ps1

# OR unattended mode (provide all parameters)
.\scripts\setup-secretless.ps1 -Unattended `
  -EnvironmentSuffix "myapp" `
  -DataverseUrl "https://orgXXXXX.crm4.dynamics.com"
```

### Step 2: Application Deployment
```powershell
# Deploy the application code to existing infrastructure
.\scripts\deploy-secretless.ps1 -EnvironmentSuffix "myapp"
```

## Local Development Process

### Step 1: Local Environment Setup
```powershell
# Interactive mode (prompts for Dataverse URL)
.\scripts\setup-local-dev.ps1

# OR provide Dataverse URL directly
.\scripts\setup-local-dev.ps1 -DataverseUrl "https://orgXXXXX.crm4.dynamics.com"
```

**This script will:**
- Create a new App Registration with client secret
- Generate a `.env.local` file with authentication configuration
- Create a Dataverse Application User with System Customizer role
- Configure the local environment for development

### Step 2: Start Development Servers
```powershell
# Start both backend and frontend servers
.\scripts\dev-local.ps1
```

**This script will:**
- Start the backend server on port 8080 with real Dataverse authentication
- Start the frontend development server on port 3003 (or next available port)
- Configure API proxy for seamless development experience
- Enable hot reload for both frontend and backend changes

### Local Development Features

**Backend Server (Port 8080):**
- Real Dataverse authentication using client secret
- All API endpoints available (`/api/*`)
- File upload handling (`/upload`)
- Deployment history tracking
- Full entity management capabilities

**Frontend Server (Port 3003+):**
- React development server with hot reload
- Vite-powered fast refresh
- API proxy to backend server
- All frontend routes working (wizard, deployment history)
- Theme switching and responsive design

### Manual Setup (Alternative)

If you prefer manual setup or need to troubleshoot:

```powershell
# 1. Create App Registration manually
.\scripts\create-local-dev-app.ps1 -DataverseUrl "https://your-org.crm.dynamics.com"

# 2. Set up Dataverse Application User
.\scripts\setup-dataverse-user.ps1 -AppId "your-app-id" -ServicePrincipalId "your-sp-id" -DataverseUrl "https://your-org.crm.dynamics.com"

# 3. Create .env.local file manually with:
# CLIENT_ID=your-app-id
# CLIENT_SECRET=your-client-secret
# DATAVERSE_URL=https://your-org.crm.dynamics.com

# 4. Start development servers
.\scripts\dev-local.ps1
```

## What Gets Deployed

The setup script automatically creates:

- **Azure Resource Group** - Container for all resources
- **App Service & App Service Plan** - Web application hosting (Linux, Node.js 20)
- **User-Assigned Managed Identity** - Secure authentication with federated credentials
- **Entra ID App Registration** - Service principal for Dataverse access
- **Dataverse Application User** - Configured with appropriate security roles

## Local Development vs Azure Deployment

| Feature | Local Development | Azure Deployment |
|---------|------------------|-----------------|
| **Authentication** | Client Secret | Managed Identity (Federated Credentials) |
| **App Registration** | Separate for local dev | Shared with Azure resources |
| **Frontend Server** | Vite dev server (port 3003+) | Served by backend (port 443/80) |
| **Backend Server** | Node.js dev server (port 8080) | Azure App Service |
| **Hot Reload** | ✅ Full hot reload | ❌ Requires redeployment |
| **Environment** | `.env.local` file | App Service settings |
| **Security** | Client secret (development only) | Passwordless (production-ready) |
| **Setup Time** | ~2 minutes | ~5-10 minutes |
| **Cost** | Free (local) | Azure resources cost |
| **Use Case** | Development & testing | Production deployment |

### When to Use Local Development:
- 🔧 **Development**: Building and testing new features
- 🐛 **Debugging**: Troubleshooting issues with full logging
- 🚀 **Rapid iteration**: Quick changes with hot reload
- 📝 **Learning**: Understanding the application architecture

### When to Use Azure Deployment:
- 🌐 **Production**: Live application for end users  
- 🏢 **Team sharing**: Multiple users accessing the same instance
- 🔐 **Security**: Enterprise-grade managed identity authentication
- 📊 **Performance**: Optimized for production workloads

## Automated Setup Process

The **setup script** (`scripts/setup-secretless.ps1`) creates the infrastructure:

1. **Creates App Registration** with proper configuration and federated credentials
2. **Deploys Infrastructure** using Bicep (Managed Identity, App Service)
3. **Configures federated credentials** for secure token exchange
4. **Stores configuration** in App Service application settings
5. **Creates Application User** in Dataverse via REST API
6. **Assigns Security Roles** (System Customizer by default)

The **deployment script** (`scripts/deploy-secretless.ps1`) handles the application:

1. **Builds React frontend** locally using Vite for optimal performance
2. **Packages backend code** (excludes node_modules and source files)
3. **Deploys to Azure App Service** using Azure CLI with proper static file configuration
4. **Configures runtime settings** for managed identity integration and static asset serving
5. **Validates deployment** by testing the application endpoints

### Security-First Deployment Approach

The deployment process uses a **security-first approach** with managed identity authentication:

- **No secrets required** - Managed identity provides passwordless authentication
- **Secure environment variables** - Configuration stored in App Service settings
- **Federated credentials** - Token exchange without storing secrets
- **Zero hardcoded secrets** - All authentication handled by Azure managed identity

### Interactive Setup Example

**Step 1: Infrastructure Setup**
```powershell
PS> .\scripts\setup-entra-app.ps1

Mermaid to Dataverse - Infrastructure Setup
===========================================

Find your Dataverse Environment URL at make.powerapps.com > Settings > Session details, copy the **Instance URL**

Dataverse Environment URL: https://orgxxxxxxx.crm4.dynamics.com
Resource Group Name: rg-mermaid-dv-we-test
Azure Region: westeurope
App Registration Name: Mermaid-Dataverse-Converter
App Service Name: app-mermaid-dv-we-5678

✅ App Registration created successfully
✅ Infrastructure deployed successfully  
✅ Managed identity configured
✅ Dataverse Application User created
✅ Security roles assigned

🎉 Infrastructure Setup Complete!
Next: Run the deploy script to deploy your application code.
```

**Step 2: Application Deployment**
```powershell
PS> .\scripts\deploy-secretless.ps1 -EnvironmentSuffix "5678"

Mermaid to Dataverse - Application Deployment
============================================

✅ Building React frontend with Vite...
✅ Packaging backend code...
✅ Deploying to Azure App Service...
✅ Configuring static file serving...
✅ Application deployed successfully!

🎉 Deployment Complete! Application ready at: 
   https://app-mermaid-dv-we-5678.azurewebsites.net/

🔒 Security Features:
   - Managed Identity for passwordless authentication
   - Federated credentials for secure token exchange
   - Zero secrets stored anywhere in the system
```

## Infrastructure as Code

All Azure resources are defined in `deploy/infrastructure.bicep`

## Security Architecture

The deployment uses **enterprise-grade security** with multiple layers of protection:

### Authentication & Authorization
- **User-Assigned Managed Identity**: Passwordless authentication for secure token access
- **Federated Credentials**: Secure token exchange without storing secrets
- **Entra ID App Registration**: Service principal configured for managed identity
- **Application User**: Dedicated Dataverse user with specific security roles

### Configuration Management
- **App Service Settings**: Configuration stored as environment variables
- **No secrets required**: All authentication handled through Azure managed identity
- **Zero hardcoded values**: Configuration managed through Azure portal or deployment scripts

### Deployment Security
- **Parameter-free deployment**: No secrets passed as command-line parameters
- **Azure CLI authentication**: Uses your existing Azure session for secure operations
- **Managed identity authentication**: All security handled through Azure identity services
- **Audit trail**: All operations logged through Azure Activity Log

### Runtime Security
- **Managed Identity authentication**: App uses managed identity for all external service access
- **Environment variables**: Configuration stored securely in App Service settings
- **HTTPS only**: All communication encrypted in transit
- **Network isolation**: App Service can be configured with VNet integration

## Deploying Code Updates

After the initial infrastructure setup, you can deploy code changes using the deploy script:

```powershell
# Deploy code updates to existing infrastructure
.\scripts\deploy-secretless.ps1 -EnvironmentSuffix "myapp"
```

This script will:
1. **Build React frontend** locally using Vite for optimal performance
2. **Package backend code** (excludes node_modules and source files for faster deployment)
3. **Deploy to Azure App Service** using Azure CLI with proper static file configuration
4. **Configure runtime settings** for managed identity integration and static asset serving
5. **Test deployment** by verifying the application endpoints
6. **Clean up temporary files** for security

### Security Benefits

The deployment process ensures **zero secrets required**:
- No secrets stored anywhere in the system
- Managed Identity provides secure, passwordless authentication
- All configuration stored as environment variables in App Service
- Federated credentials enable secure token exchange

### Idempotent Deployments

Both scripts are **idempotent** and can be run multiple times safely:

```powershell
# Re-run infrastructure setup (detects existing resources)
.\scripts\setup-secretless.ps1 -EnvironmentSuffix "myapp"

# Re-run application deployment (updates code only)
.\scripts\deploy-secretless.ps1 -EnvironmentSuffix "myapp"
```

**Infrastructure script will:**
- Detect existing resources and reuse them
- Only create missing components
- Preserve existing configuration
- Update secrets if needed

**Deployment script will:**
- Always deploy fresh application code
- Rebuild frontend for latest changes
- Update runtime configuration
- Ensure optimal performance

## Troubleshooting

### Local Development Issues

**Problem: Frontend shows 404 for `/deployment-history`**
- **Cause**: Frontend dev server not running or wrong port
- **Solution**: Access frontend at `http://localhost:3003` (not backend port 8080)

**Problem: API calls fail with authentication errors**
- **Cause**: Missing or invalid `.env.local` configuration
- **Solution**: Re-run `.\scripts\setup-local-dev.ps1` to regenerate configuration

**Problem: "Port 3003 is in use, trying another one..."**
- **Cause**: Another process using port 3003
- **Solution**: Frontend will automatically use next available port (3004, 3005, etc.)

**Problem: Backend fails to start with Dataverse authentication errors**
- **Cause**: App Registration or client secret expired/invalid
- **Solution**: 
  ```powershell
  # Regenerate the local development setup
  .\scripts\setup-local-dev.ps1 -DataverseUrl "your-dataverse-url"
  ```

**Problem: "Application User not found" in backend logs**
- **Cause**: Dataverse Application User not created properly
- **Solution**: 
  ```powershell
  # Manually create the Application User
  .\scripts\setup-dataverse-user.ps1 -AppId "your-app-id" -ServicePrincipalId "your-sp-id" -DataverseUrl "your-dataverse-url"
  ```

### General Issues

**Problem: Azure CLI not authenticated**
- **Solution**: `az login` and select the correct subscription with `az account set --subscription "your-subscription"`

**Problem: Insufficient permissions in Dataverse**
- **Cause**: User account doesn't have System Administrator role
- **Solution**: Ask your Dataverse administrator to grant System Administrator permissions temporarily for setup

**Problem: Node.js version too old**
- **Cause**: Node.js version below 18
- **Solution**: Install Node.js 18+ from [nodejs.org](https://nodejs.org)

### Getting Help

If you encounter issues not covered here:

1. **Check the logs**: Both frontend and backend show detailed error messages
2. **Verify prerequisites**: Ensure all required tools and permissions are available  
3. **Re-run setup**: Most issues can be resolved by re-running the setup scripts
4. **Clean start**: Delete `.env.local` and re-run `.\scripts\setup-local-dev.ps1`
