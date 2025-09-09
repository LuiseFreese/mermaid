/**
 * Auto-Fix Suggestions Component
 * Displays available auto-fixes and allows users to apply them
 */

import React from 'react';
import {
  Card,
  CardHeader,
  CardPreview,
  Text,
  Button,
  MessageBar,
  MessageBarBody,
  Badge,
  Divider,
  tokens
} from '@fluentui/react-components';
import { 
  AutoFix20Regular,
  PlayRegular,
  CheckmarkCircleRegular,
  InfoRegular
} from '@fluentui/react-icons';
import type { AutoFixSuggestionsProps } from '../types/file-upload.types';
import styles from './AutoFixSuggestions.module.css';

export const AutoFixSuggestions: React.FC<AutoFixSuggestionsProps> = ({
  autoFixes,
  onApplyFix,
  onApplyAllFixes,
  isLoading,
  className
}) => {
  if (!autoFixes || autoFixes.length === 0) {
    return null;
  }

  const handleApplyFix = (fixId: string) => {
    onApplyFix(fixId);
  };

  const handleApplyAllFixes = () => {
    onApplyAllFixes();
  };

  return (
    <Card className={`${styles.autoFixCard} ${className || ''}`}>
      <CardHeader
        header={
          <div className={styles.headerContent}>
            <div className={styles.titleSection}>
              <AutoFix20Regular className={styles.titleIcon} />
              <Text weight="semibold" size={500}>
                Auto-Fix Suggestions
              </Text>
              <Badge appearance="filled" color="brand" size="small">
                {autoFixes.length} Available
              </Badge>
            </div>
            <Button
              appearance="primary"
              size="small"
              icon={<PlayRegular />}
              onClick={handleApplyAllFixes}
              disabled={isLoading}
              className={styles.applyAllButton}
            >
              Apply All Fixes
            </Button>
          </div>
        }
        description={
          <Text size={300} style={{ color: tokens.colorNeutralForeground3 }}>
            We found issues that can be automatically fixed. Review and apply the suggested fixes below.
          </Text>
        }
      />
      
      <CardPreview>
        <div className={styles.fixesContent}>
          <MessageBar intent="info" className={styles.infoMessage}>
            <MessageBarBody>
              <div className={styles.infoContent}>
                <InfoRegular className={styles.infoIcon} />
                <div>
                  <Text weight="semibold">Auto-fixes available</Text>
                  <Text size={300} style={{ display: 'block', marginTop: '4px' }}>
                    These fixes will modify your ERD content to resolve common issues automatically.
                  </Text>
                </div>
              </div>
            </MessageBarBody>
          </MessageBar>

          <div className={styles.fixesList}>
            {autoFixes.map((fix, index) => (
              <div key={fix.id} className={styles.fixItem}>
                <div className={styles.fixHeader}>
                  <div className={styles.fixInfo}>
                    <Text weight="semibold" className={styles.fixTitle}>
                      {fix.type === 'naming' ? 'Fix Naming Conflict' :
                       fix.type === 'choice' ? 'Add Choice Column Definition' :
                       fix.type === 'status' ? 'Add Status Column Definition' :
                       fix.type === 'primary-key' ? 'Add Primary Key' :
                       'General Fix'}
                    </Text>
                    <Text size={300} className={styles.fixDescription}>
                      {fix.description}
                    </Text>
                    {fix.entityName && (
                      <Badge appearance="outline" color="brand" size="extra-small" className={styles.entityBadge}>
                        {fix.entityName}
                      </Badge>
                    )}
                  </div>
                  
                  <Button
                    appearance="outline"
                    size="small"
                    icon={<CheckmarkCircleRegular />}
                    onClick={() => handleApplyFix(fix.id)}
                    disabled={isLoading}
                    className={styles.applyButton}
                  >
                    Apply Fix
                  </Button>
                </div>

                {fix.preview && (
                  <div className={styles.fixPreview}>
                    <Text size={200} weight="semibold" className={styles.previewLabel}>
                      Preview of changes:
                    </Text>
                    <div className={styles.previewContent}>
                      <Text size={200} className={styles.previewText}>
                        {fix.preview}
                      </Text>
                    </div>
                  </div>
                )}

                {index < autoFixes.length - 1 && <Divider className={styles.fixDivider} />}
              </div>
            ))}
          </div>
        </div>
      </CardPreview>
    </Card>
  );
};
