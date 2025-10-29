import { writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const version = {
  buildTime: new Date().toISOString(),
  buildTimestamp: Date.now(),
  gitCommit: process.env.GIT_COMMIT || 'local',
  version: '1.0.0'
};

const content = `// Auto-generated during build - do not edit
export const BUILD_INFO = ${JSON.stringify(version, null, 2)};
`;

const outputPath = join(__dirname, '../src/version.ts');
writeFileSync(outputPath, content, 'utf8');

console.log('✅ Version file generated:', version.buildTime);
