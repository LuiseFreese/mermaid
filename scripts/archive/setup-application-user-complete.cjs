#!/usr/bin/env node

/**
 * Automated Application User Setup for Dataverse - Complete Version
 * 
 * This script automatically:
 * 1. Checks for existing app registrations and creates one if needed
 * 2. Generates fresh secrets and updates the .env file automatically
 * 3. Authenticates to Dataverse using service principal
 * 4. Creates an Application User for the service principal
 * 5. Assigns System Administrator role to the Application User
 * 6. Tests authentication by calling the publishers endpoint
 * 
 * Prerequisites:
 * - Azure CLI installed and logged in
 * - .env file with DATAVERSE_URL and TENANT_ID
 * - Admin permissions in Dataverse environment
 * 
 * Usage: node scripts/setup-application-user-complete.cjs
 */

const axios = require('axios');
const { ConfidentialClientApplication } = require('@azure/msal-node');
const { execSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

class DataverseApplicationUserSetup {
    constructor() {
        this.config = {
            dataverseUrl: process.env.DATAVERSE_URL,
            clientId: process.env.CLIENT_ID,
            clientSecret: process.env.CLIENT_SECRET,
            tenantId: process.env.TENANT_ID,
        };

        this.validateConfig();

        // Initialize MSAL only if we have credentials
        if (this.config.clientId && this.config.clientSecret) {
            this.msalConfig = {
                auth: {
                    clientId: this.config.clientId,
                    clientSecret: this.config.clientSecret,
                    authority: `https://login.microsoftonline.com/${this.config.tenantId}`,
                }
            };
            this.cca = new ConfidentialClientApplication(this.msalConfig);
        }
    }

    validateConfig() {
        const required = ['DATAVERSE_URL', 'TENANT_ID'];
        const missing = required.filter(key => !process.env[key]);
        
        if (missing.length > 0) {
            throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
        }

        console.log('✅ Configuration validated');
    }

    async checkExistingAppRegistration() {
        try {
            console.log('🔍 Checking for existing app registration...');
            const result = execSync('az ad sp list --display-name "Mermaid Luise Auto" --query "[].{appId:appId, displayName:displayName}" --output table', { 
                encoding: 'utf-8',
                timeout: 30000 
            });
            
            if (result.includes('Mermaid Luise Auto')) {
                console.log('✅ Found existing app registration');
                const appIdMatch = result.match(/([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})/);
                if (appIdMatch) {
                    return appIdMatch[1];
                }
            }
            console.log('ℹ️ No existing app registration found');
            return null;
        } catch (error) {
            console.warn('⚠️ Could not check existing app registrations:', error.message);
            return null;
        }
    }

    async createNewAppRegistration() {
        try {
            console.log('📝 Creating new app registration...');
            
            // Create the app registration
            const createResult = execSync('az ad app create --display-name "Mermaid Luise Auto" --query "appId" --output tsv', { 
                encoding: 'utf-8',
                timeout: 30000 
            });
            
            const appId = createResult.trim();
            if (!appId || appId.length < 30) {
                throw new Error('Invalid app ID returned from creation');
            }
            
            console.log(`✅ App registration created: ${appId}`);
            
            // Create service principal
            console.log('🔧 Creating service principal...');
            execSync(`az ad sp create --id ${appId}`, { 
                encoding: 'utf-8',
                timeout: 30000 
            });
            
            console.log('✅ Service principal created');
            
            // Generate initial client secret
            console.log('🔐 Generating client secret...');
            const secretResult = execSync(`az ad app credential reset --id ${appId} --display-name "Mermaid Auto Generated Secret" --query "password" --output tsv`, { 
                encoding: 'utf-8',
                timeout: 30000 
            });
            
            const clientSecret = secretResult.trim();
            if (!clientSecret || clientSecret.length < 10) {
                throw new Error('Invalid client secret generated');
            }
            
            console.log('✅ Client secret generated');
            
            return { appId, clientSecret };
        } catch (error) {
            console.error('❌ Failed to create app registration:', error.message);
            throw error;
        }
    }

    async generateFreshSecret(appId) {
        try {
            console.log('🔄 Generating fresh client secret...');
            const result = execSync(`az ad app credential reset --id ${appId} --display-name "Mermaid Auto Generated Secret" --query "password" --output tsv`, { 
                encoding: 'utf-8',
                timeout: 30000 
            });
            
            const newSecret = result.trim();
            if (newSecret && newSecret.length > 10) {
                console.log('✅ Fresh secret generated');
                return newSecret;
            }
            throw new Error('Invalid secret generated');
        } catch (error) {
            console.error('❌ Failed to generate fresh secret:', error.message);
            throw error;
        }
    }

    updateEnvFile(appId, secret) {
        try {
            console.log('📝 Updating .env file...');
            const envPath = path.join(__dirname, '..', '.env');
            
            let envContent = '';
            if (fs.existsSync(envPath)) {
                envContent = fs.readFileSync(envPath, 'utf-8');
            }
            
            // Update CLIENT_ID
            if (envContent.includes('CLIENT_ID=')) {
                envContent = envContent.replace(/CLIENT_ID=.*$/m, `CLIENT_ID=${appId}`);
            } else {
                envContent += `\nCLIENT_ID=${appId}`;
            }
            
            // Update CLIENT_SECRET
            if (envContent.includes('CLIENT_SECRET=')) {
                envContent = envContent.replace(/CLIENT_SECRET=.*$/m, `CLIENT_SECRET=${secret}`);
            } else {
                envContent += `\nCLIENT_SECRET=${secret}`;
            }
            
            fs.writeFileSync(envPath, envContent, 'utf-8');
            console.log('✅ .env file updated successfully');
            
            // Update process environment variables immediately
            process.env.CLIENT_ID = appId;
            process.env.CLIENT_SECRET = secret;
            
            // Update config for current session
            this.config.clientId = appId;
            this.config.clientSecret = secret;
            
            // Initialize or update MSAL with new credentials
            this.msalConfig = {
                auth: {
                    clientId: appId,
                    clientSecret: secret,
                    authority: `https://login.microsoftonline.com/${this.config.tenantId}`,
                }
            };
            
            // Create a completely new MSAL instance to avoid any caching issues
            this.cca = new ConfidentialClientApplication(this.msalConfig);
            
            console.log('✅ Credentials updated in memory');
            return true;
        } catch (error) {
            console.error('❌ Failed to update .env file:', error.message);
            return false;
        }
    }

    async getAccessToken() {
        try {
            console.log('🔐 Getting access token...');
            const clientCredentialRequest = {
                scopes: [`${this.config.dataverseUrl}/.default`]
            };

            try {
                // Try silent authentication first (like the main app)
                const response = await this.cca.acquireTokenSilent(clientCredentialRequest);
                console.log('✅ Access token obtained (silent)');
                return response.accessToken;
            } catch (error) {
                // If silent authentication fails, try acquiring token
                const response = await this.cca.acquireTokenByClientCredential(clientCredentialRequest);
                console.log('✅ Access token obtained (credential)');
                return response.accessToken;
            }
        } catch (error) {
            console.error('❌ Failed to get access token:', error.message);
            throw error;
        }
    }

    async checkExistingApplicationUser(accessToken) {
        try {
            console.log('🔍 Checking for existing Application User...');
            const response = await axios.get(
                `${this.config.dataverseUrl}/api/data/v9.2/systemusers?$filter=applicationid eq ${this.config.clientId}`,
                {
                    headers: {
                        'Authorization': `Bearer ${accessToken}`,
                        'Content-Type': 'application/json',
                        'OData-MaxVersion': '4.0',
                        'OData-Version': '4.0'
                    }
                }
            );

            const existingUsers = response.data.value;
            if (existingUsers.length > 0) {
                console.log(`✅ Found ${existingUsers.length} existing Application User(s)`);
                return existingUsers;
            }

            console.log('ℹ️ No existing Application Users found');
            return [];
        } catch (error) {
            console.error('❌ Failed to check existing Application Users:', error.response?.data || error.message);
            throw error;
        }
    }

    async getBusinessUnit(accessToken) {
        try {
            console.log('🏢 Getting root business unit...');
            const response = await axios.get(
                `${this.config.dataverseUrl}/api/data/v9.2/businessunits?$filter=parentbusinessunitid eq null&$select=businessunitid,name`,
                {
                    headers: {
                        'Authorization': `Bearer ${accessToken}`,
                        'Content-Type': 'application/json',
                        'OData-MaxVersion': '4.0',
                        'OData-Version': '4.0'
                    }
                }
            );

            const rootBusinessUnit = response.data.value[0];
            if (!rootBusinessUnit) {
                throw new Error('No root business unit found');
            }

            console.log(`✅ Found business unit: ${rootBusinessUnit.name}`);
            return rootBusinessUnit.businessunitid;
        } catch (error) {
            console.error('❌ Failed to get business unit:', error.response?.data || error.message);
            throw error;
        }
    }

    async getSystemAdministratorRole(accessToken) {
        try {
            console.log('🔑 Getting System Administrator role...');
            const response = await axios.get(
                `${this.config.dataverseUrl}/api/data/v9.2/roles?$filter=name eq 'System Administrator'&$select=roleid,name`,
                {
                    headers: {
                        'Authorization': `Bearer ${accessToken}`,
                        'Content-Type': 'application/json',
                        'OData-MaxVersion': '4.0',
                        'OData-Version': '4.0'
                    }
                }
            );

            const systemAdminRole = response.data.value[0];
            if (!systemAdminRole) {
                throw new Error('System Administrator role not found');
            }

            console.log('✅ Found System Administrator role');
            return systemAdminRole.roleid;
        } catch (error) {
            console.error('❌ Failed to get System Administrator role:', error.response?.data || error.message);
            throw error;
        }
    }

    async createApplicationUser(accessToken, businessUnitId) {
        console.log('👤 Creating Application User...');
        const applicationUserData = {
            "applicationid": this.config.clientId,
            "businessunitid@odata.bind": `/businessunits(${businessUnitId})`,
            "firstname": "Mermaid",
            "lastname": "Luise Service Principal",
            "fullname": "Mermaid Luise Service Principal",
            "domainname": this.config.clientId,
            "isdisabled": false
        };

        try {
            const response = await axios.post(
                `${this.config.dataverseUrl}/api/data/v9.2/systemusers`,
                applicationUserData,
                {
                    headers: {
                        'Authorization': `Bearer ${accessToken}`,
                        'Content-Type': 'application/json',
                        'OData-MaxVersion': '4.0',
                        'OData-Version': '4.0'
                    }
                }
            );

            const userId = response.headers['odata-entityid'].split('(')[1].split(')')[0];
            console.log('✅ Application User created successfully');
            return userId;
        } catch (error) {
            console.error('❌ Failed to create Application User:', error.response?.data || error.message);
            throw error;
        }
    }

    async assignRole(accessToken, userId, roleId) {
        try {
            console.log('🔑 Assigning System Administrator role...');
            await axios.post(
                `${this.config.dataverseUrl}/api/data/v9.2/systemusers(${userId})/systemuserroles_association/$ref`,
                {
                    "@odata.id": `${this.config.dataverseUrl}/api/data/v9.2/roles(${roleId})`
                },
                {
                    headers: {
                        'Authorization': `Bearer ${accessToken}`,
                        'Content-Type': 'application/json',
                        'OData-MaxVersion': '4.0',
                        'OData-Version': '4.0'
                    }
                }
            );

            console.log('✅ System Administrator role assigned successfully');
        } catch (error) {
            console.error('❌ Failed to assign role:', error.response?.data || error.message);
            throw error;
        }
    }

    async cleanupDuplicateApplicationUsers(accessToken) {
        try {
            console.log('🧹 Checking for duplicate Application Users...');
            // Get all application users (not just current client)
            const response = await axios.get(
                `${this.config.dataverseUrl}/api/data/v9.2/systemusers?$filter=applicationid ne null&$select=systemuserid,applicationid,fullname`,
                {
                    headers: {
                        'Authorization': `Bearer ${accessToken}`,
                        'Content-Type': 'application/json',
                        'OData-MaxVersion': '4.0',
                        'OData-Version': '4.0'
                    }
                }
            );

            const applicationUsers = response.data.value;
            const duplicates = applicationUsers.filter(user => 
                user.applicationid && 
                user.applicationid !== this.config.clientId &&
                user.fullname?.includes('Mermaid')
            );

            if (duplicates.length > 0) {
                console.log(`🗑️ Removing ${duplicates.length} duplicate Application Users`);
                
                for (const duplicate of duplicates) {
                    try {
                        await axios.delete(
                            `${this.config.dataverseUrl}/api/data/v9.2/systemusers(${duplicate.systemuserid})`,
                            {
                                headers: {
                                    'Authorization': `Bearer ${accessToken}`,
                                    'OData-MaxVersion': '4.0',
                                    'OData-Version': '4.0'
                                }
                            }
                        );
                        console.log(`✅ Removed: ${duplicate.fullname}`);
                    } catch (error) {
                        console.warn(`⚠️ Could not remove ${duplicate.fullname}: ${error.message}`);
                    }
                }
            } else {
                console.log('✅ No duplicate Application Users found');
            }
        } catch (error) {
            console.warn('⚠️ Failed to cleanup duplicates:', error.message);
            // Don't throw - this is cleanup, not critical
        }
    }

    async run() {
        try {
            console.log('🚀 Starting Automated Application User Setup...');
            console.log('===============================================\n');

            // Step 1: Check for existing app registration
            const existingAppId = await this.checkExistingAppRegistration();
            
            if (existingAppId && this.config.clientId && existingAppId === this.config.clientId) {
                // Case 1: App registration exists and matches our CLIENT_ID, generate fresh secret
                console.log('🔄 App registration exists, generating fresh secret...');
                const newSecret = await this.generateFreshSecret(existingAppId);
                this.updateEnvFile(existingAppId, newSecret);
                
                console.log('🔄 Credentials updated, restarting process with fresh authentication...');
                console.log('Updated credentials:');
                console.log(`CLIENT_ID: ${existingAppId}`);
                console.log(`CLIENT_SECRET: ${newSecret.substring(0, 10)}...`);
                
                // Exit and restart the process to avoid MSAL caching issues
                console.log('\n🔄 Restarting script to ensure fresh authentication...');
                const child = spawn('node', [__filename], {
                    stdio: 'inherit',
                    cwd: process.cwd(),
                    env: process.env
                });
                
                child.on('close', (code) => {
                    process.exit(code);
                });
                
                return; // Exit current process
            } else if (existingAppId && this.config.clientId && existingAppId !== this.config.clientId) {
                // Case 2: App registration exists but doesn't match our CLIENT_ID, update .env
                console.log('⚠️ App registration exists but CLIENT_ID mismatch, updating credentials...');
                const newSecret = await this.generateFreshSecret(existingAppId);
                this.updateEnvFile(existingAppId, newSecret);
                
                console.log('🔄 Credentials updated, restarting process...');
                const child = spawn('node', [__filename], {
                    stdio: 'inherit',
                    cwd: process.cwd(),
                    env: process.env
                });
                
                child.on('close', (code) => {
                    process.exit(code);
                });
                
                return; // Exit current process
            } else if (!existingAppId) {
                // Case 3: No app registration exists, create everything from scratch
                console.log('📝 No app registration found, creating from scratch...');
                const { appId, clientSecret } = await this.createNewAppRegistration();
                this.updateEnvFile(appId, clientSecret);
                
                console.log('✅ New app registration created and configured');
                console.log(`CLIENT_ID: ${appId}`);
                console.log(`CLIENT_SECRET: ${clientSecret.substring(0, 10)}...`);
                
                // Update current instance config for this run
                this.config.clientId = appId;
                this.config.clientSecret = clientSecret;
            } else if (existingAppId && !this.config.clientId) {
                // Case 4: App registration exists but no CLIENT_ID in .env
                console.log('🔄 App registration exists but no CLIENT_ID in .env, updating...');
                const newSecret = await this.generateFreshSecret(existingAppId);
                this.updateEnvFile(existingAppId, newSecret);
                
                // Update current instance config for this run
                this.config.clientId = existingAppId;
                this.config.clientSecret = newSecret;
            }

            console.log('\n🔐 Starting Dataverse operations...');

            // Step 2: Get access token
            const accessToken = await this.getAccessToken();

            // Step 3: Clean up duplicates first
            await this.cleanupDuplicateApplicationUsers(accessToken);

            // Step 4: Check if Application User already exists
            const existingUsers = await this.checkExistingApplicationUser(accessToken);
            
            if (existingUsers.length > 0) {
                console.log('✅ Application User already exists, skipping creation');
                console.log('\n🎯 Testing authentication...');
                await this.testAuthentication();
                return;
            }

            // Step 5: Get business unit
            const businessUnitId = await this.getBusinessUnit(accessToken);

            // Step 6: Get System Administrator role
            const roleId = await this.getSystemAdministratorRole(accessToken);

            // Step 7: Create Application User
            const userId = await this.createApplicationUser(accessToken, businessUnitId);

            // Step 8: Assign System Administrator role
            await this.assignRole(accessToken, userId, roleId);

            console.log('\n🎉 Application User setup completed successfully!');
            
            // Step 9: Test authentication
            console.log('\n🎯 Testing authentication...');
            await this.testAuthentication();

        } catch (error) {
            console.error('\n❌ Setup failed:', error.message);
            process.exit(1);
        }
    }

    async testAuthentication() {
        try {
            const result = execSync('node src/index.js publishers', { encoding: 'utf-8' });
            console.log('✅ Authentication test successful!');
            console.log('\n📋 Publishers test result:');
            console.log(result);
        } catch (error) {
            console.error('❌ Authentication test failed:', error.message);
            throw error;
        }
    }
}

// Run the setup
if (require.main === module) {
    const setup = new DataverseApplicationUserSetup();
    setup.run();
}

module.exports = DataverseApplicationUserSetup;
