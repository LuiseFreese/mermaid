#!/usr/bin/env node

console.log('🚀 Starting fresh Application User Setup Script...');

const axios = require('axios');
const { execSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

console.log('📦 Dependencies loaded');

async function main() {
    try {
        console.log('🔍 Checking environment...');
        
        const dataverseUrl = process.env.DATAVERSE_URL;
        const tenantId = process.env.TENANT_ID;
        const clientId = process.env.CLIENT_ID;
        const clientSecret = process.env.CLIENT_SECRET;
        
        console.log('Environment variables:');
        console.log(`DATAVERSE_URL: ${dataverseUrl}`);
        console.log(`TENANT_ID: ${tenantId}`);
        console.log(`CLIENT_ID: ${clientId || 'MISSING'}`);
        console.log(`CLIENT_SECRET: ${clientSecret ? 'SET' : 'MISSING'}`);
        
        if (!dataverseUrl || !tenantId) {
            throw new Error('Missing required environment variables: DATAVERSE_URL or TENANT_ID');
        }
        
        if (!clientId || !clientSecret) {
            console.log('⚠️ CLIENT_ID or CLIENT_SECRET missing - will create new app registration');
            
            console.log('🔍 Checking for existing app registration...');
            try {
                const result = execSync('az ad sp list --display-name "Mermaid Luise Auto" --query "[].{appId:appId, displayName:displayName}" --output table', { 
                    encoding: 'utf-8',
                    timeout: 30000 
                });
                
                console.log('🔍 Existing app registrations:');
                console.log(result);
                
                if (result.includes('Mermaid Luise Auto')) {
                    console.log('✅ Found existing app registration');
                    // Extract appId from the table output
                    const lines = result.split('\n');
                    const dataLine = lines.find(line => line.includes('Mermaid Luise Auto'));
                    if (dataLine) {
                        const appId = dataLine.trim().split(/\s+/)[0];
                        console.log(`Found existing app ID: ${appId}`);
                        
                        // Generate new secret
                        console.log('🔐 Generating new secret...');
                        const secretResult = execSync(`az ad app credential reset --id ${appId} --query "password" --output tsv`, { 
                            encoding: 'utf-8',
                            timeout: 30000 
                        });
                        const newSecret = secretResult.trim();
                        
                        console.log('🔄 Updating .env file...');
                        const envPath = path.join(process.cwd(), '.env');
                        let envContent = fs.readFileSync(envPath, 'utf-8');
                        
                        // Update CLIENT_ID
                        if (envContent.includes('CLIENT_ID=')) {
                            envContent = envContent.replace(/CLIENT_ID=.*/, `CLIENT_ID=${appId}`);
                        } else {
                            envContent += `\nCLIENT_ID=${appId}`;
                        }
                        
                        // Update CLIENT_SECRET
                        if (envContent.includes('CLIENT_SECRET=')) {
                            envContent = envContent.replace(/CLIENT_SECRET=.*/, `CLIENT_SECRET=${newSecret}`);
                        } else {
                            envContent += `\nCLIENT_SECRET=${newSecret}`;
                        }
                        
                        fs.writeFileSync(envPath, envContent);
                        
                        console.log('✅ .env file updated successfully');
                        console.log(`CLIENT_ID: ${appId}`);
                        console.log(`CLIENT_SECRET: ${newSecret.substring(0, 10)}...`);
                        
                        process.env.CLIENT_ID = appId;
                        process.env.CLIENT_SECRET = newSecret;
                        
                    }
                } else {
                    console.log('🆕 No existing app registration found, creating new one...');
                    
                    console.log('🔨 Creating new app registration...');
                    const createResult = execSync('az ad app create --display-name "Mermaid Luise Auto" --sign-in-audience AzureADMyOrg --query "appId" --output tsv', { 
                        encoding: 'utf-8',
                        timeout: 30000 
                    });
                    const newAppId = createResult.trim();
                    console.log(`✅ Created new app registration: ${newAppId}`);
                    
                    console.log('🔐 Generating secret for new app...');
                    const secretResult = execSync(`az ad app credential reset --id ${newAppId} --query "password" --output tsv`, { 
                        encoding: 'utf-8',
                        timeout: 30000 
                    });
                    const newSecret = secretResult.trim();
                    console.log('✅ Secret generated');
                    
                    console.log('🔄 Updating .env file...');
                    const envPath = path.join(process.cwd(), '.env');
                    let envContent = fs.readFileSync(envPath, 'utf-8');
                    
                    // Update CLIENT_ID
                    if (envContent.includes('CLIENT_ID=')) {
                        envContent = envContent.replace(/CLIENT_ID=.*/, `CLIENT_ID=${newAppId}`);
                    } else {
                        envContent += `\nCLIENT_ID=${newAppId}`;
                    }
                    
                    // Update CLIENT_SECRET
                    if (envContent.includes('CLIENT_SECRET=')) {
                        envContent = envContent.replace(/CLIENT_SECRET=.*/, `CLIENT_SECRET=${newSecret}`);
                    } else {
                        envContent += `\nCLIENT_SECRET=${newSecret}`;
                    }
                    
                    fs.writeFileSync(envPath, envContent);
                    
                    console.log('✅ .env file updated successfully');
                    console.log(`CLIENT_ID: ${newAppId}`);
                    console.log(`CLIENT_SECRET: ${newSecret.substring(0, 10)}...`);
                    
                    process.env.CLIENT_ID = newAppId;
                    process.env.CLIENT_SECRET = newSecret;
                }
                
            } catch (error) {
                console.error('❌ Error checking app registrations:', error.message);
                throw error;
            }
        }
        
        console.log('✅ Setup completed successfully!');
        
    } catch (error) {
        console.error('❌ Setup failed:', error.message);
        process.exit(1);
    }
}

// Run the main function
main();
