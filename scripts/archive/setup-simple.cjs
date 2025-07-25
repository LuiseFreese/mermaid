#!/usr/bin/env node

/**
 * Simple Power Platform CLI Application User Setup
 * 
 * This script uses Power Platform CLI to create Application User automatically.
 * Uses the modern pac admin create-service-principal command.
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

function runCommand(command, description) {
    console.log(`📝 ${description}...`);
    
    try {
        const result = execSync(command, { 
            encoding: 'utf-8',
            stdio: 'pipe',
            timeout: 60000 
        });
        console.log(`✅ ${description} completed`);
        if (result.trim()) {
            console.log(result);
        }
        return result;
    } catch (error) {
        const errorOutput = error.stderr || error.stdout || error.message;
        console.error(`❌ ${description} failed:`, errorOutput);
        throw new Error(`${description} failed: ${errorOutput}`);
    }
}

function updateEnvFile(appId, secret) {
    console.log('📝 Automatically updating .env file with new credentials...');
    
    const envPath = path.join(__dirname, '..', '.env');
    
    try {
        let envContent = '';
        if (fs.existsSync(envPath)) {
            envContent = fs.readFileSync(envPath, 'utf-8');
        }
        
        // Update CLIENT_ID - ensure it's exact match
        if (envContent.includes('CLIENT_ID=')) {
            envContent = envContent.replace(/CLIENT_ID=.*$/m, `CLIENT_ID=${appId}`);
        } else {
            envContent += `\nCLIENT_ID=${appId}`;
        }
        
        // Update CLIENT_SECRET - ensure it's exact match
        if (envContent.includes('CLIENT_SECRET=')) {
            envContent = envContent.replace(/CLIENT_SECRET=.*$/m, `CLIENT_SECRET=${secret}`);
        } else {
            envContent += `\nCLIENT_SECRET=${secret}`;
        }
        
        // Write the file back
        fs.writeFileSync(envPath, envContent, 'utf-8');
        console.log('✅ .env file updated successfully!');
        console.log(`📋 Updated CLIENT_ID: ${appId}`);
        console.log(`🔑 Updated CLIENT_SECRET: ${secret.substring(0, 8)}...${secret.substring(secret.length - 4)}`);
        
        // Verify the update by reading it back
        const verifyContent = fs.readFileSync(envPath, 'utf-8');
        if (verifyContent.includes(`CLIENT_ID=${appId}`) && verifyContent.includes(`CLIENT_SECRET=${secret}`)) {
            console.log('✅ .env file verification passed!');
            return true;
        } else {
            console.log('⚠️ .env file verification failed!');
            return false;
        }
    } catch (error) {
        console.log('⚠️ Failed to automatically update .env file:', error.message);
        console.log('💡 Please manually update your .env file with:');
        console.log(`CLIENT_ID=${appId}`);
        console.log(`CLIENT_SECRET=${secret}`);
        return false;
    }
}

async function testAuthenticationWithCredentials(appId, secret) {
    console.log('🧪 Testing authentication with provided credentials...');
    
    // Temporarily update environment variables for testing
    const originalClientId = process.env.CLIENT_ID;
    const originalClientSecret = process.env.CLIENT_SECRET;
    
    process.env.CLIENT_ID = appId;
    process.env.CLIENT_SECRET = secret;
    
    try {
        const testResult = execSync('node src/index.js publishers', { 
            encoding: 'utf-8',
            timeout: 15000 
        });
        
        console.log('✅ Authentication test successful!');
        console.log('📋 Publishers result:');
        console.log(testResult);
    } catch (testError) {
        console.log('⚠️ Authentication test failed');
        console.log('💡 Try running: node src/index.js publishers');
        console.log('💡 Make sure to update your .env file first');
    } finally {
        // Restore original environment variables
        process.env.CLIENT_ID = originalClientId;
        process.env.CLIENT_SECRET = originalClientSecret;
    }
}

async function setupApplicationUser() {
    console.log('🚀 Starting automated Application User setup...\n');

    const dataverseUrl = process.env.DATAVERSE_URL;

    if (!dataverseUrl) {
        throw new Error('Missing DATAVERSE_URL in .env file');
    }

    console.log(`📋 Environment: ${dataverseUrl}`);
    console.log('📋 Creating completely NEW service principal (ignoring old credentials)');

    try {
        // Step 1: Clear existing auth
        console.log('🧹 Clearing existing authentication...');
        try {
            runCommand('pac auth clear', 'Clearing authentication');
        } catch (error) {
            console.log('⚠️ No existing auth to clear (this is fine)');
        }

        // Step 2: Create interactive authentication (will open browser)
        console.log('🔐 Creating interactive authentication...');
        console.log('📝 This will open a browser window - please sign in with your admin account');
        
        runCommand(`pac auth create --environment "${dataverseUrl}"`, 'Creating interactive authentication');

        // Step 3: Check if service principal already exists
        console.log('\n🔍 Checking for existing service principals...');
        try {
            const listResult = runCommand('az ad sp list --display-name "Mermaid Luise Auto" --query "[].{appId:appId, displayName:displayName}" --output table', 'Checking existing service principals');
            
            if (listResult.includes('Mermaid Luise Auto')) {
                console.log('⚠️ Service principal "Mermaid Luise Auto" already exists!');
                console.log('📋 Listing existing service principals:');
                console.log(listResult);
                
                // Extract App ID from existing service principal
                const existingAppMatch = listResult.match(/([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})/);
                if (existingAppMatch) {
                    const existingAppId = existingAppMatch[1];
                    console.log(`\n✨ EXISTING APP ID FOUND: ${existingAppId}`);
                    
                    // Create a new client secret for the existing app
                    console.log('🔑 Creating new client secret for existing app...');
                    try {
                        const secretResult = runCommand(`az ad app credential reset --id ${existingAppId} --display-name "Mermaid Auto Generated Secret" --query "password" --output tsv`, 'Creating new client secret');
                        const newSecret = secretResult.trim();
                        
                        console.log('\n✨ NEW SECRET CREATED FOR EXISTING APP:');
                        console.log(`📋 App ID: ${existingAppId}`);
                        console.log(`🔑 New Secret: ${newSecret}`);
                        
                        // Automatically update the .env file
                        const envUpdated = updateEnvFile(existingAppId, newSecret);
                        
                        if (envUpdated) {
                            console.log('\n✅ .env file automatically updated with new credentials!');
                        } else {
                            console.log('\n⚠️ IMPORTANT: Update your .env file with these credentials:');
                            console.log(`CLIENT_ID=${existingAppId}`);
                            console.log(`CLIENT_SECRET=${newSecret}`);
                        }
                        
                        // Test the existing/updated credentials
                        console.log('\n🧪 Testing authentication with existing app...');
                        await testAuthenticationWithCredentials(existingAppId, newSecret);
                        
                        return; // Exit early since we're using existing app
                    } catch (secretError) {
                        console.log('❌ Failed to create new secret for existing app:', secretError.message);
                        console.log('💡 Fallback: Go to Azure Portal → App registrations → "Mermaid Luise Auto" → Certificates & secrets');
                        console.log('💡 Or delete the existing app and run this script again to create fresh');
                        return;
                    }
                }
            } else {
                console.log('✅ No existing service principal found, proceeding with creation...');
            }
        } catch (error) {
            console.log('⚠️ Could not check existing service principals, proceeding with creation...');
        }

        // Step 4: Create a NEW service principal with Power Platform CLI
        // This will create both the Azure service principal AND the Dataverse Application User
        console.log('\n👤 Creating NEW Service Principal with Power Platform CLI...');
        console.log('📋 This will create a fresh service principal and Application User automatically');
        
        const createCommand = `pac admin create-service-principal --environment "${dataverseUrl}" --name "Mermaid Luise Auto" --role "System Administrator"`;
        
        const result = runCommand(createCommand, 'Creating Service Principal and Application User');
        
        // Extract the new credentials from the output
        console.log('\n📋 Service Principal created! Output:');
        console.log(result);
        
        // Look for the new App ID in the output
        const appIdMatch = result.match(/Application ID:\s*([a-f0-9\-]{36})/i) || result.match(/ClientId:\s*([a-f0-9\-]{36})/i);
        const secretMatch = result.match(/Client Secret:\s*([^\s\n]+)/i) || result.match(/Secret:\s*([^\s\n]+)/i);
        
        if (appIdMatch && secretMatch) {
            const newAppId = appIdMatch[1];
            const newSecret = secretMatch[1];
            
            console.log('\n✨ NEW CREDENTIALS DETECTED:');
            console.log(`📋 New App ID: ${newAppId}`);
            console.log(`🔑 New Secret: ${newSecret}`);
            
            // Automatically update the .env file
            const envUpdated = updateEnvFile(newAppId, newSecret);
            
            if (envUpdated) {
                console.log('\n✅ .env file automatically updated with new credentials!');
            } else {
                console.log('\n⚠️ IMPORTANT: You need to update your .env file with these new credentials!');
                console.log('\nUpdate your .env file:');
                console.log(`CLIENT_ID=${newAppId}`);
                console.log(`CLIENT_SECRET=${newSecret}`);
            }
        }

        console.log('\n🎉 Application User setup completed successfully!');
        
        // Step 4: Test authentication
        console.log('\n⏳ Waiting for permissions to propagate...');
        await new Promise(resolve => setTimeout(resolve, 5000));
        
        console.log('🧪 Testing service principal authentication...');
        try {
            const testResult = execSync('node src/index.js publishers', { 
                encoding: 'utf-8',
                timeout: 15000 
            });
            
            console.log('✅ Authentication test successful!');
            console.log('📋 Publishers result:');
            console.log(testResult);
        } catch (testError) {
            console.log('⚠️ Authentication test failed, but Application User was created');
            console.log('💡 Try running: node src/index.js publishers');
            console.log('💡 If it still fails, wait a few minutes for permissions to propagate');
        }

    } catch (error) {
        console.error('\n❌ Setup failed:', error.message);
        
        if (error.message.includes('already exists') || error.message.includes('duplicate')) {
            console.log('\n✅ Application User already exists!');
            console.log('🧪 Testing authentication...');
            
            try {
                const testResult = execSync('node src/index.js publishers', { encoding: 'utf-8' });
                console.log('✅ Authentication working!');
                console.log(testResult);
            } catch (testError) {
                console.log('⚠️ Application User exists but authentication still failing');
                console.log('💡 Check permissions in Power Platform Admin Center');
            }
        } else {
            console.log('\n🔧 Troubleshooting tips:');
            console.log('1. Ensure you have System Administrator permissions in the Dataverse environment');
            console.log('2. Verify the environment URL is correct');
            console.log('3. Try the manual setup in Power Platform Admin Center');
            console.log(`4. Environment: ${dataverseUrl}`);
            console.log('5. Check that Power Platform CLI is properly installed');
        }
    }
}

// Run the setup
setupApplicationUser().catch(error => {
    console.error('Fatal error:', error.message);
    process.exit(1);
});
