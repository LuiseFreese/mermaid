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
  console.log('🔍 Attempting to add existing global choice sets to solution...');
  
  const solutionName = 'GlobalChoicesFinal2025';
  
  // Try to add the existing mmd_color global choice set to the solution
  const existingColorChoiceSet = '0a7af6e3-266a-f011-bec3-0022489c3429'; // From our earlier check
  const existingSizeChoiceSet = '63efa6ea-266a-f011-bec3-7c1e5235fe3b';   // From our earlier check  
  const existingStatusChoiceSet = '69efa6ea-266a-f011-bec3-7c1e5235fe3b'; // From our earlier check
  
  try {
    await client.addGlobalChoiceSetToSolution(solutionName, existingColorChoiceSet);
    console.log('✅ Added mmd_color to solution');
  } catch (error) {
    console.error('❌ Failed to add mmd_color:', error.message);
  }
  
  try {
    await client.addGlobalChoiceSetToSolution(solutionName, existingSizeChoiceSet);
    console.log('✅ Added mmd_size to solution');
  } catch (error) {
    console.error('❌ Failed to add mmd_size:', error.message);
  }
  
  try {
    await client.addGlobalChoiceSetToSolution(solutionName, existingStatusChoiceSet);
    console.log('✅ Added mmd_status to solution');
  } catch (error) {
    console.error('❌ Failed to add mmd_status:', error.message);
  }
  
} catch (error) {
  console.error('❌ Error:', error.response?.data || error.message);
}
