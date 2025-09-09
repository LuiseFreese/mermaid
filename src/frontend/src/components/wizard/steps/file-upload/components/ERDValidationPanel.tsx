/**
 * ERD Validation Panel Component
 * Displays validation results and issues found in the ERD content
 */

import React from 'react';
import {
  Card,
  CardHeader,
  CardPreview,
  Text,
  MessageBar,
  MessageBarBody,
  Badge,
  tokens
} from '@fluentui/react-components';
import { 
  CheckmarkCircleRegular, 
  WarningRegular, 
  ErrorCircleRegular,
  InfoRegular 
} from '@fluentui/react-icons';
import type { ERDValidationPanelProps } from '../types/file-upload.types';
import styles from './ERDValidationPanel.module.css';

export const ERDValidationPanel: React.FC<ERDValidationPanelProps> = ({
  validationResult,
  className
}) => {
  const { hasIssues, issues } = validationResult;

  const getIconForSeverity = (severity: string) => {
    switch (severity) {
      case 'error':
        return <ErrorCircleRegular className={styles.errorIcon} />;
      case 'warning':
        return <WarningRegular className={styles.warningIcon} />;
      case 'info':
        return <InfoRegular className={styles.infoIcon} />;
      default:
        return <CheckmarkCircleRegular className={styles.successIcon} />;
    }
  };

  const getIntentForSeverity = (severity: string): "success" | "warning" | "error" | "info" => {
    switch (severity) {
      case 'error':
        return 'error';
      case 'warning':
        return 'warning';
      case 'info':
        return 'info';
      default:
        return 'success';
    }
  };

  // Group issues by severity
  const errorIssues = issues.filter(issue => issue.severity === 'error');
  const warningIssues = issues.filter(issue => issue.severity === 'warning');
  const infoIssues = issues.filter(issue => issue.severity === 'info');

  return (
    <Card className={`${styles.validationCard} ${className || ''}`}>
      <CardHeader
        header={
          <div className={styles.headerContent}>
            <Text weight="semibold" size={500}>
              Validation Results
            </Text>
            <div className={styles.badges}>
              {errorIssues.length > 0 && (
                <Badge appearance="filled" color="danger" size="small">
                  {errorIssues.length} Error{errorIssues.length !== 1 ? 's' : ''}
                </Badge>
              )}
              {warningIssues.length > 0 && (
                <Badge appearance="filled" color="warning" size="small">
                  {warningIssues.length} Warning{warningIssues.length !== 1 ? 's' : ''}
                </Badge>
              )}
              {infoIssues.length > 0 && (
                <Badge appearance="filled" color="informative" size="small">
                  {infoIssues.length} Info
                </Badge>
              )}
            </div>
          </div>
        }
        description={
          <Text size={300} style={{ color: tokens.colorNeutralForeground3 }}>
            {hasIssues 
              ? "Your ERD has issues that should be addressed before deployment"
              : "Your ERD structure looks good! No issues found."
            }
          </Text>
        }
      />
      
      <CardPreview>
        <div className={styles.validationContent}>
          {!hasIssues ? (
            <MessageBar intent="success" className={styles.messageBar}>
              <MessageBarBody>
                <div className={styles.successMessage}>
                  <CheckmarkCircleRegular className={styles.successIcon} />
                  <div>
                    <Text weight="semibold">ERD validation complete</Text>
                    <Text size={300} style={{ display: 'block', marginTop: '4px' }}>
                      Your ERD structure looks good! No issues found.
                    </Text>
                  </div>
                </div>
              </MessageBarBody>
            </MessageBar>
          ) : (
            <div className={styles.issuesList}>
              {/* Error Issues */}
              {errorIssues.map((issue, index) => (
                <MessageBar 
                  key={`error-${index}`} 
                  intent={getIntentForSeverity(issue.severity)} 
                  className={styles.issueItem}
                >
                  <MessageBarBody>
                    <div className={styles.issueContent}>
                      {getIconForSeverity(issue.severity)}
                      <div className={styles.issueDetails}>
                        <Text weight="semibold" className={styles.issueTitle}>
                          {issue.entityName ? `${issue.entityName}: ` : ''}{issue.type === 'naming' ? 'Naming Conflict' : 
                           issue.type === 'choice' ? 'Choice Column' : 
                           issue.type === 'status' ? 'Status Column' : 
                           issue.type === 'primary-key' ? 'Missing Primary Key' : 
                           'Syntax Error'}
                        </Text>
                        <Text size={300} className={styles.issueDescription}>
                          {issue.description}
                        </Text>
                        {issue.fixable && (
                          <Badge appearance="outline" color="brand" size="extra-small" className={styles.fixableBadge}>
                            Auto-fixable
                          </Badge>
                        )}
                      </div>
                    </div>
                  </MessageBarBody>
                </MessageBar>
              ))}

              {/* Warning Issues */}
              {warningIssues.map((issue, index) => (
                <MessageBar 
                  key={`warning-${index}`} 
                  intent={getIntentForSeverity(issue.severity)} 
                  className={styles.issueItem}
                >
                  <MessageBarBody>
                    <div className={styles.issueContent}>
                      {getIconForSeverity(issue.severity)}
                      <div className={styles.issueDetails}>
                        <Text weight="semibold" className={styles.issueTitle}>
                          {issue.entityName ? `${issue.entityName}: ` : ''}{issue.type === 'naming' ? 'Naming Conflict' : 
                           issue.type === 'choice' ? 'Choice Column' : 
                           issue.type === 'status' ? 'Status Column' : 
                           issue.type === 'primary-key' ? 'Missing Primary Key' : 
                           'Validation Warning'}
                        </Text>
                        <Text size={300} className={styles.issueDescription}>
                          {issue.description}
                        </Text>
                        {issue.fixable && (
                          <Badge appearance="outline" color="brand" size="extra-small" className={styles.fixableBadge}>
                            Auto-fixable
                          </Badge>
                        )}
                      </div>
                    </div>
                  </MessageBarBody>
                </MessageBar>
              ))}

              {/* Info Issues */}
              {infoIssues.map((issue, index) => (
                <MessageBar 
                  key={`info-${index}`} 
                  intent={getIntentForSeverity(issue.severity)} 
                  className={styles.issueItem}
                >
                  <MessageBarBody>
                    <div className={styles.issueContent}>
                      {getIconForSeverity(issue.severity)}
                      <div className={styles.issueDetails}>
                        <Text weight="semibold" className={styles.issueTitle}>
                          {issue.entityName ? `${issue.entityName}: ` : ''}{issue.type === 'status' ? 'Status Column Info' : 'Information'}
                        </Text>
                        <Text size={300} className={styles.issueDescription}>
                          {issue.description}
                        </Text>
                      </div>
                    </div>
                  </MessageBarBody>
                </MessageBar>
              ))}
            </div>
          )}
        </div>
      </CardPreview>
    </Card>
  );
};
