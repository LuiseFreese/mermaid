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
  console.log('🔍 Searching for global choice sets...');
  const response = await client.makeRequest('GET', `GlobalOptionSetDefinitions?$select=MetadataId,Name,DisplayName`);
  
  if (response.value && response.value.length > 0) {
    console.log('\n🎨 All Global Choice Sets:');
    response.value.forEach(choiceSet => {
      const name = choiceSet.Name || 'No name';
      const displayName = choiceSet.DisplayName?.LocalizedLabels?.[0]?.Label || 'No display name';
      console.log(`- ${name} (${displayName}) - ID: ${choiceSet.MetadataId}`);
      
      // Check if it's related to our color/size fields
      if (name.toLowerCase().includes('color') || name.toLowerCase().includes('size') || name.toLowerCase().includes('farb')) {
        console.log(`  ⭐ MATCH: This might be one of our choice sets!`);
      }
    });
  } else {
    console.log('\n❌ No global choice sets found');
  }

} catch (error) {
  console.error('❌ Error:', error.response?.data || error.message);
}
