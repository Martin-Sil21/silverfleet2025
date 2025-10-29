/**
 * Analiza el workflow de n8n para extraer información de cómo se usan las bases de datos
 * Detecta automáticamente qué campos usar para filtrar en cada tabla
 */

export interface DatabaseTableMapping {
  table: string;
  filterField: string; // Campo que se usa para filtrar (ej: "session_id", "telefono")
  sourceField: string; // De dónde viene el valor (ej: "sessionId", "telefono" del payload)
}

export interface WorkflowDatabaseInfo {
  mappings: DatabaseTableMapping[];
  tables: string[];
}

/**
 * Analiza el workflow JSON para extraer información de bases de datos
 */
export function analyzeWorkflowDatabases(workflowNodes: any[]): WorkflowDatabaseInfo {
  const mappings: DatabaseTableMapping[] = [];
  const tablesSet = new Set<string>();
  
  console.log(`\n🔍 [Workflow Analyzer] Analizando ${workflowNodes.length} nodos del workflow...`);
  
  for (const node of workflowNodes) {
    // Detectar nodos de Supabase
    if (node.type === 'n8n-nodes-base.supabase' || node.name?.toLowerCase().includes('supabase')) {
      const params = node.parameters || {};
      const table = params.table || params.tableName;
      
      if (!table) continue;
      
      tablesSet.add(table);
      console.log(`\n   📊 Nodo Supabase encontrado: "${node.name}"`);
      console.log(`      Tabla: ${table}`);
      
      // Analizar filtros
      const conditions = params.conditions || params.filters || {};
      
      // Formato 1: conditions.string (n8n moderno)
      if (conditions.string && Array.isArray(conditions.string)) {
        for (const condition of conditions.string) {
          const filterField = condition.value1 || condition.field || condition.column;
          const sourceValue = condition.value2 || condition.value;
          
          if (filterField && sourceValue) {
            // Extraer nombre del campo del payload (ej: "={{$json.sessionId}}" → "sessionId")
            const sourceField = extractFieldName(sourceValue);
            
            if (sourceField) {
              console.log(`      🎯 Filtro detectado: ${filterField} = ${sourceField}`);
              mappings.push({ table, filterField, sourceField });
            }
          }
        }
      }
      
      // Formato 2: filterType manual con matchMode
      if (params.filterType === 'manual') {
        // Ya procesado arriba
      }
      
      // Formato 3: additionalFields.queryName (queries raw)
      const additionalFields = params.additionalFields || {};
      if (additionalFields.queryName) {
        console.log(`      📝 Query SQL detectado (raw): ${additionalFields.queryName}`);
        // TODO: Parsear SQL si es necesario
      }
    }
    
    // Detectar nodos de Postgres
    if (node.type === 'n8n-nodes-base.postgres' || node.name?.toLowerCase().includes('postgres')) {
      const params = node.parameters || {};
      const query = params.query;
      
      if (query) {
        console.log(`\n   🐘 Nodo Postgres encontrado: "${node.name}"`);
        console.log(`      Query: ${query.substring(0, 100)}...`);
        
        // Intentar extraer tabla y filtros del SQL
        const sqlInfo = parseSQLQuery(query);
        if (sqlInfo) {
          tablesSet.add(sqlInfo.table);
          if (sqlInfo.filterField && sqlInfo.sourceField) {
            console.log(`      🎯 Filtro detectado: ${sqlInfo.filterField} = ${sqlInfo.sourceField}`);
            mappings.push({
              table: sqlInfo.table,
              filterField: sqlInfo.filterField,
              sourceField: sqlInfo.sourceField
            });
          }
        }
      }
    }
    
    // Detectar otros tipos de nodos de BD (MySQL, MongoDB, etc.)
    // TODO: Agregar más tipos según necesidad
  }
  
  console.log(`\n   ✅ Análisis completo:`);
  console.log(`      Tablas encontradas: ${tablesSet.size}`);
  console.log(`      Mappings detectados: ${mappings.length}`);
  
  return {
    mappings,
    tables: Array.from(tablesSet)
  };
}

/**
 * Extrae el nombre del campo desde una expresión n8n
 * Ejemplos:
 *   "={{$json.sessionId}}" → "sessionId"
 *   "={{$json.telefono}}" → "telefono"
 *   "{{$node['Webhook'].json['session_id']}}" → "session_id"
 *   "123456" → null (valor literal, no variable)
 */
function extractFieldName(expression: string): string | null {
  if (!expression || typeof expression !== 'string') return null;
  
  // Caso 1: ={{$json.fieldName}}
  const match1 = expression.match(/\{\{.*?\$json\.(\w+).*?\}\}/);
  if (match1) return match1[1];
  
  // Caso 2: ={{$node['Webhook'].json['fieldName']}}
  const match2 = expression.match(/\{\{.*?json\['(\w+)'\].*?\}\}/);
  if (match2) return match2[1];
  
  // Caso 3: ={{$node['Webhook'].json["fieldName"]}}
  const match3 = expression.match(/\{\{.*?json\["(\w+)"\].*?\}\}/);
  if (match3) return match3[1];
  
  // Caso 4: Valor literal (no es variable)
  return null;
}

/**
 * Parsea un query SQL básico para extraer tabla y filtros
 */
function parseSQLQuery(query: string): { table: string; filterField?: string; sourceField?: string } | null {
  if (!query || typeof query !== 'string') return null;
  
  // Extraer tabla: SELECT ... FROM table_name
  const tableMatch = query.match(/FROM\s+(\w+)/i);
  if (!tableMatch) return null;
  
  const table = tableMatch[1];
  
  // Intentar extraer WHERE clause
  const whereMatch = query.match(/WHERE\s+(\w+)\s*=\s*(.+?)(?:\s|$|;)/i);
  if (whereMatch) {
    const filterField = whereMatch[1];
    const valueExpression = whereMatch[2].trim();
    const sourceField = extractFieldName(valueExpression);
    
    return { table, filterField, sourceField: sourceField || undefined };
  }
  
  return { table };
}

/**
 * Encuentra el mapping para una tabla específica
 */
export function findMappingForTable(
  tableName: string,
  workflowInfo: WorkflowDatabaseInfo
): DatabaseTableMapping | undefined {
  return workflowInfo.mappings.find(m => 
    m.table.toLowerCase() === tableName.toLowerCase()
  );
}

/**
 * Obtiene el valor del campo de filtro desde el payload
 */
export function getFilterValue(
  mapping: DatabaseTableMapping,
  payload: Record<string, any>
): string | undefined {
  // Buscar en el payload el campo que necesitamos
  const value = payload[mapping.sourceField];
  
  if (value !== undefined && value !== null) {
    return String(value);
  }
  
  // Intentar variaciones del nombre (camelCase, snake_case, etc.)
  const variations = [
    mapping.sourceField,
    mapping.sourceField.toLowerCase(),
    toSnakeCase(mapping.sourceField),
    toCamelCase(mapping.sourceField)
  ];
  
  for (const variation of variations) {
    if (payload[variation] !== undefined && payload[variation] !== null) {
      return String(payload[variation]);
    }
  }
  
  return undefined;
}

/**
 * Convierte camelCase a snake_case
 */
function toSnakeCase(str: string): string {
  return str.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
}

/**
 * Convierte snake_case a camelCase
 */
function toCamelCase(str: string): string {
  return str.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
}

