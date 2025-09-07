# Deployment Guide - Mermaid to Dataverse Converter

This guide explains how to deploy and use the Mermaid-to-Dataverse application. The application uses **fully automated setup** - no manual configuration required!

## Quick Start (Recommended)

**Two steps to deploy everything:**

```powershell
# Clone the repository
git clone https://github.com/LuiseFreese/mermaid.git
cd mermaid

# Step 1: Create Azure infrastructure and Entra app (interactive)
.\scripts\setup-entra-app.ps1

# Step 2: Deploy the application code
.\scripts\deploy.ps1 -AppName "your-app-name" -ResourceGroup "your-resource-group" -KeyVaultName "your-keyvault-name"
```

**The setup script will:**
- Create Entra App Registration with proper API permissions
- Deploy Azure infrastructure (App Service, Key Vault, Managed Identity, etc.)
- Configure secure authentication and Key Vault access
- Set up Dataverse application user (optional)

**The deploy script will:**
- Build the React frontend locally using Vite
- Package only necessary backend files (no node_modules)
- Deploy to Azure App Service with proper static file serving
- Configure runtime settings for optimal performance

## What You Get

After setup, you'll have a **complete working application** that:
- ✅ Converts Mermaid ERD files to Dataverse entities
- ✅ Provides a web interface for file uploads
- ✅ Shows real-time processing logs
- ✅ Supports dry-run mode for validation
- ✅ Uses enterprise-grade security (Managed Identity + Key Vault)

## Prerequisites

Before running the setup:

1. **Azure subscription** with permissions to create resources
2. **PowerShell 7+** (recommended) or Windows PowerShell 5.1
3. **Azure CLI** installed and logged in (`az login`)
4. **Node.js 18+** (required for local frontend build)
5. **Access to Dataverse environment** where you want to create entities
6. **Appropriate permissions**:
   - **Azure**: Contributor or Owner on subscription
   - **Microsoft Entra ID**: Application Administrator (to create app registrations)
   - **Dataverse**: System Administrator (to create application users)

## Deployment Process

### Step 1: Infrastructure Setup
```powershell
# Interactive mode (prompts for configuration)
.\scripts\setup-entra-app.ps1

# OR unattended mode (provide all parameters)
.\scripts\setup-entra-app.ps1 -Unattended `
  -EnvironmentUrl "https://orgXXXXX.crm4.dynamics.com" `
  -ResourceGroup "rg-mermaid-dataverse" `
  -Location "westeurope" `
  -AppRegistrationName "Mermaid-Dataverse-Converter" `
  -AppServiceName "app-mermaid-dv-we-1234" `
  -KeyVaultName "kv-mermaid-secrets-1234" `
  -SecurityRole "System Administrator"
```

### Step 2: Application Deployment
```powershell
# Deploy the application code to existing infrastructure
.\scripts\deploy.ps1 -AppName "app-mermaid-dv-we-1234" -ResourceGroup "rg-mermaid-dataverse" -KeyVaultName "kv-mermaid-secrets-1234"
```


## What Gets Deployed

The setup script automatically creates:

- **Azure Resource Group** - Container for all resources
- **App Service & App Service Plan** - Web application hosting (Linux, Node.js 20)
- **Key Vault** - Secure secret storage with RBAC
- **User-Assigned Managed Identity** - Secure authentication without passwords
- **Entra ID App Registration** - Service principal for Dataverse access
- **Dataverse Application User** - Configured with appropriate security roles

## Automated Setup Process

The **setup script** (`scripts/setup-entra-app.ps1`) creates the infrastructure:

1. **Creates App Registration** with proper configuration (using latest Azure CLI syntax)
2. **Generates Client Secret** with 2-year expiration (securely, without console exposure)
3. **Deploys Infrastructure** using Bicep (Key Vault, Managed Identity, App Service)
4. **Configures RBAC permissions** for Key Vault access
5. **Stores all secrets** securely in Key Vault
6. **Creates Application User** in Dataverse via REST API
7. **Assigns Security Roles** (System Administrator by default)

The **deployment script** (`scripts/deploy.ps1`) handles the application:

1. **Builds React frontend** locally using Vite for optimal performance
2. **Packages backend code** (excludes node_modules and source files)
3. **Deploys to Azure App Service** using Azure CLI with proper static file configuration
4. **Configures runtime settings** for Key Vault integration and static asset serving
5. **Validates deployment** by testing the application endpoints

### Security-First Deployment Approach

The deployment process uses a **security-first approach** that eliminates exposure of sensitive data:

- **No secrets in command line parameters** - Prevents exposure in process lists or command history
- **Direct Key Vault retrieval** - Secrets are retrieved from Key Vault during deployment using Azure CLI
- **Managed Identity authentication** - No stored credentials required for Key Vault access
- **Fallback environment variables** - Securely set from Key Vault for runtime backup
- **Zero hardcoded secrets** - All sensitive data flows through Azure's secure services

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
Key Vault Name: kv-mermaid-secrets-5678

✅ App Registration created successfully
✅ Infrastructure deployed successfully  
✅ Secrets stored in Key Vault
✅ Dataverse Application User created
✅ Security roles assigned

🎉 Infrastructure Setup Complete!
Next: Run the deploy script to deploy your application code.
```

