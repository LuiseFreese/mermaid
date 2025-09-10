/**
 * Custom Choices Upload Component
 * Handles file upload for custom global choice definitions
 */

import React from 'react';
import {
  Text,
  Button,
  MessageBar,
  MessageBarBody,
  Spinner
} from '@fluentui/react-components';
import type { CustomChoicesUploadProps } from '../types';
import styles from '../../GlobalChoicesStep.module.css';

// Simple file size formatter
const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
};

export const CustomChoicesUpload: React.FC<CustomChoicesUploadProps> = ({
  onFileUpload,
  uploadedFile,
  isUploading,
  error,
  className
}) => {
  const fileInputId = 'global-choices-upload';

  return (
    <div className={`${styles.fileUpload} ${className || ''}`}>
      <Text size={300} className={styles.uploadDescription}>
        Upload a JSON file containing custom global choice definitions.
      </Text>
      
      <input
        type="file"
        accept=".json"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) {
            onFileUpload(file);
          }
        }}
        style={{ display: 'none' }}
        id={fileInputId}
      />
      
      <Button
        appearance="primary"
        onClick={() => document.getElementById(fileInputId)?.click()}
        disabled={isUploading}
        className={styles.fileUploadButton}
      >
        {isUploading ? (
          <>
            <Spinner size="tiny" style={{ marginRight: '8px' }} />
            Uploading...
          </>
        ) : (
          'Choose File'
        )}
      </Button>
      
      {uploadedFile && !error && (
        <MessageBar intent="success" style={{ marginTop: '16px' }}>
          <MessageBarBody>
            <strong>File uploaded successfully!</strong> {uploadedFile.name} ({formatFileSize(uploadedFile.size)})
          </MessageBarBody>
        </MessageBar>
      )}

      {error && (
        <MessageBar intent="error" style={{ marginTop: '16px' }}>
          <MessageBarBody>
            <strong>Upload Error:</strong> {error}
          </MessageBarBody>
        </MessageBar>
      )}
      
      {!uploadedFile && !isUploading && (
        <Text size={200} style={{ color: '#6b6b6b', marginTop: '8px' }}>
          No file selected
        </Text>
      )}
    </div>
  );
};
