#!/usr/bin/env node

console.log('🚀 Creating Application User for existing service principal...');

const axios = require('axios');
const { execSync } = require('child_process');
require('dotenv').config();

async function createApplicationUser() {
    try {
        const dataverseUrl = process.env.DATAVERSE_URL;
        const clientId = process.env.CLIENT_ID;
        const tenantId = process.env.TENANT_ID;
        
        console.log(`🔧 Configuration:`);
        console.log(`DATAVERSE_URL: ${dataverseUrl}`);
        console.log(`CLIENT_ID: ${clientId}`);
        console.log(`TENANT_ID: ${tenantId}`);
        
        if (!dataverseUrl || !clientId || !tenantId) {
            throw new Error('Missing required environment variables');
        }
        
        console.log('🔐 Getting admin access token via Azure CLI...');
        const tokenResult = execSync(`az account get-access-token --resource ${dataverseUrl} --query "accessToken" --output tsv`, { 
            encoding: 'utf-8',
            timeout: 30000 
        });
        
        const accessToken = tokenResult.trim();
        if (!accessToken || accessToken.length < 100) {
            throw new Error('Invalid access token obtained from Azure CLI');
        }
        
        console.log('✅ Admin access token obtained');
        
        // Check if Application User already exists
        console.log('🔍 Checking for existing Application User...');
        const checkResponse = await axios.get(
            `${dataverseUrl}/api/data/v9.2/systemusers?$filter=applicationid eq ${clientId}`,
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
            console.log('No action needed.');
            return;
        }
        
        console.log('📋 Getting business unit...');
        const businessUnitResponse = await axios.get(
            `${dataverseUrl}/api/data/v9.2/businessunits?$filter=parentbusinessunitid eq null&$select=businessunitid,name`,
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
        console.log(`✅ Business unit found: ${rootBusinessUnit.name} (${businessUnitId})`);
        
        console.log('🔑 Getting System Administrator role...');
        const roleResponse = await axios.get(
            `${dataverseUrl}/api/data/v9.2/roles?$filter=name eq 'System Administrator'&$select=roleid,name`,
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
        console.log(`✅ System Administrator role found: ${roleId}`);
        
        console.log('👥 Creating Application User...');
        const applicationUserData = {
            "applicationid": clientId,
            "businessunitid@odata.bind": `/businessunits(${businessUnitId})`,
            "firstname": "Mermaid",
            "lastname": "Luise Service Principal",
            "fullname": "Mermaid Luise Service Principal",
            "domainname": clientId,
            "isdisabled": false
        };

        const createResponse = await axios.post(
            `${dataverseUrl}/api/data/v9.2/systemusers`,
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
        console.log(`✅ Application User created: ${userId}`);
        
        console.log('🔐 Assigning System Administrator role...');
        await axios.post(
            `${dataverseUrl}/api/data/v9.2/systemusers(${userId})/systemuserroles_association/$ref`,
            {
                "@odata.id": `${dataverseUrl}/api/data/v9.2/roles(${roleId})`
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
        
        console.log('🎉 Application User setup completed successfully!');
        console.log('🧪 Testing authentication...');
        
        try {
            const testResult = execSync('node src/index.js publishers', { encoding: 'utf-8' });
            console.log('✅ Authentication test successful!');
            console.log(testResult);
        } catch (error) {
            console.warn('⚠️ Authentication test failed:', error.message);
            console.warn('This may resolve after a few minutes due to Azure AD propagation delays');
        }
        
    } catch (error) {
        console.error('❌ Failed to create Application User:', error.response?.data || error.message);
        
        if (error.response?.data?.error) {
            console.error('API Error Details:', error.response.data.error);
        }
        
        process.exit(1);
    }
}

createApplicationUser();
