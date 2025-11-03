import React from 'react';
import {
  Card,
  Text,
  Button,
  tokens,
  Badge,
  MessageBar,
  MessageBarBody,
} from '@fluentui/react-components';
import { 
  DatabaseRegular,
  ChevronRightRegular,
  WarningRegular,
  DataTrending24Filled,
  Search24Filled,
  DocumentEdit24Filled,
  CloudArrowUp24Filled,
  ArrowUndo24Filled
} from '@fluentui/react-icons';
import { useNavigate } from 'react-router-dom';
import { useDeploymentContext } from '../context/DeploymentContext';

export const MainMenu: React.FC = () => {
  const navigate = useNavigate();
  const { blockNavigation, isDeploymentActive, isRollbackActive } = useDeploymentContext();

  const menuItems = [
    {
      id: 'deploy',
      title: 'Deploy Solution',
      subtitle: 'Mermaid ERD → Dataverse',
      description: 'Convert your Mermaid ERD diagrams into Dataverse solutions with entities, attributes, and relationships.',
      icon: <CloudArrowUp24Filled fontSize={32} />,
      color: tokens.colorPaletteGreenForeground1,
      backgroundColor: tokens.colorPaletteGreenBackground3,
      route: '/wizard',
      badges: ['Production Ready', 'Validated'],
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
      icon: <DataTrending24Filled fontSize={32} />,
      color: tokens.colorPaletteBlueForeground2,
      backgroundColor: tokens.colorPaletteBlueBackground2,
      route: '/analytics',
      badges: ['New', 'Phase-1'],
      features: [
        'Deployment trends',
        'Success rate analysis',
        'Rollback frequency',
        'Interactive charts'
      ]
    },
    {
      id: 'search',
      title: 'Enhanced Search',
      subtitle: 'Find Deployments',
      description: 'Search and filter deployment history with advanced filtering by status, environment, date ranges, and more.',
      icon: <Search24Filled fontSize={32} />,
      color: tokens.colorPalettePurpleForeground2,
      backgroundColor: tokens.colorPalettePurpleBackground2,
      route: '/search',
      badges: ['New', 'Phase-1'],
      features: [
        'Advanced filtering',
        'Date range search',
        'Environment filtering',
        'Status tracking'
      ]
    },
    {
      id: 'templates',
      title: 'Template Management',
      subtitle: 'Reusable ERDs',
      description: 'Create, manage, and share reusable ERD templates for faster deployment and standardized patterns.',
      icon: <DocumentEdit24Filled fontSize={32} />,
      color: tokens.colorPaletteTealForeground2,
      backgroundColor: tokens.colorPaletteTealBackground2,
      route: '/templates',
      badges: ['New', 'Phase-1'],
      features: [
        'Template library',
        'Quick deployment',
        'Version control',
        'Share templates'
      ]
    },
    {
      id: 'rollback',
      title: 'Rollback Solution',
      subtitle: 'Undo Deployment',
      description: 'Safely rollback previously deployed solutions with automatic dependency checking and data preservation.',
      icon: <ArrowUndo24Filled fontSize={32} />,
      color: tokens.colorPaletteDarkOrangeForeground1,
      backgroundColor: tokens.colorPaletteDarkOrangeBackground3,
      route: '/rollback',
      badges: ['Enterprise', 'Safe'],
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
      padding: '40px 32px',
      maxWidth: '1400px',
      margin: '0 auto',
      minHeight: '100vh',
      background: `linear-gradient(135deg, ${tokens.colorBrandBackground2} 0%, ${tokens.colorNeutralBackground1} 100%)`,
    }}>
      {/* Active Operation Warning */}
      {blockNavigation && (
        <div style={{ marginBottom: '32px' }}>
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

      {/* Hero Header */}
      <div style={{
        textAlign: 'center',
        marginBottom: '48px',
        padding: '32px',
        background: `linear-gradient(135deg, ${tokens.colorBrandBackground} 0%, ${tokens.colorBrandBackground2} 100%)`,
        borderRadius: tokens.borderRadiusXLarge,
        color: tokens.colorNeutralForegroundOnBrand,
        boxShadow: tokens.shadow16,
      }}>
        <div style={{
          fontSize: '48px',
          marginBottom: '16px',
        }}>
          🧬
        </div>
        <Text 
          as="h1" 
          size={900} 
          weight="bold"
          style={{ 
            marginBottom: '12px',
            color: tokens.colorNeutralForegroundOnBrand,
          }}
        >
          Mermaid ↔ Dataverse Converter
        </Text>
        <Text size={400} style={{ 
          opacity: 0.9,
          lineHeight: '1.5'
        }}>
          Convert between Mermaid ERD diagrams and Microsoft Dataverse solutions. Deploy new solutions, document existing ones, or safely rollback changes.
        </Text>
      </div>

      {/* Feature Cards Grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))',
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
              background: tokens.colorNeutralBackground1,
              border: `1px solid ${tokens.colorNeutralStroke2}`,
              borderRadius: tokens.borderRadiusXLarge,
              boxShadow: tokens.shadow8,
              position: 'relative',
              overflow: 'hidden',
            }}
            onMouseEnter={(e) => {
              if (!blockNavigation) {
                e.currentTarget.style.transform = 'translateY(-4px)';
                e.currentTarget.style.boxShadow = tokens.shadow16;
              }
            }}
            onMouseLeave={(e) => {
              if (!blockNavigation) {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = tokens.shadow8;
              }
            }}
          >
            {/* Gradient Background Accent */}
            <div style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              height: '4px',
              background: `linear-gradient(90deg, ${item.color}, ${item.backgroundColor})`,
            }} />
            
            {/* Card Content */}
            <div style={{ padding: '32px' }}>
              {/* Header Section */}
              <div style={{ 
                display: 'flex', 
                alignItems: 'flex-start', 
                gap: '20px',
                marginBottom: '24px'
              }}>
                <div style={{
                  padding: '16px',
                  borderRadius: tokens.borderRadiusLarge,
                  background: `linear-gradient(135deg, ${item.backgroundColor}, ${item.color}20)`,
                  color: item.color,
                  boxShadow: tokens.shadow4,
                  flexShrink: 0,
                }}>
                  {item.icon}
                </div>
                
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    gap: '12px', 
                    marginBottom: '8px' 
                  }}>
                    <Text size={600} weight="semibold" style={{
                      color: tokens.colorNeutralForeground1,
                    }}>
                      {item.title}
                    </Text>
                    <ChevronRightRegular 
                      fontSize={18} 
                      style={{ 
                        color: tokens.colorNeutralForeground3,
                        transition: 'transform 0.2s ease'
                      }} 
                    />
                  </div>
                  <Text size={300} style={{ 
                    color: tokens.colorBrandForeground1,
                    fontWeight: '500'
                  }}>
                    {item.subtitle}
                  </Text>
                </div>
              </div>

              {/* Description */}
              <Text size={300} style={{ 
                color: tokens.colorNeutralForeground2,
                lineHeight: '1.6',
                marginBottom: '20px',
                display: 'block'
              }}>
                {item.description}
              </Text>

              {/* Badges */}
              <div style={{ 
                display: 'flex', 
                gap: '8px', 
                marginBottom: '24px',
                flexWrap: 'wrap'
              }}>
                {item.badges.map((badge, index) => (
                  <Badge 
                    key={index}
                    appearance="filled"
                    color={badge === 'New' || badge === 'Phase-1' ? 'brand' : 
                          badge === 'BETA' ? 'important' : 'success'}
                    size="small"
                    style={{
                      borderRadius: tokens.borderRadiusMedium,
                      fontWeight: '600',
                      textTransform: 'uppercase',
                      fontSize: '10px',
                      letterSpacing: '0.5px'
                    }}
                  >
                    {badge}
                  </Badge>
                ))}
              </div>

              {/* Features Grid */}
              <div style={{ marginBottom: '28px' }}>
                <Text size={200} weight="semibold" style={{ 
                  marginBottom: '12px', 
                  display: 'block',
                  color: tokens.colorNeutralForeground1,
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px',
                  fontSize: '11px'
                }}>
                  Key Features
                </Text>
                <div style={{ 
                  display: 'grid', 
                  gridTemplateColumns: '1fr 1fr',
                  gap: '8px'
                }}>
                  {item.features.map((feature, index) => (
                    <div key={index} style={{ 
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px'
                    }}>
                      <div style={{
                        width: '4px',
                        height: '4px',
                        borderRadius: '50%',
                        backgroundColor: item.color,
                        flexShrink: 0
                      }} />
                      <Text size={200} style={{ 
                        color: tokens.colorNeutralForeground2,
                        fontSize: '12px',
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
                size="large"
                icon={<ChevronRightRegular />}
                iconPosition="after"
                onClick={() => handleNavigate(item.route)}
                disabled={blockNavigation}
                style={{ 
                  width: '100%',
                  borderRadius: tokens.borderRadiusMedium,
                  fontWeight: '600',
                  height: '48px',
                  background: `linear-gradient(135deg, ${item.color}, ${item.backgroundColor})`,
                  border: 'none',
                  boxShadow: tokens.shadow4
                }}
              >
                {item.id === 'deploy' ? 'Start Conversion' : 
                 item.id === 'analytics' ? 'View Analytics' :
                 item.id === 'search' ? 'Search Deployments' :
                 item.id === 'templates' ? 'Manage Templates' :
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
        padding: '32px',
        background: tokens.colorNeutralBackground2,
        borderRadius: tokens.borderRadiusLarge,
        border: `1px solid ${tokens.colorNeutralStroke2}`,
      }}>
        <Text size={300} style={{ 
          color: tokens.colorNeutralForeground2,
          marginBottom: '8px',
          display: 'block'
        }}>
          Powered by Microsoft Dataverse Web API • Azure Managed Identity • Mermaid.js
        </Text>
        <Text size={200} style={{ 
          color: tokens.colorNeutralForeground3, 
          fontSize: '11px',
          opacity: 0.7
        }}>
          Build: {import.meta.env.VITE_BUILD_TIME || 'Dev'} • Version 2.2.2
        </Text>
      </div>
    </div>
  );
};