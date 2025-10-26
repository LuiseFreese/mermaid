import React, { useState } from 'react';
import { DataverseEnvironment } from '../../../../shared/types/environment';
import { EnvironmentSelector } from '../environment/EnvironmentSelector';
import styles from './EnvironmentComparison.module.css';

interface Solution {
  uniqueName: string;
  displayName: string;
  version: string;
  publisher: string;
  description?: string;
  modifiedOn: string;
}

interface ComparisonResult {
  sourceEnvironment: DataverseEnvironment;
  targetEnvironment: DataverseEnvironment;
  comparison: {
    sourceOnly: Solution[];
    targetOnly: Solution[];
    common: (Solution & { targetVersion?: string; versionDifference?: boolean })[];
    summary: {
      sourceOnlyCount: number;
      targetOnlyCount: number;
      commonCount: number;
      versionDifferences: number;
    };
  };
}

interface EnvironmentComparisonProps {
  environments: DataverseEnvironment[];
}

export const EnvironmentComparison: React.FC<EnvironmentComparisonProps> = ({
  environments
}) => {
  const [sourceEnvironmentId, setSourceEnvironmentId] = useState<string>('');
  const [targetEnvironmentId, setTargetEnvironmentId] = useState<string>('');
  const [isComparing, setIsComparing] = useState(false);
  const [comparisonResult, setComparisonResult] = useState<ComparisonResult | null>(null);
  const [error, setError] = useState<string>('');

  const compareEnvironments = async () => {
    if (!sourceEnvironmentId || !targetEnvironmentId) {
      return;
    }

    setIsComparing(true);
    setError('');
    setComparisonResult(null);

    try {
      const response = await fetch('/api/cross-environment/compare', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          sourceEnvironmentId,
          targetEnvironmentId
        })
      });

      const result = await response.json();

      if (response.ok) {
        setComparisonResult(result);
      } else {
        setError(result.error || 'Comparison failed');
      }
    } catch (err) {
      setError('Error comparing environments: ' + (err as Error).message);
    } finally {
      setIsComparing(false);
    }
  };

  const canCompare = sourceEnvironmentId && targetEnvironmentId && sourceEnvironmentId !== targetEnvironmentId;

  return (
    <div className={styles.environmentComparison}>
      <div className={styles.header}>
        <h2>Environment Comparison</h2>
        <p>Compare solutions between different Dataverse environments</p>
      </div>

      <div className={styles.selectionSection}>
        <div className={styles.environmentSelector}>
          <EnvironmentSelector
            environments={environments}
            selectedEnvironmentId={sourceEnvironmentId}
            onEnvironmentSelect={(env) => setSourceEnvironmentId(env.id)}
            label="Source Environment"
            placeholder="Select source environment..."
            showAddButton={false}
            showEditButton={false}
          />
        </div>

        <div className={styles.comparisonArrow}>
          🔄
        </div>

        <div className={styles.environmentSelector}>
          <EnvironmentSelector
            environments={environments.filter(env => env.id !== sourceEnvironmentId)}
            selectedEnvironmentId={targetEnvironmentId}
            onEnvironmentSelect={(env) => setTargetEnvironmentId(env.id)}
            label="Target Environment"
            placeholder="Select target environment..."
            showAddButton={false}
            showEditButton={false}
          />
        </div>
      </div>

      <div className={styles.actionSection}>
        <button
          className={styles.compareButton}
          onClick={compareEnvironments}
          disabled={!canCompare || isComparing}
        >
          {isComparing ? 'Comparing...' : 'Compare Environments'}
        </button>
      </div>

      {error && (
        <div className={styles.error}>
          <strong>Error:</strong> {error}
        </div>
      )}

      {comparisonResult && (
        <div className={styles.results}>
          <div className={styles.resultHeader}>
            <h3>Comparison Results</h3>
            <div className={styles.environmentNames}>
              <span className={styles.sourceName}>
                {comparisonResult.sourceEnvironment.name}
              </span>
              <span className={styles.vs}>vs</span>
              <span className={styles.targetName}>
                {comparisonResult.targetEnvironment.name}
              </span>
            </div>
          </div>

          <div className={styles.summary}>
            <div className={styles.summaryItem}>
              <div className={styles.summaryNumber}>
                {comparisonResult.comparison.summary.sourceOnlyCount}
              </div>
              <div className={styles.summaryLabel}>
                Only in Source
              </div>
            </div>
            <div className={styles.summaryItem}>
              <div className={styles.summaryNumber}>
                {comparisonResult.comparison.summary.commonCount}
              </div>
              <div className={styles.summaryLabel}>
                Common Solutions
              </div>
            </div>
            <div className={styles.summaryItem}>
              <div className={styles.summaryNumber}>
                {comparisonResult.comparison.summary.targetOnlyCount}
              </div>
              <div className={styles.summaryLabel}>
                Only in Target
              </div>
            </div>
            <div className={styles.summaryItem}>
              <div className={styles.summaryNumber}>
                {comparisonResult.comparison.summary.versionDifferences}
              </div>
              <div className={styles.summaryLabel}>
                Version Differences
              </div>
            </div>
          </div>

          <div className={styles.detailSections}>
            {/* Solutions only in source */}
            {comparisonResult.comparison.sourceOnly.length > 0 && (
              <div className={styles.section}>
                <h4 className={styles.sectionTitle}>
                  📤 Only in {comparisonResult.sourceEnvironment.name} ({comparisonResult.comparison.sourceOnly.length})
                </h4>
                <div className={styles.solutionList}>
                  {comparisonResult.comparison.sourceOnly.map(solution => (
                    <div key={solution.uniqueName} className={styles.solutionItem}>
                      <div className={styles.solutionName}>{solution.displayName}</div>
                      <div className={styles.solutionDetails}>
                        <span className={styles.version}>v{solution.version}</span>
                        <span className={styles.publisher}>{solution.publisher}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Solutions only in target */}
            {comparisonResult.comparison.targetOnly.length > 0 && (
              <div className={styles.section}>
                <h4 className={styles.sectionTitle}>
                  📥 Only in {comparisonResult.targetEnvironment.name} ({comparisonResult.comparison.targetOnly.length})
                </h4>
                <div className={styles.solutionList}>
                  {comparisonResult.comparison.targetOnly.map(solution => (
                    <div key={solution.uniqueName} className={styles.solutionItem}>
                      <div className={styles.solutionName}>{solution.displayName}</div>
                      <div className={styles.solutionDetails}>
                        <span className={styles.version}>v{solution.version}</span>
                        <span className={styles.publisher}>{solution.publisher}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Common solutions */}
            {comparisonResult.comparison.common.length > 0 && (
              <div className={styles.section}>
                <h4 className={styles.sectionTitle}>
                  🔄 Common Solutions ({comparisonResult.comparison.common.length})
                </h4>
                <div className={styles.solutionList}>
                  {comparisonResult.comparison.common.map(solution => (
                    <div 
                      key={solution.uniqueName} 
                      className={`${styles.solutionItem} ${solution.versionDifference ? styles.versionDifference : ''}`}
                    >
                      <div className={styles.solutionName}>{solution.displayName}</div>
                      <div className={styles.solutionDetails}>
                        <span className={styles.version}>
                          Source: v{solution.version}
                        </span>
                        <span className={styles.version}>
                          Target: v{solution.targetVersion}
                        </span>
                        <span className={styles.publisher}>{solution.publisher}</span>
                        {solution.versionDifference && (
                          <span className={styles.versionWarning}>⚠️ Version Difference</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {comparisonResult.comparison.sourceOnly.length === 0 && 
             comparisonResult.comparison.targetOnly.length === 0 && 
             comparisonResult.comparison.common.length === 0 && (
              <div className={styles.noResults}>
                <p>No solutions found in either environment.</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};