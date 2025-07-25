#!/usr/bin/env node

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

console.log('🚀 Creating App Registration...');

try {
    // Step 1: Create the app registration
    console.log('Creating app registration...');
    const createResult = execSync('az ad app create --display-name "Mermaid Luise Auto" --query "appId" --output tsv', { 
        encoding: 'utf-8',
        timeout: 60000 
    });
    
    const appId = createResult.trim();
    console.log('✅ App ID:', appId);
    
    // Step 2: Create service principal
    console.log('Creating service principal...');
    execSync(`az ad sp create --id ${appId}`, { 
        encoding: 'utf-8',
        timeout: 60000 
    });
    console.log('✅ Service principal created');
    
    // Step 3: Generate client secret
    console.log('Generating client secret...');
    const secretResult = execSync(`az ad app credential reset --id ${appId} --display-name "Auto Generated Secret" --query "password" --output tsv`, { 
        encoding: 'utf-8',
        timeout: 60000 
    });
    
    const clientSecret = secretResult.trim();
    console.log('✅ Client secret generated');
    
    // Step 4: Update .env file
    console.log('Updating .env file...');
    const envPath = path.join(process.cwd(), '.env');
    let envContent = fs.readFileSync(envPath, 'utf-8');
    
    // Update or add CLIENT_ID
    if (envContent.includes('# CLIENT_ID=')) {
        envContent = envContent.replace(/# CLIENT_ID=.*$/m, `CLIENT_ID=${appId}`);
    } else if (envContent.includes('CLIENT_ID=')) {
        envContent = envContent.replace(/CLIENT_ID=.*$/m, `CLIENT_ID=${appId}`);
    } else {
        envContent += `\nCLIENT_ID=${appId}`;
    }
    
    // Update or add CLIENT_SECRET
    if (envContent.includes('# CLIENT_SECRET=')) {
        envContent = envContent.replace(/# CLIENT_SECRET=.*$/m, `CLIENT_SECRET=${clientSecret}`);
    } else if (envContent.includes('CLIENT_SECRET=')) {
        envContent = envContent.replace(/CLIENT_SECRET=.*$/m, `CLIENT_SECRET=${clientSecret}`);
    } else {
        envContent += `\nCLIENT_SECRET=${clientSecret}`;
    }
    
    fs.writeFileSync(envPath, envContent, 'utf-8');
    console.log('✅ .env file updated');
    
    console.log('\n🎉 App registration created successfully!');
    console.log(`CLIENT_ID: ${appId}`);
    console.log(`CLIENT_SECRET: ${clientSecret.substring(0, 10)}...`);
    
} catch (error) {
    console.error('❌ Error:', error.message);
}
