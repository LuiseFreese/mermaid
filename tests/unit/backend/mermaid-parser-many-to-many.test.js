const { MermaidERDParser } = require('../../../src/backend/mermaid-parser');

describe('MermaidERDParser - Many-to-Many Relationships', () => {
  let parser;

  beforeEach(() => {
    parser = new MermaidERDParser();
  });

  test('should auto-correct many-to-many relationships to junction table', () => {
    const erdContent = `erDiagram
    POST {
        string id PK "Unique identifier"
        string title "Post title"
        string content "Post content"
    }
    
    TAG {
        string id PK "Unique identifier"
        string name "Tag name"
    }
    
    POST }o--o{ TAG : tagged_with
`;

    const result = parser.parse(erdContent);

    // Should have 3 entities: POST, TAG, and the junction table POST_TAG
    expect(result.entities).toHaveLength(3);
    expect(result.entities.map(e => e.name)).toEqual(
      expect.arrayContaining(['POST', 'TAG', 'POST_TAG'])
    );

    // Should have 2 corrected relationships instead of the original many-to-many
    expect(result.relationships).toHaveLength(2);
    expect(result.relationships).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          fromEntity: 'POST',
          toEntity: 'POST_TAG',
          cardinality: { type: 'one-to-many', from: 'one', to: 'many' },
          name: 'has'
        }),
        expect.objectContaining({
          fromEntity: 'TAG',
          toEntity: 'POST_TAG',
          cardinality: { type: 'one-to-many', from: 'one', to: 'many' },
          name: 'has'
        })
      ])
    );

    // Should have a warning about the auto-correction
    expect(result.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'many_to_many_auto_corrected',
          severity: 'warning',
          category: 'relationships',
          autoFixed: true,
          corrections: expect.objectContaining({
            originalRelationship: 'POST }o--o{ TAG : "tagged_with"',
            junctionTable: 'POST_TAG',
            newRelationships: [
              'POST ||--o{ POST_TAG : "has"',
              'TAG ||--o{ POST_TAG : "has"'
            ]
          })
        })
      ])
    );

    // The junction table should have proper structure
    const junctionTable = result.entities.find(e => e.name === 'POST_TAG');
    expect(junctionTable).toBeDefined();
    expect(junctionTable.attributes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'id',
          type: 'string',
          constraints: ['PK'],
          description: 'Unique identifier'
        }),
        expect.objectContaining({
          name: 'post_id',
          type: 'string',
          constraints: ['FK'],
          description: 'Foreign key to POST'
        }),
        expect.objectContaining({
          name: 'tag_id',
          type: 'string',
          constraints: ['FK'],
          description: 'Foreign key to TAG'
        })
      ])
    );
  });

  test('should generate corrected ERD with junction table and relationships', () => {
    const erdContent = `erDiagram
    USER {
        string id PK "Unique identifier"
        string name "User name"
    }
    
    ROLE {
        string id PK "Unique identifier"
        string name "Role name"
    }
    
    USER }o--o{ ROLE : has_role
`;

    const result = parser.parse(erdContent);
    const correctedERD = result.correctedERD;

    // Should contain the junction table definition
    expect(correctedERD).toContain('USER_ROLE {');
    expect(correctedERD).toContain('string id "Unique identifier"');
    expect(correctedERD).toContain('string user_id "Foreign key to USER"');
    expect(correctedERD).toContain('string role_id "Foreign key to ROLE"');

    // Should contain the corrected relationships
    expect(correctedERD).toContain('USER ||--o{ USER_ROLE : "has"');
    expect(correctedERD).toContain('ROLE ||--o{ USER_ROLE : "has"');

    // Should NOT contain the original many-to-many relationship
    expect(correctedERD).not.toContain('USER }o--o{ ROLE');
  });

  test('should handle multiple many-to-many relationships', () => {
    const erdContent = `erDiagram
    STUDENT {
        string id PK "Unique identifier"
        string name "Student name"
    }
    
    COURSE {
        string id PK "Unique identifier"
        string name "Course name"
    }
    
    TEACHER {
        string id PK "Unique identifier"
        string name "Teacher name"
    }
    
    STUDENT }o--o{ COURSE : enrolled_in
    TEACHER }o--o{ COURSE : teaches
`;

    const result = parser.parse(erdContent);

    // Should have 5 entities: original 3 + 2 junction tables
    expect(result.entities).toHaveLength(5);
    expect(result.entities.map(e => e.name)).toEqual(
      expect.arrayContaining(['STUDENT', 'COURSE', 'TEACHER', 'STUDENT_COURSE', 'TEACHER_COURSE'])
    );

    // Should have 4 corrected relationships (2 for each junction table)
    expect(result.relationships).toHaveLength(4);

    // Should have 2 warnings for the 2 many-to-many corrections
    const manyToManyWarnings = result.warnings.filter(w => w.type === 'many_to_many_auto_corrected');
    expect(manyToManyWarnings).toHaveLength(2);
  });

  test('should preserve other relationship types unchanged', () => {
    const erdContent = `erDiagram
    POST {
        string id PK "Unique identifier"
        string title "Post title"
    }
    
    COMMENT {
        string id PK "Unique identifier"
        string content "Comment content"
        string post_id FK "Foreign key to Post"
    }
    
    TAG {
        string id PK "Unique identifier"
        string name "Tag name"
    }
    
    POST ||--o{ COMMENT : has_comments
    POST }o--o{ TAG : tagged_with
`;

    const result = parser.parse(erdContent);

    // Should have 4 entities: POST, COMMENT, TAG, and POST_TAG junction table
    expect(result.entities).toHaveLength(4);

    // Should have 3 relationships: 1 original one-to-many + 2 corrected for many-to-many
    expect(result.relationships).toHaveLength(3);

    // The original one-to-many relationship should be preserved
    expect(result.relationships).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          fromEntity: 'POST',
          toEntity: 'COMMENT',
          name: 'has_comments'
        })
      ])
    );

    // Only one many-to-many warning should be present
    const manyToManyWarnings = result.warnings.filter(w => w.type === 'many_to_many_auto_corrected');
    expect(manyToManyWarnings).toHaveLength(1);
  });
});