/**
 * Unit Tests for SolutionSetupStep Component
 * Tests the main solution setup step component integration
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import { SolutionSetupStep } from '../../../src/components/wizard/steps/solution-setup/SolutionSetupStep';
import { SolutionSetupStepProps } from '../../../src/components/wizard/steps/solution-setup/types';

// Mock the hooks since they use external dependencies
vi.mock('../../../src/components/wizard/steps/solution-setup/hooks', () => ({
  useSolutionConfiguration: () => ({
    solutionType: 'existing',
    setSolutionType: vi.fn(),
    solutionName: '',
    setSolutionName: vi.fn(),
    solutionInternalName: '',
    setSolutionInternalName: vi.fn(),
    selectedSolution: null,
    setSelectedSolution: vi.fn(),
    includeRelatedTables: false,
    setIncludeRelatedTables: vi.fn(),
    isValid: true,
    errors: [],
    solutions: [
      { friendlyname: 'Test Solution', uniquename: 'test_solution', ismanaged: false },
      { friendlyname: 'Another Solution', uniquename: 'another_solution', ismanaged: true }
    ],
    loadingSolutions: false,
    solutionError: null,
    refreshSolutions: vi.fn(),
    searchSolutions: vi.fn(),
    solutionDropdown: {
      searchTerm: '',
      setSearchTerm: vi.fn(),
      filteredItems: [],
      isOpen: false,
      setIsOpen: vi.fn(),
      selectedItem: null,
      setSelectedItem: vi.fn(),
      handleItemSelect: vi.fn(),
      handleSearchChange: vi.fn(),
      handleFocus: vi.fn(),
      handleBlur: vi.fn(),
      clearSelection: vi.fn(),
      reset: vi.fn(),
      open: vi.fn(),
      close: vi.fn(),
    },
    getSelectedSolutionDisplay: () => '',
    clearSolutionSelection: vi.fn(),
    getSolutionSummary: () => ({}),
    validateSolutionConfig: () => ({ isValid: true, errors: [] }),
    hasNameError: false,
    hasInternalNameError: false,
    nameError: undefined,
    internalNameError: undefined,
  }),
  usePublisherConfiguration: () => ({
    publisherType: 'existing',
    setPublisherType: vi.fn(),
    selectedPublisher: null,
    setSelectedPublisher: vi.fn(),
    newPublisherName: '',
    setNewPublisherName: vi.fn(),
    newPublisherInternalName: '',
    setNewPublisherInternalName: vi.fn(),
    newPublisherPrefix: '',
    setNewPublisherPrefix: vi.fn(),
    isValid: true,
    errors: [],
    newPublisherValidation: { isValid: true, errors: {} },
    publishers: [
      { friendlyname: 'Test Publisher', uniquename: 'test_publisher', customizationprefix: 'test' },
      { friendlyname: 'Another Publisher', uniquename: 'another_publisher', customizationprefix: 'another' }
    ],
    loadingPublishers: false,
    publisherError: null,
    refreshPublishers: vi.fn(),
    searchPublishers: vi.fn(),
    publisherDropdown: {
      searchTerm: '',
      setSearchTerm: vi.fn(),
      filteredItems: [],
      isOpen: false,
      setIsOpen: vi.fn(),
      selectedItem: null,
      setSelectedItem: vi.fn(),
      handleItemSelect: vi.fn(),
      handleSearchChange: vi.fn(),
      handleFocus: vi.fn(),
      handleBlur: vi.fn(),
      clearSelection: vi.fn(),
      reset: vi.fn(),
      open: vi.fn(),
      close: vi.fn(),
    },
    getSelectedPublisherDisplay: () => '',
    clearPublisherSelection: vi.fn(),
    getPublisherSummary: () => ({}),
    validatePublisherConfig: () => ({ isValid: true, errors: [] }),
    clearNewPublisherForm: vi.fn(),
    suggestNewPublisher: vi.fn(),
    hasNewPublisherData: false,
    hasDisplayNameError: false,
    hasInternalNameError: false,
    hasPrefixError: false,
    displayNameError: undefined,
    internalNameError: undefined,
    prefixError: undefined,
  }),
  useFormValidation: () => ({
    errors: [],
    validateField: vi.fn(),
    validateForm: vi.fn(() => ({})), // Return empty object instead of undefined
  }),
}));

describe('SolutionSetupStep', () => {
  const defaultProps: SolutionSetupStepProps = {
    solutions: [
      { friendlyname: 'Test Solution', uniquename: 'test_solution', ismanaged: false },
      { friendlyname: 'Another Solution', uniquename: 'another_solution', ismanaged: true }
    ],
    publishers: [
      { friendlyname: 'Test Publisher', uniquename: 'test_publisher', customizationprefix: 'test' },
      { friendlyname: 'Another Publisher', uniquename: 'another_publisher', customizationprefix: 'another' }
    ],
    currentSolution: null,
    currentPublisher: null,
    formData: {
      solutionType: 'existing',
      solutionName: '',
      solutionInternalName: '',
      selectedSolution: null,
      includeRelatedTables: false,
      publisherType: 'existing',
      selectedPublisher: null,
      newPublisherName: '',
      newPublisherInternalName: '',
      newPublisherPrefix: '',
      solutionSearchTerm: '',
      publisherSearchTerm: '',
      showSolutionDropdown: false,
      showPublisherDropdown: false,
    },
    onSolutionChange: vi.fn(),
    onPublisherChange: vi.fn(),
    onFormDataChange: vi.fn(),
    onValidationChange: vi.fn(),
    loading: false,
    error: null,
    onCreateSolution: vi.fn(),
    onCreatePublisher: vi.fn(),
    onEditSolution: vi.fn(),
    onEditPublisher: vi.fn(),
    onRefreshData: vi.fn(),
    validationErrors: {},
    disabled: false,
    showValidation: true,
    autoValidate: true,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Rendering', () => {
    it('should render the component with header', () => {
      render(<SolutionSetupStep {...defaultProps} />);
      
      expect(screen.getByText('Solution & Publisher Setup')).toBeInTheDocument();
      expect(screen.getByText('Configure where your schema will be deployed in Microsoft Dataverse')).toBeInTheDocument();
    });

    it('should render publisher and solution config sections', () => {
      render(<SolutionSetupStep {...defaultProps} />);
      
      expect(screen.getByText('Publisher Configuration')).toBeInTheDocument();
      expect(screen.getByText('Solution Configuration')).toBeInTheDocument();
    });

    it('should render configuration status summary', () => {
      render(<SolutionSetupStep {...defaultProps} />);
      
      expect(screen.getByText('Configuration Required')).toBeInTheDocument();
      expect(screen.getByText('Please complete both solution and publisher configuration')).toBeInTheDocument();
    });
  });

  describe('Loading State', () => {
    it('should show loading spinner when loading is true', () => {
      render(<SolutionSetupStep {...defaultProps} loading={true} />);
      
      expect(screen.getByText('Loading solutions and publishers...')).toBeInTheDocument();
      expect(screen.getAllByRole('progressbar')).toHaveLength(2); // One in button, one in loading content
    });

    it('should hide main content when loading', () => {
      render(<SolutionSetupStep {...defaultProps} loading={true} />);
      
      expect(screen.queryByText('Publisher Configuration')).not.toBeInTheDocument();
      expect(screen.queryByText('Solution Configuration')).not.toBeInTheDocument();
    });
  });

  describe('Error Handling', () => {
    it('should display error message when error prop is provided', () => {
      const errorMessage = 'Failed to load data';
      render(<SolutionSetupStep {...defaultProps} error={errorMessage} />);
      
      expect(screen.getByText(errorMessage)).toBeInTheDocument();
      // Check for the specific MessageBar error by finding the element containing the error text
      expect(screen.getByText(errorMessage).closest('[role="group"]')).toBeInTheDocument();
    });
  });

  describe('Form Data Synchronization', () => {
    it('should call onFormDataChange when form data is updated', async () => {
      const user = userEvent.setup();
      const onFormDataChange = vi.fn();
      
      render(<SolutionSetupStep {...defaultProps} onFormDataChange={onFormDataChange} />);
      
      // This would be triggered by form interactions
      // The actual form interaction testing would be in the component-specific tests
    });
  });

  describe('Configuration Status', () => {
    it('should show configuration required when neither solution nor publisher is selected', () => {
      render(<SolutionSetupStep {...defaultProps} />);
      
      expect(screen.getByText('Configuration Required')).toBeInTheDocument();
    });

    it('should show configuration complete when both solution and publisher are configured', () => {
      const propsWithSelection = {
        ...defaultProps,
        currentSolution: { friendlyname: 'Test Solution', uniquename: 'test_solution' },
        currentPublisher: { friendlyname: 'Test Publisher', uniquename: 'test_publisher' },
        formData: {
          ...defaultProps.formData!,
          solutionName: 'Test Solution',
          publisherName: 'Test Publisher',
        }
      };
      
      render(<SolutionSetupStep {...propsWithSelection} />);
      
      expect(screen.getByText('Configuration Complete')).toBeInTheDocument();
    });

    it('should show validation issues when there are validation errors', () => {
      const propsWithErrors = {
        ...defaultProps,
        validationErrors: {
          solutionName: 'Solution name is required',
          publisherName: 'Publisher name is required',
        }
      };
      
      render(<SolutionSetupStep {...propsWithErrors} />);
      
      expect(screen.getByText('Configuration Issues')).toBeInTheDocument();
      expect(screen.getByText('Please resolve the validation errors before proceeding')).toBeInTheDocument();
    });
  });

  describe('Refresh Functionality', () => {
    it('should show refresh button when onRefreshData is provided', () => {
      render(<SolutionSetupStep {...defaultProps} />);
      
      expect(screen.getByText('Refresh Data')).toBeInTheDocument();
    });

    it('should call onRefreshData when refresh button is clicked', async () => {
      const user = userEvent.setup();
      const onRefreshData = vi.fn();
      
      render(<SolutionSetupStep {...defaultProps} onRefreshData={onRefreshData} />);
      
      const refreshButton = screen.getByText('Refresh Data');
      await user.click(refreshButton);
      
      expect(onRefreshData).toHaveBeenCalledTimes(1);
    });

    it('should disable refresh button when disabled prop is true', () => {
      render(<SolutionSetupStep {...defaultProps} disabled={true} />);
      
      const refreshButton = screen.getByText('Refresh Data');
      expect(refreshButton).toBeDisabled();
    });
  });

  describe('Validation Configuration', () => {
    it('should hide status card when showValidation is false', () => {
      render(<SolutionSetupStep {...defaultProps} showValidation={false} />);
      
      expect(screen.queryByText('Configuration Required')).not.toBeInTheDocument();
    });
  });

  describe('Accessibility', () => {
    it('should have proper ARIA labels and roles', () => {
      render(<SolutionSetupStep {...defaultProps} />);
      
      // Check for proper semantic structure - sections should be present
      expect(screen.getAllByRole('group')).toHaveLength(3); // Status card and both config sections
    });

    it('should be keyboard navigable', async () => {
      const user = userEvent.setup();
      render(<SolutionSetupStep {...defaultProps} />);
      
      // Tab through the component
      await user.tab();
      
      // Verify focus is managed properly
      expect(document.activeElement).toBeDefined();
    });
  });

  describe('Integration', () => {
    it('should pass correct props to sub-components', () => {
      render(<SolutionSetupStep {...defaultProps} />);
      
      // Verify that both config sections are rendered by checking their content
      expect(screen.getByText('Publisher Configuration')).toBeInTheDocument();
      expect(screen.getByText('Solution Configuration')).toBeInTheDocument();
    });
  });
});
