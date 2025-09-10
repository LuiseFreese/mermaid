/**
 * Deployment Results Component
 * Shows deployment success/failure results and detailed information
 */

import React from 'react';
import {
  Text,
  tokens
} from '@fluentui/react-components';
import { hasDeploymentResults } from '../utils';
import type { DeploymentResultsProps } from '../types';

export const DeploymentResults: React.FC<DeploymentResultsProps> = ({ 
  result,
  error,
  isDeploying,
  className
}) => {
  // Don't render during deployment
  if (isDeploying) {
    return null;
  }

  // Show deployment result if available
  if (result) {
    return (
      <div className={className} style={{ padding: '16px 0' }}>
        {result.success ? (
          <div style={{ 
            padding: '12px', 
            backgroundColor: tokens.colorPaletteGreenBackground1, 
            borderRadius: '4px', 
            border: `1px solid ${tokens.colorPaletteGreenBorder1}` 
          }}>
            <Text 
              weight="semibold" 
              style={{ color: tokens.colorPaletteGreenForeground1 }}
            >
              Deployment Successful
            </Text>
            <div style={{ marginTop: '8px' }}>
              {/* Show detailed deployment results */}
              {result.entitiesCreated > 0 && (
                <Text 
                  size={200} 
                  style={{ 
                    color: tokens.colorPaletteGreenForeground2, 
                    display: 'block' 
                  }}
                >
                  {result.entitiesCreated} custom entities created
                </Text>
              )}
              {result.relationshipsCreated > 0 && (
                <Text 
                  size={200} 
                  style={{ 
                    color: tokens.colorPaletteGreenForeground2, 
                    display: 'block' 
                  }}
                >
                  {result.relationshipsCreated} relationships created
                </Text>
              )}
              {result.globalChoicesAdded > 0 && (
                <Text 
                  size={200} 
                  style={{ 
                    color: tokens.colorPaletteGreenForeground2, 
                    display: 'block' 
                  }}
                >
                  {result.globalChoicesAdded} global choices{' '}
                  {(result.globalChoicesCreated > 0 || result.globalChoicesExistingAdded > 0) && (
                    <span>
                      {' '}({[
                        result.globalChoicesCreated > 0 && `${result.globalChoicesCreated} created`,
                        result.globalChoicesExistingAdded > 0 && `${result.globalChoicesExistingAdded} existing added`
                      ].filter(Boolean).join(', ')})
                    </span>
                  )}
                </Text>
              )}
              {/* Show fallback summary if no specific metrics are available */}
              {!hasDeploymentResults(result) && (
                <Text 
                  size={200} 
                  style={{ 
                    color: tokens.colorPaletteGreenForeground2, 
                    display: 'block' 
                  }}
                >
                  {result.summary || result.message || 'Deployment completed successfully'}
                </Text>
              )}
            </div>
          </div>
        ) : (
          <div style={{ 
            padding: '12px', 
            backgroundColor: tokens.colorPaletteRedBackground1, 
            borderRadius: '4px', 
            border: `1px solid ${tokens.colorPaletteRedBorder1}` 
          }}>
            <Text 
              weight="semibold" 
              style={{ color: tokens.colorPaletteRedForeground1 }}
            >
              Deployment Failed
            </Text>
            {result.error && (
              <Text 
                size={200} 
                style={{ 
                  color: tokens.colorPaletteRedForeground2, 
                  display: 'block', 
                  marginTop: '4px' 
                }}
              >
                {result.error}
              </Text>
            )}
          </div>
        )}
      </div>
    );
  }

  // Show deployment error if available
  if (error) {
    return (
      <div className={className} style={{ padding: '16px 0' }}>
        <div style={{ 
          padding: '12px', 
          backgroundColor: tokens.colorPaletteRedBackground1, 
          borderRadius: '4px', 
          border: `1px solid ${tokens.colorPaletteRedBorder1}` 
        }}>
          <Text 
            weight="semibold" 
            style={{ color: tokens.colorPaletteRedForeground1 }}
          >
            Deployment Error
          </Text>
          <Text 
            size={200} 
            style={{ 
              color: tokens.colorPaletteRedForeground2, 
              display: 'block', 
              marginTop: '4px' 
            }}
          >
            {error}
          </Text>
        </div>
      </div>
    );
  }

  return null;
};
