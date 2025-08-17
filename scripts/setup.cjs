#!/usr/bin/env node

/**
 * Automated Application User Setup for Dataverse
 * 
 * This script automatically:
 * 1. Checks for existing app registrations and generates fresh secrets if needed
 * 2. Updates the .env file with new credentials automatically
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
 * Usage: node scripts/setup.cjs
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

        // Only initialize MSAL if we have real credentials (not just placeholders)
        if (this.config.clientId && this.config.clientSecret && 
            this.config.clientId !== 'placeholder' && this.config.clientSecret !== 'placeholder') {
            console.log('Initializing MSAL with credentials...');
            this.msalConfig = {
                auth: {
                    clientId: this.config.clientId,
                    clientSecret: this.config.clientSecret,
                    authority: `https://login.microsoftonline.com/${this.config.tenantId}`,
                }
            };

            this.cca = new ConfidentialClientApplication(this.msalConfig);
            console.log('MSAL initialized with existing credentials');
        } else {
            console.log('MSAL not initialized - missing or placeholder credentials');
            this.cca = null;
            this.msalConfig = null;
        }
    }

    validateConfig() {
        const required = ['DATAVERSE_URL', 'TENANT_ID'];
        const missing = required.filter(key => !process.env[key]);
        
        if (missing.length > 0) {
            throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
        }

        // CLIENT_ID and CLIENT_SECRET are optional at startup since we might create them
        if (!process.env.CLIENT_ID || !process.env.CLIENT_SECRET) {
            console.log('CLIENT_ID or CLIENT_SECRET missing - will create new app registration');
        }

        console.log('Configuration validated');
    }

    async checkExistingAppRegistration() {
        try {
            console.log('Checking for existing app registration...');
            const result = execSync('az ad sp list --display-name "Mermaid Auto" --query "[].{appId:appId, displayName:displayName}" --output table', { 
                encoding: 'utf-8',
                timeout: 30000 
            });
            
            if (result.includes('Mermaid Auto')) {
                console.log('Found existing app registration');
                const appIdMatch = result.match(/([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})/);
                if (appIdMatch) {
                    return appIdMatch[1];
                }
            }
            return null;
        } catch (error) {
            console.warn('Could not check existing app registrations:', error.message);
            return null;
        }
    }

    async createNewAppRegistration() {
        try {
            console.log('Creating new app registration...');
            
            // Create the app registration
            const createResult = execSync('az ad app create --display-name "Mermaid Auto" --query "appId" --output tsv', { 
                encoding: 'utf-8',
                timeout: 30000 
            });
            
            const appId = createResult.trim();
            if (!appId || appId.length < 30) {
                throw new Error('Invalid app ID returned from creation');
            }
            
            console.log(`App registration created: ${appId}`);
            
            // Create service principal - CRITICAL for Dataverse Application User creation
            console.log('Creating service principal...');
            execSync(`az ad sp create --id ${appId}`, { 
                encoding: 'utf-8',
                timeout: 30000 
            });
            
            console.log('Service principal created');
            
            // Generate initial client secret
            const secretResult = execSync(`az ad app credential reset --id ${appId} --display-name "Mermaid Auto Generated Secret" --query "password" --output tsv`, { 
                encoding: 'utf-8',
                timeout: 30000 
            });
            
            const clientSecret = secretResult.trim();
            if (!clientSecret || clientSecret.length < 10) {
                throw new Error('Invalid client secret generated');
            }
            
            console.log('Client secret generated');
            
            return { appId, clientSecret };
        } catch (error) {
            console.error('Failed to create app registration:', error.message);
            throw error;
        }
    }

    async generateFreshSecret(appId) {
        try {
            console.log('Generating fresh client secret...');
            const result = execSync(`az ad app credential reset --id ${appId} --display-name "Mermaid Auto Generated Secret" --query "password" --output tsv`, { 
                encoding: 'utf-8',
                timeout: 30000 
            });
            
            const newSecret = result.trim();
            if (newSecret && newSecret.length > 10) {
                console.log('Fresh secret generated');
                return newSecret;
            }
            throw new Error('Invalid secret generated');
        } catch (error) {
            console.error('Failed to generate fresh secret:', error.message);
            throw error;
        }
    }

    updateEnvFile(appId, secret) {
        try {
            console.log('Updating .env file...');
            const envPath = path.join(__dirname, '..', '.env');
            
            let envContent = '';
            if (fs.existsSync(envPath)) {
                envContent = fs.readFileSync(envPath, 'utf-8');
            }
            
            // Update CLIENT_ID (handle both commented and uncommented versions)
            if (envContent.includes('# CLIENT_ID=')) {
                envContent = envContent.replace(/# CLIENT_ID=.*$/m, `CLIENT_ID=${appId}`);
            } else if (envContent.includes('CLIENT_ID=')) {
                envContent = envContent.replace(/CLIENT_ID=.*$/m, `CLIENT_ID=${appId}`);
            } else {
                envContent += `\nCLIENT_ID=${appId}`;
            }
            
            // Update CLIENT_SECRET (handle both commented and uncommented versions)
            if (envContent.includes('# CLIENT_SECRET=')) {
                envContent = envContent.replace(/# CLIENT_SECRET=.*$/m, `CLIENT_SECRET=${secret}`);
            } else if (envContent.includes('CLIENT_SECRET=')) {
                envContent = envContent.replace(/CLIENT_SECRET=.*$/m, `CLIENT_SECRET=${secret}`);
            } else {
                envContent += `\nCLIENT_SECRET=${secret}`;
            }
            
            fs.writeFileSync(envPath, envContent, 'utf-8');
            console.log('.env file updated successfully');
            
            // Update process environment variables immediately
            process.env.CLIENT_ID = appId;
            process.env.CLIENT_SECRET = secret;
            
            // Update config for current session
            this.config.clientId = appId;
            this.config.clientSecret = secret;
            
            // Initialize MSAL now that we have credentials
            this.msalConfig = {
                auth: {
                    clientId: appId,
                    clientSecret: secret,
                    authority: `https://login.microsoftonline.com/${this.config.tenantId}`,
                }
            };
            
            // Create a completely new MSAL instance to avoid any caching issues
            this.cca = new ConfidentialClientApplication(this.msalConfig);
            
            console.log('Credentials updated in memory and MSAL initialized');
            return true;
        } catch (error) {
            console.error('Failed to update .env file:', error.message);
            return false;
        }
    }

    async getAccessToken() {
        try {
            const clientCredentialRequest = {
                scopes: [`${this.config.dataverseUrl}/.default`],
                skipCache: false,
            };

            const response = await this.cca.acquireTokenByClientCredential(clientCredentialRequest);
            return response.accessToken;
        } catch (error) {
            console.error('Failed to get access token:', error.message);
            throw error;
        }
    }

    async getAdminAccessToken() {
        try {
            console.log('Falling back to admin authentication via Azure CLI...');
            console.log('This is needed to create the first Application User (chicken-and-egg problem)');
            
            // Get access token using Azure CLI (your admin credentials)
            const result = execSync(`az account get-access-token --resource ${this.config.dataverseUrl} --query "accessToken" --output tsv`, { 
                encoding: 'utf-8',
                timeout: 30000 
            });
            
            const accessToken = result.trim();
            if (!accessToken || accessToken.length < 100) {
                throw new Error('Invalid access token obtained from Azure CLI');
            }
            
            console.log('Admin access token obtained');
            return accessToken;
        } catch (error) {
            console.error('Failed to get admin access token:', error.message);
            console.error('Please ensure you are logged in as admin with: az login');
            throw error;
        }
    }

    async checkExistingApplicationUser(accessToken) {
        try {
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
                console.log(`Found ${existingUsers.length} existing Application User(s)`);
                return existingUsers;
            }

            return [];
        } catch (error) {
            console.error('Failed to check existing Application Users:', error.response?.data || error.message);
            throw error;
        }
    }

    async getBusinessUnit(accessToken) {
        try {
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

            return rootBusinessUnit.businessunitid;
        } catch (error) {
            console.error('Failed to get business unit:', error.response?.data || error.message);
            throw error;
        }
    }

    async getSystemAdministratorRole(accessToken) {
        try {
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

            return systemAdminRole.roleid;
        } catch (error) {
            console.error('Failed to get System Administrator role:', error.response?.data || error.message);
            throw error;
        }
    }

    async createApplicationUser(accessToken, businessUnitId) {
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
            console.log('Application User created');
            return userId;
        } catch (error) {
            console.error('Failed to create Application User:', error.response?.data || error.message);
            throw error;
        }
    }

    async assignRole(accessToken, userId, roleId) {
        try {
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

            console.log('System Administrator role assigned');
        } catch (error) {
            console.error('Failed to assign role:', error.response?.data || error.message);
            throw error;
        }
    }

    async cleanupDuplicateApplicationUsers(accessToken) {
        try {
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
                console.log(`Removing ${duplicates.length} duplicate Application Users`);
                
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
                        console.log(`Removed: ${duplicate.fullname}`);
                    } catch (error) {
                        console.warn(`Could not remove ${duplicate.fullname}: ${error.message}`);
                    }
                }
            }
        } catch (error) {
            console.warn('Failed to cleanup duplicates:', error.message);
            // Don't throw - this is cleanup, not critical
        }
    }

    async run() {
        try {
            console.log('Starting Application User setup...');

            // Step 1: Check for existing app registration and handle different scenarios
            const existingAppId = await this.checkExistingAppRegistration();
            
            if (existingAppId && existingAppId === this.config.clientId) {
                // Case 1: App registration exists and matches our CLIENT_ID, generate fresh secret
                console.log('App registration exists, generating fresh secret...');
                try {
                    const newSecret = await this.generateFreshSecret(existingAppId);
                    this.updateEnvFile(existingAppId, newSecret);
                    console.log('Credentials updated, proceeding with setup...');
                } catch (error) {
                    console.log('Failed to update existing app registration, creating new one...');
                    const { appId, clientSecret } = await this.createNewAppRegistration();
                    this.updateEnvFile(appId, clientSecret);
                    console.log('New app registration created and configured');
                    console.log(`CLIENT_ID: ${appId}`);
                    console.log(`CLIENT_SECRET: ${clientSecret.substring(0, 10)}...`);
                }
            } else if (existingAppId && existingAppId !== this.config.clientId) {
                // Case 2: App registration exists but doesn't match our CLIENT_ID, update .env
                console.log('App registration exists but CLIENT_ID mismatch, updating credentials...');
                const newSecret = await this.generateFreshSecret(existingAppId);
                this.updateEnvFile(existingAppId, newSecret);
                console.log('Credentials updated, proceeding with setup...');
            } else if (!existingAppId) {
                // Case 3: No app registration exists, create everything from scratch
                console.log('No app registration found, creating from scratch...');
                const { appId, clientSecret } = await this.createNewAppRegistration();
                this.updateEnvFile(appId, clientSecret);
                
                console.log('New app registration created and configured');
                console.log(`CLIENT_ID: ${appId}`);
                console.log(`CLIENT_SECRET: ${clientSecret.substring(0, 10)}...`);
            }

            // Step 2: Get access token (try service principal first, fall back to admin if needed)
            let accessToken;
            let usingAdminAuth = false;
            
            try {
                accessToken = await this.getAccessToken();
                console.log('Service principal authentication successful');
            } catch (error) {
                console.log('Service principal authentication failed (expected for first-time setup)');
                console.log('Switching to admin authentication to bootstrap Application User...');
                accessToken = await this.getAdminAccessToken();
                usingAdminAuth = true;
            }

            // Step 3: Clean up duplicates first
            await this.cleanupDuplicateApplicationUsers(accessToken);

            // Step 4: Check if Application User already exists
            const existingUsers = await this.checkExistingApplicationUser(accessToken);
            
            if (existingUsers.length > 0) {
                console.log('Application User already exists');
                
                // If we used admin auth but Application User exists, test service principal auth
                if (usingAdminAuth) {
                    console.log('Testing service principal authentication now that Application User exists...');
                    try {
                        await this.getAccessToken();
                        console.log('Service principal authentication now working');
                    } catch (error) {
                        console.warn('Service principal authentication still not working:', error.message);
                    }
                }
                
                return await this.testAuthentication();
            }

            console.log('Creating Application User for service principal...');

            // Wait for Azure AD propagation (new service principals need time to propagate)
            console.log('Waiting for Azure AD service principal propagation...');
            await new Promise(resolve => setTimeout(resolve, 30000)); // Wait 30 seconds

            // Step 5: Get business unit
            const businessUnitId = await this.getBusinessUnit(accessToken);

            // Step 6: Get System Administrator role
            const roleId = await this.getSystemAdministratorRole(accessToken);

            // Step 7: Create Application User
            const userId = await this.createApplicationUser(accessToken, businessUnitId);

            // Step 8: Assign System Administrator role
            await this.assignRole(accessToken, userId, roleId);

            console.log('Application User setup completed successfully!');
            
            // If we used admin auth, test that service principal auth now works
            if (usingAdminAuth) {
                console.log('Testing service principal authentication after Application User creation...');
                try {
                    await this.getAccessToken();
                    console.log('Service principal authentication is now working!');
                    console.log('Chicken-and-egg problem resolved - future runs will use service principal auth');
                } catch (error) {
                    console.warn('Service principal authentication still not working:', error.message);
                    console.warn('This may resolve after a few minutes due to Azure AD propagation delays');
                }
            }
            
            // Step 9: Test authentication
            await this.testAuthentication();

        } catch (error) {
            console.error('Setup failed:', error.message);
            process.exit(1);
        }
    }

    async testAuthentication() {
        try {
            const result = execSync('node src/server.js', { encoding: 'utf-8' });
            console.log('Authentication test successful');
            console.log(result);
        } catch (error) {
            console.error('Authentication test failed:', error.message);
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
