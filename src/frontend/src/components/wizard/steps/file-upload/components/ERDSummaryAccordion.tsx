/**
 * ERD Summary Accordion Component
 * Displays a collapsible summary of the parsed ERD structure
 */

import React from 'react';
import {
  Accordion,
  AccordionHeader,
  AccordionItem,
  AccordionPanel,
  Text,
  Badge,
  DataGrid,
  DataGridHeader,
  DataGridRow,
  DataGridHeaderCell,
  DataGridCell,
  DataGridBody,
  TableCellLayout,
  TableColumnDefinition,
  createTableColumn,
  tokens
} from '@fluentui/react-components';
import { 
  DatabaseRegular,
  TableRegular,
  KeyRegular,
  LinkRegular
} from '@fluentui/react-icons';
import type { ERDSummaryAccordionProps, ERDEntity, ERDRelationship } from '../types/file-upload.types';
import styles from './ERDSummaryAccordion.module.css';

interface EntitySummary {
  name: string;
  columnCount: number;
  hasPrimaryKey: boolean;
  hasChoiceColumns: boolean;
  relationships: number;
}

interface RelationshipSummary {
  fromEntity: string;
  toEntity: string;
  type: string;
  description: string;
}

export const ERDSummaryAccordion: React.FC<ERDSummaryAccordionProps> = ({
  erdStructure,
  className
}) => {
  if (!erdStructure || (!erdStructure.entities?.length && !erdStructure.relationships?.length)) {
    return null;
  }

  const { entities = [], relationships = [] } = erdStructure;

  // Transform entities for display
  const entitySummaries: EntitySummary[] = entities.map(entity => ({
    name: entity.name,
    columnCount: entity.columns?.length || 0,
    hasPrimaryKey: entity.columns?.some(col => col.isPrimaryKey) || false,
    hasChoiceColumns: entity.columns?.some(col => col.type === 'choice') || false,
    relationships: relationships.filter(rel => 
      rel.fromEntity === entity.name || rel.toEntity === entity.name
    ).length
  }));

  // Transform relationships for display
  const relationshipSummaries: RelationshipSummary[] = relationships.map(rel => ({
    fromEntity: rel.fromEntity,
    toEntity: rel.toEntity,
    type: rel.type,
    description: `${rel.fromEntity} ${rel.type} ${rel.toEntity}`
  }));

  // Entity columns configuration
  const entityColumns: TableColumnDefinition<EntitySummary>[] = [
    createTableColumn<EntitySummary>({
      columnId: "name",
      compare: (a, b) => a.name.localeCompare(b.name),
      renderHeaderCell: () => "Entity Name",
      renderCell: (item) => (
        <TableCellLayout media={<TableRegular />}>
          <Text weight="semibold">{item.name}</Text>
        </TableCellLayout>
      ),
    }),
    createTableColumn<EntitySummary>({
      columnId: "columns",
      compare: (a, b) => a.columnCount - b.columnCount,
      renderHeaderCell: () => "Columns",
      renderCell: (item) => (
        <TableCellLayout>
          <Badge appearance="outline" color="brand" size="small">
            {item.columnCount}
          </Badge>
        </TableCellLayout>
      ),
    }),
    createTableColumn<EntitySummary>({
      columnId: "primaryKey",
      renderHeaderCell: () => "Primary Key",
      renderCell: (item) => (
        <TableCellLayout media={item.hasPrimaryKey ? <KeyRegular /> : undefined}>
          <Badge 
            appearance="filled" 
            color={item.hasPrimaryKey ? "success" : "danger"} 
            size="small"
          >
            {item.hasPrimaryKey ? "Yes" : "No"}
          </Badge>
        </TableCellLayout>
      ),
    }),
    createTableColumn<EntitySummary>({
      columnId: "choices",
      renderHeaderCell: () => "Choice Columns",
      renderCell: (item) => (
        <TableCellLayout>
          <Badge 
            appearance="outline" 
            color={item.hasChoiceColumns ? "important" : "subtle"} 
            size="small"
          >
            {item.hasChoiceColumns ? "Yes" : "No"}
          </Badge>
        </TableCellLayout>
      ),
    }),
    createTableColumn<EntitySummary>({
      columnId: "relationships",
      compare: (a, b) => a.relationships - b.relationships,
      renderHeaderCell: () => "Relationships",
      renderCell: (item) => (
        <TableCellLayout>
          <Badge appearance="outline" color="informative" size="small">
            {item.relationships}
          </Badge>
        </TableCellLayout>
      ),
    }),
  ];

  // Relationship columns configuration
  const relationshipColumns: TableColumnDefinition<RelationshipSummary>[] = [
    createTableColumn<RelationshipSummary>({
      columnId: "from",
      compare: (a, b) => a.fromEntity.localeCompare(b.fromEntity),
      renderHeaderCell: () => "From Entity",
      renderCell: (item) => (
        <TableCellLayout>
          <Text weight="semibold">{item.fromEntity}</Text>
        </TableCellLayout>
      ),
    }),
    createTableColumn<RelationshipSummary>({
      columnId: "type",
      compare: (a, b) => a.type.localeCompare(b.type),
      renderHeaderCell: () => "Relationship Type",
      renderCell: (item) => (
        <TableCellLayout media={<LinkRegular />}>
          <Badge appearance="filled" color="brand" size="small">
            {item.type}
          </Badge>
        </TableCellLayout>
      ),
    }),
    createTableColumn<RelationshipSummary>({
      columnId: "to",
      compare: (a, b) => a.toEntity.localeCompare(b.toEntity),
      renderHeaderCell: () => "To Entity",
      renderCell: (item) => (
        <TableCellLayout>
          <Text weight="semibold">{item.toEntity}</Text>
        </TableCellLayout>
      ),
    }),
  ];

  return (
    <div className={`${styles.summaryContainer} ${className || ''}`}>
      <Accordion multiple collapsible className={styles.accordion}>
        {/* Entities Summary */}
        <AccordionItem value="entities">
          <AccordionHeader>
            <div className={styles.accordionHeader}>
              <DatabaseRegular className={styles.headerIcon} />
              <Text weight="semibold">Entities Overview</Text>
              <Badge appearance="filled" color="brand" size="small">
                {entities.length} Entities
              </Badge>
            </div>
          </AccordionHeader>
          <AccordionPanel>
            <div className={styles.panelContent}>
              <Text size={300} style={{ color: tokens.colorNeutralForeground3, marginBottom: '12px' }}>
                Summary of all entities (tables) found in your ERD
              </Text>
              
              {entitySummaries.length > 0 ? (
                <DataGrid
                  items={entitySummaries}
                  columns={entityColumns}
                  sortable
                  className={styles.dataGrid}
                  size="small"
                >
                  <DataGridHeader>
                    <DataGridRow>
                      {({ renderHeaderCell }) => (
                        <DataGridHeaderCell>{renderHeaderCell()}</DataGridHeaderCell>
                      )}
                    </DataGridRow>
                  </DataGridHeader>
                  <DataGridBody<EntitySummary>>
                    {({ item, rowId }) => (
                      <DataGridRow<EntitySummary> key={rowId}>
                        {({ renderCell }) => (
                          <DataGridCell>{renderCell(item)}</DataGridCell>
                        )}
                      </DataGridRow>
                    )}
                  </DataGridBody>
                </DataGrid>
              ) : (
                <Text size={300} style={{ color: tokens.colorNeutralForeground2 }}>
                  No entities found in the ERD structure.
                </Text>
              )}
            </div>
          </AccordionPanel>
        </AccordionItem>

        {/* Relationships Summary */}
        <AccordionItem value="relationships">
          <AccordionHeader>
            <div className={styles.accordionHeader}>
              <LinkRegular className={styles.headerIcon} />
              <Text weight="semibold">Relationships Overview</Text>
              <Badge appearance="filled" color="brand" size="small">
                {relationships.length} Relationships
              </Badge>
            </div>
          </AccordionHeader>
          <AccordionPanel>
            <div className={styles.panelContent}>
              <Text size={300} style={{ color: tokens.colorNeutralForeground3, marginBottom: '12px' }}>
                Summary of all relationships between entities in your ERD
              </Text>
              
              {relationshipSummaries.length > 0 ? (
                <DataGrid
                  items={relationshipSummaries}
                  columns={relationshipColumns}
                  sortable
                  className={styles.dataGrid}
                  size="small"
                >
                  <DataGridHeader>
                    <DataGridRow>
                      {({ renderHeaderCell }) => (
                        <DataGridHeaderCell>{renderHeaderCell()}</DataGridHeaderCell>
                      )}
                    </DataGridRow>
                  </DataGridHeader>
                  <DataGridBody<RelationshipSummary>>
                    {({ item, rowId }) => (
                      <DataGridRow<RelationshipSummary> key={rowId}>
                        {({ renderCell }) => (
                          <DataGridCell>{renderCell(item)}</DataGridCell>
                        )}
                      </DataGridRow>
                    )}
                  </DataGridBody>
                </DataGrid>
              ) : (
                <Text size={300} style={{ color: tokens.colorNeutralForeground2 }}>
                  No relationships found in the ERD structure.
                </Text>
              )}
            </div>
          </AccordionPanel>
        </AccordionItem>
      </Accordion>
    </div>
  );
};
