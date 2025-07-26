import { DataverseClient } from './src/dataverse-client.js';
import dotenv from 'dotenv';

dotenv.config();

const client = new DataverseClient({
  clientId: process.env.CLIENT_ID,
  clientSecret: process.env.CLIENT_SECRET,
  tenantId: process.env.TENANT_ID,
  dataverseUrl: process.env.DATAVERSE_URL
});

await client.authenticate();

try {
  // Check what's in the most recent solution
  console.log('🔍 Checking solution components...');
  
  const solutionsResponse = await client.makeRequest('GET', `solutions?$filter=uniquename eq 'GlobalChoicesFinal2025'&$select=solutionid,uniquename,friendlyname`);
  
  if (solutionsResponse.value && solutionsResponse.value.length > 0) {
    const solution = solutionsResponse.value[0];
    console.log(`\n📦 Found solution: ${solution.friendlyname} (${solution.uniquename})`);
    console.log(`   Solution ID: ${solution.solutionid}`);
    
    // Get solution components
    const componentsResponse = await client.makeRequest('GET', `solutioncomponents?$filter=_solutionid_value eq ${solution.solutionid}&$select=componenttype,objectid&$top=20`);
    
    if (componentsResponse.value && componentsResponse.value.length > 0) {
      console.log('\n🧩 Solution Components:');
      componentsResponse.value.forEach(component => {
        console.log(`- Component Type: ${component.componenttype}, Object ID: ${component.objectid}`);
        // Component Type 9 = Option Set (Global Choice Set)
        // Component Type 1 = Entity
        // Component Type 2 = Attribute
        if (component.componenttype === 9) {
          console.log('  ⭐ This is a Global Choice Set!');
        } else if (component.componenttype === 1) {
          console.log('  📋 This is an Entity');
        } else if (component.componenttype === 2) {
          console.log('  🏛️  This is an Attribute/Column');
        }
      });
    } else {
      console.log('\n❌ No solution components found');
    }
  } else {
    console.log('\n❌ Solution not found');
  }

} catch (error) {
  console.error('❌ Error:', error.response?.data || error.message);
}
