#!/usr/bin/env node

console.log('TESTING 1 2 3');

try {
    console.log('About to require dotenv');
    require('dotenv').config();
    console.log('dotenv loaded');
    
    console.log('About to check env vars');
    console.log('DATAVERSE_URL:', process.env.DATAVERSE_URL);
    console.log('TENANT_ID:', process.env.TENANT_ID);
    
} catch (error) {
    console.error('Error:', error);
}
