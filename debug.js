import { MermaidERDParser } from './src/parser.js';

const parser = new MermaidERDParser();

// Test relationship parsing
const testLine = 'Customer ||--o{ Order : places';
console.log('Testing relationship line:', testLine);

const relationshipPattern = /^(\w+)\s+([\|\}][|\-o][|\-o][\-o]?[\{\|o])\s+(\w+)(?:\s*:\s*(.+))?$/;
const match = testLine.match(relationshipPattern);
console.log('Regex match:', match);

const result = parser.parseRelationship(testLine);
console.log('Parser result:', result);

// Test the full parse
const fullContent = `
erDiagram
    Customer {
        string id PK
    }
    Order {
        string id PK  
    }
    Customer ||--o{ Order : places
`;

console.log('\nTesting full parse:');
const fullResult = parser.parse(fullContent);
console.log('Entities:', fullResult.entities.length);
console.log('Relationships:', fullResult.relationships.length);
console.log('Relationships data:', fullResult.relationships);
