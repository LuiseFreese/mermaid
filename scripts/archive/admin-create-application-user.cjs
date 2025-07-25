#!/usr/bin/env node

/**
 * Create Application User using Azure CLI authentication
 * This script uses your admin credentials to create the Application User for the service principal
 */

const axios = require('axios');
const { execSync } = require('child_process');
require('dotenv').config();

class AdminApplicationUserSetup {
    constructor() {
        this.config = {
            dataverseUrl: process.env.DATAVERSE_URL,
            clientId: process.env.CLIENT_ID,
            tenantId: process.env.TENANT_ID,
        };

        this.validateConfig();
    }

    validateConfig() {
        const required = ['DATAVERSE_URL', 'CLIENT_ID', 'TENANT_ID'];
        const missing = required.filter(key => !process.env[key]);
        
        if (missing.length > 0) {
            throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
        }

        console.log('✅ Configuration validated');
    }

    async getAdminAccessToken() {
        try {
            console.log('🔐 Getting admin access token via Azure CLI...');
            
            // Get access token using Azure CLI (your admin credentials)
            const result = execSync(`az account get-access-token --resource ${this.config.dataverseUrl} --query "accessToken" --output tsv`, { 
                encoding: 'utf-8',
                timeout: 30000 
            });
            
            const accessToken = result.trim();
            if (!accessToken || accessToken.length < 100) {
                throw new Error('Invalid access token obtained');
            }
            
            console.log('✅ Admin access token obtained');
            return accessToken;
        } catch (error) {
            console.error('❌ Failed to get admin access token:', error.message);
            console.error('Please ensure you are logged in with: az login');
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
            console.log('🚀 Starting Admin Application User Setup...');
            console.log('=========================================\n');
            console.log(`🎯 Target App Registration: ${this.config.clientId}`);
            console.log(`🏢 Target Dataverse: ${this.config.dataverseUrl}\n`);

            // Step 1: Get admin access token using Azure CLI
            const accessToken = await this.getAdminAccessToken();

            // Step 2: Check if Application User already exists
            const existingUsers = await this.checkExistingApplicationUser(accessToken);
            
            if (existingUsers.length > 0) {
                console.log('✅ Application User already exists, skipping creation');
                console.log('\n🎯 Testing service principal authentication...');
                await this.testServicePrincipalAuthentication();
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

            console.log('\n🎉 Application User setup completed successfully!');
            
            // Step 7: Test service principal authentication
            console.log('\n🎯 Testing service principal authentication...');
            await this.testServicePrincipalAuthentication();

        } catch (error) {
            console.error('\n❌ Setup failed:', error.message);
            process.exit(1);
        }
    }

    async testServicePrincipalAuthentication() {
        try {
            const result = execSync('node src/index.js publishers', { encoding: 'utf-8' });
            console.log('✅ Service principal authentication test successful!');
            console.log('\n📋 Publishers test result:');
            console.log(result);
        } catch (error) {
            console.error('❌ Service principal authentication test failed:', error.message);
            throw error;
        }
    }
}

// Run the setup
if (require.main === module) {
    const setup = new AdminApplicationUserSetup();
    setup.run();
}

module.exports = AdminApplicationUserSetup;
