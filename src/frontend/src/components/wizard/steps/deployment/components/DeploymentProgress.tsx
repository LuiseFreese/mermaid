/**
 * Deployment Progress Component
 * Shows deployment progress with spinner and status messages
 */

import React from 'react';
import {
  Text,
  Spinner,
  tokens
} from '@fluentui/react-components';
import type { DeploymentProgressProps } from '../types';

export const DeploymentProgress: React.FC<DeploymentProgressProps> = ({ 
  isDeploying,
  progress,
  className
}) => {
  if (!isDeploying) {
    return null;
  }

  return (
    <div className={className} style={{ padding: '16px 0' }}>
      <div style={{ 
        display: 'flex', 
        alignItems: 'center', 
        gap: '8px', 
        marginBottom: '8px' 
      }}>
        <Spinner size="small" />
        <Text weight="semibold">Deploying to Dataverse...</Text>
      </div>
      {progress && (
        <Text 
          size={200} 
          style={{ color: tokens.colorNeutralForeground2 }}
        >
          {progress}
        </Text>
      )}
    </div>
  );
};
