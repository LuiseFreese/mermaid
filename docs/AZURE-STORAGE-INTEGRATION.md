---
sidebar_position: 5
title: Azure Storage Integration
description: Persistent deployment history with Azure Blob Storage
keywords: [azure storage, blob storage, deployment history, persistence, managed identity]
---

# Azure Storage Account Integration

This document describes the Azure Storage Account integration for persistent deployment history in the Mermaid to Dataverse Converter.

## Overview

The application now supports two storage backends for deployment history:

1. **Local File Storage** (default for development)
2. **Azure Blob Storage** (default for production)

This enhancement ensures deployment history persists across application restarts and deployments.

## Storage Architecture

### Storage Abstraction Layer

```
DeploymentHistoryService
    ↓
StorageProvider (Abstract)
    ↓
LocalStorageProvider | AzureStorageProvider
    ↓
File System | Azure Blob Storage
```

### Key Components

- **StorageProvider**: Abstract base class defining the storage interface
- **LocalStorageProvider**: File system-based storage for development
- **AzureStorageProvider**: Azure Blob Storage for production
- **StorageFactory**: Creates appropriate storage provider based on configuration

## Configuration

### Environment Variables

```env
# Storage Configuration
AZURE_STORAGE_ACCOUNT_NAME=storageaccount   # Azure Storage Account name (required for Azure)
AZURE_STORAGE_CONTAINER_NAME=deployment-history  # Container name (optional, defaults to 'deployment-history')
MANAGED_IDENTITY_CLIENT_ID=guid             # Managed Identity Client ID for authentication
USE_MANAGED_IDENTITY=true                   # Enable managed identity authentication in production

# Development Only (not used in production)
AZURE_STORAGE_CONNECTION_STRING=...         # Connection string for local development
```

### Automatic Selection

The system automatically selects the storage backend based on environment:

- **Development**: Local file storage in `data/deployments/` (when `AZURE_STORAGE_ACCOUNT_NAME` not set)
- **Production**: Azure Blob Storage (when `AZURE_STORAGE_ACCOUNT_NAME` is configured)

## Azure Infrastructure

### Bicep Template Updates

The infrastructure template (`deploy/infrastructure-secretless.bicep`) includes:

1. **Storage Account**: `stmermaid{environment}` (e.g., `stmermaidprod`)
2. **Blob Container**: `deployment-history` (created automatically)
3. **Role Assignment**: Storage Blob Data Contributor for User-Assigned Managed Identity
4. **App Service Settings**: Storage configuration environment variables

### Authentication Architecture

```
Azure App Service (with Managed Identity)
    ↓ uses
User-Assigned Managed Identity (mi-mermaid-*)
    ↓ has role assignment
Storage Blob Data Contributor → Storage Account (stmermaid*)
    ↓ accesses
Blob Container (deployment-history)
```

The authentication uses **ManagedIdentityCredential** with explicit client ID (no secrets required).

### Deployment Process

The `setup-secretless.ps1` script automatically:

1. Creates the Storage Account with unique naming (`stmermaid{suffix}`)
2. Creates User-Assigned Managed Identity 
3. Assigns Storage Blob Data Contributor role to the managed identity
4. Configures App Service with managed identity and environment variables
5. Creates blob container automatically on first use

## Storage Schema

### File Structure

```
Azure Blob Storage Container: deployment-history
├── deployments/
│   ├── {environment-id}/
│   │   └── deploy_{timestamp}_{id}.json     # Individual deployment records
│   └── {environment-id}/
│       └── deploy_{timestamp}_{id}.json
└── (indexes are managed in-memory, not stored)
```

### Data Format

