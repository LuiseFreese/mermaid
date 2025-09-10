/**
 * Uploaded Choices Preview Component
 * Displays uploaded global choices with details
 */

import React from 'react';
import {
  Text
} from '@fluentui/react-components';
import type { UploadedChoicesPreviewProps, GlobalChoice, GlobalChoiceOption } from '../types';

export const UploadedChoicesPreview: React.FC<UploadedChoicesPreviewProps> = ({
  choices,
  className
}) => {
  if (!choices || choices.length === 0) {
    return null;
  }

  return (
    <div className={className} style={{ marginTop: '16px' }}>
      <Text weight="semibold" style={{ marginBottom: '8px', display: 'block' }}>
        Uploaded Global Choices ({choices.length}):
      </Text>
      
      <div style={{ 
        maxHeight: '200px', 
        overflowY: 'auto', 
        border: '1px solid var(--colorNeutralStroke2)', 
        borderRadius: '4px',
        padding: '12px',
        backgroundColor: 'var(--colorNeutralBackground1)'
      }}>
        {choices.map((choice: GlobalChoice, index: number) => (
          <div 
            key={choice.id || index} 
            style={{ 
              marginBottom: '8px', 
              paddingBottom: '8px',
              borderBottom: index < choices.length - 1 ? '1px solid var(--colorNeutralStroke3)' : 'none'
            }}
          >
            <Text weight="semibold" style={{ display: 'block', color: 'var(--colorNeutralForeground1)' }}>
              {choice.displayName || choice.name}
            </Text>
            {choice.options && choice.options.length > 0 && (
              <Text size={200} style={{ color: 'var(--colorNeutralForeground2)', marginTop: '4px', display: 'block' }}>
                Options: {choice.options.map((opt: GlobalChoiceOption) => opt.label || opt.value).join(', ')}
              </Text>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};
