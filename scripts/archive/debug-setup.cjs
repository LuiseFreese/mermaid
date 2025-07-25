#!/usr/bin/env node

const { execSync } = require('child_process');
require('dotenv').config();

console.log('🐛 Debug: Starting setup...');
console.log('Environment variables:');
console.log('- DATAVERSE_URL:', process.env.DATAVERSE_URL);
console.log('- CLIENT_ID:', process.env.CLIENT_ID);
console.log('- TENANT_ID:', process.env.TENANT_ID);

try {
    console.log('\n🐛 Debug: Checking for existing app registration...');
    const result = execSync('az ad sp list --display-name "Mermaid Luise Auto" --query "[].{appId:appId, displayName:displayName}" --output table', { 
        encoding: 'utf-8',
        timeout: 30000 
    });
    console.log('Raw result:', JSON.stringify(result));
    
    if (result.includes('Mermaid Luise Auto')) {
        console.log('✅ Found existing app registration');
        const appIdMatch = result.match(/([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})/);
        if (appIdMatch) {
            console.log('Found app ID:', appIdMatch[1]);
        }
    } else {
        console.log('❌ No existing app registration found');
        console.log('Will create new app registration...');
        
        console.log('\n🐛 Debug: Creating new app registration...');
        const createResult = execSync('az ad app create --display-name "Mermaid Luise Auto" --query "appId" --output tsv', { 
            encoding: 'utf-8',
            timeout: 30000 
        });
        
        console.log('Create result:', JSON.stringify(createResult));
        const appId = createResult.trim();
        console.log('New app ID:', appId);
        
        if (!appId || appId.length < 30) {
            throw new Error('Invalid app ID returned from creation');
        }
        
        console.log('✅ App registration created successfully!');
    }
} catch (error) {
    console.error('❌ Error:', error.message);
    console.error('Full error:', error);
}
