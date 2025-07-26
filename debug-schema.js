import { MermaidERDParser } from './src/parser.js';
import { DataverseSchemaGenerator } from './src/schema-generator.js';
import fs from 'fs';

const erdContent = fs.readFileSync('examples/choice-field-test.mmd', 'utf8');
console.log('ERD Content:');
console.log(erdContent);
console.log('\n===================\n');

const parser = new MermaidERDParser();
const parsedERD = parser.parse(erdContent);
console.log('Parsed ERD:');
console.log(JSON.stringify(parsedERD, null, 2));
console.log('\n===================\n');

const schemaGenerator = new DataverseSchemaGenerator();
const schema = schemaGenerator.generateSchema(parsedERD, 'mmd');
console.log('Generated Schema:');
console.log(JSON.stringify(schema, null, 2));

if (schema.globalChoiceSets) {
  console.log('\n🎨 Global Choice Sets Found:');
  schema.globalChoiceSets.forEach(choiceSet => {
    console.log(`- ${choiceSet.Name}: [${choiceSet.options.join(', ')}]`);
  });
} else {
  console.log('\n❌ No global choice sets found in schema');
}
