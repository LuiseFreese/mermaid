/**
 * Configuration Summary Component
 * Displays deployment configuration in accordion format
 */

import React from 'react';
import {
  Text,
  Accordion,
  AccordionHeader,
  AccordionPanel,
  AccordionItem,
  tokens
} from '@fluentui/react-components';
import { useWizardContext } from '../../../../../context/WizardContext';
import { useConfigurationSummary } from '../hooks';
import type { ConfigurationSummaryProps } from '../types';
import fileUploadStyles from '../../FileUploadStep.module.css';

export const ConfigurationSummary: React.FC<ConfigurationSummaryProps> = ({ 
  className 
}) => {
  const { wizardData } = useWizardContext();
  const {
    entities,
    cdmEntities,
    relationships,
    selectedGlobalChoices,
    uploadedChoices,
    allGlobalChoices,
  } = useConfigurationSummary();

  return (
    <Accordion 
      multiple 
      collapsible 
      defaultOpenItems={['solution', 'publisher', 'entities', 'relationships', 'cdm', 'choices']} 
      className={`${fileUploadStyles.schemaAccordion} ${className || ''}`}
    >
      
      {/* Solution Section */}
      <AccordionItem value="solution">
        <AccordionHeader>
          <Text className={fileUploadStyles.accordionHeaderText}>Solution</Text>
        </AccordionHeader>
        <AccordionPanel>
          <div className={fileUploadStyles.accordionContent}>
            <div className={fileUploadStyles.entityCard}>
              <div className={fileUploadStyles.entityHeader}>
                <Text className={fileUploadStyles.entityName}>
                  {wizardData.solutionName || 'My new Solution'}
                </Text>
                <div className={fileUploadStyles.entityBadge}>
                  <span className={fileUploadStyles.customBadge}>SOLUTION</span>
                </div>
              </div>
              <div className={fileUploadStyles.attributeList}>
                <div className={fileUploadStyles.attribute}>
                  <span></span>
                  <span className={fileUploadStyles.attributeName}>Internal Name</span>
                  <span className={fileUploadStyles.attributeType}>
                    {wizardData.solutionInternalName || 'MynewSolution'}
                  </span>
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
                <Text className={fileUploadStyles.entityName}>
                  {wizardData.selectedPublisher?.displayName || 
                   wizardData.newPublisherName || 
                   'No publisher selected'}
                </Text>
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
                    <span className={fileUploadStyles.attributeType}>
                      {wizardData.newPublisherInternalName}
                    </span>
                  </div>
                  <div className={fileUploadStyles.attribute}>
                    <span></span>
                    <span className={fileUploadStyles.attributeName}>Prefix</span>
                    <span className={fileUploadStyles.attributeType}>
                      {wizardData.newPublisherPrefix}
                    </span>
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
          <Text className={fileUploadStyles.accordionHeaderText}>
            Custom Entities ({entities.length})
          </Text>
        </AccordionHeader>
        <AccordionPanel>
          <div className={fileUploadStyles.accordionContent}>
            {entities.length > 0 ? (
              entities.map((entity, index) => (
                <div key={index} className={fileUploadStyles.entityCard}>
                  <div className={fileUploadStyles.entityHeader}>
                    <Text className={fileUploadStyles.entityName}>
                      {entity.name || entity}
                    </Text>
                    <div className={fileUploadStyles.entityBadge}>
                      <span className={entity.isCdm ? fileUploadStyles.cdmBadge : fileUploadStyles.customBadge}>
                        {entity.isCdm ? 'CDM' : 'CUSTOM'}
                      </span>
                      {entity.attributes && (
                        <span className={fileUploadStyles.attributeCount}>
                          ({entity.attributes.length} attributes)
                        </span>
                      )}
                    </div>
                  </div>
                  {entity.attributes && entity.attributes.length > 0 && (
                    <div className={fileUploadStyles.attributeList}>
                      {entity.attributes.map((attr, attrIndex) => (
                        <div key={attrIndex} className={fileUploadStyles.attribute}>
                          {typeof attr === 'object' && attr.constraint ? (
                            <span className={fileUploadStyles.attributeLabel}>
                              {attr.constraint}
                            </span>
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
          <Text className={fileUploadStyles.accordionHeaderText}>
            Relationships ({relationships.length})
          </Text>
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
                      <span className={fileUploadStyles.attributeCount}>
                        ({cdmEntities.length} entities)
                      </span>
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
                  <Text className={fileUploadStyles.cdmDescription}>
                    All entities will be created as custom entities
                  </Text>
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
          <Text className={fileUploadStyles.accordionHeaderText}>
            Global Choices ({allGlobalChoices.length})
          </Text>
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
                        <span className={fileUploadStyles.attributeCount}>
                          ({selectedGlobalChoices.length} choices)
                        </span>
                      </div>
                    </div>
                    <div className={fileUploadStyles.attributeList}>
                      {selectedGlobalChoices.map((choice, index) => (
                        <div key={`selected-${index}`} className={fileUploadStyles.attribute}>
                          <span></span>
                          <span className={fileUploadStyles.attributeName}>
                            {choice.displayName || choice.name}
                          </span>
                          <span className={fileUploadStyles.attributeType}>
                            {choice.options && choice.options.length > 0 
                              ? `${choice.options.length} options` 
                              : 'Choice'}
                          </span>
                        </div>
                      ))}
                      {/* Show options details for selected choices */}
                      {selectedGlobalChoices.some(choice => choice.options && choice.options.length > 0) && (
                        <div style={{ 
                          marginTop: '8px', 
                          paddingTop: '8px', 
                          borderTop: '1px solid var(--colorNeutralStroke3)' 
                        }}>
                          {selectedGlobalChoices
                            .filter(choice => choice.options && choice.options.length > 0)
                            .map((choice, index) => (
                              <div key={`options-${index}`} style={{ marginBottom: '8px' }}>
                                <Text 
                                  size={200} 
                                  weight="semibold" 
                                  style={{ 
                                    color: 'var(--colorBrandBackground)', 
                                    display: 'block' 
                                  }}
                                >
                                  {choice.displayName || choice.name}:
                                </Text>
                                <Text 
                                  size={200} 
                                  style={{ 
                                    color: 'var(--colorNeutralForeground2)', 
                                    marginLeft: '12px', 
                                    display: 'block' 
                                  }}
                                >
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
                        <span className={fileUploadStyles.attributeCount}>
                          ({uploadedChoices.length} choices)
                        </span>
                      </div>
                    </div>
                    <div className={fileUploadStyles.attributeList}>
                      {uploadedChoices.map((choice, index) => (
                        <div key={`uploaded-${index}`} className={fileUploadStyles.attribute}>
                          <span></span>
                          <span className={fileUploadStyles.attributeName}>
                            {choice.displayName || choice.name}
                          </span>
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
  );
};
