import React, { useState, useEffect } from 'react';
import {
  makeStyles,
  shorthands,
  tokens,
  Card,
  Text,
  Title1,
  Title2,
  Title3,
  Button,
  Field,
  Input,
  Textarea,
  Badge,
  Spinner,
  MessageBar,
  Dialog,
  DialogTrigger,
  DialogSurface,
  DialogTitle,
  DialogContent,
  DialogBody,
  DialogActions,
  Menu,
  MenuTrigger,
  MenuPopover,
  MenuList,
  MenuItem,
} from '@fluentui/react-components';
import {
  DocumentText24Regular,
  Add24Regular,
  Edit24Regular,
  Delete24Regular,
  MoreHorizontal24Regular,
  Code24Regular,
  Save24Regular,
  Copy24Regular,
  Share24Regular,
} from '@fluentui/react-icons';

const useStyles = makeStyles({
  container: {
    display: 'flex',
    flexDirection: 'column',
    ...shorthands.gap('24px'),
    ...shorthands.padding('24px'),
    backgroundColor: tokens.colorNeutralBackground1,
    minHeight: '100vh',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    ...shorthands.gap('12px'),
  },
  headerLeft: {
    display: 'flex',
    alignItems: 'center',
    ...shorthands.gap('12px'),
  },
  templatesGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))',
    ...shorthands.gap('20px'),
  },
  templateCard: {
    ...shorthands.padding('20px'),
    backgroundColor: tokens.colorNeutralBackground1,
    boxShadow: tokens.shadow4,
    ...shorthands.borderRadius(tokens.borderRadiusLarge),
    ...shorthands.border('1px', 'solid', tokens.colorNeutralStroke2),
    transition: 'all 0.2s ease-in-out',
    cursor: 'pointer',
    ':hover': {
      boxShadow: tokens.shadow8,
      transform: 'translateY(-2px)',
    },
  },
  templateHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    ...shorthands.margin('0', '0', '12px', '0'),
  },
  templateTitle: {
    display: 'flex',
    alignItems: 'center',
    ...shorthands.gap('8px'),
  },
  templateContent: {
    display: 'flex',
    flexDirection: 'column',
    ...shorthands.gap('12px'),
  },
  templateDescription: {
    color: tokens.colorNeutralForeground2,
    fontSize: '14px',
    lineHeight: '1.4',
  },
  templateMeta: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    ...shorthands.margin('12px', '0', '0', '0'),
    ...shorthands.padding('12px', '0', '0', '0'),
    ...shorthands.borderTop('1px', 'solid', tokens.colorNeutralStroke2),
  },
  templateStats: {
    display: 'flex',
    ...shorthands.gap('12px'),
    fontSize: '12px',
    color: tokens.colorNeutralForeground2,
  },
  codePreview: {
    backgroundColor: tokens.colorNeutralBackground3,
    ...shorthands.padding('12px'),
    ...shorthands.borderRadius(tokens.borderRadiusMedium),
    fontFamily: 'monospace',
    fontSize: '12px',
    maxHeight: '100px',
    overflow: 'hidden',
    position: 'relative',
    '::after': {
      content: '""',
      position: 'absolute',
      bottom: '0',
      left: '0',
      right: '0',
      height: '20px',
      background: `linear-gradient(transparent, ${tokens.colorNeutralBackground3})`,
    },
  },
  createCard: {
    ...shorthands.padding('40px'),
    backgroundColor: tokens.colorNeutralBackground1,
    boxShadow: tokens.shadow4,
    ...shorthands.borderRadius(tokens.borderRadiusLarge),
    ...shorthands.border('2px', 'dashed', tokens.colorNeutralStroke2),
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    ...shorthands.gap('16px'),
    minHeight: '200px',
    cursor: 'pointer',
    transition: 'all 0.2s ease-in-out',
    ':hover': {
      backgroundColor: tokens.colorBrandBackground2,
    },
  },
  dialogContent: {
    display: 'flex',
    flexDirection: 'column',
    ...shorthands.gap('16px'),
    minWidth: '500px',
  },
  formField: {
    display: 'flex',
    flexDirection: 'column',
  },
  loading: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    height: '200px',
    flexDirection: 'column',
    ...shorthands.gap('16px'),
  },
  emptyState: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    ...shorthands.gap('16px'),
    ...shorthands.padding('60px'),
    color: tokens.colorNeutralForeground2,
  },
  actionButton: {
    minWidth: '32px',
  },
});

