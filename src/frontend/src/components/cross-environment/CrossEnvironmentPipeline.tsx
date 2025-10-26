import React, { useState, useEffect } from 'react';
import { DataverseEnvironment } from '../../../../shared/types/environment';
import { EnvironmentSelector } from '../environment/EnvironmentSelector';
import { EnvironmentContext } from '../environment/EnvironmentContext';
import styles from './CrossEnvironmentPipeline.module.css';

interface Solution {
  uniqueName: string;
  displayName: string;
  version: string;
  publisher: string;
  description?: string;
  modifiedOn: string;
}

interface PipelineStep {
  step: 'import' | 'deploy';
  environmentId: string;
  environmentName: string;
  success: boolean;
  result?: any;
  error?: string;
  timestamp: Date;
}

interface CrossEnvironmentPipelineProps {
  environments: DataverseEnvironment[];
  onPipelineComplete?: (results: any) => void;
}

export const CrossEnvironmentPipeline: React.FC<CrossEnvironmentPipelineProps> = ({
  environments,
  onPipelineComplete
}) => {
  const [sourceEnvironmentId, setSourceEnvironmentId] = useState<string>('');
  const [targetEnvironmentIds, setTargetEnvironmentIds] = useState<string[]>([]);
  const [availableSolutions, setAvailableSolutions] = useState<Solution[]>([]);
  const [selectedSolution, setSelectedSolution] = useState<string>('');
  const [isLoadingSolutions, setIsLoadingSolutions] = useState(false);
  const [isExecutingPipeline, setIsExecutingPipeline] = useState(false);
  const [pipelineResults, setPipelineResults] = useState<PipelineStep[]>([]);
  const [currentStep, setCurrentStep] = useState<string>('');
  const [deploymentOptions, setDeploymentOptions] = useState({
    skipValidation: false,
    updateExisting: true,
    includeData: false
  });

  // Load solutions when source environment changes
  useEffect(() => {
    if (sourceEnvironmentId) {
      loadSolutions(sourceEnvironmentId);
    } else {
      setAvailableSolutions([]);
      setSelectedSolution('');
    }
  }, [sourceEnvironmentId]);

  const loadSolutions = async (environmentId: string) => {
    setIsLoadingSolutions(true);
    try {
      const response = await fetch(`/api/cross-environment/solutions/${environmentId}`);
      const data = await response.json();
      
      if (response.ok) {
        setAvailableSolutions(data.solutions || []);
      } else {
        console.error('Failed to load solutions:', data.error);
        setAvailableSolutions([]);
      }
    } catch (error) {
      console.error('Error loading solutions:', error);
      setAvailableSolutions([]);
    } finally {
      setIsLoadingSolutions(false);
    }
  };

  const addTargetEnvironment = (environmentId: string) => {
    if (!targetEnvironmentIds.includes(environmentId) && environmentId !== sourceEnvironmentId) {
      setTargetEnvironmentIds([...targetEnvironmentIds, environmentId]);
    }
  };

  const removeTargetEnvironment = (environmentId: string) => {
    setTargetEnvironmentIds(targetEnvironmentIds.filter(id => id !== environmentId));
  };

  const moveTargetEnvironment = (fromIndex: number, toIndex: number) => {
    const newTargetEnvironments = [...targetEnvironmentIds];
    const [moved] = newTargetEnvironments.splice(fromIndex, 1);
    newTargetEnvironments.splice(toIndex, 0, moved);
    setTargetEnvironmentIds(newTargetEnvironments);
  };

  const executePipeline = async () => {
    if (!sourceEnvironmentId || !selectedSolution || targetEnvironmentIds.length === 0) {
      return;
    }

    setIsExecutingPipeline(true);
    setPipelineResults([]);
    setCurrentStep('Starting pipeline...');

    try {
      const pipelineConfig = {
        sourceEnvironmentId,
        targetEnvironmentIds,
        solutionName: selectedSolution,
        deploymentOptions,
        stopOnError: true
      };

      const response = await fetch('/api/cross-environment/pipeline', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(pipelineConfig)
      });

      const result = await response.json();

      if (response.ok) {
        setPipelineResults(result.pipelineResults || []);
        if (onPipelineComplete) {
          onPipelineComplete(result);
        }
      } else {
        console.error('Pipeline execution failed:', result.error);
        setPipelineResults(result.pipelineResults || []);
      }
    } catch (error) {
      console.error('Error executing pipeline:', error);
    } finally {
      setIsExecutingPipeline(false);
      setCurrentStep('');
    }
  };

  const getEnvironmentName = (environmentId: string) => {
    const env = environments.find(e => e.id === environmentId);
    return env?.name || environmentId;
  };

  const getEnvironment = (environmentId: string) => {
    return environments.find(e => e.id === environmentId);
  };

  const canExecutePipeline = sourceEnvironmentId && selectedSolution && targetEnvironmentIds.length > 0 && !isExecutingPipeline;

  return (
    <div className={styles.crossEnvironmentPipeline}>
      <div className={styles.header}>
        <h2>Cross-Environment Pipeline</h2>
        <p>Import solutions from one environment and deploy to multiple target environments</p>
      </div>

      {/* Source Environment Selection */}
      <div className={styles.section}>
        <h3>Source Environment</h3>
        <EnvironmentSelector
          environments={environments}
          selectedEnvironmentId={sourceEnvironmentId}
          onEnvironmentSelect={(env) => setSourceEnvironmentId(env.id)}
          label="Import from"
          placeholder="Select source environment..."
          showAddButton={false}
          showEditButton={false}
        />

        {/* Solution Selection */}
        {sourceEnvironmentId && (
          <div className={styles.solutionSelection}>
            <label className={styles.label}>Solution to Import</label>
            {isLoadingSolutions ? (
              <div className={styles.loading}>Loading solutions...</div>
            ) : (
              <select
                value={selectedSolution}
                onChange={(e) => setSelectedSolution(e.target.value)}
                className={styles.solutionSelect}
                disabled={availableSolutions.length === 0}
              >
                <option value="">Select a solution...</option>
                {availableSolutions.map(solution => (
                  <option key={solution.uniqueName} value={solution.uniqueName}>
                    {solution.displayName} (v{solution.version})
                  </option>
                ))}
              </select>
            )}
            {availableSolutions.length === 0 && !isLoadingSolutions && (
              <div className={styles.noSolutions}>No unmanaged solutions found in this environment</div>
            )}
          </div>
        )}
      </div>

      {/* Target Environments Selection */}
      <div className={styles.section}>
        <h3>Target Environments (Deployment Order)</h3>
        <div className={styles.targetEnvironments}>
          {targetEnvironmentIds.map((envId, index) => {
            const env = getEnvironment(envId);
            return (
              <div key={envId} className={styles.targetEnvironment}>
                <div className={styles.environmentOrder}>
                  <span className={styles.stepNumber}>{index + 1}</span>
                </div>
                <div className={styles.environmentInfo}>
                  <div className={styles.environmentName}>{env?.name || envId}</div>
                  <div className={styles.environmentUrl}>{env?.url}</div>
                </div>
                <div className={styles.environmentActions}>
                  <button
                    onClick={() => moveTargetEnvironment(index, Math.max(0, index - 1))}
                    disabled={index === 0}
                    className={styles.moveButton}
                    title="Move up"
                  >
                    ↑
                  </button>
                  <button
                    onClick={() => moveTargetEnvironment(index, Math.min(targetEnvironmentIds.length - 1, index + 1))}
                    disabled={index === targetEnvironmentIds.length - 1}
                    className={styles.moveButton}
                    title="Move down"
                  >
                    ↓
                  </button>
                  <button
                    onClick={() => removeTargetEnvironment(envId)}
                    className={styles.removeButton}
                    title="Remove"
                  >
                    ✕
                  </button>
                </div>
              </div>
            );
          })}

          <div className={styles.addTargetEnvironment}>
            <EnvironmentSelector
              environments={environments.filter(env => 
                env.id !== sourceEnvironmentId && !targetEnvironmentIds.includes(env.id)
              )}
              selectedEnvironmentId=""
              onEnvironmentSelect={(env) => addTargetEnvironment(env.id)}
              label=""
              placeholder="Add target environment..."
              showAddButton={false}
              showEditButton={false}
            />
          </div>
        </div>
      </div>

      {/* Deployment Options */}
      <div className={styles.section}>
        <h3>Deployment Options</h3>
        <div className={styles.options}>
          <label className={styles.checkboxLabel}>
            <input
              type="checkbox"
              checked={deploymentOptions.skipValidation}
              onChange={(e) => setDeploymentOptions({
                ...deploymentOptions,
                skipValidation: e.target.checked
              })}
            />
            Skip validation (faster deployment)
          </label>
          <label className={styles.checkboxLabel}>
            <input
              type="checkbox"
              checked={deploymentOptions.updateExisting}
              onChange={(e) => setDeploymentOptions({
                ...deploymentOptions,
                updateExisting: e.target.checked
              })}
            />
            Update existing entities
          </label>
          <label className={styles.checkboxLabel}>
            <input
              type="checkbox"
              checked={deploymentOptions.includeData}
              onChange={(e) => setDeploymentOptions({
                ...deploymentOptions,
                includeData: e.target.checked
              })}
            />
            Include sample data
          </label>
        </div>
      </div>

      {/* Pipeline Execution */}
      <div className={styles.section}>
        <button
          className={styles.executeButton}
          onClick={executePipeline}
          disabled={!canExecutePipeline}
        >
          {isExecutingPipeline ? 'Executing Pipeline...' : 'Execute Pipeline'}
        </button>

        {currentStep && (
          <div className={styles.currentStep}>
            {currentStep}
          </div>
        )}
      </div>

      {/* Pipeline Results */}
      {pipelineResults.length > 0 && (
        <div className={styles.section}>
          <h3>Pipeline Results</h3>
          <div className={styles.pipelineResults}>
            {pipelineResults.map((step, index) => (
              <div key={index} className={`${styles.pipelineStep} ${step.success ? styles.success : styles.failure}`}>
                <div className={styles.stepHeader}>
                  <span className={styles.stepIcon}>
                    {step.success ? '✅' : '❌'}
                  </span>
                  <span className={styles.stepTitle}>
                    {step.step === 'import' ? 'Import' : 'Deploy'}: {step.environmentName}
                  </span>
                  <span className={styles.stepTime}>
                    {new Date(step.timestamp).toLocaleTimeString()}
                  </span>
                </div>
                {step.error && (
                  <div className={styles.stepError}>
                    {step.error}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Operation Context Display */}
      {sourceEnvironmentId && targetEnvironmentIds.length > 0 && (
        <div className={styles.operationContext}>
          <EnvironmentContext
            operation={{
              type: 'deploy',
              sourceEnvironment: getEnvironment(sourceEnvironmentId)!,
              targetEnvironment: getEnvironment(targetEnvironmentIds[0]),
              description: `Pipeline: ${getEnvironmentName(sourceEnvironmentId)} → ${targetEnvironmentIds.map(id => getEnvironmentName(id)).join(' → ')}`
            }}
          />
        </div>
      )}
    </div>
  );
};