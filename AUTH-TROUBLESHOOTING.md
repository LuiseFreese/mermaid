# Authentication Troubleshooting Guide

## ✅ SUCCESS: New Service Principal Created!

**New Service Principal Details:**
- **App ID**: `7964773b-c8bf-4b4d-854f-1cefb3d8be31`
- **Display Name**: `Mermaid Luise 2`
- **Password**: `fGT8Q~vE59YipIPvs5j-uNgsHqRzu7ekwsB5pdaO` 
- **Tenant ID**: `b469e370-d6a6-45b5-928e-856ae0307a6d`

**Status:**
- ✅ Service Principal created successfully
- ✅ Authentication to Azure working  
- ✅ `.env` file updated with new credentials
- ❌ **NEXT STEP**: Add Application User to Dataverse

## CURRENT ISSUE: Permission Error

**Error**: `The user is not a member of the organization` (Code: 0x80072560)  
**Cause**: Service principal exists in Azure but is not added as an Application User in Dataverse

## STEP 2: Add Application User to Dataverse (AUTOMATED)

### Method 1: Automated Setup Script (Recommended)

I've created an automated script that will:
- ✅ Clean up duplicate/old Application Users
- ✅ Create the new Application User for your service principal  
- ✅ Assign System Administrator role
- ✅ Test the authentication

**Run the automated setup:**

```powershell
# Install required dependencies (if not already installed)
npm install axios @azure/msal-node

# Run the automated Application User setup
node scripts/setup-application-user.js
```

**What the script does:**
1. Authenticates using your service principal credentials
2. Checks for existing Application Users with your Client ID
3. Removes duplicate/old Application Users (cleanup)
4. Creates new Application User if needed
5. Assigns System Administrator role
6. Tests authentication by running `node src/index.js publishers`

### Method 2: Power Platform Admin Center (Manual Fallback)