#### Deployment Record
```json
{
  "deploymentId": "deploy_1762017227483_ndimut6nd",
  "timestamp": "2025-11-01T17:15:39.134Z",
  "environmentSuffix": "61b386a4-5c51-ed5c-94ee-9f3303c38e4e",
  "environmentId": "61b386a4-5c51-ed5c-94ee-9f3303c38e4e",
  "environmentName": "test-princess",
  "environmentUrl": "https://org32dda8c3.crm4.dynamics.com",
  "erdContent": "erDiagram...",
  "status": {
    "status": "completed|rolled-back",
    "rollbackInfo": {
      "rollbacks": [/* rollback records */],
      "lastRollback": {/* most recent rollback */}
    }
  },
  "summary": {
    "totalEntities": 2,
    "entitiesAdded": ["Contact", "Event"],
    "cdmEntities": 1,
    "customEntities": 1,
    "globalChoicesAdded": ["Goal Fiscalperiod", "Goal Fiscalyear"],
    "relationshipsCreated": 0,
    "totalRelationships": 1
  },
  "solutionInfo": {
    "solutionName": "azsth",
    "publisherName": "azsth",
    "publisherPrefix": "azsth",
    "solutionId": "743aa320-46b7-f011-bbd2-6045bd9de75f"
  },
  "rollbackData": {
    "relationships": [/* relationships for rollback */],
    "customEntities": [/* custom entities created */],
    "globalChoicesCreated": []
  },
  "deploymentLogs": [],
  "metadata": {
    "deploymentMethod": "web-ui"
  },
  "lastUpdated": "2025-11-01T17:19:10.494Z"
}
```

#### Environment Index
```json
{
  "deployments": [
    {
      "deploymentId": "dep_1234567890_abc123",
      "timestamp": "2025-10-31T10:00:00.000Z",
      "status": "completed",
      "summary": "Deployed 5 entities and 3 relationships",
      "environmentId": "env-guid-123",
      "environmentName": "Production Environment"
    }
  ]
}
```

## Migration

### From Local to Azure Storage

When upgrading to Azure Storage, the system provides a migration method:

```javascript
const migrationResult = await deploymentHistoryService.migrateFromLocalStorage('./data/deployments');
console.log(`Migrated ${migrationResult.migratedDeployments} deployments`);
```

### Migration Process

1. **Automatic Detection**: Service detects existing local storage files
2. **Data Transfer**: Copies deployment records and indexes to Azure Storage
3. **Validation**: Verifies all data transferred successfully
4. **Cleanup**: Optional removal of local files (manual process)

## Local Development

### With Local Storage (Default)

```env
STORAGE_TYPE=local
```

No additional configuration required. Files stored in `data/deployments/`.

### With Azure Storage (Testing)

```env
# For local development with real Azure Storage
AZURE_STORAGE_ACCOUNT_NAME=stmermaiddev
AZURE_STORAGE_CONTAINER_NAME=deployment-history
MANAGED_IDENTITY_CLIENT_ID=your-managed-identity-client-id
USE_MANAGED_IDENTITY=true

# Alternative: Use connection string for local testing
AZURE_STORAGE_CONNECTION_STRING=DefaultEndpointsProtocol=https;AccountName=...
```

**Note**: When using managed identity locally, you need to authenticate with Azure CLI:
```powershell
az login
```

## Production Deployment

### Infrastructure Requirements

1. **Storage Account**: Created via Bicep template
2. **Managed Identity**: Must have Storage Blob Data Contributor role
3. **Environment Variables**: Set via App Service configuration

### Automatic Configuration

The deployment process automatically:
- Creates storage account with environment-specific naming
- Configures managed identity authentication (no secrets required)
- Sets up proper RBAC permissions
- Configures App Service environment variables

## Performance Considerations

### Caching Strategy

- **Environment indexes**: Cached in memory for fast access
- **Recent deployments**: Prioritized for quick retrieval
- **Old deployments**: Archived but accessible on demand

### Cost Optimization

- **Hot tier**: Recent deployment data for fast access
- **Retention policy**: Automatic cleanup of old deployments (configurable)
- **Compression**: JSON data stored efficiently

## Monitoring and Diagnostics

### Health Checks

The health service monitors storage connectivity:

```javascript
const healthResult = await healthService.checkDependencies(environmentId);
console.log('Storage health:', healthResult.storage);
```

### Error Handling

- **Graceful degradation**: Falls back to local storage if Azure unavailable
- **Retry logic**: Automatic retry for transient failures
- **Detailed logging**: Comprehensive error reporting

## Security

### Authentication

- **Managed Identity**: Uses ManagedIdentityCredential with explicit client ID (no secrets)
- **RBAC**: Principle of least privilege (Storage Blob Data Contributor only)
- **Network Security**: Storage account accessible only to App Service

### Implementation Details

