/**
 * 💾 Advanced Database Schema Parser
 * 
 * Detecta y parsea schemas de bases de datos de CUALQUIER tipo:
 * - Prisma (.prisma files)
 * - Drizzle (TypeScript schemas)
 * - TypeORM (decorators)
 * - Sequelize (models)
 * - Mongoose (schemas)
 * - SQL migrations (.sql files)
 * - Supabase types (generated types)
 * 
 * Extrae:
 * - Tablas/colecciones
 * - Campos con tipos
 * - Relaciones (foreign keys)
 * - Índices y constraints
 * - Migraciones
 */

export interface DatabaseSchema {
  provider: string; // 'Prisma', 'Drizzle', 'TypeORM', etc.
  type: string; // 'postgresql', 'mysql', 'mongodb', 'sqlite'
  tables: TableDefinition[];
  relationships: RelationshipDefinition[];
  indexes: IndexDefinition[];
  enums?: EnumDefinition[];
  migrations?: MigrationInfo[];
  confidence: number;
  detectedFrom: string[]; // Archivos fuente
}

export interface TableDefinition {
  name: string;
  schema?: string; // 'public', 'auth', etc.
  fields: FieldDefinition[];
  primaryKey: string | string[];
  uniqueConstraints?: string[][];
  checks?: string[];
}

export interface FieldDefinition {
  name: string;
  type: string; // 'String', 'Int', 'Boolean', 'DateTime', etc.
  nullable: boolean;
  unique?: boolean;
  defaultValue?: string;
  autoIncrement?: boolean;
  references?: {
    table: string;
    field: string;
    onDelete?: string;
    onUpdate?: string;
  };
}

export interface RelationshipDefinition {
  type: 'one-to-one' | 'one-to-many' | 'many-to-many';
  from: { table: string; field: string };
  to: { table: string; field: string };
  through?: string; // Tabla intermedia para many-to-many
}

export interface IndexDefinition {
  table: string;
  name: string;
  fields: string[];
  unique: boolean;
}

export interface EnumDefinition {
  name: string;
  values: string[];
}

export interface MigrationInfo {
  filename: string;
  timestamp: number;
  operations: MigrationOperation[];
}

export interface MigrationOperation {
  type: 'create_table' | 'alter_table' | 'drop_table' | 'add_column' | 'remove_column' | 'add_index' | 'remove_index';
  table: string;
  details: string;
}

interface FileContent {
  path: string;
  name: string;
  content: string;
  extension: string;
}

/**
 * Analiza archivos y detecta todos los schemas de bases de datos
 */
