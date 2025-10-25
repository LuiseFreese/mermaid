/**
 * GlobalChoicesStep Orchestrator Component
 * Main orchestrator that integrates all extracted components
 */

import React from 'react';
import {
  Card,
  CardHeader,
  Text,
  Accordion,
  AccordionItem,
  AccordionHeader,
  AccordionPanel,
  MessageBar,
  MessageBarBody,
  Button
} from '@fluentui/react-components';
import { SettingsRegular } from '@fluentui/react-icons';
import { useWizardContext } from '../../../../context/WizardContext';
import { 
  useGlobalChoicesData, 
  useChoiceSelection, 
  useFileUpload, 
  useChoicesValidation 
} from './hooks';
import {
  ChoiceSearch,
  GlobalChoicesList,
  CustomChoicesUpload,
  UploadedChoicesPreview,
  GlobalChoicesNavigation
} from './components';
import type { GlobalChoicesStepProps } from './types';
import styles from '../GlobalChoicesStep.module.css';

export const GlobalChoicesStep: React.FC<GlobalChoicesStepProps> = ({
  onNext,
  onPrevious,
}) => {
  const { wizardData, updateWizardData } = useWizardContext();
  const { globalChoicesSearchTerm } = wizardData;

  // Custom hooks
  const { builtInChoices, customChoices, loading, error, refetch } = useGlobalChoicesData();
  const { selectedChoices, handleChoiceSelect } = useChoiceSelection([...builtInChoices, ...customChoices]);
  const { uploadedFile, uploadedChoices, isUploading, uploadError, handleFileUpload } = useFileUpload();
  const { isValid } = useChoicesValidation();

  // Handle search term updates
  const handleSearchChange = (value: string) => {
    updateWizardData({ globalChoicesSearchTerm: value });
  };

  return (
    <Card>
      <CardHeader
        header={
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <SettingsRegular />
            <Text className={styles.headerText}>
              Global Choices (Optional)
            </Text>
          </div>
        }
      />

      <div className={styles.cardContent}>
        {/* Single Search Bar at the top */}
        <div style={{ marginBottom: '16px' }}>
          <ChoiceSearch
            value={globalChoicesSearchTerm || ''}
            onChange={handleSearchChange}
          />
        </div>

        {/* Error Handling */}
        {error && (
          <MessageBar intent="error" style={{ marginBottom: '16px' }}>
            <MessageBarBody>
              {error}
              <Button 
                appearance="transparent" 
                size="small" 
                onClick={refetch}
                style={{ marginLeft: '8px' }}
              >
                Retry
              </Button>
            </MessageBarBody>
          </MessageBar>
        )}

        <Accordion
          multiple
          defaultOpenItems={['built-in-choices', 'upload-choices']}
          className={styles.accordion}
        >
          {/* Built-in Choices - Single accordion with choices directly below */}
          {builtInChoices.length > 0 && (
            <AccordionItem value="built-in-choices">
              <AccordionHeader expandIconPosition="start">
                <Text className={styles.accordionHeaderText}>
                  Built-in Choices ({builtInChoices.length})
                </Text>
              </AccordionHeader>
              <AccordionPanel>
                <Text size={300} style={{ color: '#6b6b6b', marginBottom: '16px' }}>
                  Select existing built-in choice sets from your environment.
                </Text>

                <GlobalChoicesList
                  choices={builtInChoices}
                  selectedChoices={selectedChoices}
                  onChoiceSelect={handleChoiceSelect}
                  searchTerm={globalChoicesSearchTerm || ''}
                  loading={loading}
                />
              </AccordionPanel>
            </AccordionItem>
          )}

          {/* Upload Custom Choices */}
          <AccordionItem value="upload-choices">
            <AccordionHeader expandIconPosition="start">
              <Text className={styles.accordionHeaderText}>
                Upload Custom Choices
              </Text>
            </AccordionHeader>
            <AccordionPanel>
              {/* File Upload Component */}
              <CustomChoicesUpload
                onFileUpload={handleFileUpload}
                uploadedFile={uploadedFile}
                isUploading={isUploading}
                error={uploadError}
              />

              {/* Uploaded Choices Preview */}
              <UploadedChoicesPreview
                choices={uploadedChoices}
                onRemove={() => {/* TODO: Implement remove logic */}}
              />
            </AccordionPanel>
          </AccordionItem>
        </Accordion>

        {/* Navigation Controls */}
        <GlobalChoicesNavigation
          onNext={onNext || (() => {})}
          onPrevious={onPrevious || (() => {})}
          canProceed={isValid}
          isValid={isValid}
        />
      </div>
    </Card>
  );
};
