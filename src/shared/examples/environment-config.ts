/**
 * Example Multi-Environment Configuration
 * 
 * This shows how organizations might configure their environments
 * with meaningful names rather than generic dev/test/prod labels.
 */

import { EnvironmentConfig } from '../types/environment';

export const exampleEnvironmentConfig: EnvironmentConfig = {
  version: '1.0.0',
  defaultEnvironmentId: 'customer-dev-001',
  environments: [
    {
      id: 'customer-dev-001',
      name: 'Customer Development',
      url: 'https://contoso-dev.crm.dynamics.com',
      description: 'Development environment for customer-facing solutions',
      color: 'blue',
      metadata: {
        organizationName: 'contoso-dev',
        organizationDisplayName: 'Contoso Development',
        region: 'North America'
      }
    },
    {
      id: 'integration-test',
      name: 'Integration Testing',
      url: 'https://contoso-integration.crm.dynamics.com',
      description: 'Integration testing with external systems',
      color: 'yellow',
      metadata: {
        organizationName: 'contoso-integration',
        organizationDisplayName: 'Contoso Integration Test',
        region: 'North America'
      }
    },
    {
      id: 'partner-uat',
      name: 'Partner UAT',
      url: 'https://contoso-partneruat.crm.dynamics.com',
      description: 'User acceptance testing with partner organizations',
      color: 'green',
      metadata: {
        organizationName: 'contoso-partneruat',
        organizationDisplayName: 'Contoso Partner UAT',
        region: 'North America'
      }
    },
    {
      id: 'production-main',
      name: 'Production (Main)',
      url: 'https://contoso.crm.dynamics.com',
      description: 'Live production environment',
      color: 'red',
      metadata: {
        organizationName: 'contoso',
        organizationDisplayName: 'Contoso Production',
        region: 'North America'
      }
    },
    {
      id: 'production-emea',
      name: 'Production (EMEA)',
      url: 'https://contoso-emea.crm4.dynamics.com',
      description: 'Production environment for European customers',
      color: 'red',
      metadata: {
        organizationName: 'contoso-emea',
        organizationDisplayName: 'Contoso EMEA Production',
        region: 'Europe'
      }
    }
  ]
};

/**
 * Example operation contexts to show in UI
 */
export const operationExamples = {
  importFromDev: {
    type: 'import' as const,
    sourceEnvironment: exampleEnvironmentConfig.environments[0],
    description: 'Importing solution from Customer Development'
  },
  deployToUAT: {
    type: 'deploy' as const,
    sourceEnvironment: exampleEnvironmentConfig.environments[0],
    targetEnvironment: exampleEnvironmentConfig.environments[2],
    description: 'Deploying from Customer Development to Partner UAT'
  },
  rollbackProduction: {
    type: 'rollback' as const,
    sourceEnvironment: exampleEnvironmentConfig.environments[3],
    description: 'Rolling back changes in Production (Main)'
  }
};