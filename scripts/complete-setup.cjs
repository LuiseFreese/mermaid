#!/usr/bin/env node

console.log('🚀 Complete Dataverse Application User Setup');
console.log('============================================');

/**
 * Complete Automated Application User Setup for Dataverse
 * 
 * This single script handles the entire process:
 * 1. Creates app registration if it doesn't exist
 * 2. Creates service principal for the app registration
 * 3. Generates client secret and updates .env file
 * 4. Uses admin authentication to create Application User in Dataverse
 * 5. Assigns System Administrator role
 * 6. Tests authentication by fetching publishers
 * 
 * Prerequisites:
 * - Azure CLI installed and logged in as admin (az login)
 * - .env file with DATAVERSE_URL and TENANT_ID
 * - Admin permissions in Dataverse environment
 * 
 * Usage: node scripts/complete-setup.cjs
 */

const axios = require('axios');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

class CompleteDataverseSetup {
    constructor() {
        this.config = {
            dataverseUrl: process.env.DATAVERSE_URL,
            clientId: process.env.CLIENT_ID,
            clientSecret: process.env.CLIENT_SECRET,
            tenantId: process.env.TENANT_ID,
        };

        this.appName = 'Mermaid Luise Auto';
        
        console.log('🔧 Current Configuration:');
        console.log(`   DATAVERSE_URL: ${this.config.dataverseUrl}`);
        console.log(`   TENANT_ID: ${this.config.tenantId}`);
        console.log(`   CLIENT_ID: ${this.config.clientId || 'MISSING'}`);
        console.log(`   CLIENT_SECRET: ${this.config.clientSecret ? 'SET' : 'MISSING'}`);
        
        this.validateEnvironment();
    }

    validateEnvironment() {
        if (!this.config.dataverseUrl || !this.config.tenantId) {
            throw new Error('Missing required environment variables: DATAVERSE_URL or TENANT_ID');
        }
        console.log('✅ Environment validation passed');
    }

    async checkOrCreateAppRegistration() {
        try {
            console.log('\n📋 Step 1: App Registration');
            console.log('============================');
            
            // Check if app registration already exists
            console.log('🔍 Checking for existing app registration...');
            const listResult = execSync(`az ad app list --display-name "${this.appName}" --query "[].{appId:appId, displayName:displayName}" --output table`, { 
                encoding: 'utf-8',
                timeout: 30000 
            });
            
            if (listResult.includes(this.appName)) {
                // Extract app ID from existing registration
                const appIdMatch = listResult.match(/([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})/);
                if (appIdMatch) {
                    const existingAppId = appIdMatch[1];
                    console.log(`✅ Found existing app registration: ${existingAppId}`);
                    
                    // Generate new secret for existing app
                    console.log('🔐 Generating fresh client secret...');
                    const secretResult = execSync(`az ad app credential reset --id ${existingAppId} --display-name "Mermaid Auto Generated Secret" --query "password" --output tsv`, { 
                        encoding: 'utf-8',
                        timeout: 30000 
                    });
                    
                    const newSecret = secretResult.trim();
                    console.log('✅ Fresh client secret generated');
                    
                    this.config.clientId = existingAppId;
                    this.config.clientSecret = newSecret;
                    
                    return { appId: existingAppId, clientSecret: newSecret, wasCreated: false };
                }
            }
            
            // Create new app registration
            console.log('🆕 Creating new app registration...');
            const createResult = execSync(`az ad app create --display-name "${this.appName}" --sign-in-audience AzureADMyOrg --query "appId" --output tsv`, { 
                encoding: 'utf-8',
                timeout: 30000 
            });
            
            const newAppId = createResult.trim();
            if (!newAppId || newAppId.length < 30) {
                throw new Error('Invalid app ID returned from creation');
            }
            
            console.log(`✅ App registration created: ${newAppId}`);
            
            // Generate client secret
            console.log('🔐 Generating client secret...');
            const secretResult = execSync(`az ad app credential reset --id ${newAppId} --display-name "Mermaid Auto Generated Secret" --query "password" --output tsv`, { 
                encoding: 'utf-8',
                timeout: 30000 
            });
            
            const newSecret = secretResult.trim();
            console.log('✅ Client secret generated');
            
            this.config.clientId = newAppId;
            this.config.clientSecret = newSecret;
            
            return { appId: newAppId, clientSecret: newSecret, wasCreated: true };
            
        } catch (error) {
            console.error('❌ Failed to handle app registration:', error.message);
            throw error;
        }
    }

