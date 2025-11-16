/**
 * 🔬 ZIP Database Analyzer
 * 
 * Analiza proyectos ZIP para extraer información de uso de bases de datos
 * y crear mappings equivalentes a los de n8n workflows.
 * 
 * Diferencia con workflowDatabaseAnalyzer:
 * - Analiza CÓDIGO TypeScript en lugar de nodos JSON
 * - Usa AST parsing + regex para detectar queries
 * - Infiere mappings desde uso real de BD en el código
 */

import type { ParsedCodeProject, DetectedDatabase } from '../types';
import type { WorkflowDatabaseInfo, DatabaseTableMapping } from './workflowDatabaseAnalyzer';

/**
 * Analiza proyecto ZIP para extraer información de bases de datos
 * y crear mappings compatibles con workflowDatabaseAnalyzer
 */
export function analyzeZipDatabases(codeProject: ParsedCodeProject): WorkflowDatabaseInfo {
  console.log(`\n🔍 [ZIP DB Analyzer] Analizando uso de BD en proyecto ZIP...`);
  console.log(`   Framework: ${codeProject.framework?.name || 'Unknown'}`);
  console.log(`   Bases de datos detectadas: ${codeProject.databases.length}`);
  
  const mappings: DatabaseTableMapping[] = [];
  const tablesSet = new Set<string>();
  
  // 1. Analizar cada base de datos detectada
  for (const db of codeProject.databases) {
    console.log(`\n   📊 Analizando BD: ${db.provider}`);
    
    // 🔥 DEBUG: Ver estructura completa de la BD
    console.log(`      🔍 DEBUG - Estructura de DB:`, JSON.stringify(db, null, 2).substring(0, 500));
    
    // 2. Extraer tablas del análisis profundo
    const dbWithSchema = db as any;
    
    // 🔥 Verificar TODAS las posibles ubicaciones de tablas
    let tablesFound = false;
    
    if (dbWithSchema.tables && Array.isArray(dbWithSchema.tables)) {
      console.log(`      Tablas en schema: ${dbWithSchema.tables.length}`);
      tablesFound = true;
      
      dbWithSchema.tables.forEach((table: any) => {
        const tableName = typeof table === 'string' ? table : table.name;
        if (tableName) {
          tablesSet.add(tableName);
          console.log(`         - ${tableName}`);
          
          // 🔥 DEBUG: Ver estructura de cada tabla
          if (typeof table === 'object' && table.fields) {
            console.log(`           Campos: ${table.fields.map((f: any) => typeof f === 'object' ? f.name : f).slice(0, 5).join(', ')}`);
          }
        }
      });
    }
    
    if (!tablesFound) {
      console.warn(`      ⚠️ NO se encontraron tablas en db.tables`);
      console.log(`      Claves disponibles en db:`, Object.keys(dbWithSchema));
    }
    
    // 3. Analizar archivos que mencionan esta BD para inferir mappings
    const dbType = db.provider.toLowerCase();
    const relevantFiles = findFilesUsingDatabase(codeProject, dbType);
    
    console.log(`      Archivos que usan esta BD: ${relevantFiles.length}`);
    
    for (const file of relevantFiles) {
      const fileMappings = extractMappingsFromFile(file, dbType);
      mappings.push(...fileMappings);
      
      if (fileMappings.length > 0) {
        console.log(`         ${file.path}: ${fileMappings.length} mappings detectados`);
      }
    }
  }
  
  // 4. Si no hay mappings detectados, crear mappings inteligentes
  if (mappings.length === 0 && tablesSet.size > 0) {
    console.log(`\n   ⚠️ No se detectaron mappings desde código, usando análisis inteligente...`);
    
    // Obtener información de schemas de las tablas si está disponible
    const tablesInfo: any[] = [];
    for (const db of codeProject.databases) {
      const dbWithTables = db as any;
      
      // 🔥 DEBUG: Ver qué tiene cada DB
      console.log(`      🔍 Revisando db.provider = ${db.provider}`);
      console.log(`         db.tables existe: ${!!dbWithTables.tables}`);
      console.log(`         db.tables es array: ${Array.isArray(dbWithTables.tables)}`);
      
      if (dbWithTables.tables && Array.isArray(dbWithTables.tables)) {
        console.log(`         db.tables.length: ${dbWithTables.tables.length}`);
        tablesInfo.push(...dbWithTables.tables);
        
        // 🔥 Mostrar muestra de las tablas
        dbWithTables.tables.slice(0, 2).forEach((t: any, idx: number) => {
          console.log(`         Tabla ${idx + 1}:`, typeof t === 'object' ? JSON.stringify(t).substring(0, 100) : t);
        });
      }
    }
    
    console.log(`      📋 Total tablesInfo recopilada: ${tablesInfo.length} tablas con detalles`);
    
    if (tablesInfo.length > 0) {
      console.log(`      🔍 Muestra de tablesInfo[0]:`, JSON.stringify(tablesInfo[0], null, 2).substring(0, 300));
    }
    
    const intelligentMappings = createCommonFieldMappings(Array.from(tablesSet), tablesInfo);
    mappings.push(...intelligentMappings);
    
    console.log(`      ✅ Creados ${intelligentMappings.length} mappings inteligentes`);
  }
  
  console.log(`\n   ✅ Análisis completo:`);
  console.log(`      Tablas: ${tablesSet.size}`);
  console.log(`      Mappings: ${mappings.length}`);
  
  if (mappings.length > 0) {
    console.log(`      Detalle de mappings:`);
    mappings.forEach((m, i) => {
      console.log(`         ${i + 1}. ${m.table}.${m.filterField} ${m.operator || 'eq'} ${m.sourceField}`);
    });
  }
  
  return {
    mappings,
    tables: Array.from(tablesSet)
  };
}

