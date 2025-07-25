#!/usr/bin/env node

/**
 * Automated Application User Setup for Dataverse
 * 
 * This script automatically:
 * 1. Authenticates to Dataverse using service principal
 * 2. Creates an Application User for the service principal
 * 3. Assigns System Administrator role to the Application User
 * 
 * Usage: node scripts/setup-application-user.js
 */

const axios = require('axios');
const { ConfidentialClientApplication } = require('@azure/msal-node');
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
        console.log('🔐 Getting access token...');
        
        try {
            const clientCredentialRequest = {
                scopes: [`${this.config.dataverseUrl}/.default`],
                skipCache: false,
            };

            const response = await this.cca.acquireTokenByClientCredential(clientCredentialRequest);
            console.log('✅ Access token acquired');
            return response.accessToken;
        } catch (error) {
            console.error('❌ Failed to get access token:', error.message);
            throw error;
        }
    }

    async checkExistingApplicationUser(accessToken) {
        console.log('🔍 Checking for existing Application User...');
        
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
                console.log(`⚠️ Found ${existingUsers.length} existing Application User(s)`);
                return existingUsers;
            }

            console.log('✅ No existing Application User found');
            return [];
        } catch (error) {
            console.error('❌ Failed to check existing Application Users:', error.response?.data || error.message);
            throw error;
        }
    }

    async getBusinessUnit(accessToken) {
        console.log('🏢 Getting default business unit...');
        
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

            console.log(`✅ Found business unit: ${rootBusinessUnit.name}`);
            return rootBusinessUnit.businessunitid;
        } catch (error) {
            console.error('❌ Failed to get business unit:', error.response?.data || error.message);
            throw error;
        }
    }

    async getSystemAdministratorRole(accessToken) {
        console.log('👑 Getting System Administrator role...');
        
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
        console.log('🔐 Assigning System Administrator role...');
        
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

            console.log('✅ System Administrator role assigned successfully');
        } catch (error) {
            console.error('❌ Failed to assign role:', error.response?.data || error.message);
            throw error;
        }
    }

    async cleanupDuplicateApplicationUsers(accessToken) {
        console.log('🧹 Cleaning up duplicate Application Users...');
        
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
                console.log(`⚠️ Found ${duplicates.length} duplicate/old Application Users to clean up`);
                
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
                        console.log(`🗑️ Removed duplicate user: ${duplicate.fullname} (${duplicate.applicationid})`);
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
            console.log('🚀 Starting automated Application User setup...\n');

            // Step 1: Get access token
            const accessToken = await this.getAccessToken();

            // Step 2: Clean up duplicates first
            await this.cleanupDuplicateApplicationUsers(accessToken);

            // Step 3: Check if Application User already exists
            const existingUsers = await this.checkExistingApplicationUser(accessToken);
            
            if (existingUsers.length > 0) {
                console.log('✅ Application User already exists! Setup complete.');
                console.log('🧪 Testing authentication...');
                return await this.testAuthentication();
            }

            // Step 4: Get business unit
            const businessUnitId = await this.getBusinessUnit(accessToken);

            // Step 5: Get System Administrator role
            const roleId = await this.getSystemAdministratorRole(accessToken);

            // Step 6: Create Application User
            const userId = await this.createApplicationUser(accessToken, businessUnitId);

            // Step 7: Assign System Administrator role
            await this.assignRole(accessToken, userId, roleId);

            console.log('\n🎉 Application User setup completed successfully!');
            console.log('🧪 Testing authentication...');
            
            // Step 8: Test authentication
            await this.testAuthentication();

        } catch (error) {
            console.error('\n❌ Setup failed:', error.message);
            process.exit(1);
        }
    }

    async testAuthentication() {
        console.log('\n📋 Testing publishers access...');
        
        try {
            const { execSync } = require('child_process');
            const result = execSync('node src/index.js publishers', { encoding: 'utf-8' });
            console.log('✅ Authentication test successful!');
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