1. **Navigate to Power Platform Admin Center**:
   - Go to [Power Platform Admin Center](https://admin.powerplatform.microsoft.com)
   - Select your environment: `orgb85e2da2.crm4.dynamics.com`

2. **Add Application User**:
   - Go to Settings → Users + permissions → Application users
   - Click "+ New app user"
   - Business unit: Select your business unit
   - Application ID: `7964773b-c8bf-4b4d-854f-1cefb3d8be31`
   - Click "Create"

3. **Assign Security Role**:
   - Select the newly created application user
   - Click "Manage security roles"  
   - Assign "System Administrator" role (or minimum required permissions)
   - Click "Save"

### Method 2: Power Platform CLI (Alternative)

```powershell
# First authenticate to Power Platform
pac auth create --environment "https://orgb85e2da2.crm4.dynamics.com"

# Add the application user (this may require additional permissions)
pac admin assign-user --environment "https://orgb85e2da2.crm4.dynamics.com" --user "7964773b-c8bf-4b4d-854f-1cefb3d8be31" --role "System Administrator"
```

### Method 3: Clean Up Existing Application Users First

**Before adding the new Application User, clean up duplicates:**

1. **Check existing Application Users**:
   - Power Platform Admin Center → Your Environment → Settings → Users + permissions → Application users
   - Look for any users with old App IDs (like `727413de-eb32-41a3-8cb8-fe8c84de17f2`)
   - Remove duplicates/orphaned application users

2. **Add the new Application User**:
   - Use App ID: `7964773b-c8bf-4b4d-854f-1cefb3d8be31`
   - Name: `Mermaid Luise 2`

## Testing After Adding Application User

Once you've added the Application User to Dataverse, test with:

```bash
# Test publishers (should work now)
node src/index.js publishers

# Test solution creation
node src/index.js convert --input examples/hr-system-erd.mmd --solution "TestSolution" --dry-run
```

## Previous Investigation (Archive)

**Current Situation**: 
- ⚠️ Multiple App Registrations exist in Azure Entra ID
- ⚠️ Multiple Application Users exist in Dataverse (duplicates) 
- ❌ Current app `727413de-eb32-41a3-8cb8-fe8c84de17f2` has NO service principal

**We need to decide**: Fix the existing app OR create a new one following Microsoft best practices.

### Option A: Inventory Existing Apps (Recommended First Step)

```powershell
# Step 1: Login to Azure (if not already logged in)
az login

# Step 2: List ALL app registrations to see what we have
az ad app list --query "[].{appId:appId, displayName:displayName, createdDateTime:createdDateTime}" --output table

# Step 3: For each app, check if it has a service principal
# Replace APP_ID with each app ID from step 2
az ad sp show --id APP_ID 2>$null
```

### Option B: Create Fresh App (Microsoft Best Practice)

Following [Microsoft's Azure CLI Service Principal Tutorial](https://learn.microsoft.com/en-us/cli/azure/azure-cli-sp-tutorial-1), create a new service principal with proper role and scope:

```powershell
# Create NEW service principal with specific role and scope
az ad sp create-for-rbac --name "Mermaid-to-Dataverse-Converter" \
                         --role "Contributor" \
                         --scopes "/subscriptions/YOUR_SUBSCRIPTION_ID"
```

## Issue Identified (Current App)
**Error**: `AADSTS7000229: The client application 727413de-eb32-41a3-8cb8-fe8c84de17f2 is missing service principal in the tenant`

**Root Cause**: 
- ✅ App Registration exists in Azure Entra ID (Application ID: `727413de-eb32-41a3-8cb8-fe8c84de17f2`)
- ❌ Enterprise Application (Service Principal) does NOT exist  
- ❌ `pac admin create-service-principal` doesn't support existing App IDs - only creates NEW apps

**The Problem**: We have an orphaned App Registration without a Service Principal. The `pac` CLI can't fix existing apps - only create new ones.

## DECISION: Which Path Should We Take?

### Path 1: Clean Start (Recommended by Microsoft)
**Pros**:
- ✅ Follows Microsoft best practices
- ✅ Creates both App Registration AND Service Principal together  
- ✅ No orphaned components
- ✅ Proper role and scope assignment from the start
- ✅ Clean authentication setup

**Cons**:
- ⚠️ Need to update `.env` file with new credentials
- ⚠️ Need to remove duplicate Application Users from Dataverse

### Path 2: Fix Existing App
**Pros**:
- ✅ Keep existing `.env` configuration
- ✅ No need to generate new credentials

**Cons**:
- ❌ More complex troubleshooting
- ❌ Still have duplicate Application Users to clean up
- ❌ May have permission/role issues

### Path 3: Inventory and Choose Best Existing App
**Pros**:
- ✅ May find an app that already has service principal
- ✅ Avoid creating more duplicates

**Cons**:
- ⚠️ Still need to clean up duplicates
- ⚠️ May still have permission issues

## RECOMMENDATION: Start with Path 3 (Inventory), then Path 1 (Clean Start)

Let's first see what apps you already have, then make an informed decision.

## Solution Options

### Option 1: Create Service Principal via Azure CLI (Recommended)

```powershell
# Install Azure CLI if not already installed
# Download from: https://aka.ms/installazurecliwindows

# Login to Azure
az login

# Create the missing service principal for your existing app
az ad sp create --id 727413de-eb32-41a3-8cb8-fe8c84de17f2

# Verify it was created
az ad sp show --id 727413de-eb32-41a3-8cb8-fe8c84de17f2
```

### Option 2: Create Service Principal via Azure Portal (Manual)

1. **Navigate to Azure Portal**:
   - Go to [Azure Portal](https://portal.azure.com)
   - Navigate to "Azure Active Directory" → "Enterprise applications"

2. **Create Enterprise Application**:
   - Click "New application"
   - Click "Create your own application" 
   - Select "Integrate any other application you don't find in the gallery (Non-gallery)"
   - Name: "Mermaid to Dataverse Converter"
   - Click "Create"

3. **Link to existing App Registration**:
   - In the Enterprise Application → "Properties"
   - Set "Application ID" to: `727413de-eb32-41a3-8cb8-fe8c84de17f2`

### Option 3: Create New App with Power Platform CLI (Clean Start)

```powershell
# Delete existing authentication
pac auth clear

# Authenticate to Power Platform  
pac auth create --environment "https://orgb85e2da2.crm4.dynamics.com"

# Create NEW service principal (this will create both App Registration AND Service Principal)
pac admin create-service-principal --environment "https://orgb85e2da2.crm4.dynamics.com" --name "Mermaid Dataverse Converter v2" --role "System Administrator"

# This will output NEW credentials - update your .env file with them
```

### Option 4: Fix via PowerShell (Advanced)

```powershell
# Connect to Azure AD
Connect-AzureAD

# Create service principal for existing app
New-AzureADServicePrincipal -AppId "727413de-eb32-41a3-8cb8-fe8c84de17f2"

# Verify creation
Get-AzureADServicePrincipal -Filter "AppId eq '727413de-eb32-41a3-8cb8-fe8c84de17f2'"
```

## Testing Authentication

After implementing one of the solutions above, test with:

```bash
# Test configuration
node src/index.js config

# Test publishers (requires authentication)
node src/index.js publishers

# Test solution creation
node src/index.js convert --input examples/hr-system-erd.mmd --solution "TestSolution" --dry-run
```

## Common Issues and Solutions

### Issue: "Access denied" error
**Solution**: Ensure your user account has sufficient permissions in the Dataverse environment.

### Issue: "Invalid client secret" error
**Solution**: The client secret may have expired. Generate a new one in the Azure Portal.

### Issue: "Environment not found" error
**Solution**: Verify the Dataverse URL is correct and accessible.

## Verification Steps

1. **Check App Registration exists**:
   - Azure Portal → Azure Active Directory → App registrations
   - Search for ID: `727413de-eb32-41a3-8cb8-fe8c84de17f2`

2. **Check Service Principal exists**:
   - Azure Portal → Azure Active Directory → Enterprise applications
   - Search for the same ID

3. **Check Application User in Dataverse**:
   - Power Platform Admin Center → Your Environment → Settings → Users + permissions → Application users
   - Look for your application

## Next Steps

1. Try **Option 1** first (Power Platform CLI method)
2. If that fails, try **Option 2** (Azure Portal method)
3. If both fail, use **Option 3** (create new service principal)
4. Test authentication with `node src/index.js publishers`

Let me know which approach works or if you encounter any specific errors!
