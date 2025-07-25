#!/usr/bin/env node

console.log('🚀 Application User Creation Script Starting...');

const axios = require('axios');
const { ConfidentialClientApplication } = require('@azure/msal-node');
const { execSync } = require('child_process');
require('dotenv').config();

async function createApplicationUser() {
    try {
        console.log('📋 Loading configuration...');
        
        const config = {
            dataverseUrl: process.env.DATAVERSE_URL,
            clientId: process.env.CLIENT_ID,
            clientSecret: process.env.CLIENT_SECRET,
            tenantId: process.env.TENANT_ID,
        };
        
        console.log('Configuration loaded:', {
            dataverseUrl: config.dataverseUrl,
            clientId: config.clientId ? 'SET' : 'MISSING',
            clientSecret: config.clientSecret ? 'SET' : 'MISSING',
            tenantId: config.tenantId ? 'SET' : 'MISSING'
        });
        
        // Validate required config
        if (!config.dataverseUrl || !config.clientId || !config.clientSecret || !config.tenantId) {
            throw new Error('Missing required configuration. Please check your .env file.');
        }
        
        console.log('🔐 Getting admin access token via Azure CLI...');
        
        // Get admin access token using Azure CLI
        const result = execSync(`az account get-access-token --resource ${config.dataverseUrl} --query "accessToken" --output tsv`, { 
            encoding: 'utf-8',
            timeout: 30000 
        });
        
        const accessToken = result.trim();
        if (!accessToken || accessToken.length < 100) {
            throw new Error('Invalid access token obtained from Azure CLI');
        }
        
        console.log('✅ Admin access token obtained');
        
        console.log('🔍 Checking for existing Application User...');
        
        // Check if Application User already exists
        const checkResponse = await axios.get(
            `${config.dataverseUrl}/api/data/v9.2/systemusers?$filter=applicationid eq ${config.clientId}`,
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
            console.log(`✅ Application User already exists! Found ${existingUsers.length} user(s)`);
            console.log('User details:', existingUsers.map(u => ({ 
                id: u.systemuserid, 
                name: u.fullname,
                applicationId: u.applicationid 
            })));
            return;
        }
        
        console.log('👤 No existing Application User found. Creating new one...');
        
        console.log('📍 Getting business unit...');
        
        // Get root business unit
        const businessUnitResponse = await axios.get(
            `${config.dataverseUrl}/api/data/v9.2/businessunits?$filter=parentbusinessunitid eq null&$select=businessunitid,name`,
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
        
        console.log(`Business unit found: ${rootBusinessUnit.name} (${rootBusinessUnit.businessunitid})`);
        
        console.log('🔑 Getting System Administrator role...');
        
        // Get System Administrator role
        const roleResponse = await axios.get(
            `${config.dataverseUrl}/api/data/v9.2/roles?$filter=name eq 'System Administrator'&$select=roleid,name`,
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
        
        console.log(`System Administrator role found: ${systemAdminRole.roleid}`);
        
        console.log('👥 Creating Application User...');
        
        // Create Application User
        const applicationUserData = {
            "applicationid": config.clientId,
            "businessunitid@odata.bind": `/businessunits(${rootBusinessUnit.businessunitid})`,
            "firstname": "Mermaid",
            "lastname": "Luise Service Principal",
            "fullname": "Mermaid Luise Service Principal",
            "domainname": config.clientId,
            "isdisabled": false
        };

        const createUserResponse = await axios.post(
            `${config.dataverseUrl}/api/data/v9.2/systemusers`,
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

        const userId = createUserResponse.headers['odata-entityid'].split('(')[1].split(')')[0];
        console.log(`✅ Application User created with ID: ${userId}`);
        
        console.log('🔐 Assigning System Administrator role...');
        
        // Assign System Administrator role
        await axios.post(
            `${config.dataverseUrl}/api/data/v9.2/systemusers(${userId})/systemuserroles_association/$ref`,
            {
                "@odata.id": `${config.dataverseUrl}/api/data/v9.2/roles(${systemAdminRole.roleid})`
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
        
        console.log('🧪 Testing service principal authentication...');
        
        // Test service principal authentication
        const msalConfig = {
            auth: {
                clientId: config.clientId,
                clientSecret: config.clientSecret,
                authority: `https://login.microsoftonline.com/${config.tenantId}`,
            }
        };
        
        const cca = new ConfidentialClientApplication(msalConfig);
        
        const clientCredentialRequest = {
            scopes: [`${config.dataverseUrl}/.default`]
        };

        const tokenResponse = await cca.acquireTokenByClientCredential(clientCredentialRequest);
        
        if (tokenResponse && tokenResponse.accessToken) {
            console.log('✅ Service principal authentication successful!');
            
            // Test a simple API call
            const testResponse = await axios.get(
                `${config.dataverseUrl}/api/data/v9.2/publishers?$select=friendlyname&$top=1`,
                {
                    headers: {
                        'Authorization': `Bearer ${tokenResponse.accessToken}`,
                        'Content-Type': 'application/json',
                        'OData-MaxVersion': '4.0',
                        'OData-Version': '4.0'
                    }
                }
            );
            
            console.log('✅ API test successful! Service principal can access Dataverse');
            console.log('🎉 Application User setup completed successfully!');
            
        } else {
            console.warn('⚠️ Could not get service principal token immediately. This may resolve in a few minutes due to Azure AD propagation delays.');
        }
        
    } catch (error) {
        console.error('❌ Failed to create Application User:', error.message);
        if (error.response?.data) {
            console.error('API Error Details:', JSON.stringify(error.response.data, null, 2));
        }
        process.exit(1);
    }
}

// Run the script
createApplicationUser();
