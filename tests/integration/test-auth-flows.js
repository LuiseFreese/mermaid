/**
 * Real integration test for authentication flows
 * Tests actual Azure endpoints with existing app registration and managed identity
 * 
 * Configure your environment variables in .env file:
 * - CLIENT_ID: Your app registration client ID
 * - TENANT_ID: Your Azure tenant ID
 * - RESOURCE_GROUP: Your Azure resource group name
 */

const { DataverseClient } = require('../../src/backend/dataverse/index');
const fs = require('fs');
const path = require('path');

// Test configuration - configure via environment variables
const TEST_CONFIG = {
    // Common config
    tenantId: process.env.TENANT_ID || 'your-tenant-id',
    clientId: process.env.CLIENT_ID || 'your-app-registration-client-id',
    serverUrl: process.env.DATAVERSE_URL || 'https://your-dataverse.crm.dynamics.com',
    
    // Managed identity config
    useManagedIdentity: process.env.USE_MANAGED_IDENTITY === 'true',
    managedIdentityClientId: process.env.MANAGED_IDENTITY_CLIENT_ID,
    
    // Federated credential config
    useFederatedCredential: process.env.USE_FEDERATED_CREDENTIAL === 'true',
    clientAssertion: process.env.CLIENT_ASSERTION,
    clientAssertionFile: process.env.CLIENT_ASSERTION_FILE
};

async function testManagedIdentityWithFederatedCredentials() {
    console.log('\n🏗️ 🎫 Testing Managed Identity with Federated Credentials...');
    
    if (!TEST_CONFIG.useManagedIdentity || !TEST_CONFIG.useFederatedCredential) {
        console.log('❌ Skipping - Both USE_MANAGED_IDENTITY and USE_FEDERATED_CREDENTIAL must be set to true');
        return false;
    }
    
    let clientAssertion = TEST_CONFIG.clientAssertion;
    
    // Try to read from file if provided
    if (!clientAssertion && TEST_CONFIG.clientAssertionFile) {
        try {
            const assertionPath = path.resolve(TEST_CONFIG.clientAssertionFile);
            clientAssertion = fs.readFileSync(assertionPath, 'utf8').trim();
            console.log(`   Reading client assertion from: ${assertionPath}`);
        } catch (error) {
            console.log(`❌ Could not read client assertion file: ${error.message}`);
            return false;
        }
    }
    
    if (!clientAssertion) {
        console.log('❌ Skipping - No CLIENT_ASSERTION or CLIENT_ASSERTION_FILE provided');
        return false;
    }
    
    try {
        const client = new DataverseClient({
            serverUrl: TEST_CONFIG.serverUrl,
            tenantId: TEST_CONFIG.tenantId,
            clientId: TEST_CONFIG.clientId,
            useManagedIdentity: true,
            useFederatedCredential: true,
            clientAssertion: clientAssertion,
            verbose: true
        });
        
        // Force token acquisition
        await client._ensureToken();
        
        console.log('✅ Managed Identity with Federated Credentials: SUCCESS');
        console.log(`   Token acquired: ${client._token ? 'Yes' : 'No'}`);
        console.log('   This is the workload identity pattern - perfect for GitHub Actions!');
        return true;
    } catch (error) {
        console.log('❌ Managed Identity with Federated Credentials: FAILED');
        console.log(`   Error: ${error.message}`);
        return false;
    }
}

async function testDirectManagedIdentity() {
    console.log('\n🏗️  Testing Direct Managed Identity Authentication...');
    
    if (!TEST_CONFIG.useManagedIdentity || TEST_CONFIG.useFederatedCredential) {
        console.log('❌ Skipping - USE_MANAGED_IDENTITY=true and USE_FEDERATED_CREDENTIAL=false required');
        return false;
    }
    
    try {
        const client = new DataverseClient({
            serverUrl: TEST_CONFIG.serverUrl,
            tenantId: TEST_CONFIG.tenantId,
            clientId: TEST_CONFIG.clientId,
            useManagedIdentity: true,
            verbose: true
        });
        
        // Force token acquisition
        await client._ensureToken();
        
        console.log('✅ Direct Managed Identity Authentication: SUCCESS');
        console.log(`   Token acquired: ${client._token ? 'Yes' : 'No'}`);
        console.log(`   Note: This test requires running on Azure VM/App Service with managed identity enabled`);
        return true;
    } catch (error) {
        console.log('❌ Direct Managed Identity Authentication: FAILED');
        console.log(`   Error: ${error.message}`);
        console.log(`   Note: This test requires running on Azure VM/App Service with managed identity enabled`);
        return false;
    }
}

async function testDataverseAccess(client) {
    console.log('\n📊 Testing Dataverse Access...');
    
    try {
        // Try a simple query to verify the token works with Dataverse
        const response = await client._req('GET', '/EntityDefinitions?$select=LogicalName&$top=5');
        
        console.log('✅ Dataverse Access: SUCCESS');
        console.log(`   Retrieved ${response.value?.length || 0} entity definitions`);
        return true;
    } catch (error) {
        console.log('❌ Dataverse Access: FAILED');
        console.log(`   Error: ${error.message}`);
        return false;
    }
}

async function runAllTests() {
    console.log('🏗️🎫 Testing Managed Identity + Federated Credentials');
    console.log('====================================================');
    
    // Only test your managed identity + federated credentials setup
    const result = await testManagedIdentityWithFederatedCredentials();
    
    if (result) {
        console.log('\n✅ SUCCESS: Managed Identity + Federated Credentials authentication works!');
        return true;
    } else {
        console.log('\n❌ FAILED: Managed Identity + Federated Credentials authentication failed');
        return false;
    }
}

// Environment variable instructions (simplified)
function printEnvironmentInstructions() {
    console.log('\n� This tests your managed identity + federated credentials setup.');
    console.log('   Expected result: Authentication reaches Azure (may fail with dummy JWT)');
}

// Run tests if called directly
if (require.main === module) {
    runAllTests().then(success => {
        if (!success) {
            printEnvironmentInstructions();
        }
        process.exit(success ? 0 : 1);
    }).catch(error => {
        console.error('❌ Test execution failed:', error);
        process.exit(1);
    });
}

module.exports = {
    runAllTests,
    testManagedIdentityWithFederatedCredentials,
    testDirectManagedIdentity,
    testDataverseAccess
};