/**
 * File Upload Zone Component
 * Handles file selection and drag/drop functionality
 */

import React, { useCallback } from 'react';
import {
  Card,
  CardHeader,
  CardPreview,
  Text,
  Button,
  tokens
} from '@fluentui/react-components';
import { DocumentRegular, DocumentArrowUpRegular } from '@fluentui/react-icons';
import type { FileUploadZoneProps } from '../types/file-upload.types';
import styles from './FileUploadZone.module.css';

export const FileUploadZone: React.FC<FileUploadZoneProps> = ({
  onFileSelected,
  acceptedFileTypes = '.mmd',
  disabled = false,
  className = ''
}) => {
  /**
   * Handle file selection from input
   */
  const handleFileInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      const file = files[0];
      handleFileSelection(file);
    }
  }, []);

  /**
   * Handle browse button click
   */
  const handleBrowseClick = useCallback(() => {
    const input = document.getElementById('file-input') as HTMLInputElement;
    input?.click();
  }, []);

  /**
   * Process selected file and read content
   */
  const handleFileSelection = useCallback(async (file: File) => {
    if (!file.name.endsWith('.mmd')) {
      alert('Please select a .mmd file');
      return;
    }

    try {
      const content = await file.text();
      onFileSelected(file, content);
    } catch (error) {
      console.error('Error reading file:', error);
      alert('Error reading file. Please try again.');
    }
  }, [onFileSelected]);

  /**
   * Handle drag and drop events
   */
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (disabled) return;

    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      handleFileSelection(files[0]);
    }
  }, [disabled, handleFileSelection]);

  return (
    <Card className={`${styles.uploadCard} ${className}`}>
      <CardHeader
        header={
          <Text weight="semibold" size={400}>
            Upload Mermaid ERD File
          </Text>
        }
        description={
          <Text size={300} style={{ color: tokens.colorNeutralForeground3 }}>
            Select a .mmd file containing your Entity Relationship Diagram
          </Text>
        }
      />
      <CardPreview>
        <div 
          className={`${styles.uploadZone} ${disabled ? styles.disabled : ''}`}
          onDragOver={handleDragOver}
          onDragEnter={handleDragEnter}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          data-testid="upload-zone"
        >
          <div className={styles.uploadContent}>
            <DocumentArrowUpRegular 
              className={styles.uploadIcon}
              fontSize={48}
            />
            <Text size={500} weight="semibold" className={styles.uploadTitle}>
              Drop your .mmd file here
            </Text>
            <Text size={300} className={styles.uploadSubtitle}>
              or
            </Text>
            <Button 
              appearance="primary"
              size="large"
              onClick={handleBrowseClick}
              disabled={disabled}
              data-testid="upload-trigger"
              className={styles.browseButton}
            >
              <DocumentRegular className={styles.buttonIcon} />
              Browse Files
            </Button>
            <Text size={200} className={styles.uploadHint}>
              Accepted formats: {acceptedFileTypes}
            </Text>
          </div>
        </div>

        <input
          id="file-input"
          type="file"
          accept={acceptedFileTypes}
          onChange={handleFileInputChange}
          style={{ display: 'none' }}
          disabled={disabled}
        />
      </CardPreview>
    </Card>
  );
};