/**
 * Encuentra archivos que usan una base de datos específica
 */
function findFilesUsingDatabase(codeProject: ParsedCodeProject, dbType: string): Array<{path: string, content: string}> {
  const files: Array<{path: string, content: string}> = [];
  
  // Buscar en archivos del proyecto (agents contienen el código)
  for (const agent of codeProject.agents) {
    const content = agent.systemPrompt || '';
    
    // Los agentes pueden tener código en description o en metadata
    const agentContent = [
      content,
      agent.description || '',
      JSON.stringify((agent as any).metadata || {})
    ].join('\n');
    
    // Detectar imports de BD
    if (
      (dbType.includes('supabase') && agentContent.includes('@supabase/supabase-js')) ||
      (dbType.includes('postgres') && (agentContent.includes('pg') || agentContent.includes('postgres'))) ||
      (dbType.includes('prisma') && agentContent.includes('@prisma/client')) ||
      (dbType.includes('drizzle') && agentContent.includes('drizzle-orm'))
    ) {
      files.push({ path: agent.filePath, content: agentContent });
    }
  }
  
  // También buscar en evidence de las BDs detectadas
  for (const db of codeProject.databases) {
    if (db.evidence && db.evidence.length > 0) {
      for (const evidenceFile of db.evidence) {
        // El evidence contiene paths de archivos que usan la BD
        files.push({ path: evidenceFile, content: '' });
      }
    }
  }
  
  return files;
}

/**
 * Extrae mappings de un archivo analizando queries y operaciones de BD
 */
