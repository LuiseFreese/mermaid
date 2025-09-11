import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Text,
  Accordion,
  AccordionHeader,
  AccordionPane      <div className={styles.cardContent}>
        <Text className={fileUploadStyles.schemaOverviewDescription}>
          Review your deployment configuration. This summary shows what will be created in your Dataverse environment.
        </Text>,
  Card,
  CardHeader,
  Button,
  Spinner,
  tokens
} from '@fluentui/react-components';
import { useWizardContext } from '../../../context/WizardContext';
import { ApiService } from '../../../services/apiService';
import styles from './DeploymentStep.module.css';
import fileUploadStyles from './FileUploadStep.module.css';

interface DeploymentStepProps {
  onPrevious?: () => void;
  onNext?: () => void;
}

export const DeploymentStep: React.FC<DeploymentStepProps> = ({ 
  onNext, 
  onPrevious 
}) => {
  const { wizardData, resetWizard } = useWizardContext();
  const navigate = useNavigate();
  const [isDeploying, setIsDeploying] = useState(false);
  const [deploymentProgress, setDeploymentProgress] = useState<string>('');
  const [deploymentResult, setDeploymentResult] = useState<any>(null);
  const [deploymentError, setDeploymentError] = useState<string>('');
  const [deploymentSuccess, setDeploymentSuccess] = useState<boolean>(false);
  
  const handleBackToStart = () => {
    // Reset wizard data and navigate back to start
    resetWizard();
    navigate('/wizard');
  };
  
  const handleDeploy = async () => {
    console.log('Deploying with data:', wizardData);
    
    setIsDeploying(true);
    setDeploymentProgress('Preparing deployment...');
    setDeploymentResult(null);
    setDeploymentError('');
    setDeploymentSuccess(false);

    try {
      // Prepare deployment data based on wizardData structure
      const deploymentData = {
        mermaidContent: wizardData.originalErdContent || '',
        // Use existing solution name when adding to existing solution
        solutionName: wizardData.solutionType === 'existing' && wizardData.selectedSolution 
          ? wizardData.selectedSolution.uniquename 
          : (wizardData.solutionInternalName || wizardData.solutionName || 'MermaidSolution'),
        solutionDisplayName: wizardData.solutionType === 'existing' && wizardData.selectedSolution
          ? wizardData.selectedSolution.friendlyname
          : (wizardData.solutionName || 'Mermaid Solution'),
        // Publisher information - for existing solutions, use selected solution's publisher
        useExistingSolution: wizardData.solutionType === 'existing',
        selectedSolutionId: wizardData.selectedSolution?.solutionid,
        selectedPublisher: wizardData.selectedPublisher ? {
          id: wizardData.selectedPublisher.id,
          uniqueName: wizardData.selectedPublisher.uniqueName,
          displayName: wizardData.selectedPublisher.displayName,
          prefix: wizardData.selectedPublisher.prefix
        } : null,
        // For new publishers
        createNewPublisher: wizardData.publisherType === 'new',
        publisherName: wizardData.newPublisherName || wizardData.selectedPublisher?.displayName || 'Mermaid Publisher',
        publisherUniqueName: wizardData.newPublisherInternalName || wizardData.selectedPublisher?.uniqueName,
        publisherPrefix: wizardData.newPublisherPrefix || wizardData.selectedPublisher?.prefix || 'mmd',
        cdmChoice: wizardData.entityChoice,
        cdmMatches: wizardData.detectedEntities || [],
        selectedChoices: wizardData.selectedGlobalChoices || [],
        customChoices: wizardData.uploadedGlobalChoices || [],
        includeRelatedEntities: wizardData.includeRelatedTables || false,
        entities: wizardData.parsedEntities || [],
        relationships: wizardData.parsedRelationships || []
      };

      console.log('Sending deployment request with data:', deploymentData);

      const result = await ApiService.deploySolution(
        deploymentData,
        (message, details) => {
          console.log('Deployment progress:', message, details);
          setDeploymentProgress(message);
        }
      );

      console.log('Deployment result:', result);
      console.log('🔍 DEBUG: Deployment result structure:', JSON.stringify(result, null, 2));
      console.log('🔍 DEBUG: entitiesCreated:', result?.entitiesCreated);
      console.log('🔍 DEBUG: cdmEntitiesIntegrated:', result?.cdmEntitiesIntegrated);
      console.log('🔍 DEBUG: relationshipsCreated:', result?.relationshipsCreated);
      console.log('🔍 DEBUG: globalChoicesAdded:', result?.globalChoicesAdded);
      setDeploymentResult(result);
      
      if (result.success) {
        setDeploymentProgress('Deployment completed successfully!');
        setDeploymentSuccess(true);
        // Optionally navigate to next step after successful deployment
        setTimeout(() => {
          if (onNext) onNext();
        }, 2000);
      } else {
        setDeploymentError(result.error || 'Deployment failed');
        setDeploymentProgress('Deployment failed');
      }
    } catch (error) {
      console.error('Deployment error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      setDeploymentError(errorMessage);
      setDeploymentProgress('Deployment failed');
    } finally {
      setIsDeploying(false);
    }
  };

  // Get entities from the parsed mermaid data - filter to show only custom entities
  // CDM entities are shown separately in the CDM Integration section
  const allEntities = wizardData.parsedEntities || [];
  const entities = allEntities.filter(entity => !entity.isCdm);
  const cdmEntities = allEntities.filter(entity => entity.isCdm);
  
  // Get relationships from the parsed mermaid data
  const relationships = wizardData.parsedRelationships || [];

  // Get selected global choices
  const selectedGlobalChoices = wizardData.selectedGlobalChoices || [];
  const uploadedChoices = wizardData.uploadedGlobalChoices || [];
  const allGlobalChoices = [...selectedGlobalChoices, ...uploadedChoices];

  return (
    <Card>
      <CardHeader
        header={
          <Text className={styles.headerText}>
            Deployment Summary & Options
          </Text>
        }
      />
      
      <div className={styles.cardContent}>
        {/* TEMPORARY TEST BUTTON - Remove after UI testing */}
        <div style={{ marginBottom: '16px', padding: '8px', backgroundColor: '#fff3cd', border: '1px solid #ffeaa7', borderRadius: '4px' }}>
          <Button 
            appearance="secondary" 
            onClick={handleTestUI}
            disabled={isDeploying}
            size="small"
          >
            🧪 Test Deployment UI
          </Button>
          <Text size={200} style={{ marginLeft: '8px', color: '#856404' }}>
            Click to test the deployment progress UI without actually deploying
          </Text>
        </div>

        <Text className={fileUploadStyles.schemaOverviewDescription}>
          Review your deployment configuration. This summary shows what will be created in your Dataverse environment.
        </Text>

        <Accordion multiple collapsible defaultOpenItems={['solution', 'publisher', 'entities', 'relationships', 'cdm', 'choices']} className={fileUploadStyles.schemaAccordion}>
          
          {/* Solution Section */}
          <AccordionItem value="solution">
            <AccordionHeader>
              <Text className={fileUploadStyles.accordionHeaderText}>Solution</Text>
            </AccordionHeader>
            <AccordionPanel>
              <div className={fileUploadStyles.accordionContent}>
                <div className={fileUploadStyles.entityCard}>
                  <div className={fileUploadStyles.entityHeader}>
                    <Text className={fileUploadStyles.entityName}>{wizardData.solutionName || 'My new Solution'}</Text>
                    <div className={fileUploadStyles.entityBadge}>
                      <span className={fileUploadStyles.customBadge}>SOLUTION</span>
                    </div>
                  </div>
                  <div className={fileUploadStyles.attributeList}>
                    <div className={fileUploadStyles.attribute}>
                      <span></span>
                      <span className={fileUploadStyles.attributeName}>Internal Name</span>
                      <span className={fileUploadStyles.attributeType}>{wizardData.solutionInternalName || 'MynewSolution'}</span>
                    </div>
                  </div>
                </div>
              </div>
            </AccordionPanel>
          </AccordionItem>

          {/* Publisher Section */}
          <AccordionItem value="publisher">
            <AccordionHeader>
              <Text className={fileUploadStyles.accordionHeaderText}>Publisher</Text>
            </AccordionHeader>
            <AccordionPanel>
              <div className={fileUploadStyles.accordionContent}>
                <div className={fileUploadStyles.entityCard}>
                  <div className={fileUploadStyles.entityHeader}>
                    <Text className={fileUploadStyles.entityName}>{wizardData.selectedPublisher?.displayName || wizardData.newPublisherName || 'No publisher selected'}</Text>
                    <div className={fileUploadStyles.entityBadge}>
                      <span className={wizardData.selectedPublisher ? fileUploadStyles.cdmBadge : fileUploadStyles.customBadge}>
                        {wizardData.selectedPublisher ? 'EXISTING' : 'NEW'}
                      </span>
                    </div>
                  </div>
                  {wizardData.newPublisherName && (
                    <div className={fileUploadStyles.attributeList}>
                      <div className={fileUploadStyles.attribute}>
                        <span></span>
                        <span className={fileUploadStyles.attributeName}>Internal Name</span>
                        <span className={fileUploadStyles.attributeType}>{wizardData.newPublisherInternalName}</span>
                      </div>
                      <div className={fileUploadStyles.attribute}>
                        <span></span>
                        <span className={fileUploadStyles.attributeName}>Prefix</span>
                        <span className={fileUploadStyles.attributeType}>{wizardData.newPublisherPrefix}</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </AccordionPanel>
          </AccordionItem>

          {/* Entities Section - Custom entities only */}
          <AccordionItem value="entities">
            <AccordionHeader>
              <Text className={fileUploadStyles.accordionHeaderText}>Custom Entities ({entities.length})</Text>
            </AccordionHeader>
            <AccordionPanel>
              <div className={fileUploadStyles.accordionContent}>
                {entities.length > 0 ? (
                  entities.map((entity, index) => (
                    <div key={index} className={fileUploadStyles.entityCard}>
                      <div className={fileUploadStyles.entityHeader}>
                        <Text className={fileUploadStyles.entityName}>{entity.name || entity}</Text>
                        <div className={fileUploadStyles.entityBadge}>
                          <span className={entity.isCdm ? fileUploadStyles.cdmBadge : fileUploadStyles.customBadge}>
                            {entity.isCdm ? 'CDM' : 'CUSTOM'}
                          </span>
                          {entity.attributes && (
                            <span className={fileUploadStyles.attributeCount}>({entity.attributes.length} attributes)</span>
                          )}
                        </div>
                      </div>
                      {entity.attributes && entity.attributes.length > 0 && (
                        <div className={fileUploadStyles.attributeList}>
                          {entity.attributes.map((attr, attrIndex) => (
                            <div key={attrIndex} className={fileUploadStyles.attribute}>
                              {typeof attr === 'object' && attr.constraint ? (
                                <span className={fileUploadStyles.attributeLabel}>{attr.constraint}</span>
                              ) : (
                                <span></span>
                              )}
                              <span className={fileUploadStyles.attributeName}>
                                {typeof attr === 'string' ? attr : attr.name}
                              </span>
                              <span className={fileUploadStyles.attributeType}>
                                {typeof attr === 'string' ? 'string' : attr.type}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))
                ) : (
                  <div className={fileUploadStyles.entityCard}>
                    <Text style={{ color: tokens.colorNeutralForeground3 }}>
                      No entities detected in the uploaded file
                    </Text>
                  </div>
                )}
              </div>
            </AccordionPanel>
          </AccordionItem>

          {/* Relationships Section */}
          <AccordionItem value="relationships">
            <AccordionHeader>
              <Text className={fileUploadStyles.accordionHeaderText}>Relationships ({relationships.length})</Text>
            </AccordionHeader>
            <AccordionPanel>
              <div className={fileUploadStyles.accordionContent}>
                {relationships.length > 0 ? (
                  relationships.map((relationship, index) => (
                    <div key={index} className={fileUploadStyles.entityCard}>
                      <div className={fileUploadStyles.relationshipContent}>
                        <Text className={fileUploadStyles.relationshipTitle}>
                          {relationship.from} → {relationship.to}
                        </Text>
                        <Text className={fileUploadStyles.relationshipDetails}>
                          {relationship.type} {relationship.label && `${relationship.label}`}
                        </Text>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className={fileUploadStyles.entityCard}>
                    <Text style={{ color: tokens.colorNeutralForeground3 }}>
                      No relationships detected in the uploaded file
                    </Text>
                  </div>
                )}
              </div>
            </AccordionPanel>
          </AccordionItem>

          {/* CDM Integration Section */}
          <AccordionItem value="cdm">
            <AccordionHeader>
              <Text className={fileUploadStyles.accordionHeaderText}>
                CDM Integration ({cdmEntities.length} entities)
              </Text>
            </AccordionHeader>
            <AccordionPanel>
              <div className={fileUploadStyles.accordionContent}>
                <div className={fileUploadStyles.entityCard}>
                  {cdmEntities.length > 0 ? (
                    <>
                      <div className={fileUploadStyles.entityHeader}>
                        <Text className={fileUploadStyles.entityName}>Using existing CDM entities</Text>
                        <div className={fileUploadStyles.entityBadge}>
                          <span className={fileUploadStyles.cdmBadge}>CDM</span>
                          <span className={fileUploadStyles.attributeCount}>({cdmEntities.length} entities)</span>
                        </div>
                      </div>
                      <div className={fileUploadStyles.attributeList}>
                        {cdmEntities.map((entity, index) => (
                          <div key={index} className={fileUploadStyles.attribute}>
                            <span></span>
                            <span className={fileUploadStyles.attributeName}>{entity.name}</span>
                            <span className={fileUploadStyles.attributeType}>Standard</span>
                          </div>
                        ))}
                      </div>
                    </>
                  ) : wizardData.entityChoice === 'custom' ? (
                    <div className={fileUploadStyles.entityDescription}>
                      <Text className={fileUploadStyles.cdmDescription}>All entities will be created as custom entities</Text>
                    </div>
                  ) : !wizardData.cdmDetected ? (
                    <div className={fileUploadStyles.entityDescription}>
                      <Text style={{ color: tokens.colorNeutralForeground3 }}>
                        No CDM entities detected in your ERD
                      </Text>
                    </div>
                  ) : (
                    <div className={fileUploadStyles.entityDescription}>
                      <Text style={{ color: tokens.colorNeutralForeground3 }}>
                        CDM entities detected but no integration choice selected
                      </Text>
                    </div>
                  )}
                </div>
              </div>
            </AccordionPanel>
          </AccordionItem>

          {/* Global Choices Section */}
          <AccordionItem value="choices">
            <AccordionHeader>
              <Text className={fileUploadStyles.accordionHeaderText}>Global Choices ({allGlobalChoices.length})</Text>
            </AccordionHeader>
            <AccordionPanel>
              <div className={fileUploadStyles.accordionContent}>
                {allGlobalChoices.length > 0 ? (
                  <>
                    {selectedGlobalChoices.length > 0 && (
                      <div className={fileUploadStyles.entityCard}>
                        <div className={fileUploadStyles.entityHeader}>
                          <Text className={fileUploadStyles.entityName}>Selected from Dataverse</Text>
                          <div className={fileUploadStyles.entityBadge}>
                            <span className={fileUploadStyles.cdmBadge}>EXISTING</span>
                            <span className={fileUploadStyles.attributeCount}>({selectedGlobalChoices.length} choices)</span>
                          </div>
                        </div>
                        <div className={fileUploadStyles.attributeList}>
                          {selectedGlobalChoices.map((choice, index) => (
                            <div key={`selected-${index}`} className={fileUploadStyles.attribute}>
                              <span></span>
                              <span className={fileUploadStyles.attributeName}>{choice.displayName || choice.name}</span>
                              <span className={fileUploadStyles.attributeType}>
                                {choice.options && choice.options.length > 0 ? `${choice.options.length} options` : 'Choice'}
                              </span>
                            </div>
                          ))}
                          {/* Show options details for selected choices */}
                          {selectedGlobalChoices.some(choice => choice.options && choice.options.length > 0) && (
                            <div style={{ marginTop: '8px', paddingTop: '8px', borderTop: '1px solid var(--colorNeutralStroke3)' }}>
                              {selectedGlobalChoices.filter(choice => choice.options && choice.options.length > 0).map((choice, index) => (
                                <div key={`options-${index}`} style={{ marginBottom: '8px' }}>
                                  <Text size={200} weight="semibold" style={{ color: 'var(--colorBrandBackground)', display: 'block' }}>
                                    {choice.displayName || choice.name}:
                                  </Text>
                                  <Text size={200} style={{ color: 'var(--colorNeutralForeground2)', marginLeft: '12px', display: 'block' }}>
                                    {choice.options?.map(opt => opt.label || opt.value).join(', ')}
                                  </Text>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                    {uploadedChoices.length > 0 && (
                      <div className={fileUploadStyles.entityCard}>
                        <div className={fileUploadStyles.entityHeader}>
                          <Text className={fileUploadStyles.entityName}>Uploaded from JSON</Text>
                          <div className={fileUploadStyles.entityBadge}>
                            <span className={fileUploadStyles.customBadge}>NEW</span>
                            <span className={fileUploadStyles.attributeCount}>({uploadedChoices.length} choices)</span>
                          </div>
                        </div>
                        <div className={fileUploadStyles.attributeList}>
                          {uploadedChoices.map((choice, index) => (
                            <div key={`uploaded-${index}`} className={fileUploadStyles.attribute}>
                              <span></span>
                              <span className={fileUploadStyles.attributeName}>{choice.displayName || choice.name}</span>
                              <span className={fileUploadStyles.attributeType}>Choice</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  <div className={fileUploadStyles.entityCard}>
                    <Text style={{ color: tokens.colorNeutralForeground3 }}>
                      No global choices selected or uploaded
                    </Text>
                  </div>
                )}
              </div>
            </AccordionPanel>
          </AccordionItem>

        </Accordion>

        {/* Deployment Progress */}
        {isDeploying && (
          <div className={styles.deploymentProgress}>
            <div className={styles.deploymentProgressContent} style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px', marginLeft: '20px', paddingLeft: '8px' }}>
              <Spinner size="small" />
              <Text weight="semibold">Deploying to Dataverse...</Text>
            </div>
            {deploymentProgress && (
              <Text size={200} className={styles.deploymentProgressContent} style={{ color: tokens.colorNeutralForeground2, marginLeft: '20px', paddingLeft: '8px' }}>
                {deploymentProgress}
              </Text>
            )}
          </div>
        )}

        {/* Deployment Result */}
        {deploymentResult && !isDeploying && (
          <div className={styles.deploymentResult}>
            {deploymentResult.success ? (
              <div style={{ padding: '12px', backgroundColor: tokens.colorPaletteGreenBackground1, borderRadius: '4px', border: `1px solid ${tokens.colorPaletteGreenBorder1}` }}>
                <Text weight="semibold" style={{ color: tokens.colorPaletteGreenForeground1 }}>
                  Deployment Successful
                </Text>
                <div style={{ marginTop: '8px' }}>
                  {/* Show detailed deployment results */}
                  {deploymentResult.entitiesCreated > 0 && (
                    <Text size={200} style={{ color: tokens.colorPaletteGreenForeground2, display: 'block' }}>
                      {deploymentResult.entitiesCreated} custom entities created
                    </Text>
                  )}
                  {deploymentResult.relationshipsCreated > 0 && (
                    <Text size={200} style={{ color: tokens.colorPaletteGreenForeground2, display: 'block' }}>
                      {deploymentResult.relationshipsCreated} relationships created
                    </Text>
                  )}
                  {deploymentResult.globalChoicesAdded > 0 && (
                    <Text size={200} style={{ color: tokens.colorPaletteGreenForeground2, display: 'block' }}>
                      {deploymentResult.globalChoicesAdded} global choices 
                      {(deploymentResult.globalChoicesCreated > 0 || deploymentResult.globalChoicesExistingAdded > 0) && (
                        <span>
                          {' '}({[
                            deploymentResult.globalChoicesCreated > 0 && `${deploymentResult.globalChoicesCreated} created`,
                            deploymentResult.globalChoicesExistingAdded > 0 && `${deploymentResult.globalChoicesExistingAdded} existing added`
                          ].filter(Boolean).join(', ')})
                        </span>
                      )}
                    </Text>
                  )}
                  {/* Show fallback summary if no specific metrics are available */}
                  {(!deploymentResult.entitiesCreated || deploymentResult.entitiesCreated === 0) && 
                   (!deploymentResult.cdmEntitiesIntegrated || deploymentResult.cdmEntitiesIntegrated.length === 0) && 
                   (!deploymentResult.relationshipsCreated || deploymentResult.relationshipsCreated === 0) && 
                   (!deploymentResult.globalChoicesAdded || deploymentResult.globalChoicesAdded === 0) && (
                    <Text size={200} style={{ color: tokens.colorPaletteGreenForeground2, display: 'block' }}>
                      {deploymentResult.summary || deploymentResult.message || 'Deployment completed successfully'}
                    </Text>
                  )}
                </div>
              </div>
            ) : (
              <div style={{ padding: '12px', backgroundColor: tokens.colorPaletteRedBackground1, borderRadius: '4px', border: `1px solid ${tokens.colorPaletteRedBorder1}` }}>
                <Text weight="semibold" style={{ color: tokens.colorPaletteRedForeground1 }}>
                  Deployment Failed
                </Text>
                {deploymentResult.error && (
                  <Text size={200} style={{ color: tokens.colorPaletteRedForeground2, display: 'block', marginTop: '4px' }}>
                    {deploymentResult.error}
                  </Text>
                )}
              </div>
            )}
          </div>
        )}

        {/* Deployment Error */}
        {deploymentError && !isDeploying && (
          <div className={styles.deploymentError}>
            <div style={{ padding: '12px', backgroundColor: tokens.colorPaletteRedBackground1, borderRadius: '4px', border: `1px solid ${tokens.colorPaletteRedBorder1}` }}>
              <Text weight="semibold" style={{ color: tokens.colorPaletteRedForeground1 }}>
                Deployment Error
              </Text>
              <Text size={200} style={{ color: tokens.colorPaletteRedForeground2, display: 'block', marginTop: '4px' }}>
                {deploymentError}
              </Text>
            </div>
          </div>
        )}

        {/* Navigation Buttons */}
        <div className={styles.navigationButtons}>
          <Button 
            appearance="secondary" 
            onClick={onPrevious}
            className={styles.previousButton}
            disabled={isDeploying}
            style={{ display: deploymentSuccess ? 'none' : 'block' }}
          >
            Previous
          </Button>
          
          {deploymentSuccess ? (
            <Button 
              appearance="primary" 
              onClick={handleBackToStart}
              className={styles.deployButton}
            >
              Back to Start
            </Button>
          ) : (
            <Button 
              appearance="primary" 
              onClick={handleDeploy}
              className={styles.deployButton}
              disabled={isDeploying}
            >
              {isDeploying ? (
                <>
                  <Spinner size="tiny" style={{ marginRight: '8px' }} />
                  Deploying...
                </>
              ) : (
                'Deploy to Dataverse'
              )}
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
};