export async function analyzeDatabaseSchemas(files: FileContent[]): Promise<DatabaseSchema[]> {
  console.log('💾 Analyzing database schemas...');
  console.log(`   📂 Total files to analyze: ${files.length}`);
  
  // 🔍 DEBUG: Mostrar tipos de archivos recibidos
  const extensions = [...new Set(files.map(f => f.extension))].sort();
  console.log(`   📋 Extensions found: ${extensions.join(', ')}`);
  
  const schemas: DatabaseSchema[] = [];
  
  // 1. Buscar Prisma schemas
  const prismaFiles = files.filter(f => f.extension === '.prisma' || f.name === 'schema.prisma');
  console.log(`   🔎 Checking Prisma: ${prismaFiles.length} files`);
  if (prismaFiles.length > 0) {
    console.log(`   📘 Found ${prismaFiles.length} Prisma schema(s)`);
    const prismaSchemas = parsePrismaSchemas(prismaFiles);
    if (prismaSchemas.length > 0) {
      console.log(`      ✓ Parsed ${prismaSchemas.length} Prisma schema(s) with ${prismaSchemas[0].tables.length} tables`);
      schemas.push(...prismaSchemas);
    }
  }
  
  // 2. Buscar Drizzle schemas
  const drizzleFiles = files.filter(f => 
    (f.extension === '.ts' || f.extension === '.js') && (
      f.content.includes('pgTable') || 
      f.content.includes('mysqlTable') ||
      f.content.includes('sqliteTable') ||
      f.content.includes('drizzle-orm') ||
      f.path.toLowerCase().includes('drizzle')
    )
  );
  console.log(`   🔎 Checking Drizzle: ${drizzleFiles.length} files`);
  if (drizzleFiles.length > 0) {
    console.log(`   📗 Found ${drizzleFiles.length} potential Drizzle schema(s)`);
    const drizzleSchemas = parseDrizzleSchemas(drizzleFiles);
    if (drizzleSchemas.length > 0) {
      console.log(`      ✓ Parsed ${drizzleSchemas.length} Drizzle schema(s)`);
      schemas.push(...drizzleSchemas);
    }
  }
  
  // 3. Buscar TypeORM entities
  const typeormFiles = files.filter(f => 
    (f.extension === '.ts' || f.extension === '.js') && (
      f.content.includes('@Entity') || 
      f.content.includes('@Column') ||
      f.content.includes('typeorm') ||
      f.path.toLowerCase().includes('entit')
    )
  );
  console.log(`   🔎 Checking TypeORM: ${typeormFiles.length} files`);
  if (typeormFiles.length > 0) {
    console.log(`   📙 Found ${typeormFiles.length} potential TypeORM entit(y/ies)`);
    const typeormSchemas = parseTypeORMEntities(typeormFiles);
    if (typeormSchemas.length > 0) {
      console.log(`      ✓ Parsed ${typeormSchemas[0].tables.length} TypeORM entit(y/ies)`);
      schemas.push(...typeormSchemas);
    }
  }
  
  // 4. Buscar Mongoose schemas
  const mongooseFiles = files.filter(f => 
    (f.extension === '.ts' || f.extension === '.js') && (
      f.content.includes('new Schema') || 
      f.content.includes('mongoose.model') ||
      f.content.includes('mongoose.Schema') ||
      f.content.includes('require(\'mongoose\')') ||
      f.path.toLowerCase().includes('model')
    )
  );
  console.log(`   🔎 Checking Mongoose: ${mongooseFiles.length} files`);
  if (mongooseFiles.length > 0) {
    console.log(`   📕 Found ${mongooseFiles.length} potential Mongoose schema(s)`);
    const mongooseSchemas = parseMongooseSchemas(mongooseFiles);
    if (mongooseSchemas.length > 0) {
      console.log(`      ✓ Parsed ${mongooseSchemas[0].tables.length} Mongoose schema(s)`);
      schemas.push(...mongooseSchemas);
    }
  }
  
  // 5. Buscar migraciones SQL
  const sqlFiles = files.filter(f => 
    ['.sql'].includes(f.extension) ||
    f.path.toLowerCase().includes('migrations/') ||
    f.path.toLowerCase().includes('migration/') ||
    f.path.toLowerCase().includes('supabase/')
  );
  console.log(`   🔎 Checking SQL: ${sqlFiles.length} files`);
  if (sqlFiles.length > 0) {
    console.log(`   📄 Found ${sqlFiles.length} SQL migration(s)`);
    // 🔍 DEBUG: Mostrar nombres de archivos SQL
    console.log(`      Files: ${sqlFiles.map(f => f.name).join(', ')}`);
    const sqlSchemas = parseSQLMigrations(sqlFiles);
    if (sqlSchemas.length > 0) {
      console.log(`      ✓ Parsed ${sqlSchemas[0].tables.length} tables from SQL migrations`);
      schemas.push(...sqlSchemas);
    } else {
      console.log(`      ⚠️ No tables found in SQL files`);
    }
  }
  
  // 6. Buscar Sequelize models
  const sequelizeFiles = files.filter(f => 
    (f.extension === '.ts' || f.extension === '.js') && (
      f.content.includes('sequelize.define') || 
      f.content.includes('DataTypes') ||
      f.content.includes('Sequelize.') ||
      f.content.includes('require(\'sequelize\')') ||
      (f.path.toLowerCase().includes('model') && f.content.includes('Model'))
    )
  );
  console.log(`   🔎 Checking Sequelize: ${sequelizeFiles.length} files`);
  if (sequelizeFiles.length > 0) {
    console.log(`   📒 Found ${sequelizeFiles.length} potential Sequelize model(s)`);
    const sequelizeSchemas = parseSequelizeModels(sequelizeFiles);
    if (sequelizeSchemas.length > 0) {
      console.log(`      ✓ Parsed ${sequelizeSchemas[0].tables.length} Sequelize model(s)`);
      schemas.push(...sequelizeSchemas);
    }
  }
  
  // 7. 🔥 NUEVO: Detectar tablas desde raw SQL queries en código
  const rawQueryFiles = files.filter(f => 
    (f.extension === '.ts' || f.extension === '.js') && (
      f.content.match(/INSERT\s+INTO\s+["'`]?\w+["'`]?/i) ||
      f.content.match(/UPDATE\s+["'`]?\w+["'`]?\s+SET/i) ||
      f.content.match(/DELETE\s+FROM\s+["'`]?\w+["'`]?/i) ||
      f.content.match(/SELECT\s+.+\s+FROM\s+["'`]?\w+["'`]?/i) ||
      f.content.match(/CREATE\s+TABLE/i) ||
      // 🔥 Detectar Supabase/ORM abstractions
      f.content.includes('.from(') ||
      f.content.includes('.table(') ||
      f.content.includes('supabase.from')
    )
  );
  console.log(`   🔎 Checking Raw SQL Queries: ${rawQueryFiles.length} files`);
  if (rawQueryFiles.length > 0) {
    console.log(`   📝 Found ${rawQueryFiles.length} file(s) with raw SQL queries or DB operations`);
    const rawSchemas = parseRawSQLQueries(rawQueryFiles);
    if (rawSchemas.length > 0) {
      console.log(`      ✓ Detected ${rawSchemas[0].tables.length} table(s) from raw queries`);
      schemas.push(...rawSchemas);
    } else {
      console.log(`      ⚠️ Files found but no tables extracted`);
    }
  }
  
  console.log(`✅ Total schemas detected: ${schemas.length}`);
  
  return schemas;
}

// =====================================
// PARSERS ESPECÍFICOS
// =====================================

/**
 * Parser para Prisma schemas
 */
function parsePrismaSchemas(files: FileContent[]): DatabaseSchema[] {
  const schemas: DatabaseSchema[] = [];
  
  for (const file of files) {
    const content = file.content;
    const tables: TableDefinition[] = [];
    const enums: EnumDefinition[] = [];
    const relationships: RelationshipDefinition[] = [];
    
    // Detectar tipo de base de datos
    const providerMatch = content.match(/provider\s*=\s*"(\w+)"/);
    const dbType = providerMatch ? providerMatch[1] : 'postgresql';
    
    // Parsear enums
    const enumPattern = /enum\s+(\w+)\s*\{([^}]+)\}/g;
    let match;
    while ((match = enumPattern.exec(content)) !== null) {
      const enumName = match[1];
      const values = match[2]
        .split('\n')
        .map(l => l.trim())
        .filter(l => l && !l.startsWith('//'))
        .map(l => l.replace(/,$/, ''));
      
      enums.push({ name: enumName, values });
    }
    
    // Parsear modelos (tablas)
    const modelPattern = /model\s+(\w+)\s*\{([^}]+)\}/g;
    while ((match = modelPattern.exec(content)) !== null) {
      const tableName = match[1];
      const fieldsStr = match[2];
      
      const fields: FieldDefinition[] = [];
      const lines = fieldsStr.split('\n');
      let primaryKey: string | string[] = 'id';
      
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('//')) continue;
        
        // Parsear primary key compuesta
        if (trimmed.startsWith('@@id')) {
          const pkMatch = trimmed.match(/@@id\(\[([^\]]+)\]\)/);
          if (pkMatch) {
            primaryKey = pkMatch[1].split(',').map(f => f.trim());
          }
          continue;
        }
        
        // Parsear campo: name Type? @attributes
        const fieldMatch = trimmed.match(/^(\w+)\s+(\w+)(\[\])?(\?)?(.*)$/);
        if (!fieldMatch) continue;
        
        const [, fieldName, fieldType, isArray, isOptional, attributes] = fieldMatch;
        
        const field: FieldDefinition = {
          name: fieldName,
          type: isArray ? `${fieldType}[]` : fieldType,
          nullable: !!isOptional,
        };
        
        // Parsear atributos
        if (attributes.includes('@id')) {
          primaryKey = fieldName;
        }
        if (attributes.includes('@unique')) {
          field.unique = true;
        }
        if (attributes.includes('@default')) {
          const defaultMatch = attributes.match(/@default\(([^)]+)\)/);
          if (defaultMatch) {
            field.defaultValue = defaultMatch[1];
          }
        }
        if (attributes.includes('@relation')) {
          const relationMatch = attributes.match(/@relation\([^)]*references:\s*\[(\w+)\]/);
          if (relationMatch) {
            field.references = {
              table: fieldType,
              field: relationMatch[1],
            };
          }
        }
        
        fields.push(field);
      }
      
      tables.push({
        name: tableName,
        fields,
        primaryKey,
      });
    }
    
    schemas.push({
      provider: 'Prisma',
      type: dbType,
      tables,
      relationships,
      indexes: [],
      enums,
      confidence: 0.95,
      detectedFrom: [file.path],
    });
  }
  
  return schemas;
}

/**
 * Parser para Drizzle schemas
 */
function parseDrizzleSchemas(files: FileContent[]): DatabaseSchema[] {
  const schemas: DatabaseSchema[] = [];
  
  for (const file of files) {
    const content = file.content;
    const tables: TableDefinition[] = [];
    
    // Detectar tipo de tabla
    let dbType = 'postgresql';
    if (content.includes('mysqlTable')) dbType = 'mysql';
    if (content.includes('sqliteTable')) dbType = 'sqlite';
    
    // Buscar definiciones de tablas
    const tablePattern = /export\s+const\s+(\w+)\s*=\s*(?:pg|mysql|sqlite)Table\s*\(\s*['"](\w+)['"]/g;
    let match;
    
    while ((match = tablePattern.exec(content)) !== null) {
      const constName = match[1];
      const tableName = match[2];
      
      // Extraer definición de campos (simplificado)
      const tableDefPattern = new RegExp(`${constName}\\s*=\\s*\\w+Table\\([^,]+,\\s*\\{([^}]+)\\}`, 's');
      const tableDefMatch = content.match(tableDefPattern);
      
      if (!tableDefMatch) continue;
      
      const fieldsStr = tableDefMatch[1];
      const fields: FieldDefinition[] = [];
      
      // Parsear campos (aproximado)
      const fieldLines = fieldsStr.split('\n').filter(l => l.trim() && l.includes(':'));
      
      for (const line of fieldLines) {
        const fieldMatch = line.match(/(\w+):\s*(\w+)\(/);
        if (fieldMatch) {
          const [, fieldName, fieldType] = fieldMatch;
          fields.push({
            name: fieldName,
            type: fieldType,
            nullable: line.includes('.notNull()') ? false : true,
            unique: line.includes('.unique()'),
            defaultValue: extractDefault(line),
          });
        }
      }
      
      tables.push({
        name: tableName,
        fields,
        primaryKey: 'id', // Drizzle suele tener id por defecto
      });
    }
    
    if (tables.length > 0) {
      schemas.push({
        provider: 'Drizzle',
        type: dbType,
        tables,
        relationships: [],
        indexes: [],
        confidence: 0.9,
        detectedFrom: [file.path],
      });
    }
  }
  
  return schemas;
}

/**
 * Parser para TypeORM entities
 */
function parseTypeORMEntities(files: FileContent[]): DatabaseSchema[] {
  const allTables: TableDefinition[] = [];
  const detectedFrom: string[] = [];
  
  for (const file of files) {
    const content = file.content;
    
    // Buscar @Entity decorator
    const entityMatch = content.match(/@Entity\(\s*['"]?(\w+)?['"]?\s*\)/);
    if (!entityMatch) continue;
    
    const tableName = entityMatch[1] || extractClassName(content) || 'Unknown';
    const fields: FieldDefinition[] = [];
    
    // Buscar @Column decorators
    const columnPattern = /@Column\(([^)]*)\)\s+(\w+)(?::\s*(\w+))?/g;
    let match;
    
    while ((match = columnPattern.exec(content)) !== null) {
      const [, options, fieldName, fieldType] = match;
      
      const field: FieldDefinition = {
        name: fieldName,
        type: fieldType || 'string',
        nullable: options.includes('nullable: true'),
        unique: options.includes('unique: true'),
      };
      
      // Extraer default
      const defaultMatch = options.match(/default:\s*['"]?([^,'"]+)['"]?/);
      if (defaultMatch) {
        field.defaultValue = defaultMatch[1];
      }
      
      fields.push(field);
    }
    
    // Buscar @PrimaryColumn o @PrimaryGeneratedColumn
    const pkMatch = content.match(/@Primary(?:Generated)?Column\([^)]*\)\s+(\w+)/);
    const primaryKey = pkMatch ? pkMatch[1] : 'id';
    
    allTables.push({
      name: tableName,
      fields,
      primaryKey,
    });
    
    detectedFrom.push(file.path);
  }
  
  if (allTables.length === 0) return [];
  
  return [{
    provider: 'TypeORM',
    type: 'sql', // Puede ser mysql, postgres, etc.
    tables: allTables,
    relationships: [],
    indexes: [],
    confidence: 0.85,
    detectedFrom,
  }];
}

/**
 * Parser para Mongoose schemas
 */
function parseMongooseSchemas(files: FileContent[]): DatabaseSchema[] {
  const allTables: TableDefinition[] = [];
  const detectedFrom: string[] = [];
  
  for (const file of files) {
    const content = file.content;
    
    // Buscar new Schema({ ... })
    const schemaPattern = /new\s+Schema\s*\(\s*\{([^}]+)\}/g;
    let match;
    
    while ((match = schemaPattern.exec(content)) !== null) {
      const fieldsStr = match[1];
      const fields: FieldDefinition[] = [];
      
      // Parsear campos
      const fieldLines = fieldsStr.split('\n');
      
      for (const line of fieldLines) {
        const fieldMatch = line.match(/(\w+):\s*\{?\s*type:\s*(\w+)/);
        if (fieldMatch) {
          const [, fieldName, fieldType] = fieldMatch;
          fields.push({
            name: fieldName,
            type: fieldType,
            nullable: !line.includes('required: true'),
            unique: line.includes('unique: true'),
          });
        }
      }
      
      // Buscar nombre del modelo
      const modelMatch = content.match(/model\s*\(\s*['"](\w+)['"]/);
      const collectionName = modelMatch ? modelMatch[1] : file.name.replace(/\.(ts|js)$/, '');
      
      allTables.push({
        name: collectionName,
        fields,
        primaryKey: '_id',
      });
    }
    
    if (allTables.length > 0) {
      detectedFrom.push(file.path);
    }
  }
  
  if (allTables.length === 0) return [];
  
  return [{
    provider: 'Mongoose',
    type: 'mongodb',
    tables: allTables,
    relationships: [],
    indexes: [],
    confidence: 0.85,
    detectedFrom,
  }];
}

/**
 * Parser para SQL migrations
 */
function parseSQLMigrations(files: FileContent[]): DatabaseSchema[] {
  const migrations: MigrationInfo[] = [];
  const allTables: TableDefinition[] = [];
  const detectedFrom: string[] = [];
  let isSupabase = false;
  let provider = 'SQL Migrations';
  let dbType = 'sql';
  
  for (const file of files) {
    const content = file.content.toUpperCase();
    const originalContent = file.content; // Mantener case original
    
    // 🔥 Detectar Supabase
    if (file.path.toLowerCase().includes('supabase') || 
        originalContent.includes('supabase') ||
        originalContent.includes('uuid_generate_v4()') ||
        originalContent.includes('gen_random_uuid()')) {
      isSupabase = true;
      provider = 'Supabase/PostgreSQL';
      dbType = 'postgresql';
    }
    
    const operations: MigrationOperation[] = [];
    
    // Buscar CREATE TABLE (con soporte para schema.table)
    const createTablePattern = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:["']?\w+["']?\.)?["']?(\w+)["']?\s*\(([^;]+)\)/gis;
    let match;
    
    while ((match = createTablePattern.exec(content)) !== null) {
      const tableName = match[1].toLowerCase(); // Normalizar nombre
      const fieldsStr = match[2];
      
      const fields: FieldDefinition[] = [];
      
      // Dividir por comas, pero respetando paréntesis (para tipos como DECIMAL(10,2))
      const fieldLines = splitByCommaRespectingParens(fieldsStr);
      
      for (const line of fieldLines) {
        const trimmed = line.trim().toUpperCase();
        const originalTrimmed = line.trim();
        
        // Skip constraints
        if (trimmed.startsWith('PRIMARY KEY') || 
            trimmed.startsWith('FOREIGN KEY') || 
            trimmed.startsWith('CONSTRAINT') ||
            trimmed.startsWith('UNIQUE (') ||
            trimmed.startsWith('CHECK (')) {
          continue;
        }
        
        // Parse field: name type [constraints]
        const fieldMatch = originalTrimmed.match(/^["']?(\w+)["']?\s+([\w()]+)/i);
        if (fieldMatch) {
          const [, fieldName, fieldType] = fieldMatch;
          fields.push({
            name: fieldName.toLowerCase(),
            type: fieldType.toUpperCase(),
            nullable: !trimmed.includes('NOT NULL'),
            unique: trimmed.includes('UNIQUE'),
            autoIncrement: trimmed.includes('AUTO_INCREMENT') || 
                          trimmed.includes('AUTOINCREMENT') ||
                          trimmed.includes('SERIAL') ||
                          trimmed.includes('IDENTITY'),
            defaultValue: extractDefaultValue(originalTrimmed),
          });
        }
      }
      
      // Extraer primary key
      const pkMatch = fieldsStr.match(/PRIMARY\s+KEY\s*\(\s*(\w+)\s*\)/i);
      const primaryKey = pkMatch ? pkMatch[1].toLowerCase() : 'id';
      
      allTables.push({
        name: tableName,
        fields,
        primaryKey,
      });
      
      operations.push({
        type: 'create_table',
        table: tableName,
        details: `Created with ${fields.length} columns`,
      });
    }
    
    // Extraer timestamp del nombre del archivo
    const timestampMatch = file.name.match(/(\d{8,14})/);
    const timestamp = timestampMatch ? parseInt(timestampMatch[1]) : Date.now();
    
    if (operations.length > 0) {
      migrations.push({
        filename: file.name,
        timestamp,
        operations,
      });
      detectedFrom.push(file.path);
    }
  }
  
  if (allTables.length === 0) return [];
  
  return [{
    provider,
    type: dbType,
    tables: allTables,
    relationships: [],
    indexes: [],
    migrations,
    confidence: isSupabase ? 0.95 : 0.8,
    detectedFrom,
  }];
}

// 🔥 Helper para extraer valores default
function extractDefaultValue(fieldDef: string): string | undefined {
  const defaultMatch = fieldDef.match(/DEFAULT\s+([^,\s)]+)/i);
  return defaultMatch ? defaultMatch[1] : undefined;
}

// 🔥 Helper para dividir por comas respetando paréntesis
function splitByCommaRespectingParens(str: string): string[] {
  const result: string[] = [];
  let current = '';
  let depth = 0;
  
  for (let i = 0; i < str.length; i++) {
    const char = str[i];
    
    if (char === '(') depth++;
    if (char === ')') depth--;
    
    if (char === ',' && depth === 0) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  
  if (current.trim()) {
    result.push(current.trim());
  }
  
  return result;
}

/**
 * Parser para Sequelize models
 */
function parseSequelizeModels(files: FileContent[]): DatabaseSchema[] {
  const allTables: TableDefinition[] = [];
  const detectedFrom: string[] = [];
  
  for (const file of files) {
    const content = file.content;
    
    // Buscar sequelize.define
    const definePattern = /sequelize\.define\s*\(\s*['"](\w+)['"]\s*,\s*\{([^}]+)\}/g;
    let match;
    
    while ((match = definePattern.exec(content)) !== null) {
      const tableName = match[1];
      const fieldsStr = match[2];
      
      const fields: FieldDefinition[] = [];
      const fieldLines = fieldsStr.split('\n');
      
      for (const line of fieldLines) {
        const fieldMatch = line.match(/(\w+):\s*\{[^}]*type:\s*DataTypes\.(\w+)/);
        if (fieldMatch) {
          const [, fieldName, fieldType] = fieldMatch;
          fields.push({
            name: fieldName,
            type: fieldType,
            nullable: !line.includes('allowNull: false'),
            unique: line.includes('unique: true'),
          });
        }
      }
      
      allTables.push({
        name: tableName,
        fields,
        primaryKey: 'id',
      });
    }
    
    if (allTables.length > 0) {
      detectedFrom.push(file.path);
    }
  }
  
  if (allTables.length === 0) return [];
  
  return [{
    provider: 'Sequelize',
    type: 'sql',
    tables: allTables,
    relationships: [],
    indexes: [],
    confidence: 0.8,
    detectedFrom,
  }];
}

/**
 * 🔥 NUEVO: Parser para detectar tablas desde raw SQL queries en código
 * Extrae nombres de tablas y campos mencionados en queries SQL embebidas
 * También detecta Supabase client operations como: supabase.from('table')
 */
function parseRawSQLQueries(files: FileContent[]): DatabaseSchema[] {
  const tableMap = new Map<string, Set<string>>(); // table -> Set of field names
  
  for (const file of files) {
    const content = file.content;
    
    // 🔥 DETECTAR SUPABASE CLIENT OPERATIONS
    // Pattern: supabase.from('table') o .from('table')
    const supabasePattern = /\.from\s*\(\s*["'`](\w+)["'`]\s*\)/gi;
    let match;
    
    while ((match = supabasePattern.exec(content)) !== null) {
      const tableName = match[1].toLowerCase();
      if (!tableMap.has(tableName)) {
        tableMap.set(tableName, new Set());
      }
      
      // Intentar extraer campos de .select() siguiente
      const selectPattern = new RegExp(`\\.from\\s*\\(\\s*["'\`]${match[1]}["'\`]\\s*\\)[^;]*?\\.select\\s*\\(\\s*["'\`]([^"'\`]+)["'\`]\\s*\\)`, 'i');
      const selectMatch = content.match(selectPattern);
      if (selectMatch) {
        const fields = selectMatch[1].split(',').map(f => f.trim());
        fields.forEach(f => {
          if (f !== '*') tableMap.get(tableName)!.add(f);
        });
      }
      
      // Intentar extraer campos de .insert() o .update()
      const insertPattern = new RegExp(`\\.from\\s*\\(\\s*["'\`]${match[1]}["'\`]\\s*\\)[^;]*?\\.(?:insert|update)\\s*\\(\\s*\\{([^}]+)\\}`, 'i');
      const insertMatch = content.match(insertPattern);
      if (insertMatch) {
        const fieldMatches = insertMatch[1].matchAll(/(\w+)\s*:/g);
        Array.from(fieldMatches).forEach(m => tableMap.get(tableName)!.add(m[1]));
      }
    }
    
    // Detectar INSERT INTO table (field1, field2, ...) VALUES
    const insertPattern = /INSERT\s+INTO\s+["'`]?(\w+)["'`]?\s*\(([^)]+)\)/gi;
    
    while ((match = insertPattern.exec(content)) !== null) {
      const tableName = match[1].toLowerCase();
      const fieldsStr = match[2];
      const fields = fieldsStr.split(',').map(f => f.trim().replace(/["'`]/g, ''));
      
      if (!tableMap.has(tableName)) {
        tableMap.set(tableName, new Set());
      }
      fields.forEach(f => tableMap.get(tableName)!.add(f));
    }
    
    // Detectar UPDATE table SET field1 = ..., field2 = ...
    const updatePattern = /UPDATE\s+["'`]?(\w+)["'`]?\s+SET\s+([^;WHERE]+)/gi;
    while ((match = updatePattern.exec(content)) !== null) {
      const tableName = match[1].toLowerCase();
      const setsStr = match[2];
      
      // Extraer campos del SET clause
      const fieldMatches = setsStr.matchAll(/(\w+)\s*=/g);
      const fields = Array.from(fieldMatches).map(m => m[1]);
      
      if (!tableMap.has(tableName)) {
        tableMap.set(tableName, new Set());
      }
      fields.forEach(f => tableMap.get(tableName)!.add(f));
    }
    
    // Detectar SELECT ... FROM table
    const selectPattern = /SELECT\s+(.+?)\s+FROM\s+["'`]?(\w+)["'`]?/gi;
    while ((match = selectPattern.exec(content)) !== null) {
      const fieldsStr = match[1];
      const tableName = match[2].toLowerCase();
      
      if (!tableMap.has(tableName)) {
        tableMap.set(tableName, new Set());
      }
      
      // Si no es SELECT *, extraer campos
      if (!fieldsStr.includes('*')) {
        const fields = fieldsStr.split(',').map(f => {
          // Extraer nombre de campo (ignorar aliases, funciones, etc.)
          const cleanField = f.trim().split(/\s+/)[0].replace(/["'`]/g, '');
          return cleanField.split('.').pop() || cleanField; // Manejar table.field
        });
        fields.forEach(f => {
          if (f && !f.includes('(')) { // Ignorar funciones como COUNT(*)
            tableMap.get(tableName)!.add(f);
          }
        });
      }
    }
    
    // Detectar DELETE FROM table
    const deletePattern = /DELETE\s+FROM\s+["'`]?(\w+)["'`]?/gi;
    while ((match = deletePattern.exec(content)) !== null) {
      const tableName = match[1].toLowerCase();
      if (!tableMap.has(tableName)) {
        tableMap.set(tableName, new Set());
      }
    }
  }
  
  if (tableMap.size === 0) return [];
  
  // Convertir a DatabaseSchema format
  const tables: TableDefinition[] = [];
  
  for (const [tableName, fieldSet] of tableMap.entries()) {
    const fields: FieldDefinition[] = Array.from(fieldSet).map(fieldName => ({
      name: fieldName,
      type: 'unknown', // No podemos inferir tipo desde raw queries
      nullable: true,
    }));
    
    // Intentar detectar primary key común
    const possiblePKs = ['id', 'uuid', `${tableName}_id`];
    const primaryKey = Array.from(fieldSet).find(f => possiblePKs.includes(f.toLowerCase())) || 'id';
    
    tables.push({
      name: tableName,
      fields,
      primaryKey,
    });
  }
  
  return [{
    provider: 'Raw SQL Queries / Supabase Client',
    type: 'sql',
    tables,
    relationships: [],
    indexes: [],
    confidence: 0.6, // Menor confianza porque es inferido
    detectedFrom: files.map(f => f.path),
  }];
}

// =====================================
// UTILIDADES
// =====================================

function extractClassName(content: string): string | null {
  const classMatch = content.match(/class\s+(\w+)/);
  return classMatch ? classMatch[1] : null;
}

function extractDefault(line: string): string | undefined {
  const match = line.match(/\.default\(['"]?([^'")]+)['"]?\)/);
  return match ? match[1] : undefined;
}

/**
 * Convierte schemas a formato simplificado para auditoría
 */
export function simplifySchemas(schemas: DatabaseSchema[]): {
  tables: string[];
  fields: Record<string, string[]>;
  summary: string;
} {
  const allTables: string[] = [];
  const fields: Record<string, string[]> = {};
  
  for (const schema of schemas) {
    for (const table of schema.tables) {
      allTables.push(table.name);
      fields[table.name] = table.fields.map(f => `${f.name}: ${f.type}`);
    }
  }
  
  const summary = `${schemas.length} schema(s), ${allTables.length} table(s)`;
  
  return { tables: allTables, fields, summary };
}
