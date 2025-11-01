@description('The name of the App Service')
param appServiceName string

@description('The name of the App Service Plan')
param appServicePlanName string

@description('The name of the Managed Identity')
param managedIdentityName string

@description('The name of the Storage Account')
param storageAccountName string

@description('The location for all resources')
param location string = resourceGroup().location

@description('App Service plan SKU')
param appServicePlanSku string = 'B1'

@description('Storage Account SKU')
param storageAccountSku string = 'Standard_LRS'

@description('The environment suffix (dev, staging, prod)')
param environment string = 'prod'

// User-assigned managed identity
resource managedIdentity 'Microsoft.ManagedIdentity/userAssignedIdentities@2022-01-31-preview' = {
  name: managedIdentityName
  location: location
  tags: {
    purpose: 'mermaid-dataverse-converter'
    environment: environment
    deploymentType: 'secretless'
  }
}

// Storage Account for persistent deployment history
resource storageAccount 'Microsoft.Storage/storageAccounts@2023-01-01' = {
  name: storageAccountName
  location: location
  tags: {
    purpose: 'mermaid-dataverse-converter'
    environment: environment
    dataType: 'deployment-history'
  }
  sku: {
    name: storageAccountSku
  }
  kind: 'StorageV2'
  properties: {
    accessTier: 'Hot'
    supportsHttpsTrafficOnly: true
    minimumTlsVersion: 'TLS1_2'
    allowBlobPublicAccess: false
    networkAcls: {
      defaultAction: 'Allow'
    }
  }
}

// Blob container for deployment history
resource blobContainer 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-01-01' = {
  name: '${storageAccount.name}/default/deployment-history'
  properties: {
    publicAccess: 'None'
    metadata: {
      purpose: 'deployment-history-storage'
      service: 'mermaid-to-dataverse'
    }
  }
}

// Role assignment: Storage Blob Data Contributor for Managed Identity
resource storageRoleAssignment 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(storageAccount.id, managedIdentity.id, 'ba92f5b4-2d11-453d-a403-e96b0029c9fe')
  scope: storageAccount
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', 'ba92f5b4-2d11-453d-a403-e96b0029c9fe') // Storage Blob Data Contributor
    principalId: managedIdentity.properties.principalId
    principalType: 'ServicePrincipal'
  }
}

// App Service Plan
resource appServicePlan 'Microsoft.Web/serverfarms@2022-09-01' = {
  name: appServicePlanName
  location: location
  tags: {
    purpose: 'mermaid-dataverse-converter'
    environment: environment
  }
  sku: {
    name: appServicePlanSku
  }
  kind: 'linux'
  properties: {
    reserved: true
  }
}

// App Service
resource appService 'Microsoft.Web/sites@2022-09-01' = {
  name: appServiceName
  location: location
  tags: {
    purpose: 'mermaid-dataverse-converter'
    environment: environment
    authType: 'managed-identity'
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
      http20Enabled: true
      appSettings: [
        {
          name: 'NODE_ENV'
          value: 'production'
        }
        {
          name: 'WEBSITES_ENABLE_APP_SERVICE_STORAGE'
          value: 'false'
        }
        {
          name: 'SCM_DO_BUILD_DURING_DEPLOYMENT'
          value: 'true'  // Let Oryx build from our source files
        }
        {
          name: 'ENABLE_ORYX_BUILD'
          value: 'true'  // Oryx will npm install using our source
        }
        {
          name: 'STORAGE_TYPE'
          value: 'azure'
        }
        {
          name: 'AZURE_STORAGE_ACCOUNT_NAME'
          value: storageAccount.name
        }
        {
          name: 'AZURE_STORAGE_CONTAINER_NAME'
          value: 'deployment-history'
        }
      ]
    }
  }
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: {
      '${managedIdentity.id}': {}
    }
  }
}

// Output important values for the setup script
output appServiceName string = appService.name
output appServiceUrl string = 'https://${appService.properties.defaultHostName}'
output managedIdentityName string = managedIdentity.name
output managedIdentityClientId string = managedIdentity.properties.clientId
output managedIdentityPrincipalId string = managedIdentity.properties.principalId
output storageAccountName string = storageAccount.name
output storageAccountId string = storageAccount.id
output blobContainerName string = 'deployment-history'
output resourceGroupName string = resourceGroup().name
