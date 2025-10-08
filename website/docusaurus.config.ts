import {themes as prismThemes} from 'prism-react-renderer';
import type {Config} from '@docusaurus/types';
import type * as Preset from '@docusaurus/preset-classic';

const config: Config = {
  title: 'Mermaid to Dataverse Converter',
  tagline: 'Convert Mermaid ERD diagrams to Dataverse solutions with ease',
  favicon: 'img/logo.svg',

  // Add OpenGraph and X Card metadata
  headTags: [
    {
      tagName: 'meta',
      attributes: {
        property: 'og:image',
        content: 'https://mermaid2dataverse.netlify.app/img/logo.svg',
      },
    },
    {
      tagName: 'meta',
      attributes: {
        property: 'og:image:alt',
        content: 'Mermaid to Dataverse Converter - Convert ERD diagrams to Dataverse',
      },
    },
    {
      tagName: 'meta',
      attributes: {
        name: 'twitter:card',
        content: 'summary_large_image',
      },
    },
    {
      tagName: 'meta',
      attributes: {
        name: 'twitter:image',
        content: 'https://mermaid2dataverse.netlify.app/img/logo.svg',
      },
    },
  ],

  // Enable Mermaid diagrams
  markdown: {
    mermaid: true,
  },
  themes: ['@docusaurus/theme-mermaid'],

  // Future flags, see https://docusaurus.io/docs/api/docusaurus-config#future
  future: {
    v4: true, // Improve compatibility with the upcoming Docusaurus v4
  },

  // Set the production url of your site here
  // For Netlify: this will be your custom domain or netlify subdomain
  url: 'https://mermaid2dataverse.netlify.app',
  // Set the /<baseUrl>/ pathname under which your site is served
  // For Netlify deployment at root, use '/'
  baseUrl: '/',

  // GitHub pages deployment config (keep for reference)
  organizationName: 'LuiseFreese', // Usually your GitHub org/user name.
  projectName: 'mermaid', // Usually your repo name.

  onBrokenLinks: 'throw',

  // Even if you don't use internationalization, you can use this field to set
  // useful metadata like html lang. For example, if your site is Chinese, you
  // may want to replace "en" with "zh-Hans".
  i18n: {
    defaultLocale: 'en',
    locales: ['en'],
  },

  presets: [
    [
      'classic',
      {
        docs: {
          path: '../docs',
          sidebarPath: './sidebars.ts',
          exclude: [
            '**/temp/**',
            '**/NEXT-FEATURES-ROADMAP.md',
          ],
          // Please change this to your repo.
          // Remove this to remove the "edit this page" links.
          editUrl:
            'https://github.com/LuiseFreese/mermaid/tree/main/docs/',
        },
        blog: false, // Disable blog for now
        theme: {
          customCss: './src/css/custom.css',
        },
      } satisfies Preset.Options,
    ],
  ],

  themeConfig: {
    // OpenGraph social card
    image: 'img/logo.svg',
    colorMode: {
      respectPrefersColorScheme: true,
    },
    navbar: {
      title: 'Mermaid to Dataverse',
      logo: {
        alt: 'Mermaid with Database Logo',
        src: 'img/logo.svg',
      },
      items: [
        {
          href: 'https://github.com/LuiseFreese/mermaid',
          label: 'GitHub',
          position: 'right',
        },
      ],
    },
    footer: {
      style: 'dark',
      links: [
        {
          title: 'Documentation',
          items: [
            {
              label: 'Getting Started',
              to: '/docs/intro',
            },
            {
              label: 'Local Development',
              to: '/docs/LOCAL-DEVELOPMENT',
            },
            {
              label: 'Deployment',
              to: '/docs/DEPLOYMENT',
            },
            {
              label: 'Dev Proxy Testing',
              to: '/docs/DEV-PROXY-TESTING',
            },
          ],
        },
        {
          title: 'More',
          items: [
            {
              label: 'GitHub',
              href: 'https://github.com/LuiseFreese/mermaid',
            },
            {
              label: 'Blog',
              href: 'https://m365princess.com',
            },
            {
              label: 'Luise on LinkedIn',
              href: 'https://linkedin.com/in/luisefreese',
            },
                        {
              label: 'MermaidJS',
              href: 'https://mermaid.js.org/syntax/entityRelationshipDiagram.html',
            },
          ],
        },
      ],
      copyright: `Made with 💖 by Luise Freese ${new Date().getFullYear()}. Built with Docusaurus.`,
    },
    prism: {
      theme: prismThemes.github,
      darkTheme: prismThemes.dracula,
    },
  } satisfies Preset.ThemeConfig,
};

export default config;
