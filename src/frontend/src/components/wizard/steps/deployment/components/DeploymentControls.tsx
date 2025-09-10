/**
 * Deployment Controls Component
 * Navigation buttons and deployment action controls
 */

import React from 'react';
import {
  Button,
  Spinner
} from '@fluentui/react-components';
import type { DeploymentControlsProps } from '../types';

export const DeploymentControls: React.FC<DeploymentControlsProps> = ({ 
  isDeploying,
  deploymentSuccess,
  onDeploy,
  onPrevious,
  onBackToStart,
  className
}) => {
  return (
    <div 
      className={className}
      style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        gap: '12px',
        padding: '16px 0' 
      }}
    >
      <Button 
        appearance="secondary" 
        onClick={onPrevious}
        disabled={isDeploying}
        style={{ display: deploymentSuccess ? 'none' : 'block' }}
      >
        Previous
      </Button>
      
      {deploymentSuccess ? (
        <Button 
          appearance="primary" 
          onClick={onBackToStart}
        >
          Back to Start
        </Button>
      ) : (
        <Button 
          appearance="primary" 
          onClick={onDeploy}
          disabled={isDeploying}
        >
          {isDeploying ? (
            <>
              <Spinner size="tiny" style={{ marginRight: '8px' }} />
              Deploying...
            </>
          ) : (
            'Deploy to Dataverse'
          )}
        </Button>
      )}
    </div>
  );
};
