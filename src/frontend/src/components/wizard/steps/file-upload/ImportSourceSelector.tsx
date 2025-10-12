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
  CloudDatabaseRegular,
  ArrowRightRegular
} from '@fluentui/react-icons';

export type ImportSource = 'file' | 'dataverse';

interface ImportSourceSelectorProps {
  selectedSource: ImportSource | null;
  onSourceSelect: (source: ImportSource) => void;
}

export const ImportSourceSelector: React.FC<ImportSourceSelectorProps> = ({
  selectedSource,
  onSourceSelect
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
            cursor: 'pointer',
            border: selectedSource === 'file' ? `2px solid ${tokens.colorBrandBackground}` : undefined,
            transition: 'all 0.2s ease'
          }}
          onClick={() => onSourceSelect('file')}
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
              
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: '4px' }}>
                <Badge appearance="tint" size="small">Local Files</Badge>
                <Badge appearance="tint" size="small">Quick Upload</Badge>
                <Badge appearance="tint" size="small">Validation</Badge>
              </div>

              {selectedSource === 'file' && (
                <div style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  gap: '4px', 
                  marginTop: '8px',
                  color: tokens.colorBrandForeground1 
                }}>
                  <ArrowRightRegular fontSize={14} />
                  <Text size={200} weight="semibold">Selected</Text>
                </div>
              )}
            </div>
          </CardPreview>
        </Card>

        {/* Dataverse Import Option */}
        <Card 
          appearance={selectedSource === 'dataverse' ? 'filled' : 'outline'}
          style={{ 
            cursor: 'pointer',
            border: selectedSource === 'dataverse' ? `2px solid ${tokens.colorBrandBackground}` : undefined,
            transition: 'all 0.2s ease'
          }}
          onClick={() => onSourceSelect('dataverse')}
        >
          <CardHeader
            header={
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <CloudDatabaseRegular fontSize={20} />
                <Text weight="semibold">Import from Dataverse</Text>
                <Badge appearance="filled" color="brand" size="small">BETA</Badge>
              </div>
            }
            description="Reverse engineer from existing Dataverse solution"
          />
          <CardPreview style={{ padding: '12px 16px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <Text size={200} style={{ color: tokens.colorNeutralForeground2 }}>
                Connect to a Dataverse environment and extract ERD from existing solutions
              </Text>
              
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: '4px' }}>
                <Badge appearance="tint" size="small">Live Data</Badge>
                <Badge appearance="tint" size="small">Relationships</Badge>
                <Badge appearance="tint" size="small">CDM Detection</Badge>
              </div>

              {selectedSource === 'dataverse' && (
                <div style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  gap: '4px', 
                  marginTop: '8px',
                  color: tokens.colorBrandForeground1 
                }}>
                  <ArrowRightRegular fontSize={14} />
                  <Text size={200} weight="semibold">Selected</Text>
                </div>
              )}
            </div>
          </CardPreview>
        </Card>

      </div>
    </div>
  );
};