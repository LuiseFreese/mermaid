/**
 * CDM Detection Card Component
 * Displays CDM entity detection results and allows user choice between CDM and custom entities
 */

import React from 'react';
import {
  Card,
  CardPreview,
  Text,
  Button,
  MessageBar,
  MessageBarBody
} from '@fluentui/react-components';
import type { CDMDetectionCardProps } from '../types/file-upload.types';
import styles from './CDMDetectionCard.module.css';

export const CDMDetectionCard: React.FC<CDMDetectionCardProps> = ({
  detectionResult,
  onChoiceSelected,
  onChoiceChanged,
  className
}) => {
  const { detected, entities, choice } = detectionResult;

  if (!detected) {
    return null; // Don't render if no CDM entities detected
  }

  return (
    <Card className={`${styles.cdmCard} ${className || ''}`}>
      <CardPreview>
        <div className={styles.cdmContent}>
          <Text className={styles.cdmTitle} weight="semibold">
            CDM Tables Detected
          </Text>
          <br />
          <Text className={styles.cdmDescription}>
            We found <strong>{entities.length}</strong> Common Data Model (CDM) tables in your ERD:
          </Text>
          
          <div className={styles.entityList}>
            {entities.map(entity => (
              <span key={entity} className={styles.entityBadge}>
                {entity.charAt(0).toUpperCase() + entity.slice(1).toLowerCase()}
              </span>
            ))}
          </div>

          {!choice && (
            <div className={styles.choiceSection}>
              <Text className={styles.choiceTitle} weight="semibold">
                How would you like to handle these tables?
              </Text>
              
              <div className={styles.choiceButtons}>
                <Button 
                  appearance="primary"
                  onClick={() => {
                    console.log('🔧 FRONTEND DEBUG: CDM button clicked - USE CDM', {
                      choice: 'cdm',
                      detectedEntities: entities,
                      timestamp: new Date().toISOString()
                    });
                    onChoiceSelected('cdm');
                  }}
                  className={styles.cdmChoiceButton}
                >
                  Use existing CDM tables
                </Button>
                <Button 
                  appearance="secondary"
                  onClick={() => {
                    console.log('🔧 FRONTEND DEBUG: CDM button clicked - CREATE CUSTOM', {
                      choice: 'custom',
                      detectedEntities: entities,
                      timestamp: new Date().toISOString()
                    });
                    onChoiceSelected('custom');
                  }}
                  className={styles.cdmChoiceButton}
                >
                  Create custom tables
                </Button>
              </div>
              
              <Text className={styles.choiceHelp}>
                CDM tables leverage existing Dataverse structure, while custom tables give you full control.
              </Text>
            </div>
          )}

          {choice && (
            <div className={styles.selectedChoice}>
              {choice === 'cdm' ? (
                <MessageBar intent="success" className={styles.messageBar}>
                  <MessageBarBody>
                    <strong>CDM tables selected successfully!</strong> Using existing Dataverse tables.
                    <Button 
                      appearance="transparent" 
                      onClick={onChoiceChanged}
                      className={styles.changeButton}
                    >
                      Change
                    </Button>
                  </MessageBarBody>
                </MessageBar>
              ) : (
                <MessageBar intent="info" className={styles.messageBar}>
                  <MessageBarBody>
                    <strong>Creating custom tables for:</strong> {entities.map(e => e.charAt(0).toUpperCase() + e.slice(1).toLowerCase()).join(', ')}
                    <Button 
                      appearance="transparent" 
                      onClick={onChoiceChanged}
                      className={styles.changeButton}
                    >
                      Change
                    </Button>
                  </MessageBarBody>
                </MessageBar>
              )}
            </div>
          )}
        </div>
      </CardPreview>
    </Card>
  );
};