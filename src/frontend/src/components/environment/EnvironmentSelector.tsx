import React, { useState } from 'react';
import { DataverseEnvironment } from '../../../../shared/types/environment';
import styles from './EnvironmentSelector.module.css';

interface EnvironmentSelectorProps {
  environments: DataverseEnvironment[];
  selectedEnvironmentId?: string;
  onEnvironmentSelect: (environment: DataverseEnvironment) => void;
  onAddEnvironment?: () => void;
  onEditEnvironment?: (environment: DataverseEnvironment) => void;
  placeholder?: string;
  label?: string;
  disabled?: boolean;
  showAddButton?: boolean;
  showEditButton?: boolean;
}

export const EnvironmentSelector: React.FC<EnvironmentSelectorProps> = ({
  environments,
  selectedEnvironmentId,
  onEnvironmentSelect,
  onAddEnvironment,
  onEditEnvironment,
  placeholder = "Select an environment...",
  label = "Dataverse Environment",
  disabled = false,
  showAddButton = true,
  showEditButton = true
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  const selectedEnvironment = environments.find(env => env.id === selectedEnvironmentId);

  const filteredEnvironments = environments.filter(env =>
    env.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    env.url.toLowerCase().includes(searchTerm.toLowerCase()) ||
    env.description?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleEnvironmentSelect = (environment: DataverseEnvironment) => {
    onEnvironmentSelect(environment);
    setIsOpen(false);
    setSearchTerm('');
  };

  const getEnvironmentStatusIndicator = (env: DataverseEnvironment) => {
    if (!env.lastConnected) return '⚪'; // Never connected
    
    const hoursSinceLastConnection = (Date.now() - env.lastConnected.getTime()) / (1000 * 60 * 60);
    if (hoursSinceLastConnection < 1) return '🟢'; // Recently connected
    if (hoursSinceLastConnection < 24) return '🟡'; // Connected today
    return '🔴'; // Not recently connected
  };

  return (
    <div className={styles.environmentSelector}>
      <label className={styles.label}>{label}</label>
      
      <div className={styles.selectorContainer}>
        <div 
          className={`${styles.selectedEnvironment} ${disabled ? styles.disabled : ''}`}
          onClick={() => !disabled && setIsOpen(!isOpen)}
        >
          {selectedEnvironment ? (
            <div className={styles.environmentDisplay}>
              <div className={styles.environmentInfo}>
                <span 
                  className={styles.environmentDot}
                  style={{ 
                    backgroundColor: selectedEnvironment.color === 'red' ? '#dc2626' : 
                                   selectedEnvironment.color === 'green' ? '#16a34a' :
                                   selectedEnvironment.color === 'blue' ? '#2563eb' :
                                   selectedEnvironment.color === 'yellow' ? '#ca8a04' :
                                   selectedEnvironment.color === 'purple' ? '#9333ea' : '#6b7280'
                  }}
                />
                <div className={styles.environmentText}>
                  <div className={styles.environmentName}>
                    {selectedEnvironment.name}
                  </div>
                  <div className={styles.environmentUrl}>
                    {selectedEnvironment.url}
                  </div>
                </div>
              </div>
              <div className={styles.environmentActions}>
                {getEnvironmentStatusIndicator(selectedEnvironment)}
                <span className={styles.dropdownArrow}>
                  {isOpen ? '▲' : '▼'}
                </span>
              </div>
            </div>
          ) : (
            <div className={styles.placeholder}>
              {placeholder}
              <span className={styles.dropdownArrow}>▼</span>
            </div>
          )}
        </div>

        {isOpen && (
          <div className={styles.dropdown}>
            <div className={styles.searchContainer}>
              <input
                type="text"
                placeholder="Search environments..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className={styles.searchInput}
                autoFocus
              />
            </div>

            <div className={styles.environmentList}>
              {filteredEnvironments.length === 0 ? (
                <div className={styles.noResults}>
                  No environments found
                </div>
              ) : (
                filteredEnvironments.map(env => (
                  <div
                    key={env.id}
                    className={`${styles.environmentOption} ${
                      env.id === selectedEnvironmentId ? styles.selected : ''
                    }`}
                    onClick={() => handleEnvironmentSelect(env)}
                  >
                    <div className={styles.environmentInfo}>
                      <span 
                        className={styles.environmentDot}
                        style={{ 
                          backgroundColor: env.color === 'red' ? '#dc2626' : 
                                         env.color === 'green' ? '#16a34a' :
                                         env.color === 'blue' ? '#2563eb' :
                                         env.color === 'yellow' ? '#ca8a04' :
                                         env.color === 'purple' ? '#9333ea' : '#6b7280'
                        }}
                      />
                      <div className={styles.environmentText}>
                        <div className={styles.environmentName}>
                          {env.name}
                        </div>
                        <div className={styles.environmentUrl}>
                          {env.url}
                        </div>
                        {env.description && (
                          <div className={styles.environmentDescription}>
                            {env.description}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className={styles.environmentStatus}>
                      {getEnvironmentStatusIndicator(env)}
                      {showEditButton && onEditEnvironment && (
                        <button
                          className={styles.editButton}
                          onClick={(e) => {
                            e.stopPropagation();
                            onEditEnvironment(env);
                          }}
                          title="Edit environment"
                        >
                          ✏️
                        </button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>

            {showAddButton && onAddEnvironment && (
              <div className={styles.addEnvironmentContainer}>
                <button
                  className={styles.addEnvironmentButton}
                  onClick={onAddEnvironment}
                >
                  ➕ Add New Environment
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Click outside to close */}
      {isOpen && (
        <div 
          className={styles.overlay}
          onClick={() => setIsOpen(false)}
        />
      )}
    </div>
  );
};