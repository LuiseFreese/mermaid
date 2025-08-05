// CommonJS version of key-vault-config.js for server deployment
const { DefaultAzureCredential, ManagedIdentityCredential, ChainedTokenCredential } = require("@azure/identity");
const { SecretClient } = require("@azure/keyvault-secrets");

async function getKeyVaultSecrets() {
  try {
    const keyVaultName = process.env.KEY_VAULT_NAME || "mermaid-dataverse-kv";
    const keyVaultUrl = process.env.KEY_VAULT_URI || `https://${keyVaultName}.vault.azure.net`;
    
    // Determine which credential type to use
    const authType = process.env.AUTH_MODE || process.env.AZURE_AUTH_TYPE || 'default';
    console.log(`🔐 Using Azure Key Vault (${keyVaultName}) for configuration with auth type: ${authType}`);
    
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
        console.log('🔑 Using default Azure credential chain');
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
    
    console.log("✅ Successfully connected to Key Vault");
    
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

module.exports = { getKeyVaultSecrets };
