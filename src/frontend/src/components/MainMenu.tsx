import React from 'react';
import {
  Card,
  CardHeader,
  CardPreview,
  Text,
  Button,
  tokens,
  Badge,
} from '@fluentui/react-components';
import { 
  ArrowUploadRegular,
  ArrowUndoRegular,
  ArrowDownloadRegular,
  DatabaseRegular,
  DocumentRegular,
  ChevronRightRegular
} from '@fluentui/react-icons';
import { useNavigate } from 'react-router-dom';

export const MainMenu: React.FC = () => {
  const navigate = useNavigate();

  const menuItems = [
    {
      id: 'deploy',
      title: 'Deploy Solution',
      subtitle: 'Mermaid ERD → Dataverse',
      description: 'Convert your Mermaid ERD diagrams into Dataverse solutions with entities, attributes, and relationships.',
      icon: <ArrowUploadRegular fontSize={32} />,
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
      id: 'rollback',
      title: 'Rollback Solution',
      subtitle: 'Undo Deployment',
      description: 'Safely rollback previously deployed solutions with automatic dependency checking and data preservation.',
      icon: <ArrowUndoRegular fontSize={32} />,
      color: tokens.colorPaletteOrangeForeground1,
      backgroundColor: tokens.colorPaletteOrangeBackground3,
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
    navigate(route);
  };

  return (
    <div style={{
      padding: '32px 24px',
      maxWidth: '1200px',
      margin: '0 auto',
      minHeight: '100vh',
      backgroundColor: tokens.colorNeutralBackground1
    }}>
      {/* Header */}
      <div style={{ 
        textAlign: 'center', 
        marginBottom: '48px',
        padding: '24px 0'
      }}>
        <div style={{ 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'center', 
          gap: '12px',
          marginBottom: '16px'
        }}>
          <DatabaseRegular fontSize={40} style={{ color: tokens.colorBrandBackground }} />
          <Text size={900} weight="bold" style={{ color: tokens.colorNeutralForeground1 }}>
            Mermaid ↔ Dataverse Converter
          </Text>
        </div>
        
        <Text size={400} style={{ 
          color: tokens.colorNeutralForeground2,
          maxWidth: '600px',
          margin: '0 auto',
          lineHeight: '1.5'
        }}>
          Convert between Mermaid ERD diagrams and Microsoft Dataverse solutions. 
          Deploy new solutions, document existing ones, or safely rollback changes.
        </Text>
      </div>

      {/* Menu Cards */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))',
        gap: '24px',
        marginBottom: '32px'
      }}>
        {menuItems.map((item) => (
          <Card
            key={item.id}
            appearance="outline"
            style={{
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              border: `1px solid ${tokens.colorNeutralStroke1}`,
              '&:hover': {
                transform: 'translateY(-2px)',
                boxShadow: tokens.shadow8
              }
            }}
            onClick={() => handleNavigate(item.route)}
          >
            <CardHeader
              header={
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div style={{
                    padding: '12px',
                    borderRadius: '8px',
                    backgroundColor: item.backgroundColor,
                    color: item.color
                  }}>
                    {item.icon}
                  </div>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                      <Text weight="semibold" size={500}>
                        {item.title}
                      </Text>
                      <ChevronRightRegular fontSize={16} style={{ color: tokens.colorNeutralForeground3 }} />
                    </div>
                    <Text size={300} style={{ color: tokens.colorNeutralForeground2 }}>
                      {item.subtitle}
                    </Text>
                  </div>
                </div>
              }
            />
            <CardPreview style={{ padding: '16px 24px' }}>
              <div style={{ marginBottom: '16px' }}>
                <Text size={300} style={{ 
                  color: tokens.colorNeutralForeground2,
                  lineHeight: '1.4'
                }}>
                  {item.description}
                </Text>
              </div>

              {/* Badges */}
              <div style={{ 
                display: 'flex', 
                gap: '6px', 
                marginBottom: '16px',
                flexWrap: 'wrap'
              }}>
                {item.badges.map((badge, index) => (
                  <Badge 
                    key={index}
                    appearance={badge === 'BETA' || badge === 'New' ? 'filled' : 'tint'}
                    color={badge === 'BETA' || badge === 'New' ? 'brand' : 'success'}
                    size="small"
                  >
                    {badge}
                  </Badge>
                ))}
              </div>

              {/* Features */}
              <div>
                <Text size={200} weight="semibold" style={{ 
                  marginBottom: '8px', 
                  display: 'block',
                  color: tokens.colorNeutralForeground1
                }}>
                  Key Features:
                </Text>
                <div style={{ 
                  display: 'grid', 
                  gridTemplateColumns: '1fr 1fr',
                  gap: '4px'
                }}>
                  {item.features.map((feature, index) => (
                    <Text key={index} size={200} style={{ 
                      color: tokens.colorNeutralForeground3,
                      fontSize: '12px'
                    }}>
                      • {feature}
                    </Text>
                  ))}
                </div>
              </div>

              {/* Call to Action */}
              <div style={{ marginTop: '20px' }}>
                <Button 
                  appearance="primary"
                  icon={<ChevronRightRegular />}
                  iconPosition="after"
                  onClick={() => handleNavigate(item.route)}
                  style={{ width: '100%' }}
                >
                  {item.id === 'deploy' ? 'Start Conversion' : 
                   item.id === 'reverse' ? 'Extract Solution' : 
                   'View History'}
                </Button>
              </div>
            </CardPreview>
          </Card>
        ))}
      </div>

      {/* Footer Info */}
      <div style={{
        textAlign: 'center',
        padding: '24px',
        borderTop: `1px solid ${tokens.colorNeutralStroke2}`,
        marginTop: '32px'
      }}>
        <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>
          Powered by Microsoft Dataverse Web API • Azure Managed Identity • Mermaid.js
        </Text>
      </div>
    </div>
  );
};