import React from 'react';
import {
  Card,
  Text,
  Button,
  tokens,
  MessageBar,
  MessageBarBody,
} from '@fluentui/react-components';
import { 
  ChevronRightRegular,
  WarningRegular,
} from '@fluentui/react-icons';
import { useNavigate } from 'react-router-dom';
import { useDeploymentContext } from '../context/DeploymentContext';
import { ThemeToggle } from './common/ThemeToggle';

export const MainMenu: React.FC = () => {
  const navigate = useNavigate();
  const { blockNavigation, isDeploymentActive, isRollbackActive } = useDeploymentContext();

  const menuItems = [
    {
      id: 'deploy',
      title: 'Deploy Solution',
      subtitle: 'Mermaid ERD → Dataverse',
      description: 'Convert your Mermaid ERD diagrams into Dataverse solutions with entities, attributes, and relationships.',
      color: tokens.colorPaletteGreenForeground1,
      backgroundColor: tokens.colorPaletteGreenBackground3,
      route: '/wizard',
      features: [
        'Auto-validation and correction',
        'CDM entity detection',
        'Relationship mapping',
        'Real-time preview'
      ]
    },
    {
      id: 'analytics',
      title: 'Analytics Dashboard',
      subtitle: 'Deployment Insights',
      description: 'Visualize deployment trends, success rates, and performance metrics with interactive charts and statistics.',
      color: tokens.colorPaletteBlueForeground2,
      backgroundColor: tokens.colorPaletteBlueBackground2,
      route: '/analytics',
      features: [
        'Deployment trends',
        'Success rate analysis',
        'Rollback frequency',
        'Interactive charts'
      ]
    },
    {
      id: 'rollback',
      title: 'Rollback Solution',
      subtitle: 'Undo Deployment',
      description: 'Safely rollback previously deployed solutions with automatic dependency checking and data preservation.',
      color: tokens.colorPaletteDarkOrangeForeground1,
      backgroundColor: tokens.colorPaletteDarkOrangeBackground3,
      route: '/deployment-history',
      features: [
        'Deployment history',
        'Preview changes',
        'Data preservation',
        'Dependency analysis'
      ]
    }
  ];

  const handleNavigate = (route: string) => {
    if (blockNavigation) {
      return; // Prevent navigation during active operations
    }
    navigate(route);
  };

  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: 'var(--color-background)',
      color: 'var(--color-text-primary)',
    }}>
      {/* Active Operation Warning */}
      {blockNavigation && (
        <div style={{ 
          position: 'absolute',
          top: '16px',
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 1000,
          width: 'calc(100% - 32px)',
          maxWidth: '800px'
        }}>
          <MessageBar intent="warning">
            <MessageBarBody>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <WarningRegular />
                {isDeploymentActive && "Deployment in progress - Please wait for completion before navigating"}
                {isRollbackActive && "Rollback in progress - Please wait for completion before navigating"}
              </div>
            </MessageBarBody>
          </MessageBar>
        </div>
      )}

      {/* Header Section with flat background like wizard page */}
      <header style={{
        backgroundColor: 'var(--color-banner-background)',
        color: 'var(--color-banner-text)',
        padding: '32px 24px',
        textAlign: 'center',
        position: 'relative',
      }}>
        {/* Theme Toggle in top-right corner */}
        <div style={{
          position: 'absolute',
          top: '16px',
          right: '24px',
          display: 'flex',
          gap: '12px',
          alignItems: 'center',
        }}>
          <ThemeToggle />
        </div>
        
        <div style={{
          maxWidth: '1000px',
          margin: '0 auto',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
        }}>
          <Text 
            as="h1" 
            size={900} 
            weight="bold"
            style={{ 
              color: 'var(--color-banner-text)'
            }}
          >
            Mermaid ↔ Dataverse Converter
          </Text>
          <Text size={400} style={{ 
            color: 'var(--color-banner-text-secondary)'
          }}>
            Convert between Mermaid ERD diagrams and Microsoft Dataverse solutions. Deploy new solutions, document existing ones, or safely rollback changes.
          </Text>
        </div>
      </header>

      <main style={{
        maxWidth: '1000px',
        margin: '0 auto',
        paddingLeft: '24px',
        paddingRight: '24px',
        paddingTop: '32px',
        paddingBottom: '40px'
      }}>
        {/* Feature Cards Grid */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
          gap: '24px',
          marginBottom: '48px'
        }}>
          {menuItems.map((item) => (
            <Card 
              key={item.id}
              style={{
                cursor: blockNavigation ? 'not-allowed' : 'pointer',
                opacity: blockNavigation ? 0.6 : 1,
                transition: 'all 0.3s ease',
                background: 'var(--color-surface)',
                border: `1px solid var(--color-border)`,
                borderRadius: tokens.borderRadiusLarge,
                boxShadow: tokens.shadow4,
              }}
              onMouseEnter={(e) => {
                if (!blockNavigation) {
                  e.currentTarget.style.transform = 'translateY(-2px)';
                  e.currentTarget.style.boxShadow = tokens.shadow8;
                }
              }}
              onMouseLeave={(e) => {
                if (!blockNavigation) {
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = tokens.shadow4;
                }
              }}
              onClick={() => handleNavigate(item.route)}
            >
              {/* Card Content */}
              <div style={{ padding: '24px' }}>
                {/* Header Section */}
                <div style={{ 
                  marginBottom: '16px'
                }}>
                  <div style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    gap: '8px', 
                    marginBottom: '4px' 
                  }}>
                    <Text size={500} weight="semibold" style={{
                      color: 'var(--color-text-primary)',
                    }}>
                      {item.title}
                    </Text>
                    <ChevronRightRegular 
                      fontSize={16} 
                      style={{ 
                        color: 'var(--color-text-secondary)',
                        transition: 'transform 0.2s ease'
                      }} 
                    />
                  </div>
                  <Text size={300} style={{ 
                    color: 'var(--color-primary)',
                    fontWeight: '500'
                  }}>
                    {item.subtitle}
                  </Text>
                </div>

                {/* Description */}
                <Text size={300} style={{ 
                  color: 'var(--color-text-secondary)',
                  lineHeight: '1.5',
                  marginBottom: '16px',
                  display: 'block'
                }}>
                  {item.description}
                </Text>

                {/* Features List */}
                <div style={{ marginBottom: '20px' }}>
                  <div style={{ 
                    display: 'grid', 
                    gridTemplateColumns: '1fr 1fr',
                    gap: '6px'
                  }}>
                    {item.features.map((feature, index) => (
                      <div key={index} style={{ 
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px'
                      }}>
                        <div style={{
                          width: '3px',
                          height: '3px',
                          borderRadius: '50%',
                          backgroundColor: 'var(--color-primary)',
                          flexShrink: 0
                        }} />
                        <Text size={200} style={{ 
                          color: 'var(--color-text-secondary)',
                          fontSize: '11px',
                          lineHeight: '1.4'
                        }}>
                          {feature}
                        </Text>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Action Button */}
                <Button 
                  appearance="primary"
                  size="medium"
                  icon={<ChevronRightRegular />}
                  iconPosition="after"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleNavigate(item.route);
                  }}
                  disabled={blockNavigation}
                  style={{ 
                    width: '100%',
                    borderRadius: tokens.borderRadiusMedium,
                  }}
                >
                  {item.id === 'deploy' ? 'Start Conversion' : 
                   item.id === 'analytics' ? 'View Analytics' :
                   item.id === 'rollback' ? 'View History' : 
                   'Open'}
                </Button>
              </div>
            </Card>
          ))}
        </div>

        {/* Footer */}
        <div style={{
          textAlign: 'center',
          padding: '24px',
          background: 'var(--color-surface-secondary)',
          borderRadius: tokens.borderRadiusLarge,
          border: `1px solid var(--color-border)`,
        }}>
          <Text size={300} style={{ 
            color: 'var(--color-text-secondary)',
            marginBottom: '8px',
            display: 'block',
            textAlign: 'center'
          }}>
            Copyright 2025 | Built with 💖 by{' '}
            <a 
              href="https://linkedin.com/in/luisefreese" 
              target="_blank" 
              rel="noopener noreferrer"
              style={{
                color: 'var(--color-primary)',
                textDecoration: 'none',
                fontWeight: '500'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.textDecoration = 'underline';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.textDecoration = 'none';
              }}
            >
              Luise Freese
            </a>
          </Text>
          <Text size={200} style={{ 
            color: 'var(--color-text-tertiary)', 
            fontSize: '11px',
            opacity: 0.7,
            textAlign: 'center'
          }}>
            Build: {import.meta.env.VITE_BUILD_TIME || 'Dev'} • Version 2.2.2
          </Text>
        </div>
      </main>
    </div>
  );
};