#!/usr/bin/env node

console.log('🚀 Minimal Test Starting...');

try {
    require('dotenv').config();
    
    console.log('Environment check:');
    console.log('DATAVERSE_URL:', process.env.DATAVERSE_URL || 'MISSING');
    console.log('TENANT_ID:', process.env.TENANT_ID || 'MISSING');
    console.log('CLIENT_ID:', process.env.CLIENT_ID || 'MISSING');
    console.log('CLIENT_SECRET:', process.env.CLIENT_SECRET || 'MISSING');
    
    // Test the validation logic
    const required = ['DATAVERSE_URL', 'TENANT_ID'];
    const missing = required.filter(key => !process.env[key]);
    
    console.log('Missing required vars:', missing);
    
    if (missing.length > 0) {
        throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
    }
    
    console.log('✅ Validation passed');
    
    // Test CLIENT_ID check
    if (!process.env.CLIENT_ID || !process.env.CLIENT_SECRET) {
        console.log('⚠️ CLIENT_ID or CLIENT_SECRET missing - will create new app registration');
    }
    
    console.log('✅ All checks passed');
    
} catch (error) {
    console.error('❌ Error:', error.message);
}