    async ensureServicePrincipal(appId) {
        try {
            console.log('\n🔐 Step 2: Service Principal');
            console.log('=============================');
            
            // Check if service principal already exists
            console.log('🔍 Checking for existing service principal...');
            try {
                const checkResult = execSync(`az ad sp show --id ${appId} --query "displayName" --output tsv`, { 
                    encoding: 'utf-8',
                    timeout: 30000 
                });
                
                if (checkResult.trim()) {
                    console.log(`✅ Service principal already exists: ${checkResult.trim()}`);
                    return;
                }
            } catch (error) {
                // Service principal doesn't exist, create it
                console.log('🆕 Creating service principal...');
                execSync(`az ad sp create --id ${appId}`, { 
                    encoding: 'utf-8',
                    timeout: 30000 
                });
                
                console.log('✅ Service principal created successfully');
                
                // Wait for Azure AD propagation
                console.log('⏳ Waiting 30 seconds for Azure AD propagation...');
                await new Promise(resolve => setTimeout(resolve, 30000));
                console.log('✅ Wait completed');
            }
            
        } catch (error) {
            console.error('❌ Failed to handle service principal:', error.message);
            throw error;
        }
    }

    updateEnvFile(appId, clientSecret) {
        try {
            console.log('\n📝 Step 3: Update Configuration');
            console.log('================================');
            
            const envPath = path.join(process.cwd(), '.env');
            
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
                envContent = envContent.replace(/CLIENT_SECRET=.*$/m, `CLIENT_SECRET=${clientSecret}`);
            } else {
                envContent += `\nCLIENT_SECRET=${clientSecret}`;
            }
            
            fs.writeFileSync(envPath, envContent, 'utf-8');
            
            // Update process environment for current session
            process.env.CLIENT_ID = appId;
            process.env.CLIENT_SECRET = clientSecret;
            this.config.clientId = appId;
            this.config.clientSecret = clientSecret;
            
            console.log('✅ .env file updated successfully');
            console.log(`   CLIENT_ID: ${appId}`);
            console.log(`   CLIENT_SECRET: ${clientSecret.substring(0, 10)}...`);
            
        } catch (error) {
            console.error('❌ Failed to update .env file:', error.message);
            throw error;
        }
    }

    async getAdminAccessToken() {
        try {
            console.log('🔐 Getting admin access token via Azure CLI...');
            const result = execSync(`az account get-access-token --resource ${this.config.dataverseUrl} --query "accessToken" --output tsv`, { 
                encoding: 'utf-8',
                timeout: 30000 
            });
            
            const accessToken = result.trim();
            if (!accessToken || accessToken.length < 100) {
                throw new Error('Invalid access token obtained from Azure CLI');
            }
            
            console.log('✅ Admin access token obtained');
            return accessToken;
        } catch (error) {
            console.error('❌ Failed to get admin access token:', error.message);
            console.error('   Please ensure you are logged in as admin with: az login');
            throw error;
        }
    }

    async createApplicationUser() {
        try {
            console.log('\n👤 Step 4: Application User in Dataverse');
            console.log('=========================================');
            
            const accessToken = await this.getAdminAccessToken();
            
            // Check if Application User already exists
            console.log('🔍 Checking for existing Application User...');
            const checkResponse = await axios.get(
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

            const existingUsers = checkResponse.data.value;
            if (existingUsers.length > 0) {
                console.log(`✅ Application User already exists: ${existingUsers[0].fullname}`);
                return existingUsers[0].systemuserid;
            }
            
            // Get business unit
            console.log('📋 Getting root business unit...');
            const businessUnitResponse = await axios.get(
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

            const rootBusinessUnit = businessUnitResponse.data.value[0];
            if (!rootBusinessUnit) {
                throw new Error('No root business unit found');
            }

            const businessUnitId = rootBusinessUnit.businessunitid;
            console.log(`✅ Business unit: ${rootBusinessUnit.name}`);
            
            // Get System Administrator role
            console.log('🔑 Getting System Administrator role...');
            const roleResponse = await axios.get(
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

            const systemAdminRole = roleResponse.data.value[0];
            if (!systemAdminRole) {
                throw new Error('System Administrator role not found');
            }

            const roleId = systemAdminRole.roleid;
            console.log(`✅ System Administrator role found`);
            
            // Create Application User
            console.log('👥 Creating Application User...');
            const applicationUserData = {
                "applicationid": this.config.clientId,
                "businessunitid@odata.bind": `/businessunits(${businessUnitId})`,
                "firstname": "Mermaid",
                "lastname": "Luise Service Principal",
                "fullname": "Mermaid Luise Service Principal",
                "domainname": this.config.clientId,
                "isdisabled": false
            };

            const createResponse = await axios.post(
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

            const userId = createResponse.headers['odata-entityid'].split('(')[1].split(')')[0];
            console.log('✅ Application User created');
            
            // Assign System Administrator role
            console.log('🔐 Assigning System Administrator role...');
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

            console.log('✅ System Administrator role assigned');
            
            return userId;
            
        } catch (error) {
            console.error('❌ Failed to create Application User:', error.response?.data || error.message);
            if (error.response?.data?.error) {
                console.error('   API Error Details:', error.response.data.error);
            }
            throw error;
        }
    }

    async testAuthentication() {
        try {
            console.log('\n🧪 Step 5: Test Authentication');
            console.log('===============================');
            
            console.log('🔄 Testing service principal authentication...');
            const result = execSync('node src/index.js publishers', { 
                encoding: 'utf-8',
                timeout: 30000 
            });
            
            console.log('✅ Authentication test successful!');
            console.log('\n📋 Publishers Output:');
            console.log('─'.repeat(50));
            console.log(result);
            
            return true;
            
        } catch (error) {
            console.warn('⚠️ Authentication test failed:', error.message);
            console.warn('   This may resolve after a few minutes due to Azure AD propagation delays');
            return false;
        }
    }

    async run() {
        try {
            console.log('Starting complete Dataverse setup...\n');

            // Step 1: Handle app registration
            const { appId, clientSecret, wasCreated } = await this.checkOrCreateAppRegistration();
            
            // Step 2: Ensure service principal exists
            await this.ensureServicePrincipal(appId);
            
            // Step 3: Update .env file
            this.updateEnvFile(appId, clientSecret);
            
            // Step 4: Create Application User in Dataverse
            await this.createApplicationUser();
            
            // Step 5: Test authentication
            const authSuccess = await this.testAuthentication();
            
            console.log('\n🎉 Setup Complete!');
            console.log('==================');
            console.log(`✅ App Registration: ${appId}`);
            console.log(`✅ Service Principal: Created`);
            console.log(`✅ Application User: Created with System Administrator role`);
            console.log(`✅ Authentication: ${authSuccess ? 'Working' : 'Pending (may need a few minutes)'}`);
            console.log(`✅ Configuration: Updated in .env file`);
            
            if (authSuccess) {
                console.log('\n🚀 Your Dataverse integration is ready to use!');
                console.log('   You can now run: node src/index.js <command>');
            } else {
                console.log('\n⏳ Setup completed but authentication may need a few minutes to propagate.');
                console.log('   Try running: node src/index.js publishers');
                console.log('   If it still fails, wait 2-3 minutes and try again.');
            }
            
        } catch (error) {
            console.error('\n❌ Setup failed:', error.message);
            console.error('\nTroubleshooting:');
            console.error('1. Ensure you are logged in as admin: az login');
            console.error('2. Verify your .env file has DATAVERSE_URL and TENANT_ID');
            console.error('3. Check that you have admin permissions in the Dataverse environment');
            process.exit(1);
        }
    }
}

// Run the complete setup
if (require.main === module) {
    const setup = new CompleteDataverseSetup();
    setup.run();
}

module.exports = CompleteDataverseSetup;
