import React from 'react';
import { Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import { 
  Title1,
  Title2,
  Text,
  ProgressBar,
  tokens,
  Badge
} from '@fluentui/react-components';
import { ChevronRightRegular } from '@fluentui/react-icons';
import { FileUploadStep } from './steps/FileUploadStep';
import { SolutionSetupStep } from './steps/SolutionSetupStep';
import { GlobalChoicesStep } from './steps/GlobalChoicesStep';
import { DeploymentStep } from './steps/DeploymentStep';
import { WizardProvider } from '../../context/WizardContext';

export const WizardShell: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  
  // Determine current step based on route
  const getCurrentStep = () => {
    const path = location.pathname;
    if (path.includes('solution-setup')) return 2;
    if (path.includes('global-choices')) return 3;
    if (path.includes('deploy')) return 4;
    return 1;
  };

  const currentStep = getCurrentStep();
  const totalSteps = 4;

  const handleNext = () => {
    if (currentStep === 1) {
      navigate('solution-setup');
    } else if (currentStep === 2) {
      navigate('global-choices');
    } else if (currentStep === 3) {
      navigate('deploy');
    }
  };

  const handlePrevious = () => {
    if (currentStep === 2) {
      navigate('/wizard');
    } else if (currentStep === 3) {
      navigate('solution-setup');
    } else if (currentStep === 4) {
      navigate('global-choices');
    }
  };

  return (
    <WizardProvider>
      <div data-testid="wizard-container" style={{
        minHeight: '100vh',
        backgroundColor: tokens.colorNeutralBackground1,
      }}>
        {/* Blue Header Section */}
        <div style={{
          backgroundColor: tokens.colorBrandBackground,
          color: tokens.colorNeutralForegroundOnBrand,
          padding: '32px 24px',
          textAlign: 'center',
        }}>
          <div style={{
            maxWidth: '1000px',
            margin: '0 auto',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
          }}>
            <Title1 style={{ 
              color: tokens.colorNeutralForegroundOnBrand 
            }}>
              Mermaid to Dataverse Converter
            </Title1>
            <Text size={400} style={{ 
              color: tokens.colorNeutralForegroundOnBrand,
              opacity: 0.9
            }}>
              Transform your Mermaid ERD diagrams into Microsoft Dataverse solutions
            </Text>
          </div>
        </div>

        <div style={{
          maxWidth: '1000px',
          margin: '0 auto',
          paddingLeft: '24px',
          paddingRight: '24px',
          paddingTop: '32px',
          paddingBottom: '40px'
        }}>
          {/* Progress Section */}
          <div style={{ marginBottom: '32px' }}>
            <div style={{ 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'space-between',
              marginBottom: '16px' 
            }}>
              <Title2>Conversion Process</Title2>
              <Badge 
                appearance="filled" 
                color="brand"
              >
                Step {currentStep} of {totalSteps}
              </Badge>
            </div>
            
            <ProgressBar 
              value={currentStep / totalSteps} 
              style={{ marginBottom: '16px' }}
            />
            
            <div style={{ 
              display: 'flex', 
              gap: '12px', 
              alignItems: 'center',
              fontSize: '14px',
              color: tokens.colorNeutralForeground2
            }}>
              <Badge data-testid="step-1" appearance={currentStep >= 1 ? "filled" : "outline"} color="brand">1</Badge>
              <Text size={300}>File Upload</Text>
              <ChevronRightRegular />
              <Badge data-testid="step-2" appearance={currentStep >= 2 ? "filled" : "outline"} color="brand">2</Badge>
              <Text size={300}>Solution & Publisher</Text>
              <ChevronRightRegular />
              <Badge data-testid="step-3" appearance={currentStep >= 3 ? "filled" : "outline"} color="brand">3</Badge>
              <Text size={300}>Global Choices</Text>
              <ChevronRightRegular />
              <Badge data-testid="step-4" appearance={currentStep >= 4 ? "filled" : "outline"} color="brand">4</Badge>
              <Text size={300}>Deployment Summary</Text>
            </div>
          </div>

          {/* Main Content */}
          <div data-testid="wizard-content" style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '24px',
          }}>
            <Routes>
              <Route index element={<div data-testid="step-1-content"><FileUploadStep onNext={handleNext} /></div>} />
              <Route path="solution-setup" element={<div data-testid="step-2-content"><SolutionSetupStep onNext={handleNext} onPrevious={handlePrevious} /></div>} />
              <Route path="global-choices" element={<div data-testid="step-3-content"><GlobalChoicesStep onNext={handleNext} onPrevious={handlePrevious} /></div>} />
              <Route path="deploy" element={<div data-testid="step-4-content"><DeploymentStep onPrevious={handlePrevious} /></div>} />
            </Routes>
          </div>
        </div>
      </div>
    </WizardProvider>
  );
};
