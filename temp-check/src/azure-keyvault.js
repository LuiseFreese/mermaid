// CommonJS version of key-vault-config.js for server deployment
const { DefaultAzureCredential, ManagedIdentityCredential, ChainedTokenCredential } = require("@azure/identity");
const { SecretClient } = require("@azure/keyvault-secrets");

async function getKeyVaultSecrets() {
  try {
    const keyVaultName = process.env.KEY_VAULT_NAME || "mermaid-dataverse-kv";
    const keyVaultUrl = process.env.KEY_VAULT_URI || `https://${keyVaultName}.vault.azure.net`;
    
    // Determine which credential type to use
    const authType = process.env.AUTH_MODE || process.env.AZURE_AUTH_TYPE || 'default';
    console.log(`Using Azure Key Vault (${keyVaultName}) for configuration with auth type: ${authType}`);
    
    let credential;
    
    switch (authType.toLowerCase()) {
      case 'managed-identity': {
        // Use Managed Identity credential
        const managedIdentityClientId = process.env.MANAGED_IDENTITY_CLIENT_ID;
        if (managedIdentityClientId) {
          console.log(`👤 Using user-assigned managed identity with client ID: ${managedIdentityClientId}`);
          credential = new ManagedIdentityCredential(managedIdentityClientId);
        } else {
          console.log('👤 Using system-assigned managed identity');
          credential = new ManagedIdentityCredential();
        }
        break;
      }
        
      case 'chained': {
        // Use both managed identity and default credentials in a chain
        console.log('⛓️ Using chained credential (managed identity + default credentials)');
        const managedIdentity = new ManagedIdentityCredential();
        const defaultCredential = new DefaultAzureCredential();
        credential = new ChainedTokenCredential(managedIdentity, defaultCredential);
        break;
      }
        
      case 'default':
      default: {
        // Use default credential chain
        console.log('Using default Azure credential chain');
        credential = new DefaultAzureCredential();
        break;
      }
    }
    
    const secretClient = new SecretClient(keyVaultUrl, credential);
    
    // Test connection by listing secrets first
    const secretNames = [];
    const secretsIterator = secretClient.listPropertiesOfSecrets();
    
    let count = 0;
    for await (const secretProperties of secretsIterator) {
      secretNames.push(secretProperties.name);
      count++;
      if (count > 10) break; // Limit to avoid long responses
    }
    
    // Try to retrieve the main secrets used by the application
    const secretResults = {};
    const secretsToRetrieve = ["DATAVERSE-URL", "CLIENT-ID", "CLIENT-SECRET", "TENANT-ID", "SOLUTION-NAME"];
    
    for (const secretName of secretsToRetrieve) {
      try {
        const secret = await secretClient.getSecret(secretName);
        secretResults[secretName] = { success: true, hasValue: !!secret.value };
      } catch (error) {
        secretResults[secretName] = { success: false, error: error.message };
      }
    }
    
    console.log(" Successfully connected to Key Vault");
    
    return {
      success: true,
      message: 'Successfully connected to Key Vault',
      authType: authType,
      clientId: process.env.MANAGED_IDENTITY_CLIENT_ID,
      keyVaultUrl: keyVaultUrl,
      secretCount: secretNames.length,
      availableSecrets: secretNames,
      secretResults: secretResults,
      timestamp: new Date().toISOString()
    };
    
  } catch (error) {
    console.error(`❌ Error accessing Key Vault: ${error.message}`);
    
    return {
      success: false,
      message: `Key Vault connection failed: ${error.message}`,
      authType: process.env.AUTH_MODE || process.env.AZURE_AUTH_TYPE || 'default',
      clientId: process.env.MANAGED_IDENTITY_CLIENT_ID,
      keyVaultUrl: process.env.KEY_VAULT_URI,
      error: error.message,
      errorCode: error.code || 'UNKNOWN',
      timestamp: new Date().toISOString()
    };
  }
}

