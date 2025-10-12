import React from 'react';
import {
  Card,
  CardHeader,
  CardPreview,
  Text,
  Button,
  Badge,
  tokens,
} from '@fluentui/react-components';
import { 
  DocumentRegular, 
  CloudDatabaseRegular
} from '@fluentui/react-icons';

export type ImportSource = 'file' | 'dataverse';

interface ImportSourceSelectorProps {
  selectedSource: ImportSource | null;
  onSourceSelect: (source: ImportSource) => void;
  isDataverseImported?: boolean;
  isFileUploaded?: boolean;
}

export const ImportSourceSelector: React.FC<ImportSourceSelectorProps> = ({
  selectedSource,
  onSourceSelect,
  isDataverseImported = false,
  isFileUploaded = false
}) => {
  return (
    <div style={{ marginBottom: '24px' }}>
      <Text size={500} weight="semibold" style={{ marginBottom: '16px', display: 'block' }}>
        Choose Import Source
      </Text>
      
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
        
        {/* File Upload Option */}
        <Card 
          appearance={selectedSource === 'file' ? 'filled' : 'outline'}
          style={{ 
            cursor: isDataverseImported ? 'not-allowed' : 'pointer',
            border: selectedSource === 'file' ? `2px solid ${tokens.colorBrandBackground}` : undefined,
            transition: 'all 0.2s ease',
            opacity: isDataverseImported ? 0.5 : 1,
            pointerEvents: isDataverseImported ? 'none' : 'auto'
          }}
          onClick={() => !isDataverseImported && onSourceSelect('file')}
        >
          <CardHeader
            header={
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <DocumentRegular fontSize={20} />
                <Text weight="semibold">Upload File</Text>
              </div>
            }
            description="Import from a Mermaid ERD file (.mmd)"
          />
          <CardPreview style={{ padding: '12px 16px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <Text size={200} style={{ color: tokens.colorNeutralForeground2 }}>
                Upload an existing Mermaid ERD file to validate and convert to Dataverse
              </Text>
            </div>
          </CardPreview>
        </Card>

        {/* Dataverse Import Option */}
        <Card 
          appearance={selectedSource === 'dataverse' ? 'filled' : 'outline'}
          style={{ 
            cursor: isFileUploaded ? 'not-allowed' : 'pointer',
            border: selectedSource === 'dataverse' ? `2px solid ${tokens.colorBrandBackground}` : undefined,
            transition: 'all 0.2s ease',
            opacity: isFileUploaded ? 0.5 : 1,
            pointerEvents: isFileUploaded ? 'none' : 'auto'
          }}
          onClick={() => !isFileUploaded && onSourceSelect('dataverse')}
        >
          <CardHeader
            header={
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <CloudDatabaseRegular fontSize={20} />
                <Text weight="semibold">Import from Dataverse</Text>
                <Badge appearance="filled" color="brand" size="small">BETA</Badge>
              </div>
            }
            description="Reverse engineer from an existing Dataverse solution"
          />
          <CardPreview style={{ padding: '12px 16px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <Text size={200} style={{ color: tokens.colorNeutralForeground2 }}>
                Extract a mermaid ERD to either download or modify it
              </Text>
            </div>
          </CardPreview>
        </Card>

      </div>
    </div>
  );
};