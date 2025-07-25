#!/usr/bin/env node

/**
 * Automated Application User Setup using Power Platform CLI
 * 
 * This script automatically creates an Application User in Dataverse
 * using Power Platform CLI with System Administrator role.
 * 
 * Usage: node scripts/setup-app-user-cli.js
 */

const { execSync, spawn } = require('child_process');
const path = require('path');
require('dotenv').config();

class PowerPlatformApplicationUserSetup {
    constructor() {
        this.config = {
            dataverseUrl: process.env.DATAVERSE_URL,
            clientId: process.env.CLIENT_ID,
            clientSecret: process.env.CLIENT_SECRET,
            tenantId: process.env.TENANT_ID,
        };

        this.validateConfig();
    }

    validateConfig() {
        const required = ['DATAVERSE_URL', 'CLIENT_ID', 'CLIENT_SECRET', 'TENANT_ID'];
        const missing = required.filter(key => !process.env[key]);
        
        if (missing.length > 0) {
            throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
        }

        console.log('✅ Configuration validated');
    }

    async runCommand(command, description) {
        console.log(`📝 ${description}...`);
        
        try {
            const result = execSync(command, { 
                encoding: 'utf-8',
                stdio: 'pipe',
                timeout: 30000 // 30 second timeout
            });
            console.log(`✅ ${description} completed`);
            return result;
        } catch (error) {
            const errorOutput = error.stderr || error.stdout || error.message;
            console.error(`❌ ${description} failed:`, errorOutput);
            throw new Error(`${description} failed: ${errorOutput}`);
        }
    }

    async authenticateWithUserAccount() {
        console.log('🔐 Authenticating with your user account...');
        console.log('📝 This will open a browser window for authentication');
        
        try {
            // Clear any existing auth
            await this.runCommand('pac auth clear', 'Clearing existing authentication');
            
            // Create interactive auth for the environment
            const authCommand = `pac auth create --environment "${this.config.dataverseUrl}"`;
            await this.runCommand(authCommand, 'Creating user authentication');
            
            console.log('✅ User authentication successful');
        } catch (error) {
            console.error('❌ User authentication failed:', error.message);
            throw error;
        }
    }

    async createApplicationUser() {
        console.log('👤 Creating Application User with Power Platform CLI...');
        
        try {
            // Use pac admin create-user to add application user
            const createUserCommand = `pac admin create-user --environment "${this.config.dataverseUrl}" --application-id "${this.config.clientId}" --role "System Administrator"`;
            
            const result = await this.runCommand(createUserCommand, 'Creating Application User');
            
            console.log('✅ Application User created successfully with System Administrator role');
            return result;
        } catch (error) {
            // Check if user already exists
            if (error.message.includes('already exists') || error.message.includes('duplicate')) {
                console.log('⚠️ Application User already exists');
                return 'already exists';
            }
            
            console.error('❌ Failed to create Application User:', error.message);
            throw error;
        }
    }

    async listApplicationUsers() {
        console.log('📋 Listing Application Users...');
        
        try {
            const listCommand = `pac admin list-users --environment "${this.config.dataverseUrl}" --application-users`;
            const result = await this.runCommand(listCommand, 'Listing Application Users');
            
            console.log('Application Users in environment:');
            console.log(result);
            
            return result;
        } catch (error) {
            console.warn('⚠️ Could not list Application Users:', error.message);
            return null;
        }
    }

    async testAuthentication() {
        console.log('\n🧪 Testing service principal authentication...');
        
        try {
            const result = execSync('node src/index.js publishers', { 
                encoding: 'utf-8',
                timeout: 15000 
            });
            
            console.log('✅ Authentication test successful!');
            console.log('📋 Publishers result:');
            console.log(result);
            
            return true;
        } catch (error) {
            console.error('❌ Authentication test failed:', error.message);
            return false;
        }
    }

    async run() {
        try {
            console.log('🚀 Starting automated Application User setup with Power Platform CLI...\n');

            // Step 1: Authenticate with your user account (interactive)
            await this.authenticateWithUserAccount();

            // Step 2: List existing Application Users
            await this.listApplicationUsers();

            // Step 3: Create Application User with System Administrator role
            await this.createApplicationUser();

            // Step 4: Test the service principal authentication
            console.log('\n⏳ Waiting a moment for permissions to propagate...');
            await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5 seconds

            const testResult = await this.testAuthentication();
            
            if (testResult) {
                console.log('\n🎉 Application User setup completed successfully!');
                console.log('✅ Your service principal now has access to Dataverse');
            } else {
                console.log('\n⚠️ Application User created but authentication test failed');
                console.log('💡 Try running: node src/index.js publishers');
                console.log('💡 If it still fails, wait a few minutes for permissions to propagate');
            }

        } catch (error) {
            console.error('\n❌ Setup failed:', error.message);
            console.log('\n🔧 Troubleshooting tips:');
            console.log('1. Ensure you have System Administrator permissions in the Dataverse environment');
            console.log('2. Verify the environment URL is correct');
            console.log('3. Try the manual setup in Power Platform Admin Center');
            process.exit(1);
        }
    }
}

// Run the setup
if (require.main === module) {
    const setup = new PowerPlatformApplicationUserSetup();
    setup.run();
}

module.exports = PowerPlatformApplicationUserSetup;
