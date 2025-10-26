import React from 'react';
import {
  MessageBar,
  MessageBarBody,
  Text,
  Button,
  tokens,
  Accordion,
  AccordionItem,
  AccordionHeader,
  AccordionPanel,
} from '@fluentui/react-components';
import { ValidationWarning } from '../../../../../../../shared/types';
import styles from '../../FileUploadStep.module.css';

interface ValidationResultsProps {
  warnings: ValidationWarning[];
  entityChoice: 'cdm' | 'custom' | null;
  fixedIssues: Set<string>;
  correctedErdContent: string;
  hasAnyIssues: boolean;
  hasChoiceIssues: boolean;
  hasNamingIssues: boolean;
  namingConflicts: string[];
  validationError: string | null;
  onFixWarning: (warning: ValidationWarning) => void;
  onApplyAllFixes: () => void;
  onApplyChoiceColumnFix: () => void;
  onApplyNamingConflictFix: (entityName: string) => void;
}

export const ValidationResults: React.FC<ValidationResultsProps> = ({
  warnings,
  entityChoice,
  fixedIssues,
  correctedErdContent,
  hasAnyIssues,
  hasChoiceIssues,
  hasNamingIssues,
  namingConflicts,
  validationError,
  onFixWarning,
  onApplyAllFixes,
  onApplyChoiceColumnFix,
  onApplyNamingConflictFix,
}) => {
  // Filter out CDM warnings if user chose CDM entities
  const filterCDMWarnings = (warning: ValidationWarning) => {
    if (entityChoice === 'cdm' && 
        (warning.category === 'cdm' || warning.type === 'cdm_entity_detected' || warning.type === 'cdm_summary')) {
      return false;
    }
    return true;
  };

  // Filter out warnings for CDM entities (Account, Contact)
  const filterCDMEntityWarnings = (warning: ValidationWarning) => {
    const cdmEntities = ['Account', 'Contact'];
    
    if (warning.entity && cdmEntities.includes(warning.entity)) {
      return false;
    }
    
    // For FK warnings, also check the relationship field
    if (warning.relationship) {
      const relationshipMatch = warning.relationship.match(/(\w+)\s*→\s*(\w+)/);
      if (relationshipMatch) {
        const [, fromEntity, toEntity] = relationshipMatch;
        if (cdmEntities.includes(fromEntity) || cdmEntities.includes(toEntity)) {
          return false;
        }
      }
    }
    
    return true;
  };

  // Check if a warning has been fixed
  const isWarningFixed = (warning: ValidationWarning): boolean => {
    if (warning.type === 'missing_primary_key') {
      const entityMatch = warning.message.match(/Entity '(\w+)'/);
      if (entityMatch) {
        const warningId = `missing_primary_key_${entityMatch[1]}`;
        return fixedIssues.has(warningId);
      }
    } else if (warning.type === 'missing_foreign_key') {
      const entityMatch = warning.message.match(/no foreign key found in '(\w+)'/) || 
                          warning.message.match(/Relationship defined but no foreign key found in '(\w+)'/);
      const relationshipMatch = warning.relationship?.match(/(\w+)\s*→\s*(\w+)/);
      if (entityMatch && relationshipMatch) {
        const warningId = `missing_foreign_key_${entityMatch[1]}_${relationshipMatch[1]}`;
        return fixedIssues.has(warningId);
      }
    } else if (warning.type === 'foreign_key_naming') {
      const relationshipMatch = warning.relationship?.match(/(\w+)\s*→\s*(\w+)/);
      if (relationshipMatch) {
        const warningId = `foreign_key_naming_${relationshipMatch[2]}_${relationshipMatch[1]}`;
        return fixedIssues.has(warningId);
      }
    } else if (warning.type === 'naming_conflict') {
      const entityName = warning.entity || warning.message.match(/Entity '(\w+)'/)?.[1];
      if (entityName) {
        // Check if there's actually a literal 'name' column (not event_name, location_name, etc.)
        const entityRegex = new RegExp(`${entityName}\\s*\\{[\\s\\S]*?\\}`, 'g');
        const entityMatch = correctedErdContent.match(entityRegex);
        if (entityMatch && entityMatch[0]) {
          const hasLiteralNameColumn = /\bstring\s+name\s+/i.test(entityMatch[0]);
          if (!hasLiteralNameColumn) {
            return true; // Consider it "fixed" if no literal name column exists
          }
        }
        
        const warningId = `naming_conflict_${entityName}`;
        return fixedIssues.has(warningId);
      }
    } else if (warning.type === 'multiple_primary_keys') {
      const entityMatch = warning.message.match(/Entity '(\w+)'/);
      if (entityMatch) {
        const warningId = `multiple_primary_keys_${entityMatch[1]}`;
        return fixedIssues.has(warningId);
      }
    } else if (warning.type === 'duplicate_columns') {
      const entityName = warning.entity;
      if (entityName) {
        const warningId = `duplicate_columns_${entityName}`;
        return fixedIssues.has(warningId);
      }
    }
    
    return fixedIssues.has(warning.id);
  };

  // Auto-corrected warnings (info style)
  const autoCorrectedWarnings = warnings
    .filter(w => filterCDMWarnings(w) && w.autoFixed);

  // Fixable warnings with cards
  const fixableWarnings = warnings
    .filter(w => 
      filterCDMWarnings(w) && 
      filterCDMEntityWarnings(w) && 
      !w.autoFixed && 
      w.autoFixable === true && 
      !isWarningFixed(w)
    );

  // Non-fixable warnings
  const nonFixableWarnings = warnings
    .filter(w => 
      filterCDMWarnings(w) && 
      filterCDMEntityWarnings(w) && 
      !w.autoFixed && 
      w.type !== 'missing_primary_key' && 
      w.type !== 'missing_foreign_key' && 
      w.type !== 'foreign_key_naming' && 
      w.type !== 'naming_conflict' && 
      w.type !== 'multiple_primary_keys' && 
      w.type !== 'duplicate_columns'
    );

  const getEntityName = (warning: ValidationWarning): string => {
    if (warning.entity) {
      return warning.entity;
    } else if (warning.type === 'foreign_key_naming') {
      const relationshipMatch = warning.relationship?.match(/(\w+)\s*→\s*(\w+)/);
      return relationshipMatch ? relationshipMatch[2] : 'Entity';
    } else {
      const entityMatch = warning.message.match(/Entity '(\w+)'/) || 
                        warning.message.match(/entity '(\w+)'/) ||
                        warning.message.match(/no foreign key found in '(\w+)'/) || 
                        warning.message.match(/Relationship defined but no foreign key found in '(\w+)'/) ||
                        warning.message.match(/in entity (\w+)/) ||
                        warning.message.match(/(\w+) entity/) ||
                        warning.message.match(/for (\w+):/) ||
                        warning.message.match(/(\w+) has/);
      return entityMatch ? entityMatch[1] : 'Entity';
    }
  };

  const getFixTitle = (warning: ValidationWarning): string => {
    const entityName = getEntityName(warning);
    
    switch (warning.type) {
      case 'missing_primary_key':
        return `Fix missing primary key in ${entityName}`;
      case 'missing_foreign_key':
        return `Fix missing foreign key in ${entityName}`;
      case 'foreign_key_naming':
        return `Fix foreign key naming in ${entityName}`;
      case 'naming_conflict':
        return `Fix naming conflict in ${entityName}`;
      case 'multiple_primary_keys':
        return `Fix multiple primary keys in ${entityName}`;
      case 'duplicate_columns':
        return `Fix duplicate columns in ${entityName}`;
      default:
        return `Fix issue in ${entityName}`;
    }
  };

  const getOriginalCode = (warning: ValidationWarning, entityName: string): React.ReactNode => {
    if (warning.type === 'missing_primary_key') {
      return (
        <>
          {entityName} {`{`}<br />
          &nbsp;&nbsp;string existing_field<br />
          &nbsp;&nbsp;<span className={styles.highlightError}>// no primary key</span><br />
          &nbsp;&nbsp;...<br />
          {`}`}
        </>
      );
    } else if (warning.type === 'multiple_primary_keys') {
      return (
        <>
          {entityName} {`{`}<br />
          &nbsp;&nbsp;string existing_field<br />
          &nbsp;&nbsp;<span className={styles.highlightError}>
            string id PK "First primary"<br />
            &nbsp;&nbsp;string other_id PK "Second primary"
          </span><br />
          &nbsp;&nbsp;...<br />
          {`}`}
        </>
      );
    } else if (warning.type === 'foreign_key_naming') {
      const relationshipMatch = warning.relationship?.match(/(\w+)\s*→\s*(\w+)/);
      if (relationshipMatch) {
        const toEntity = relationshipMatch[2];
        const fromEntity = relationshipMatch[1];
        const expectedFK = `${fromEntity.toLowerCase()}_id`;
        
        // Find existing FK in the ERD content
        const entityRegex = new RegExp(`${toEntity}\\s*\\{[\\s\\S]*?\\}`, 'g');
        const entityMatch = correctedErdContent.match(entityRegex);
        if (entityMatch && entityMatch[0]) {
          const fkRegex = /string\s+(\w+)\s+FK/g;
          let fkMatch;
          while ((fkMatch = fkRegex.exec(entityMatch[0])) !== null) {
            const fkName = fkMatch[1];
            if (fkName !== expectedFK && fkName.includes(fromEntity.toLowerCase())) {
              return (
                <>
                  {entityName} {`{`}<br />
                  &nbsp;&nbsp;string existing_field<br />
                  &nbsp;&nbsp;<span className={styles.highlightError}>
                    string {fkName} FK "Incorrectly named"
                  </span><br />
                  &nbsp;&nbsp;...<br />
                  {`}`}
                </>
              );
            }
          }
        }
      }
      return (
        <>
          {entityName} {`{`}<br />
          &nbsp;&nbsp;string existing_field<br />
          &nbsp;&nbsp;<span className={styles.highlightError}>
            string existing_fk FK "Incorrectly named"
          </span><br />
          &nbsp;&nbsp;...<br />
          {`}`}
        </>
      );
    } else {
      return (
        <>
          {entityName} {`{`}<br />
          &nbsp;&nbsp;string existing_field<br />
          &nbsp;&nbsp;<span className={styles.highlightError}>// missing foreign key</span><br />
          &nbsp;&nbsp;...<br />
          {`}`}
        </>
      );
    }
  };

  const getCorrectedCode = (warning: ValidationWarning, entityName: string): React.ReactNode => {
    if (warning.type === 'missing_primary_key') {
      return (
        <>
          {entityName} {`{`}<br />
          &nbsp;&nbsp;string existing_field<br />
          &nbsp;&nbsp;<span className={styles.highlightSuccess}>
            string id PK "Unique identifier"
          </span><br />
          &nbsp;&nbsp;...<br />
          {`}`}
        </>
      );
    } else if (warning.type === 'multiple_primary_keys') {
      return (
        <>
          {entityName} {`{`}<br />
          &nbsp;&nbsp;string existing_field<br />
          &nbsp;&nbsp;<span className={styles.highlightSuccess}>
            string id PK "Primary key"<br />
            &nbsp;&nbsp;string other_id "Regular field"
          </span><br />
          &nbsp;&nbsp;...<br />
          {`}`}
        </>
      );
    } else {
      const relationshipMatch = warning.relationship?.match(/(\w+)\s*→\s*(\w+)/);
      const fromEntity = relationshipMatch ? relationshipMatch[1] : 'related';
      return (
        <>
          {entityName} {`{`}<br />
          &nbsp;&nbsp;string existing_field<br />
          &nbsp;&nbsp;<span className={styles.highlightSuccess}>
            string {fromEntity.toLowerCase()}_id FK "Foreign key to {fromEntity}"
          </span><br />
          &nbsp;&nbsp;...<br />
          {`}`}
        </>
      );
    }
  };

  return (
    <Accordion multiple collapsible defaultOpenItems={["validation-results"]} className={styles.schemaAccordion}>
      <AccordionItem value="validation-results">
        <AccordionHeader>
          <Text className={styles.accordionHeaderText}>
            Validation results
          </Text>
        </AccordionHeader>
        <AccordionPanel>
          
          {/* Auto-corrected warnings */}
          {autoCorrectedWarnings.map((warning, index) => (
            <MessageBar 
              key={`auto-${index}`}
              intent="info"
              className={styles.validationMessageBar}
            >
              <MessageBarBody>
                <strong>
                  Auto-corrected: {warning.category === 'relationships' && warning.type === 'many_to_many_auto_corrected' 
                    ? 'Many-to-Many Relationship Converted' 
                    : warning.message}
                </strong><br />
                {/* {warning.corrections && (
                  <>
                    <Text style={{ fontSize: '12px', color: tokens.colorNeutralForeground2 }}>
                      Original: {warning.corrections.originalRelationship}
                    </Text><br />
                    <Text style={{ fontSize: '12px', color: tokens.colorNeutralForeground2 }}>
                      Created junction table: {warning.corrections.junctionTable}
                    </Text><br />
                    <Text style={{ fontSize: '12px', color: tokens.colorNeutralForeground2 }}>
                      New relationships: {warning.corrections.newRelationships.join(' and ')}
                    </Text>
                  </>
                )} */}
              </MessageBarBody>
            </MessageBar>
          ))}

          {/* Warning messages for fixable warnings */}
          {fixableWarnings.map((warning, index) => (
            <MessageBar 
              key={`fixable-warning-msg-${index}`}
              intent="warning"
              className={styles.validationMessageBar}
            >
              <MessageBarBody>
                <strong>Warning: {warning.message}</strong><br />
                <Text style={{ fontSize: '10px', color: tokens.colorNeutralForeground3, fontFamily: 'monospace' }}>
                  ID: {warning.id}
                </Text><br />
                <Text style={{ fontSize: '12px', color: tokens.colorNeutralForeground2 }}>
                  {warning.suggestion || 'This issue can be automatically fixed.'}
                </Text>
              </MessageBarBody>
            </MessageBar>
          ))}

          {/* Fixable warnings with comparison cards */}
          {fixableWarnings.map((warning, index) => {
            const entityName = getEntityName(warning);
            
            return (
              <div key={`fixable-${index}`} className={styles.backendWarningContainer}>
                <div className={styles.correctionHeader}>
                  <Text className={styles.correctionTitle}>
                    {getFixTitle(warning)}
                  </Text>
                  <Button
                    size="small"
                    appearance="primary"
                    className={styles.fixButton}
                    onClick={() => onFixWarning(warning)}
                  >
                    Fix this
                  </Button>
                </div>
                <div className={styles.comparisonGrid}>
                  <div className={styles.originalColumn}>
                    <Text className={styles.columnHeader}>
                      Original ERD
                    </Text>
                    <div className={styles.codeBlock}>
                      <Text className={styles.codeText}>
                        {getOriginalCode(warning, entityName)}
                      </Text>
                    </div>
                  </div>
                  <div className={styles.correctedColumn}>
                    <Text className={styles.columnHeader}>
                      Corrected ERD
                    </Text>
                    <div className={styles.codeBlock}>
                      <Text className={styles.codeText}>
                        {getCorrectedCode(warning, entityName)}
                      </Text>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}

          {/* Non-fixable warnings */}
          {nonFixableWarnings.map((warning, index) => (
            <MessageBar 
              key={`warning-${index}`}
              intent={warning.severity === 'info' ? 'info' : 'warning'}
              className={styles.validationMessageBar}
            >
              <MessageBarBody>
                <strong>{warning.severity === 'info' ? 'Info' : 'Warning'}: {warning.message}</strong><br />
                <Text style={{ fontSize: '10px', color: tokens.colorNeutralForeground3, fontFamily: 'monospace' }}>
                  ID: {warning.id}
                </Text><br />
                <Text style={{ fontSize: '12px', color: tokens.colorNeutralForeground2 }}>
                  {warning.suggestion || warning.message}
                </Text>
              </MessageBarBody>
            </MessageBar>
          ))}

          {/* ERD Structure Status */}
          {hasAnyIssues ? (
            <MessageBar intent="warning" className={styles.validationMessageBar}>
              <MessageBarBody>
                ERD structure needs attention<br />
                Your ERD structure is valid but has issues that should be addressed before deployment.
              </MessageBarBody>
            </MessageBar>
          ) : (!validationError && (
            <MessageBar intent="success" className={styles.validationMessageBar}>
              <MessageBarBody>
                <strong>ERD validation complete</strong><br />
                Your ERD structure looks good! No issues found.
              </MessageBarBody>
            </MessageBar>
          ))}

          {/* Choice Column Issues */}
          {hasChoiceIssues && (
            <MessageBar intent="warning" className={styles.validationMessageBar}>
              <MessageBarBody>
                <strong>Entity contains 'choice' or 'category' columns which cannot be automatically created. These columns will be ignored during deployment.</strong><br />
                <Text style={{ fontSize: '12px', color: tokens.colorNeutralForeground2 }}>
                  Entities with choice/category columns detected
                </Text><br />
                <Text style={{ fontSize: '12px', color: tokens.colorNeutralForeground2 }}>
                  Mermaid ERD diagrams cannot define choice column options. You'll need to manually create these choice columns in Dataverse after deployment. You can use the global choices feature to sync predefined choice sets to your manually created choice columns. You can automatically fix this below.
                </Text>
              </MessageBarBody>
            </MessageBar>
          )}

          {/* Naming Conflicts */}
          {hasNamingIssues && namingConflicts.map((entityName) => (
            <div key={entityName}>
              <MessageBar intent="warning" className={styles.validationMessageBar}>
                <MessageBarBody>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div style={{ flex: 1 }}>
                      <strong>Naming conflict</strong><br />
                      Entity '{entityName}' has a non-primary column called 'name'. This will conflict with the auto-generated primary name column in Dataverse.<br />
                      <Text style={{ fontSize: '12px', color: tokens.colorNeutralForeground2 }}>
                        Suggestion: Consider renaming the column to something like '{entityName.toLowerCase()}_name', 'display_name', or 'title'.
                      </Text>
                    </div>
                    <Button 
                      appearance="secondary"
                      size="small"
                      className={styles.fixButton}
                      onClick={() => onApplyNamingConflictFix(entityName)}
                      style={{ marginLeft: '12px', flexShrink: 0 }}
                    >
                      Fix this (N/A)
                    </Button>
                  </div>
                </MessageBarBody>
              </MessageBar>
            </div>
          ))}

          {/* Suggested Corrections Section */}
          {(hasNamingIssues || hasChoiceIssues) && (
            <>
              <Text className={styles.validationResultsHeading}>
                Suggested corrections
              </Text>

              <div className={styles.correctionComparisonContainer}>
                {/* Choice Column Correction */}
                {hasChoiceIssues && (
                  <div className={styles.correctionItem}>
                    <div className={styles.correctionHeader}>
                      <Text className={styles.correctionTitle}>Remove choice/category columns</Text>
                      <Button 
                        appearance="secondary"
                        size="small"
                        className={styles.fixButton}
                        onClick={onApplyChoiceColumnFix}
                      >
                        Fix this (N/A)
                      </Button>
                    </div>
                    <div className={styles.comparisonGrid}>
                      <div className={styles.originalColumn}>
                        <Text className={styles.columnHeader}>
                          Original ERD
                        </Text>
                        <div className={styles.codeBlock}>
                          <Text className={styles.codeText}>
                            Event {`{`}<br />
                            &nbsp;&nbsp;string id PK<br />
                            &nbsp;&nbsp;string name<br />
                            &nbsp;&nbsp;<span className={styles.highlightError}>choice priority</span><br />
                            {`}`}
                          </Text>
                        </div>
                      </div>
                      <div className={styles.correctedColumn}>
                        <Text className={styles.columnHeader}>
                          Corrected ERD
                        </Text>
                        <div className={styles.codeBlock}>
                          <Text className={styles.codeText}>
                            Event {`{`}<br />
                            &nbsp;&nbsp;string id PK<br />
                            &nbsp;&nbsp;string name<br />
                            &nbsp;&nbsp;<span className={styles.highlightSuccess}>// choice columns created manually in Dataverse</span><br />
                            {`}`}
                          </Text>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Individual Naming Conflict Corrections */}
                {namingConflicts.map((entityName) => {
                  const entityWarning = warnings.find((w: any) => 
                    w.type === 'naming_conflict' && w.entity === entityName
                  );
                  
                  const hasCustomPrimaryColumn = entityWarning?.message?.includes('custom primary column');
                  const isInfoLevel = entityWarning?.severity === 'info';
                  
                  return (
                    <div key={entityName} className={styles.correctionItem}>
                      <div className={styles.correctionHeader}>
                        <Text className={styles.correctionTitle}>
                          {hasCustomPrimaryColumn 
                            ? `Fix naming conflict in ${entityName} (Custom Primary Column)`
                            : isInfoLevel
                            ? `Optimize primary column in ${entityName}`
                            : `Fix naming conflict in ${entityName}`
                          }
                        </Text>
                        <Button 
                          appearance="secondary"
                          size="small"
                          className={styles.fixButton}
                          onClick={() => onApplyNamingConflictFix(entityName)}
                        >
                          Fix this (N/A)
                        </Button>
                      </div>
                      <div className={styles.comparisonGrid}>
                        <div className={styles.originalColumn}>
                          <Text className={styles.columnHeader}>
                            Original ERD
                          </Text>
                          <div className={styles.codeBlock}>
                            <Text className={styles.codeText}>
                              {entityName} {`{`}<br />
                              {hasCustomPrimaryColumn ? (
                                <>
                                  &nbsp;&nbsp;string customer_code PK<br />
                                  &nbsp;&nbsp;<span className={styles.highlightError}>string name</span><br />
                                </>
                              ) : isInfoLevel ? (
                                <>
                                  &nbsp;&nbsp;string other_field<br />
                                  &nbsp;&nbsp;<span className={styles.highlightError}>string name</span><br />
                                </>
                              ) : (
                                <>
                                  &nbsp;&nbsp;string id<br />
                                  &nbsp;&nbsp;<span className={styles.highlightError}>string name</span><br />
                                </>
                              )}
                              &nbsp;&nbsp;...<br />
                              {`}`}
                            </Text>
                          </div>
                        </div>
                        <div className={styles.correctedColumn}>
                          <Text className={styles.columnHeader}>
                            Corrected ERD
                          </Text>
                          <div className={styles.codeBlock}>
                            <Text className={styles.codeText}>
                              {entityName} {`{`}<br />
                              {hasCustomPrimaryColumn ? (
                                <>
                                  &nbsp;&nbsp;string customer_code PK<br />
                                  &nbsp;&nbsp;<span className={styles.highlightSuccess}>string {entityName.toLowerCase()}_name</span><br />
                                </>
                              ) : isInfoLevel ? (
                                <>
                                  &nbsp;&nbsp;string other_field<br />
                                  &nbsp;&nbsp;<span className={styles.highlightSuccess}>string name PK "Primary Name"</span><br />
                                </>
                              ) : (
                                <>
                                  &nbsp;&nbsp;string id<br />
                                  &nbsp;&nbsp;<span className={styles.highlightSuccess}>string {entityName.toLowerCase()}_name</span><br />
                                </>
                              )}
                              &nbsp;&nbsp;...<br />
                              {`}`}
                            </Text>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {(hasChoiceIssues || hasNamingIssues) && (
                <div className={styles.fixAllContainer}>
                  <Button 
                    appearance="primary"
                    className={styles.fixAllButton}
                    onClick={onApplyAllFixes}
                  >
                    Fix All Issues
                  </Button>
                </div>
              )}
            </>
          )}
          
        </AccordionPanel>
      </AccordionItem>
    </Accordion>
  );
};
