#!/usr/bin/env node

console.log('🚀 Debug Script Starting...');

try {
    require('dotenv').config();
    console.log('✅ dotenv loaded');
    
    console.log('Environment variables:');
    console.log('DATAVERSE_URL:', process.env.DATAVERSE_URL);
    console.log('CLIENT_ID:', process.env.CLIENT_ID);
    console.log('CLIENT_SECRET:', process.env.CLIENT_SECRET ? 'SET' : 'NOT SET');
    console.log('TENANT_ID:', process.env.TENANT_ID);

    const { execSync } = require('child_process');
    console.log('✅ child_process loaded');

    console.log('Testing Azure CLI...');
    const result = execSync('az account show --query "user.name" --output tsv', { 
        encoding: 'utf-8',
        timeout: 10000 
    });
    console.log('✅ Azure CLI working, logged in as:', result.trim());

    console.log('✅ All basic components working');
    
} catch (error) {
    console.error('❌ Error in debug script:', error.message);
    console.error('Stack:', error.stack);
}
