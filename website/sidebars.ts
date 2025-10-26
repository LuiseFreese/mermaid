import type {SidebarsConfig} from '@docusaurus/plugin-content-docs';

// This runs in Node.js - Don't use client-side code here (browser APIs, JSX...)

/**
 * Creating a sidebar enables you to:
 - create an ordered group of docs
 - render a sidebar for each doc of that group
 - provide next/previous navigation

 The sidebars can be generated from the filesystem, or explicitly defined here.

 Create as many sidebars as you want.
 */
const sidebars: SidebarsConfig = {
  tutorialSidebar: [
    'intro',
    {
      type: 'category',
      label: 'User Guides',
      items: [
        'USAGE-GUIDE',
        'LOCAL-DEVELOPMENT',
        'DEPLOYMENT',
        'AZURE-MULTI-ENVIRONMENT',
        'GLOBAL-CHOICES-GUIDE',
        'RELATIONSHIP_TYPES',
        'VALIDATION-AND-AUTOFIX',
      ],
    },
    {
      type: 'category',
      label: 'Development',
      items: [
        'DEVELOPER_ARCHITECTURE',
        'TESTING',
        'DEV-PROXY-TESTING',
        'TESTING-SCENARIOS',
      ],
    },
  ],
};

export default sidebars;
