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
    <div className={className} style={{ padding: '20px' }}>
      <div style={{ 
        display: 'flex', 
        alignItems: 'center', 
        gap: '16px', 
        marginBottom: '12px',
        padding: '4px 0'
      }}>
        <Spinner size="small" style={{ flexShrink: 0 }} />
        <Text weight="semibold">Deploying to Dataverse...</Text>
      </div>
      {progress && (
        <Text 
          size={200} 
          style={{ 
            color: tokens.colorNeutralForeground2,
            marginLeft: '36px' // Align with text above
          }}
        >
          {progress}
        </Text>
      )}
    </div>
  );
};
