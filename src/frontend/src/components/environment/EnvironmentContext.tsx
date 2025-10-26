import React from 'react';
import { DataverseEnvironment, EnvironmentOperation } from '../../../../shared/types/environment';
import styles from './EnvironmentContext.module.css';

interface EnvironmentContextProps {
  operation: EnvironmentOperation;
  className?: string;
}

/**
 * Component that clearly shows which environment the user is working with
 * and what operation they're performing (import, deploy, rollback)
 */
export const EnvironmentContext: React.FC<EnvironmentContextProps> = ({
  operation,
  className = ''
}) => {
  const getOperationIcon = (type: string) => {
    switch (type) {
      case 'import': return '📥';
      case 'deploy': return '🚀';
      case 'rollback': return '↩️';
      case 'validate': return '✅';
      default: return '🔄';
    }
  };

  const getEnvironmentBadgeStyle = (env: DataverseEnvironment) => ({
    backgroundColor: env.color === 'red' ? '#fee2e2' : 
                     env.color === 'green' ? '#dcfce7' :
                     env.color === 'blue' ? '#dbeafe' :
                     env.color === 'yellow' ? '#fef3c7' :
                     env.color === 'purple' ? '#f3e8ff' : '#f3f4f6',
    borderColor: env.color === 'red' ? '#dc2626' : 
                 env.color === 'green' ? '#16a34a' :
                 env.color === 'blue' ? '#2563eb' :
                 env.color === 'yellow' ? '#ca8a04' :
                 env.color === 'purple' ? '#9333ea' : '#6b7280',
    color: env.color === 'red' ? '#dc2626' : 
           env.color === 'green' ? '#16a34a' :
           env.color === 'blue' ? '#2563eb' :
           env.color === 'yellow' ? '#ca8a04' :
           env.color === 'purple' ? '#9333ea' : '#6b7280'
  });

  return (
    <div className={`${styles.environmentContext} ${className}`}>
      <div className={styles.operationHeader}>
        <span className={styles.operationIcon}>
          {getOperationIcon(operation.type)}
        </span>
        <span className={styles.operationText}>
          {operation.description}
        </span>
      </div>

      <div className={styles.environmentDetails}>
        {/* Source Environment */}
        <div className={styles.environmentCard}>
          <div className={styles.environmentLabel}>
            {operation.type === 'import' ? 'Importing from:' : 
             operation.type === 'rollback' ? 'Rolling back in:' : 
             'Source:'}
          </div>
          <div 
            className={styles.environmentBadge}
            style={getEnvironmentBadgeStyle(operation.sourceEnvironment)}
          >
            <div className={styles.environmentName}>
              {operation.sourceEnvironment.name}
            </div>
            <div className={styles.environmentUrl}>
              {operation.sourceEnvironment.url}
            </div>
            {operation.sourceEnvironment.metadata?.organizationDisplayName && (
              <div className={styles.environmentOrg}>
                {operation.sourceEnvironment.metadata.organizationDisplayName}
              </div>
            )}
          </div>
        </div>

        {/* Target Environment (for deploy operations) */}
        {operation.targetEnvironment && (
          <>
            <div className={styles.operationArrow}>→</div>
            <div className={styles.environmentCard}>
              <div className={styles.environmentLabel}>Deploying to:</div>
              <div 
                className={styles.environmentBadge}
                style={getEnvironmentBadgeStyle(operation.targetEnvironment)}
              >
                <div className={styles.environmentName}>
                  {operation.targetEnvironment.name}
                </div>
                <div className={styles.environmentUrl}>
                  {operation.targetEnvironment.url}
                </div>
                {operation.targetEnvironment.metadata?.organizationDisplayName && (
                  <div className={styles.environmentOrg}>
                    {operation.targetEnvironment.metadata.organizationDisplayName}
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </div>

      {/* Warning for production operations */}
      {operation.sourceEnvironment.color === 'red' && (
        <div className={styles.productionWarning}>
          ⚠️ You are working with a Production environment. Please proceed with caution.
        </div>
      )}
    </div>
  );
};