/**
 * Enhanced Progress Indicator Component
 * Shows detailed progress with percentage, steps, and time estimates
 */

import React from 'react';
import {
  Text,
  ProgressBar,
  Spinner,
  tokens,
  Badge
} from '@fluentui/react-components';
import {
  Clock20Regular,
  Checkmark20Filled,
  Circle20Regular
} from '@fluentui/react-icons';
import styles from './EnhancedProgress.module.css';

export interface ProgressStep {
  id: string;
  label: string;
  status: 'pending' | 'active' | 'completed' | 'error';
  message?: string;
}

export interface EnhancedProgressProps {
  /** Whether progress is active */
  isActive: boolean;
  /** Overall progress percentage (0-100) */
  percentage?: number;
  /** Current step being processed */
  currentStep?: string;
  /** Array of progress steps */
  steps?: ProgressStep[];
  /** Main progress message */
  message?: string;
  /** Estimated time remaining */
  estimatedTimeRemaining?: string;
  /** Total time elapsed */
  timeElapsed?: string;
  /** Whether to show detailed steps */
  showSteps?: boolean;
  /** CSS class name */
  className?: string;
}

export const EnhancedProgress: React.FC<EnhancedProgressProps> = ({
  isActive,
  percentage = 0,
  currentStep,
  steps = [],
  message,
  estimatedTimeRemaining,
  timeElapsed,
  showSteps = true,
  className
}) => {
  if (!isActive) {
    return null;
  }

  const hasValidPercentage = percentage >= 0 && percentage <= 100;

  return (
    <div className={`${styles.enhancedProgress} ${className || ''}`}>
      {/* Main Progress Header */}
      <div className={styles.progressHeader}>
        {hasValidPercentage ? (
          <div className={styles.progressBarContainer}>
            <div className={styles.progressBarHeader}>
              <Text weight="semibold">
                {currentStep || 'Processing...'}
              </Text>
              <Text size={200} style={{ color: tokens.colorNeutralForeground2 }}>
                {Math.round(percentage)}%
              </Text>
            </div>
            <ProgressBar 
              value={percentage} 
              max={100}
              className={styles.progressBar}
            />
          </div>
        ) : (
          <>
            <Spinner size="small" style={{ flexShrink: 0 }} />
            <Text weight="semibold">
              {currentStep || 'Processing...'}
            </Text>
          </>
        )}
      </div>

      {/* Progress Message */}
      {message && (
        <Text 
          size={200} 
          style={{ 
            color: tokens.colorNeutralForeground2,
            marginBottom: '12px',
            display: 'block'
          }}
        >
          {message}
        </Text>
      )}

      {/* Time Information */}
      {(timeElapsed || estimatedTimeRemaining) && (
        <div className={styles.timeInfo}>
          {timeElapsed && (
            <div className={styles.timeItem}>
              <Clock20Regular style={{ color: tokens.colorNeutralForeground2 }} />
              <Text size={200} style={{ color: tokens.colorNeutralForeground2 }}>
                Elapsed: {timeElapsed}
              </Text>
            </div>
          )}
          {estimatedTimeRemaining && (
            <div className={styles.timeItem}>
              <Clock20Regular style={{ color: tokens.colorNeutralForeground2 }} />
              <Text size={200} style={{ color: tokens.colorNeutralForeground2 }}>
                Est. remaining: {estimatedTimeRemaining}
              </Text>
            </div>
          )}
        </div>
      )}

      {/* Detailed Steps */}
      {showSteps && steps.length > 0 && (
        <div className={styles.stepsContainer}>
          <Text size={200} weight="semibold" className={styles.stepsHeader}>
            Progress Steps
          </Text>
          <div className={styles.stepsList}>
            {steps.map((step, index) => (
              <div 
                key={step.id} 
                className={styles.stepItem}
                data-status={step.status}
              >
                {/* Step Icon */}
                <div className={styles.stepIcon}>
                  {step.status === 'completed' && (
                    <Checkmark20Filled style={{ color: tokens.colorPaletteGreenForeground1 }} />
                  )}
                  {step.status === 'active' && (
                    <Spinner size="extra-small" />
                  )}
                  {step.status === 'pending' && (
                    <Circle20Regular style={{ color: tokens.colorNeutralForeground3 }} />
                  )}
                  {step.status === 'error' && (
                    <div className={styles.stepIconError}>
                      <Text size={100}>✕</Text>
                    </div>
                  )}
                </div>

                {/* Step Label */}
                <Text 
                  size={200} 
                  className={`${styles.stepLabel} ${
                    step.status === 'active' ? styles.stepLabelActive :
                    step.status === 'completed' ? styles.stepLabelCompleted :
                    step.status === 'error' ? styles.stepLabelError :
                    styles.stepLabelPending
                  }`}
                >
                  {step.label}
                </Text>

                {/* Step Status Badge */}
                {step.status === 'active' && (
                  <Badge appearance="filled" color="brand" size="small">
                    In Progress
                  </Badge>
                )}
                {step.status === 'completed' && (
                  <Badge appearance="filled" color="success" size="small">
                    Done
                  </Badge>
                )}
                {step.status === 'error' && (
                  <Badge appearance="filled" color="danger" size="small">
                    Failed
                  </Badge>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};