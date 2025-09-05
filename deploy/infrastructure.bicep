@description('The name of the application')
param appName string

@description('The location for all resources')
param location string = resourceGroup().location

@description('The environment suffix (dev, test, prod)')
param environment string = 'prod'

@description('Key Vault name (required)')
param keyVaultName string

@description('Managed Identity name (required)')
param managedIdentityName string

@description('App Service name (required)')
param appServiceName string

@description('App Service plan name (required)')
param appServicePlanName string

@description('App Service plan SKU')
param appServicePlanSku string = 'B1'

// User-assigned managed identity (idempotent - will use existing if found)
resource managedIdentity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' = {
  name: managedIdentityName
  location: location
  tags: {
    application: appName
    environment: environment
  }
}

// Key Vault with RBAC enabled (idempotent - will use existing if found)
resource keyVault 'Microsoft.KeyVault/vaults@2023-07-01' = {
  name: keyVaultName
  location: location
  tags: {
    application: appName
    environment: environment
  }
  properties: {
    sku: {
      family: 'A'
      name: 'standard'
    }
    tenantId: tenant().tenantId
    enableRbacAuthorization: true
    enabledForDeployment: false
    enabledForDiskEncryption: false
    enabledForTemplateDeployment: false
    publicNetworkAccess: 'Enabled'
    networkAcls: {
      defaultAction: 'Allow'
      bypass: 'AzureServices'
    }
  }
}

// App Service Plan (idempotent - will use existing if found)
resource appServicePlan 'Microsoft.Web/serverfarms@2023-01-01' = {
  name: appServicePlanName
  location: location
  tags: {
    application: appName
    environment: environment
  }
  sku: {
    name: appServicePlanSku
  }
  properties: {
    reserved: true // Linux
  }
  kind: 'linux'
}

// App Service (idempotent - will use existing if found)
resource appService 'Microsoft.Web/sites@2023-01-01' = {
  name: appServiceName
  location: location
  kind: 'app,linux'
  tags: {
    application: appName
    environment: environment
  }
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: {
      '${managedIdentity.id}': {}
    }
  }
  properties: {
    serverFarmId: appServicePlan.id
    httpsOnly: true
    siteConfig: {
      linuxFxVersion: 'NODE|20-lts'
      alwaysOn: true
      ftpsState: 'Disabled'
      minTlsVersion: '1.2'
      scmMinTlsVersion: '1.2'
      appSettings: [
        {
          name: 'KEY_VAULT_URI'
          value: keyVault.properties.vaultUri
        }
        {
          name: 'AUTH_MODE'
          value: 'managed-identity'
        }
        {
          name: 'MANAGED_IDENTITY_CLIENT_ID'
          value: managedIdentity.properties.clientId
        }
        {
          name: 'SCM_DO_BUILD_DURING_DEPLOYMENT'
          value: 'true'
        }
        {
          name: 'SCM_COMMAND_IDLE_TIMEOUT'
          value: '1800'
        }
      ]
    }
  }
}

// Key Vault Secrets User role assignment for managed identity (runtime read access)
resource keyVaultSecretsUserRoleAssignment 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(keyVault.id, managedIdentity.id, 'Key Vault Secrets User')
  scope: keyVault
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '4633458b-17de-408a-b874-0445c86b69e6') // Key Vault Secrets User
    principalId: managedIdentity.properties.principalId
    principalType: 'ServicePrincipal'
  }
}

// Outputs
output appServiceName string = appService.name
output appServiceUrl string = 'https://${appService.properties.defaultHostName}'
output appServicePlanName string = appServicePlan.name
output keyVaultName string = keyVault.name
output keyVaultUri string = keyVault.properties.vaultUri
output managedIdentityName string = managedIdentity.name
output managedIdentityClientId string = managedIdentity.properties.clientId
output managedIdentityPrincipalId string = managedIdentity.properties.principalId
output resourceGroupName string = resourceGroup().name