async function getDataverseConfig() {
  try {
    console.log('Getting Dataverse configuration from Key Vault...');
    
    const keyVaultName = process.env.KEY_VAULT_NAME || "mermaid-dataverse-kv";
    const keyVaultUrl = process.env.KEY_VAULT_URI || `https://${keyVaultName}.vault.azure.net`;
    
    console.log(`Retrieving Dataverse secrets from Key Vault: ${keyVaultUrl}`);
    
    // Use the same authentication logic as getKeyVaultSecrets
    const authType = process.env.AUTH_MODE || process.env.AZURE_AUTH_TYPE || 'default';
    let credential;
    
    switch (authType.toLowerCase()) {
      case 'managed-identity': {
        const managedIdentityClientId = process.env.MANAGED_IDENTITY_CLIENT_ID;
        if (managedIdentityClientId) {
          console.log(`👤 Using user-assigned managed identity with client ID: ${managedIdentityClientId}`);
          credential = new ManagedIdentityCredential(managedIdentityClientId);
        } else {
          console.log('� Using system-assigned managed identity');
          credential = new ManagedIdentityCredential();
        }
        break;
      }
        
      case 'chained': {
        console.log('🔗 Using chained token credential');
        const managedIdentityClientId = process.env.MANAGED_IDENTITY_CLIENT_ID;
        if (managedIdentityClientId) {
          credential = new ChainedTokenCredential(
            new ManagedIdentityCredential(managedIdentityClientId),
            new DefaultAzureCredential()
          );
        } else {
          credential = new ChainedTokenCredential(
            new ManagedIdentityCredential(),
            new DefaultAzureCredential()
          );
        }
        break;
      }
        
      default: {
        console.log('Using default Azure credential chain');
        credential = new DefaultAzureCredential();
        break;
      }
    }
    
    const secretClient = new SecretClient(keyVaultUrl, credential);
    
    // Test the connection first
    console.log(' Testing Key Vault connection...');
    try {
      await secretClient.getSecret("DATAVERSE-URL").catch(() => {}); // Just test connection
      console.log(' Successfully connected to Key Vault');
    } catch (error) {
      console.log(`⚠️ Key Vault connection test failed: ${error.message}`);
      // Continue anyway to get detailed error messages
    }
    
    // Retrieve the Dataverse secrets
    const secrets = {};
    const secretMapping = {
      'DATAVERSE-URL': 'serverUrl',
      'CLIENT-ID': 'clientId', 
      'CLIENT-SECRET': 'clientSecret',
      'TENANT-ID': 'tenantId'
    };
    
    for (const [secretName, propertyName] of Object.entries(secretMapping)) {
      try {
        const secret = await secretClient.getSecret(secretName);
        if (secret && secret.value) {
          secrets[propertyName] = secret.value;
          console.log(` Retrieved ${secretName} from Key Vault (length: ${secret.value.length})`);
        } else {
          console.log(`⚠️ ${secretName} is empty in Key Vault`);
          secrets[propertyName] = null;
        }
      } catch (error) {
        console.log(`❌ Failed to retrieve ${secretName}: ${error.message}`);
        secrets[propertyName] = null;
      }
    }
    
    // Check if we got the essential secrets
    const missingSecrets = [];
    if (!secrets.serverUrl) missingSecrets.push('DATAVERSE-URL');
    if (!secrets.clientId) missingSecrets.push('CLIENT-ID');
    if (!secrets.clientSecret) missingSecrets.push('CLIENT-SECRET');
    if (!secrets.tenantId) missingSecrets.push('TENANT-ID');
    
    if (missingSecrets.length > 0) {
      throw new Error(`Missing required secrets in Key Vault: ${missingSecrets.join(', ')}`);
    }
    
    console.log(' All required Dataverse secrets retrieved successfully');
    
    return {
      success: true,
      source: 'key_vault',
      serverUrl: secrets.serverUrl,
      tenantId: secrets.tenantId,
      clientId: secrets.clientId,
      clientSecret: secrets.clientSecret
    };
  } catch (error) {
    console.error('❌ Failed to get Dataverse config from Key Vault:', error.message);
    throw error;
  }
}

module.exports = { getKeyVaultSecrets, getDataverseConfig };
