import React, { useState } from 'react';
import {
  Card,
  CardHeader,
  Text,
  Button,
  Field,
  Input,
  Accordion,
  AccordionItem,
  AccordionHeader,
  AccordionPanel,
  Checkbox,
  MessageBar,
  MessageBarBody,
  Spinner,
  tokens,
} from '@fluentui/react-components';
import { SettingsRegular } from '@fluentui/react-icons';
import { useGlobalChoices } from '../../../hooks/useGlobalChoices';
import { useWizardContext } from '../../../context/WizardContext';
import styles from './GlobalChoicesStep.module.css';

interface GlobalChoicesStepProps {
  onNext?: () => void;
  onPrevious?: () => void;
}

export const GlobalChoicesStep: React.FC<GlobalChoicesStepProps> = ({
  onNext,
  onPrevious,
}) => {
  const { wizardData, updateWizardData } = useWizardContext();
  const { globalChoicesSearchTerm, selectedGlobalChoices, uploadedGlobalChoices } = wizardData;

  // Local state for uploaded JSON file (separate from ERD file)
  const [uploadedJsonFile, setUploadedJsonFile] = useState<File | null>(null);

  // Use the custom hook to fetch global choices
  const { 
    builtInChoices, 
    customChoices, 
    loading, 
    error, 
    refetch 
  } = useGlobalChoices();

  // Debug logging
  console.log('🔍 GlobalChoicesStep - Debug info:', {
    builtInChoices: builtInChoices.length,
    customChoices: customChoices.length,
    loading,
    error,
    builtInChoicesData: builtInChoices.slice(0, 3),
    customChoicesData: customChoices.slice(0, 3)
  });

  const handleChoiceSelect = (choiceId: string, checked: boolean) => {
    const currentSelected = selectedGlobalChoices || [];
    if (checked) {
      // Find the choice object and add it to the array
      const choice = [...builtInChoices, ...customChoices].find(c => c.id === choiceId);
      if (choice && !currentSelected.find(c => c.id === choiceId)) {
        updateWizardData({ selectedGlobalChoices: [...currentSelected, choice] });
      }
    } else {
      // Remove the choice from the array
      const newSelected = currentSelected.filter(c => c.id !== choiceId);
      updateWizardData({ selectedGlobalChoices: newSelected });
    }
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      // Update the local uploaded JSON file state (not the ERD file)
      setUploadedJsonFile(file);
      
      // Parse the JSON file and add to uploaded choices
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const content = e.target?.result as string;
          const jsonData = JSON.parse(content);
          
          // Handle different JSON structures
          let choicesArray = [];
          if (jsonData.globalChoices && Array.isArray(jsonData.globalChoices)) {
            // Standard format: { "globalChoices": [{ "name": "...", ... }] }
            choicesArray = jsonData.globalChoices;
          } else if (Array.isArray(jsonData)) {
            // Direct array format: [{ "name": "...", ... }]
            choicesArray = jsonData;
          } else {
            // Legacy object format: { "choiceName": { "displayName": "...", ... } }
            choicesArray = Object.entries(jsonData).map(([key, value]: [string, any]) => ({
              name: key,
              displayName: value.displayName || key,
              options: value.options || []
            }));
          }
          
          // Convert to GlobalChoice format
          const uploadedChoices = choicesArray.map((choice: any, index: number) => ({
            id: choice.name || choice.id || `choice_${index}`,
            name: choice.name || choice.id || `choice_${index}`,
            displayName: choice.displayName || choice.name || `Choice ${index + 1}`,
            description: choice.description || '',
            options: choice.options || []
          }));
          
          updateWizardData({ uploadedGlobalChoices: uploadedChoices });
        } catch (error) {
          console.error('Error parsing JSON file:', error);
        }
      };
      reader.readAsText(file);
    }
  };

  // Global choices are optional - user can proceed without selecting any
  const isValid = true;

  const searchTerm = globalChoicesSearchTerm || '';
  
  const filteredBuiltInChoices = builtInChoices.filter(choice =>
    (choice.name?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
    (choice.displayName?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
    (choice.logicalName?.toLowerCase() || '').includes(searchTerm.toLowerCase())
  );

  const filteredCustomChoices = customChoices.filter(choice =>
    (choice.name?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
    (choice.displayName?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
    (choice.logicalName?.toLowerCase() || '').includes(searchTerm.toLowerCase())
  );

  return (
    <Card style={{ boxShadow: tokens.shadow4 }}>
      <CardHeader
        header={
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <SettingsRegular style={{ fontSize: '20px', color: tokens.colorBrandBackground }} />
            <Text className={styles.headerText} weight="bold">Global Choice Management</Text>
          </div>
        }
        description={
          <Text size={300} style={{ color: tokens.colorNeutralForeground2 }}>
            Add existing global choice sets or create new ones for your entities.
          </Text>
        }
      />

      <div className={styles.cardContent}>
        <Accordion
          multiple
          defaultOpenItems={['global-choice-sets', 'upload-choices']}
          className={styles.accordion}
        >
          <AccordionItem value="global-choice-sets">
            <AccordionHeader expandIconPosition="start">
              <Text className={styles.accordionHeaderText}>
                Built-in Choices
              </Text>
            </AccordionHeader>
            <AccordionPanel>
              <Text size={300} style={{ color: '#6b6b6b', marginBottom: '24px' }}>
                Select existing built-in choice sets from your environment.
              </Text>

              <Field label={<Text weight="semibold">Search</Text>}>
                <Input
                  placeholder="Search by name, logical name, or prefix..."
                  value={searchTerm}
                  onChange={(_, data) => updateWizardData({ globalChoicesSearchTerm: data.value })}
                  style={{ width: '100%', marginBottom: '24px' }}
                />
              </Field>

              {loading && (
                <div className={styles.loadingContainer}>
                  <Spinner size="medium" />
                  <Text>Loading global choices...</Text>
                </div>
              )}

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

              {!loading && !error && (
                <div>
                  {/* Built-in Global Choices - Direct display without nested accordion */}
                  <Text className={styles.accordionHeaderText} style={{ marginBottom: '12px', display: 'block' }}>
                    Built-in Global Choices ({filteredBuiltInChoices.length})
                  </Text>
                  
                  <div className={styles.choicesList}>
                    {filteredBuiltInChoices.slice(0, 20).map((choice) => (
                      <div key={choice.id} className={styles.choiceItem}>
                        <Checkbox
                          checked={selectedGlobalChoices?.some(c => c.id === choice.id) || false}
                          onChange={(_, data) => handleChoiceSelect(choice.id, data.checked === true)}
                          label={
                            <div>
                              <Text size={300} weight="medium">{choice.displayName}</Text>
                              <Text size={200} style={{ color: '#6b6b6b', display: 'block' }}>
                                {choice.logicalName}
                              </Text>
                            </div>
                          }
                        />
                      </div>
                    ))}
                    {filteredBuiltInChoices.length > 20 && (
                      <Text size={200} style={{ color: '#6b6b6b', fontStyle: 'italic', padding: '8px' }}>
                        ... and {filteredBuiltInChoices.length - 20} more. Use search to find specific choices.
                      </Text>
                    )}
                  </div>

                  {/* Custom Global Choices - Display if any exist */}
                  {filteredCustomChoices.length > 0 && (
                    <div style={{ marginTop: '24px' }}>
                      <Text className={styles.accordionHeaderText} style={{ marginBottom: '12px', display: 'block' }}>
                        Custom Global Choices ({filteredCustomChoices.length})
                      </Text>
                      
                      <div className={styles.choicesList}>
                        {filteredCustomChoices.map((choice) => (
                          <div key={choice.id} className={styles.choiceItem}>
                            <Checkbox
                              checked={selectedGlobalChoices?.some(c => c.id === choice.id) || false}
                              onChange={(_, data) => handleChoiceSelect(choice.id, data.checked === true)}
                              label={
                                <div>
                                  <Text size={300} weight="medium">{choice.displayName}</Text>
                                  <Text size={200} style={{ color: '#6b6b6b', display: 'block' }}>
                                    {choice.logicalName}
                                  </Text>
                                </div>
                              }
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </AccordionPanel>
          </AccordionItem>

          <AccordionItem value="upload-choices">
            <AccordionHeader expandIconPosition="start">
              <Text className={styles.accordionHeaderText}>
                Upload Custom Choices
              </Text>
            </AccordionHeader>
            <AccordionPanel>
              <div className={styles.fileUpload}>
                <Text size={300} className={styles.uploadDescription}>
                  Upload a JSON file containing custom global choice definitions.
                </Text>
                
                <input
                  type="file"
                  accept=".json"
                  onChange={handleFileUpload}
                  style={{ display: 'none' }}
                  id="global-choices-upload"
                />
                <Button
                  appearance="primary"
                  onClick={() => document.getElementById('global-choices-upload')?.click()}
                  className={styles.fileUploadButton}
                >
                  Choose File
                </Button>
                
                {uploadedJsonFile && (
                  <>
                    <MessageBar intent="success" style={{ marginTop: '16px' }}>
                      <MessageBarBody>
                        <strong>File uploaded successfully!</strong> {uploadedJsonFile.name} ({(uploadedJsonFile.size / 1024).toFixed(1)} KB)
                      </MessageBarBody>
                    </MessageBar>
                    
                    {/* Display uploaded choices */}
                    {uploadedGlobalChoices && uploadedGlobalChoices.length > 0 && (
                      <div style={{ marginTop: '16px' }}>
                        <Text weight="semibold" style={{ marginBottom: '8px', display: 'block' }}>
                          Uploaded Global Choices ({uploadedGlobalChoices.length}):
                        </Text>
                        <div style={{ 
                          maxHeight: '200px', 
                          overflowY: 'auto', 
                          border: '1px solid var(--colorNeutralStroke2)', 
                          borderRadius: '4px',
                          padding: '12px',
                          backgroundColor: 'var(--colorNeutralBackground1)'
                        }}>
                          {uploadedGlobalChoices.map((choice, index) => (
                            <div key={index} style={{ 
                              marginBottom: '8px', 
                              paddingBottom: '8px',
                              borderBottom: index < uploadedGlobalChoices.length - 1 ? '1px solid var(--colorNeutralStroke3)' : 'none'
                            }}>
                              <Text weight="semibold" style={{ display: 'block', color: 'var(--colorNeutralForeground1)' }}>
                                {choice.displayName || choice.name}
                              </Text>
                              {choice.options && choice.options.length > 0 && (
                                <Text size={200} style={{ color: 'var(--colorNeutralForeground2)', marginTop: '4px', display: 'block' }}>
                                  Options: {choice.options.map(opt => opt.label || opt.value).join(', ')}
                                </Text>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                )}
                
                {!uploadedJsonFile && (
                  <Text size={200} style={{ color: '#6b6b6b', marginTop: '8px' }}>
                    No file selected
                  </Text>
                )}
              </div>
            </AccordionPanel>
          </AccordionItem>
        </Accordion>

        <div className={styles.navigationButtons}>
          <Button 
            appearance="secondary"
            onClick={onPrevious}
            className={styles.previousButton}
          >
            Previous
          </Button>
          <Button 
            appearance="primary"
            onClick={onNext}
            disabled={!isValid}
            className={styles.nextButton}
          >
            Next: Deployment Summary
          </Button>
        </div>
      </div>
    </Card>
  );
};
