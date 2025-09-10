/**
 * DeploymentStep Orchestrator Component
 * Main orchestrator that integrates all extracted components
 */

import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Card,
  CardHeader,
  Text
} from '@fluentui/react-components';
import { useWizardContext } from '../../../../context/WizardContext';
import { useDeploymentState } from './hooks';
import {
  ConfigurationSummary,
  DeploymentProgress,
  DeploymentResults,
  DeploymentControls
} from './components';
import type { DeploymentStepProps } from './types';
import styles from './DeploymentStep.module.css';
import fileUploadStyles from '../FileUploadStep.module.css';

export const DeploymentStep: React.FC<DeploymentStepProps> = ({ 
  onNext, 
  onPrevious 
}) => {
  const { resetWizard } = useWizardContext();
  const navigate = useNavigate();
  const { deploymentState, handleDeploy } = useDeploymentState();

  const handleBackToStart = () => {
    // Reset wizard data and navigate back to start
    resetWizard();
    navigate('/wizard');
  };

  return (
    <Card>
      <CardHeader
        header={
          <Text className={styles.headerText}>
            Deployment Summary & Options
          </Text>
        }
      />
      
      <div className={styles.cardContent}>
        <Text className={fileUploadStyles.schemaOverviewDescription}>
          Review your deployment configuration. This summary shows what will be created in your Dataverse environment.
        </Text>

        {/* Configuration Summary */}
        <ConfigurationSummary />

        {/* Deployment Progress */}
        <DeploymentProgress
          isDeploying={deploymentState.isDeploying}
          progress={deploymentState.deploymentProgress}
          className={styles.deploymentProgress}
        />

        {/* Deployment Results */}
        <DeploymentResults
          result={deploymentState.deploymentResult}
          error={deploymentState.deploymentError}
          isDeploying={deploymentState.isDeploying}
          className={styles.deploymentResult}
        />

        {/* Navigation Controls */}
        <DeploymentControls
          isDeploying={deploymentState.isDeploying}
          deploymentSuccess={deploymentState.deploymentSuccess}
          onDeploy={handleDeploy}
          onPrevious={onPrevious}
          onBackToStart={handleBackToStart}
          className={styles.navigationButtons}
        />
      </div>
    </Card>
  );
};
