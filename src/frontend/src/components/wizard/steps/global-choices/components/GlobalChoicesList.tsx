/**
 * Global Choices List Component
 * Displays choices with checkboxes for selection
 */

import React from 'react';
import {
  Text,
  Checkbox,
  Spinner,
  tokens
} from '@fluentui/react-components';
import { filterGlobalChoices } from '../utils';
import type { GlobalChoicesListProps, GlobalChoice } from '../types';
import styles from '../../GlobalChoicesStep.module.css';

export const GlobalChoicesList: React.FC<GlobalChoicesListProps> = ({
  choices,
  selectedChoices,
  onChoiceSelect,
  searchTerm,
  loading = false,
  className
}) => {
  // Filter choices based on search term
  const filteredChoices = filterGlobalChoices(choices, {
    searchTerm: searchTerm || '',
    includeBuiltIn: true,
    includeCustom: true,
    selectedOnly: false
  });  if (loading) {
    return (
      <div className={styles.loadingContainer}>
        <Spinner size="medium" />
        <Text>Loading global choices...</Text>
      </div>
    );
  }

  if (choices.length === 0) {
    return (
      <Text style={{ color: tokens.colorNeutralForeground3 }}>
        No global choices available
      </Text>
    );
  }

  return (
    <div className={className}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {filteredChoices.map((choice) => {
          const isSelected = selectedChoices.some((sc: GlobalChoice) => sc.id === choice.id);
          return (
            <div key={choice.id} style={{ padding: '8px 0' }}>
              <Checkbox
                checked={isSelected}
                onChange={(_, data) => onChoiceSelect(choice.id, data.checked === true)}
                label={
                  <div>
                    <Text size={300} weight="medium">{choice.displayName}</Text>
                    <Text size={200} style={{ color: '#6b6b6b', display: 'block' }}>
                      {choice.logicalName}
                    </Text>
                    {choice.options && choice.options.length > 0 && (
                      <Text size={200} style={{ color: tokens.colorNeutralForeground3, display: 'block' }}>
                        {choice.options.length} options available
                      </Text>
                    )}
                  </div>
                }
              />
            </div>
          );
        })}
      </div>
    </div>
  );
};