The `AzureStorageProvider` uses:
```javascript
const credential = new ManagedIdentityCredential(this.managedIdentityClientId);
const blobServiceClient = new BlobServiceClient(
  `https://${this.accountName}.blob.core.windows.net`,
  credential
);
```

**Important**: Uses `ManagedIdentityCredential` with explicit client ID instead of `DefaultAzureCredential` to avoid authentication chain issues in App Service environment.

### Data Protection

- **Encryption**: Data encrypted at rest and in transit
- **Access Control**: Container-level access policies
- **Audit Trail**: All operations logged for security monitoring

## Troubleshooting

### Common Issues

1. **Storage Account Not Found**
   - Verify `AZURE_STORAGE_ACCOUNT_NAME` environment variable is set correctly
   - Check managed identity has Storage Blob Data Contributor role
   - Confirm storage account exists in the same region

2. **Authentication Failures ("ChainedTokenCredential authentication failed")**
   - Verify `MANAGED_IDENTITY_CLIENT_ID` is set correctly in App Service
   - Ensure User-Assigned Managed Identity is assigned to App Service
   - Check that the managed identity has Storage Blob Data Contributor role on the storage account
   - Verify the implementation uses `ManagedIdentityCredential` with explicit client ID

3. **Container Not Found**
   - Container is created automatically on first use
   - Verify container name in `AZURE_STORAGE_CONTAINER_NAME` (defaults to 'deployment-history')
   - Check managed identity has sufficient permissions to create containers

4. **Performance Issues**
   - Monitor storage account metrics in Azure Portal
   - Consider upgrading storage account tier if needed
   - Check network connectivity between App Service and Storage Account

### Diagnostic Commands

```powershell
# Check storage account status
az storage account show --name stmermaidprod --resource-group rg-mermaid-prod

# Verify managed identity role assignments
az role assignment list --assignee <managed-identity-id> --scope /subscriptions/<sub>/resourceGroups/<rg>/providers/Microsoft.Storage/storageAccounts/<storage>

# Test storage health endpoint
curl -s "https://app-mermaid-prod.azurewebsites.net/api/health/storage"

# Test deployment history API
curl -s "https://app-mermaid-prod.azurewebsites.net/api/deployments/history?limit=5"

# Check app service configuration
az webapp config appsettings list --name app-mermaid-prod --resource-group rg-mermaid-prod --query "[?contains(name, 'AZURE_STORAGE') || contains(name, 'MANAGED_IDENTITY')]"
```

### App Service Configuration Example

```json
[
  {
    "name": "AZURE_STORAGE_ACCOUNT_NAME",
    "value": "stmermaidprod"
  },
  {
    "name": "AZURE_STORAGE_CONTAINER_NAME", 
    "value": "deployment-history"
  },
  {
    "name": "MANAGED_IDENTITY_CLIENT_ID",
    "value": "502cd837-0592-47a0-b7a5-16efb4c591be"
  },
  {
    "name": "USE_MANAGED_IDENTITY",
    "value": "true"
  }
]
```

## API Changes

### New Methods

- `DeploymentHistoryService.getStorageInfo()`: Returns storage provider information
- `DeploymentHistoryService.migrateFromLocalStorage(path)`: Migrates from local storage
- `DeploymentHistoryService.getAllEnvironments()`: Lists all environments with deployment counts

### Backward Compatibility

All existing APIs remain unchanged. The storage abstraction is transparent to existing code.

## Future Enhancements

### Planned Features

1. **Storage Tier Management**: Automatic archival of old deployments
2. **Cross-Region Replication**: Disaster recovery capabilities
3. **Analytics Integration**: Enhanced reporting and insights
4. **Backup Strategies**: Regular backups to secondary storage

### Configuration Options

Future versions may support:
- Custom retention policies per environment
- Multiple storage accounts for different environments
- Advanced caching strategies for improved performance

## Testing

### Unit Tests

- Storage provider interfaces
- Data serialization/deserialization
- Error handling scenarios

### Integration Tests

- End-to-end deployment history workflows
- Migration process validation
- Cross-platform compatibility (Windows/Linux path handling)

### Performance Tests

- Large deployment history handling
- Concurrent access scenarios
- Network failure resilience

## Support

For issues or questions regarding Azure Storage integration:

1. Check the application logs for storage-related errors
2. Verify Azure Storage Account configuration
3. Review managed identity permissions
4. Consult this documentation for configuration details

---

*This integration enhances the Mermaid to Dataverse Converter with persistent, scalable deployment history storage while maintaining compatibility with existing workflows.*