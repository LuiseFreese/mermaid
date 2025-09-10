/**
 * Choice Search Component
 * Handles search input for filtering global choices
 */

import React from 'react';
import {
  Field,
  Input,
  Text
} from '@fluentui/react-components';
import type { ChoiceSearchProps } from '../types';

export const ChoiceSearch: React.FC<ChoiceSearchProps> = ({
  value,
  onChange,
  placeholder = "Search by name, logical name, or prefix...",
  className
}) => {
  return (
    <Field 
      label={<Text weight="semibold">Search</Text>}
      className={className}
    >
      <Input
        placeholder={placeholder}
        value={value}
        onChange={(_, data) => onChange(data.value)}
        style={{ width: '100%', marginBottom: '24px' }}
      />
    </Field>
  );
};