function extractMappingsFromFile(file: {path: string, content: string}, dbType: string): DatabaseTableMapping[] {
  const mappings: DatabaseTableMapping[] = [];
  const content = file.content;
  
  if (dbType.includes('supabase')) {
    // Patrón 1: .from('table').select().eq('field', value)
    const supabasePatterns = [
      // supabase.from('conversaciones').select().eq('session_id', sessionId)
      /\.from\s*\(\s*['"](\w+)['"]\s*\)[\s\S]*?\.(?:eq|ilike|gt|lt|gte|lte)\s*\(\s*['"](\w+)['"]\s*,\s*(\w+)/g,
      
      // supabase.from('users').update({}).match({ phone: phoneNumber })
      /\.from\s*\(\s*['"](\w+)['"]\s*\)[\s\S]*?\.match\s*\(\s*\{\s*['"]?(\w+)['"]?\s*:\s*(\w+)/g,
      
      // supabase.from('tabla').select().filter('campo', 'eq', valor)
      /\.from\s*\(\s*['"](\w+)['"]\s*\)[\s\S]*?\.filter\s*\(\s*['"](\w+)['"]\s*,\s*['"](\w+)['"]\s*,\s*(\w+)/g,
    ];
    
    for (const pattern of supabasePatterns) {
      let match;
      while ((match = pattern.exec(content)) !== null) {
        const table = match[1];
        const filterField = match[2];
        const sourceField = match[3] || match[4]; // Depende del patrón
        
        if (table && filterField && sourceField) {
          // Inferir operator del método
          let operator = 'eq';
          if (content.includes(`.ilike('${filterField}'`)) operator = 'ilike';
          else if (content.includes(`.gt('${filterField}'`)) operator = 'gt';
          else if (content.includes(`.lt('${filterField}'`)) operator = 'lt';
          
          mappings.push({
            table,
            filterField,
            sourceField,
            operator
          });
        }
      }
    }
  } else if (dbType.includes('postgres')) {
    // Patrón 1: SQL con placeholders
    // SELECT * FROM users WHERE phone = $1
    const sqlPattern = /(?:SELECT|UPDATE|DELETE)[\s\S]*?FROM\s+(\w+)[\s\S]*?WHERE\s+(\w+)\s*=\s*\$\d+/gi;
    
    let match;
    while ((match = sqlPattern.exec(content)) !== null) {
      const table = match[1];
      const filterField = match[2];
      
      // Intentar inferir sourceField del contexto (nombre similar)
      const sourceField = filterField.replace(/_/g, ''); // session_id → sessionid
      
      mappings.push({
        table,
        filterField,
        sourceField,
        operator: 'eq'
      });
    }
  } else if (dbType.includes('prisma')) {
    // Patrón: prisma.user.findMany({ where: { phone: phoneNumber } })
    const prismaPattern = /prisma\.(\w+)\.(?:findMany|findUnique|findFirst)\s*\(\s*\{\s*where\s*:\s*\{\s*(\w+)\s*:\s*(\w+)/g;
    
    let match;
    while ((match = prismaPattern.exec(content)) !== null) {
      const table = match[1];
      const filterField = match[2];
      const sourceField = match[3];
      
      mappings.push({
        table,
        filterField,
        sourceField,
        operator: 'eq'
      });
    }
  }
  
  return mappings;
}

/**
 * Crea mappings genéricos para campos comunes cuando no se detectan específicos
 * 🔥 MEJORADO: Usa información del schema de la tabla si está disponible
 */
function createCommonFieldMappings(tables: string[], tablesInfo?: any[]): DatabaseTableMapping[] {
  const mappings: DatabaseTableMapping[] = [];
  
  console.log(`\n   🤖 Creando mappings inteligentes para ${tables.length} tablas...`);
  
  for (const table of tables) {
    const tableLower = table.toLowerCase();
    
    // Buscar info del schema si está disponible
    let tableSchema = null;
    if (tablesInfo && Array.isArray(tablesInfo)) {
      tableSchema = tablesInfo.find(t => 
        (typeof t === 'object' && t.name === table) || t === table
      );
    }
    
    // Si tenemos schema, analizar campos disponibles
    let availableFields: string[] = [];
    if (tableSchema && typeof tableSchema === 'object' && tableSchema.fields) {
      availableFields = tableSchema.fields.map((f: any) => 
        typeof f === 'object' ? f.name : f
      );
      console.log(`      📋 Tabla "${table}" tiene campos: ${availableFields.slice(0, 5).join(', ')}${availableFields.length > 5 ? '...' : ''}`);
    }
    
    // 🔥 ESTRATEGIA: Buscar el MEJOR campo de filtro disponible
    const filterCandidates = [
      // Para WhatsApp/Baileys
      { db: 'session_id', payload: 'session_id', priority: 100 },
      { db: 'from', payload: 'from', priority: 95 },
      { db: 'remoteJid', payload: 'from', priority: 90 },
      
      // Para conversaciones genéricas
      { db: 'conversationId', payload: 'conversationId', priority: 85 },
      { db: 'conversation_id', payload: 'conversationId', priority: 85 },
      { db: 'sessionId', payload: 'sessionId', priority: 80 },
      
      // Para usuarios
      { db: 'telefono', payload: 'from', priority: 75 },
      { db: 'phone', payload: 'from', priority: 75 },
      { db: 'user_id', payload: 'userId', priority: 70 },
      { db: 'userId', payload: 'userId', priority: 70 },
      
      // Fallback genérico
      { db: 'id', payload: 'id', priority: 10 },
    ];
    
    let selectedMapping = null;
    
    // Si tenemos campos del schema, buscar el mejor match
    if (availableFields.length > 0) {
      for (const candidate of filterCandidates) {
        // Buscar campo en schema (case-insensitive)
        const fieldExists = availableFields.some(f => 
          f.toLowerCase() === candidate.db.toLowerCase()
        );
        
        if (fieldExists) {
          const actualFieldName = availableFields.find(f => 
            f.toLowerCase() === candidate.db.toLowerCase()
          )!;
          
          selectedMapping = {
            table,
            filterField: actualFieldName, // Usar nombre real del campo
            sourceField: candidate.payload,
            operator: 'eq' as const
          };
          
          console.log(`      ✅ "${table}" → ${actualFieldName} = ${candidate.payload} (priority: ${candidate.priority})`);
          break;
        }
      }
    }
    
    // Si no encontramos match con schema, usar heurísticas por nombre de tabla
    if (!selectedMapping) {
      if (tableLower.includes('conversacion') || tableLower.includes('conversation') || tableLower.includes('chat') || tableLower.includes('mensaje')) {
        selectedMapping = {
          table,
          filterField: 'session_id',
          sourceField: 'session_id',
          operator: 'eq' as const
        };
        console.log(`      💡 "${table}" → session_id = session_id (heurística: tabla de conversaciones)`);
      } else if (tableLower.includes('user') || tableLower.includes('usuario') || tableLower.includes('contact')) {
        selectedMapping = {
          table,
          filterField: 'phone',
          sourceField: 'from',
          operator: 'eq' as const
        };
        console.log(`      💡 "${table}" → phone = from (heurística: tabla de usuarios)`);
      } else {
        // Fallback: usar session_id por defecto
        selectedMapping = {
          table,
          filterField: 'session_id',
          sourceField: 'session_id',
          operator: 'eq' as const
        };
        console.log(`      ⚠️ "${table}" → session_id = session_id (fallback genérico)`);
      }
    }
    
    mappings.push(selectedMapping);
  }
  
  return mappings;
}

/**
 * Construye WorkflowDatabaseInfo desde información de deepProjectAnalyzer
 * Esta es la función principal que debe llamarse desde AgentConfig
 * 
 * @param samplePayload - Payload generado para validar que los mappings tengan campos disponibles
 */
export function buildWorkflowInfoFromDeepAnalysis(
  codeProject: ParsedCodeProject,
  deepAnalysis?: any, // DeepProjectAnalysis de zipProjectDeepAnalyzer
  samplePayload?: Record<string, any> // 🔥 NUEVO: Para validar mappings
): WorkflowDatabaseInfo {
  console.log(`\n🔧 [ZIP DB Analyzer] Construyendo WorkflowDatabaseInfo desde deep analysis...`);
  
  // 1. Analizar bases de datos desde el código
  const workflowInfo = analyzeZipDatabases(codeProject);
  
  // 🔥 VALIDAR Y AJUSTAR MAPPINGS SEGÚN PAYLOAD REAL
  if (samplePayload && Object.keys(samplePayload).length > 0) {
    console.log(`   🔍 Validando mappings contra payload real...`);
    console.log(`      Campos en payload: ${Object.keys(samplePayload).join(', ')}`);
    
    const validatedMappings: DatabaseTableMapping[] = [];
    
    for (const mapping of workflowInfo.mappings) {
      // Verificar si el sourceField existe en el payload
      if (samplePayload[mapping.sourceField]) {
        validatedMappings.push(mapping);
        console.log(`      ✅ "${mapping.table}" → ${mapping.filterField} = ${mapping.sourceField} (válido)`);
      } else {
        // Intentar encontrar un campo alternativo
        console.log(`      ⚠️ "${mapping.table}" → ${mapping.sourceField} NO está en payload`);
        
        // Buscar campos comunes en el payload
        const payloadKeys = Object.keys(samplePayload);
        let alternativeField = null;
        
        // Prioridad de campos alternativos
        if (payloadKeys.includes('session_id')) alternativeField = 'session_id';
        else if (payloadKeys.includes('from')) alternativeField = 'from';
        else if (payloadKeys.includes('conversationId')) alternativeField = 'conversationId';
        else if (payloadKeys.includes('sessionId')) alternativeField = 'sessionId';
        else if (payloadKeys.includes('phone')) alternativeField = 'phone';
        
        if (alternativeField) {
          validatedMappings.push({
            ...mapping,
            sourceField: alternativeField
          });
          console.log(`      🔄 "${mapping.table}" → usando "${alternativeField}" en su lugar`);
        } else {
          console.log(`      ❌ "${mapping.table}" → no se encontró campo alternativo válido`);
        }
      }
    }
    
    workflowInfo.mappings = validatedMappings;
    console.log(`      ✅ Mappings validados: ${validatedMappings.length}/${workflowInfo.mappings.length} válidos`);
  }
  
  // 2. Si hay deep analysis, enriquecer con información adicional
  if (deepAnalysis && deepAnalysis.agents) {
    console.log(`   🧠 Enriqueciendo con información de ${deepAnalysis.agents.length} agentes...`);
    
    // Agregar mappings adicionales basados en lo que cada agente usa
    for (const agent of deepAnalysis.agents) {
      if (agent.databases && Array.isArray(agent.databases)) {
        for (const dbName of agent.databases) {
          // Si un agente menciona una BD, asegurarse de que tenga mappings
          if (!workflowInfo.tables.includes(dbName)) {
            workflowInfo.tables.push(dbName);
            
            // Agregar mapping genérico
            workflowInfo.mappings.push({
              table: dbName,
              filterField: 'session_id',
              sourceField: 'session_id',
              operator: 'eq'
            });
            
            console.log(`      Agregada tabla "${dbName}" desde agente "${agent.name}"`);
          }
        }
      }
    }
  }
  
  console.log(`\n   ✅ WorkflowDatabaseInfo construido:`);
  console.log(`      Tablas: ${workflowInfo.tables.length}`);
  console.log(`      Mappings: ${workflowInfo.mappings.length}`);
  
  return workflowInfo;
}
