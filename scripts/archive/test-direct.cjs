#!/usr/bin/env node

console.log('🔥 Direct test starting...');

require('dotenv').config();

console.log('Environment variables loaded:');
console.log('CLIENT_ID:', process.env.CLIENT_ID);
console.log('CLIENT_SECRET:', process.env.CLIENT_SECRET ? 'SET' : 'MISSING');
console.log('DATAVERSE_URL:', process.env.DATAVERSE_URL);
console.log('TENANT_ID:', process.env.TENANT_ID);

console.log('About to test class creation...');

try {
    const { ConfidentialClientApplication } = require('@azure/msal-node');
    console.log('MSAL loaded successfully');
    
    const config = {
        dataverseUrl: process.env.DATAVERSE_URL,
        clientId: process.env.CLIENT_ID,
        clientSecret: process.env.CLIENT_SECRET,
        tenantId: process.env.TENANT_ID,
    };
    
    console.log('Config created:', {
        dataverseUrl: config.dataverseUrl,
        clientId: config.clientId ? 'SET' : 'MISSING',
        clientSecret: config.clientSecret ? 'SET' : 'MISSING',
        tenantId: config.tenantId ? 'SET' : 'MISSING'
    });
    
    const msalConfig = {
        auth: {
            clientId: config.clientId,
            clientSecret: config.clientSecret,
            authority: `https://login.microsoftonline.com/${config.tenantId}`,
        }
    };
    
    console.log('About to create MSAL instance...');
    const cca = new ConfidentialClientApplication(msalConfig);
    console.log('✅ MSAL instance created successfully');
    
} catch (error) {
    console.error('❌ Error:', error.message);
    console.error('Stack:', error.stack);
}
