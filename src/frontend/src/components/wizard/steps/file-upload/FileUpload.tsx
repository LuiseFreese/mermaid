import React, { useState, useRef, useCallback } from 'react';
import {
  Card,
  CardHeader,
  CardPreview,
  Text,
  Button,
  ProgressBar,
  MessageBar,
  MessageBarBody,
  tokens,
} from '@fluentui/react-components';
import { 
  DocumentRegular, 
  CloudArrowUpRegular,
  CheckmarkCircleRegular
} from '@fluentui/react-icons';
import { useWizardContext } from '../../../../context/WizardContext';

interface FileUploadProps {
  onFileUploaded?: (content: string, metadata?: any) => void;
}

export const FileUpload: React.FC<FileUploadProps> = ({ onFileUploaded }) => {
  const { updateWizardData } = useWizardContext();
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [isDragOver, setIsDragOver] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadedFile, setUploadedFile] = useState<string | null>(null);

  const handleFileSelect = useCallback(async (file: File) => {
    if (!file.name.endsWith('.mmd')) {
      setUploadError('Please select a valid Mermaid (.mmd) file');
      return;
    }

    setIsUploading(true);
    setUploadError(null);
    setUploadProgress(0);

    try {
      // Simulate upload progress
      const progressInterval = setInterval(() => {
        setUploadProgress(prev => {
          if (prev >= 90) {
            clearInterval(progressInterval);
            return 90;
          }
          return prev + 10;
        });
      }, 100);

      const content = await file.text();
      
      clearInterval(progressInterval);
      setUploadProgress(100);

      // Update wizard data
      updateWizardData({
        originalErdContent: content,
        correctedErdContent: content,
        importSource: {
          type: 'file',
          fileName: file.name,
          size: file.size,
          lastModified: file.lastModified
        }
      });

      setUploadedFile(file.name);
      onFileUploaded?.(content, { 
        fileName: file.name,
        size: file.size,
        lastModified: file.lastModified 
      });

    } catch (error) {
      setUploadError(error instanceof Error ? error.message : 'Failed to read file');
    } finally {
      setIsUploading(false);
      
      // Reset progress after a delay
      setTimeout(() => {
        setUploadProgress(0);
      }, 2000);
    }
  }, [updateWizardData, onFileUploaded]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      handleFileSelect(files[0]);
    }
  }, [handleFileSelect]);

  const handleFileInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      handleFileSelect(files[0]);
    }
  }, [handleFileSelect]);

  const handleSelectFile = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  return (
    <Card style={{ minHeight: '400px' }}>
      <CardHeader
        header={
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <DocumentRegular fontSize={20} />
            <Text weight="semibold">Upload Mermaid ERD File</Text>
          </div>
        }
        description="Upload an existing Mermaid ERD file to validate and convert"
      />

      <CardPreview style={{ padding: '16px 24px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          
          {/* File Upload Area */}
          <div
            style={{
              border: `2px dashed ${isDragOver ? tokens.colorBrandBackground : tokens.colorNeutralStroke1}`,
              borderRadius: '8px',
              padding: '32px',
              textAlign: 'center',
              backgroundColor: isDragOver ? tokens.colorNeutralBackground1Hover : tokens.colorNeutralBackground1,
              transition: 'all 0.2s ease',
              cursor: 'pointer'
            }}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={handleSelectFile}
          >
            {uploadedFile ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
                <CheckmarkCircleRegular fontSize={48} style={{ color: tokens.colorPaletteGreenForeground1 }} />
                <Text weight="semibold">{uploadedFile}</Text>
                <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>
                  File uploaded successfully
                </Text>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
                <CloudArrowUpRegular fontSize={48} style={{ color: tokens.colorNeutralForeground3 }} />
                <div>
                  <Text weight="semibold" style={{ marginBottom: '4px', display: 'block' }}>
                    {isDragOver ? 'Drop your file here' : 'Drop your Mermaid file here'}
                  </Text>
                  <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>
                    or click to browse files
                  </Text>
                </div>
                <Button appearance="secondary" disabled={isUploading}>
                  Select File
                </Button>
              </div>
            )}
          </div>

          {/* Progress Bar */}
          {isUploading && (
            <div>
              <Text size={200} style={{ marginBottom: '8px', display: 'block' }}>
                Uploading file...
              </Text>
              <ProgressBar value={uploadProgress} max={100} />
            </div>
          )}

          {/* Error Message */}
          {uploadError && (
            <MessageBar intent="error">
              <MessageBarBody>{uploadError}</MessageBarBody>
            </MessageBar>
          )}

          {/* File Requirements */}
          <div style={{ 
            padding: '12px', 
            backgroundColor: tokens.colorNeutralBackground2, 
            borderRadius: '6px',
            fontSize: '12px'
          }}>
            <Text weight="semibold" style={{ marginBottom: '4px', display: 'block' }}>
              File Requirements:
            </Text>
            <div style={{ color: tokens.colorNeutralForeground3 }}>
              • File extension: .mmd
              • Valid Mermaid ERD syntax
              • Maximum file size: 10MB
            </div>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept=".mmd"
            style={{ display: 'none' }}
            onChange={handleFileInputChange}
          />

        </div>
      </CardPreview>
    </Card>
  );
};