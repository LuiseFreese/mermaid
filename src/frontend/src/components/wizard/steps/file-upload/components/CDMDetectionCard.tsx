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
  MessageBarBody,
  tokens
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
          <Text className={styles.cdmTitle} weight="semibold" size={500}>
            CDM Entities Detected
          </Text>
          
          <Text className={styles.cdmDescription} size={300}>
            We found <strong>{entities.length}</strong> Common Data Model (CDM) entities in your ERD:
          </Text>
          
          <div className={styles.entityList}>
            {entities.map(entity => (
              <span key={entity} className={styles.entityBadge}>
                {entity}
              </span>
            ))}
          </div>

          {!choice && (
            <div className={styles.choiceSection}>
              <Text className={styles.choiceTitle} weight="semibold" size={400}>
                How would you like to handle these entities?
              </Text>
              
              <div className={styles.choiceButtons}>
                <Button 
                  appearance="primary"
                  onClick={() => onChoiceSelected('cdm')}
                  className={styles.cdmChoiceButton}
                >
                  Use existing CDM entities
                </Button>
                <Button 
                  appearance="secondary"
                  onClick={() => onChoiceSelected('custom')}
                  className={styles.cdmChoiceButton}
                >
                  Create custom entities
                </Button>
              </div>
              
              <Text className={styles.choiceHelp} size={200}>
                CDM entities leverage existing Dataverse structure, while custom entities give you full control.
              </Text>
            </div>
          )}

          {choice && (
            <div className={styles.selectedChoice}>
              {choice === 'cdm' ? (
                <MessageBar intent="success" className={styles.messageBar}>
                  <MessageBarBody>
                    <strong>CDM entities selected successfully!</strong> Using existing Dataverse entities.
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
                    <strong>Creating custom entities for:</strong> {entities.join(', ')}
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