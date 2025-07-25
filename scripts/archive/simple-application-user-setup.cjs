#!/usr/bin/env node

/**
 * Simple Application User Setup for Dataverse
 * Assumes credentials are already correctly set in .env
 */

const axios = require('axios');
const { ConfidentialClientApplication } = require('@azure/msal-node');
const { execSync } = require('child_process');
require('dotenv').config();

class SimpleApplicationUserSetup {
    constructor() {
        this.config = {
            dataverseUrl: process.env.DATAVERSE_URL,
            clientId: process.env.CLIENT_ID,
            clientSecret: process.env.CLIENT_SECRET,
            tenantId: process.env.TENANT_ID,
        };

        this.validateConfig();

        // Initialize MSAL
        this.msalConfig = {
            auth: {
                clientId: this.config.clientId,
                clientSecret: this.config.clientSecret,
                authority: `https://login.microsoftonline.com/${this.config.tenantId}`,
            }
        };

        this.cca = new ConfidentialClientApplication(this.msalConfig);
    }

    validateConfig() {
        const required = ['DATAVERSE_URL', 'CLIENT_ID', 'CLIENT_SECRET', 'TENANT_ID'];
        const missing = required.filter(key => !process.env[key]);
        
        if (missing.length > 0) {
            throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
        }

        console.log('✅ Configuration validated');
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

    async run() {
        try {
            console.log('🚀 Starting Application User setup...');

            // Step 1: Get access token
            const accessToken = await this.getAccessToken();

            // Step 2: Check if Application User already exists
            const existingUsers = await this.checkExistingApplicationUser(accessToken);
            
            if (existingUsers.length > 0) {
                console.log('✅ Application User already exists, skipping creation');
                console.log('🎯 Testing authentication...');
                const result = execSync('node src/index.js publishers', { encoding: 'utf-8' });
                console.log('✅ Authentication test successful');
                return;
            }

            // Step 3: Get business unit
            const businessUnitId = await this.getBusinessUnit(accessToken);

            // Step 4: Get System Administrator role
            const roleId = await this.getSystemAdministratorRole(accessToken);

            // Step 5: Create Application User
            const userId = await this.createApplicationUser(accessToken, businessUnitId);

            // Step 6: Assign System Administrator role
            await this.assignRole(accessToken, userId, roleId);

            console.log('🎉 Application User setup completed successfully');
            
            // Step 7: Test authentication
            console.log('🎯 Testing authentication...');
            const result = execSync('node src/index.js publishers', { encoding: 'utf-8' });
            console.log('✅ Authentication test successful');

        } catch (error) {
            console.error('❌ Setup failed:', error.message);
            process.exit(1);
        }
    }
}

// Run the setup
if (require.main === module) {
    const setup = new SimpleApplicationUserSetup();
    setup.run();
}

module.exports = SimpleApplicationUserSetup;
