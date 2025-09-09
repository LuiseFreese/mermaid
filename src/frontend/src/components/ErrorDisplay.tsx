import React from 'react';
import { MessageBar, MessageBarBody, Text } from '@fluentui/react-components';
import { ErrorCircleRegular } from '@fluentui/react-icons';

interface ErrorDisplayProps {
  error?: string | Error;
  title?: string;
  onDismiss?: () => void;
}

export const ErrorDisplay: React.FC<ErrorDisplayProps> = ({
  error,
  title = 'Error',
  onDismiss,
}) => {
  if (!error) {
    return null;
  }

  const errorMessage = typeof error === 'string' ? error : error.message;

  return (
    <MessageBar intent="error" onDismiss={onDismiss}>
      <MessageBarBody>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <ErrorCircleRegular />
          <div>
            <Text weight="semibold">{title}</Text>
            <Text>{errorMessage}</Text>
          </div>
        </div>
      </MessageBarBody>
    </MessageBar>
  );
};