interface Template {
  id: string;
  name: string;
  description: string;
  erdContent: string;
  createdAt?: string;
  category?: string;
  tags?: string[];
}

export const TemplateManagement: React.FC = () => {
  const styles = useStyles();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<Template | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    erdContent: '',
    category: '',
    tags: '',
  });

  useEffect(() => {
    fetchTemplates();
  }, []);

  const fetchTemplates = async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await fetch('/api/templates');
      if (!response.ok) {
        throw new Error('Failed to fetch templates');
      }

      const data = await response.json();
      setTemplates(data.data || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateTemplate = async () => {
    try {
      const templateData = {
        name: formData.name,
        description: formData.description,
        erdContent: formData.erdContent,
        category: formData.category || 'General',
        tags: formData.tags.split(',').map(tag => tag.trim()).filter(Boolean),
        createdAt: new Date().toISOString(),
      };

      const response = await fetch('/api/templates', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(templateData),
      });

      if (!response.ok) {
        throw new Error('Failed to create template');
      }

      await fetchTemplates();
      setShowCreateDialog(false);
      resetForm();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create template');
    }
  };

  const handleUpdateTemplate = async () => {
    if (!editingTemplate) return;

    try {
      const templateData = {
        ...editingTemplate,
        name: formData.name,
        description: formData.description,
        erdContent: formData.erdContent,
        category: formData.category,
        tags: formData.tags.split(',').map(tag => tag.trim()).filter(Boolean),
      };

      const response = await fetch(`/api/templates/${editingTemplate.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(templateData),
      });

      if (!response.ok) {
        throw new Error('Failed to update template');
      }

      await fetchTemplates();
      setEditingTemplate(null);
      resetForm();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update template');
    }
  };

  const handleDeleteTemplate = async (templateId: string) => {
    if (!confirm('Are you sure you want to delete this template?')) return;

    try {
      const response = await fetch(`/api/templates/${templateId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error('Failed to delete template');
      }

      await fetchTemplates();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete template');
    }
  };

  const handleDuplicateTemplate = async (template: Template) => {
    const duplicatedTemplate = {
      name: `${template.name} (Copy)`,
      description: template.description,
      erdContent: template.erdContent,
      category: template.category || 'General',
      tags: template.tags || [],
      createdAt: new Date().toISOString(),
    };

    try {
      const response = await fetch('/api/templates', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(duplicatedTemplate),
      });

      if (!response.ok) {
        throw new Error('Failed to duplicate template');
      }

      await fetchTemplates();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to duplicate template');
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      description: '',
      erdContent: '',
      category: '',
      tags: '',
    });
  };

  const openCreateDialog = () => {
    resetForm();
    setShowCreateDialog(true);
  };

  const openEditDialog = (template: Template) => {
    setFormData({
      name: template.name,
      description: template.description,
      erdContent: template.erdContent,
      category: template.category || '',
      tags: (template.tags || []).join(', '),
    });
    setEditingTemplate(template);
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return 'Unknown';
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const getEntityCount = (erdContent: string) => {
    const matches = erdContent.match(/^\s*\w+\s*\{/gm);
    return matches ? matches.length : 0;
  };

  if (loading) {
    return (
      <div className={styles.container}>
        <div className={styles.loading}>
          <Spinner size="large" />
          <Text>Loading templates...</Text>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <DocumentText24Regular />
          <Title1>Template Management</Title1>
        </div>
        <Badge appearance="outline">{templates.length} templates</Badge>
      </div>

      {error && (
        <MessageBar intent="error">
          <Text>{error}</Text>
        </MessageBar>
      )}

      <div className={styles.templatesGrid}>
        <Dialog open={showCreateDialog || !!editingTemplate}>
          <DialogTrigger disableButtonEnhancement>
            <Card className={styles.createCard} onClick={openCreateDialog}>
              <Add24Regular style={{ fontSize: '48px', color: tokens.colorBrandForeground1 }} />
              <Title3>Create New Template</Title3>
              <Text>Build reusable ERD templates for faster deployments</Text>
            </Card>
          </DialogTrigger>
          
          <DialogSurface>
            <DialogBody>
              <DialogTitle>
                {editingTemplate ? 'Edit Template' : 'Create New Template'}
              </DialogTitle>
              <DialogContent className={styles.dialogContent}>
                <Field label="Template Name" required className={styles.formField}>
                  <Input
                    value={formData.name}
                    onChange={(_, data) => setFormData({ ...formData, name: data.value })}
                    placeholder="Enter template name..."
                  />
                </Field>

                <Field label="Description" className={styles.formField}>
                  <Textarea
                    value={formData.description}
                    onChange={(_, data) => setFormData({ ...formData, description: data.value })}
                    placeholder="Describe what this template does..."
                    rows={3}
                  />
                </Field>

                <Field label="Category" className={styles.formField}>
                  <Input
                    value={formData.category}
                    onChange={(_, data) => setFormData({ ...formData, category: data.value })}
                    placeholder="e.g., CRM, E-commerce, Healthcare..."
                  />
                </Field>

                <Field label="Tags" className={styles.formField}>
                  <Input
                    value={formData.tags}
                    onChange={(_, data) => setFormData({ ...formData, tags: data.value })}
                    placeholder="Enter tags separated by commas..."
                  />
                </Field>

                <Field label="ERD Content" required className={styles.formField}>
                  <Textarea
                    value={formData.erdContent}
                    onChange={(_, data) => setFormData({ ...formData, erdContent: data.value })}
                    placeholder="erDiagram&#10;  Customer {&#10;    int id PK&#10;    string name&#10;    string email&#10;  }"
                    rows={8}
                    style={{ fontFamily: 'monospace' }}
                  />
                </Field>
              </DialogContent>
              <DialogActions>
                <DialogTrigger disableButtonEnhancement>
                  <Button
                    appearance="secondary"
                    onClick={() => {
                      setShowCreateDialog(false);
                      setEditingTemplate(null);
                      resetForm();
                    }}
                  >
                    Cancel
                  </Button>
                </DialogTrigger>
                <Button
                  appearance="primary"
                  icon={<Save24Regular />}
                  onClick={editingTemplate ? handleUpdateTemplate : handleCreateTemplate}
                  disabled={!formData.name || !formData.erdContent}
                >
                  {editingTemplate ? 'Update' : 'Create'} Template
                </Button>
              </DialogActions>
            </DialogBody>
          </DialogSurface>
        </Dialog>

        {templates.map((template) => (
          <Card key={template.id} className={styles.templateCard}>
            <div className={styles.templateHeader}>
              <div className={styles.templateTitle}>
                <Code24Regular />
                <Title3>{template.name}</Title3>
              </div>
              <Menu>
                <MenuTrigger disableButtonEnhancement>
                  <Button
                    appearance="subtle"
                    icon={<MoreHorizontal24Regular />}
                    className={styles.actionButton}
                  />
                </MenuTrigger>
                <MenuPopover>
                  <MenuList>
                    <MenuItem
                      icon={<Edit24Regular />}
                      onClick={() => openEditDialog(template)}
                    >
                      Edit
                    </MenuItem>
                    <MenuItem
                      icon={<Copy24Regular />}
                      onClick={() => handleDuplicateTemplate(template)}
                    >
                      Duplicate
                    </MenuItem>
                    <MenuItem
                      icon={<Share24Regular />}
                      onClick={() => {/* TODO: Implement share functionality */}}
                    >
                      Share
                    </MenuItem>
                    <MenuItem
                      icon={<Delete24Regular />}
                      onClick={() => handleDeleteTemplate(template.id)}
                    >
                      Delete
                    </MenuItem>
                  </MenuList>
                </MenuPopover>
              </Menu>
            </div>

            <div className={styles.templateContent}>
              {template.description && (
                <Text className={styles.templateDescription}>
                  {template.description}
                </Text>
              )}

              {template.erdContent && (
                <div className={styles.codePreview}>
                  <code>{template.erdContent.substring(0, 150)}{template.erdContent.length > 150 ? '...' : ''}</code>
                </div>
              )}

              <div className={styles.templateMeta}>
                <div className={styles.templateStats}>
                  <Text>{getEntityCount(template.erdContent)} entities</Text>
                  <Text>•</Text>
                  <Text>Created {formatDate(template.createdAt)}</Text>
                </div>
                {template.category && (
                  <Badge appearance="tint" size="small">
                    {template.category}
                  </Badge>
                )}
              </div>
            </div>
          </Card>
        ))}

        {templates.length === 0 && !loading && (
          <div className={styles.emptyState}>
            <DocumentText24Regular style={{ fontSize: '64px' }} />
            <Title2>No Templates Yet</Title2>
            <Text>Create your first template to get started with reusable ERD patterns</Text>
          </div>
        )}
      </div>
    </div>
  );
};

export default TemplateManagement;