**Step 2: Application Deployment**
```powershell
PS> .\scripts\deploy.ps1 -AppName "app-mermaid-dv-we-5678" -ResourceGroup "rg-mermaid-dv-we-test" -KeyVaultName "kv-mermaid-secrets-5678"

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
   - All secrets secured in Azure Key Vault
   - Managed Identity for passwordless authentication
   - Zero hardcoded credentials in deployment process
```

## Infrastructure as Code

All Azure resources are defined in `deploy/infrastructure.bicep`

## Security Architecture

The deployment uses **enterprise-grade security** with multiple layers of protection:

### Secret Management
- **Azure Key Vault**: All sensitive data (client secrets, URLs) stored securely
- **No hardcoded secrets**: Zero secrets in source code, configuration files, or deployment scripts
- **Secure retrieval**: Secrets fetched directly from Key Vault during deployment using Azure CLI
- **Runtime Key Vault integration**: App retrieves secrets at runtime using Managed Identity

### Authentication & Authorization
- **User-Assigned Managed Identity**: Passwordless authentication for App Service ↔ Key Vault
- **RBAC permissions**: Principle of least privilege for Key Vault access
- **Entra ID App Registration**: Secure service principal for Dataverse access
- **Application User**: Dedicated Dataverse user with specific security roles

### Deployment Security
- **Parameter-free deployment**: No secrets passed as command-line parameters
- **Azure CLI authentication**: Uses your existing Azure session for secure operations
- **Temporary secret exposure**: Secrets only retrieved when needed during deployment
- **Audit trail**: All operations logged through Azure Activity Log

### Runtime Security
- **Primary**: App uses Managed Identity to fetch secrets from Key Vault
- **Fallback**: Secure environment variables set during deployment (also from Key Vault)
- **HTTPS only**: All communication encrypted in transit
- **Network isolation**: App Service can be configured with VNet integration

## Deploying Code Updates

After the initial infrastructure setup, you can deploy code changes using the deploy script:

```powershell
# Deploy code updates to existing infrastructure
.\scripts\deploy.ps1 -AppName "app-mermaid-dv-we-5678" -ResourceGroup "rg-mermaid-dv-we-test" -KeyVaultName "kv-mermaid-secrets-5678"
```

This script will:
1. **Build React frontend** locally using Vite for optimal performance
2. **Package backend code** (excludes node_modules and source files for faster deployment)
3. **Deploy to Azure App Service** using Azure CLI with proper static file configuration
4. **Configure runtime settings** for Key Vault integration and static asset serving
5. **Test deployment** by verifying the application endpoints
6. **Clean up temporary files** for security

### Security Benefits

The deployment process ensures **zero exposure of sensitive data**:
- Secrets are retrieved directly from Key Vault during deployment
- No secrets appear in command parameters, process lists, or logs
- Managed Identity provides secure, passwordless authentication
- Fallback environment variables are set securely from Key Vault

### Idempotent Deployments

Both scripts are **idempotent** and can be run multiple times safely:

```powershell
# Re-run infrastructure setup (detects existing resources)
.\scripts\setup-entra-app.ps1

# Re-run application deployment (updates code only)
.\scripts\deploy.ps1 -AppName "your-app-name" -ResourceGroup "your-resource-group" -KeyVaultName "your-keyvault-name"
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

## Using Your Deployed Application

After the automated setup completes, you can start using the application:

### 1. Access Your Application
Visit the URL provided by the setup script:
```
https://your-app-name.azurewebsites.net
```

### 2. Upload Mermaid Files
- Use the web interface to upload `.mmd` files
- Start with **dry-run mode** to validate your files
- Review the real-time processing logs
- Switch to **live mode** to create actual Dataverse entities

### 3. Monitor and Manage
- Check the status dashboard for system health
- Use diagnostic endpoints to troubleshoot issues
- View created entities in your Dataverse environment

## Next Steps

After successful deployment:

1. **Read the Usage Guide**: See [USAGE-GUIDE.md](USAGE-GUIDE.md) for how to use the application
2. **Try Examples**: Test with sample files in the `examples/` folder
3. **Understand Mermaid Syntax**: Review [MERMAID-GUIDE.md](MERMAID-GUIDE.md) for supported ERD syntax
4. **Learn About Relationships**: See [RELATIONSHIP_TYPES.md](RELATIONSHIP_TYPES.md) for relationship modeling

For technical details about the application architecture, see [DEVELOPER.md](DEVELOPER.md).
