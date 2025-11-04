/**
 * Analiza el workflow de n8n para extraer información de cómo se usan las bases de datos
 * Detecta automáticamente qué campos usar para filtrar en cada tabla
 */

export interface DatabaseTableMapping {
  table: string;
  filterField: string; // Campo que se usa para filtrar (ej: "session_id", "telefono")
  sourceField: string; // De dónde viene el valor (ej: "sessionId", "telefono" del payload)
  operator?: string; // Operador SQL (eq, ilike, gt, lt, etc.)
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
  
  if (!workflowNodes || workflowNodes.length === 0) {
    console.error(`   ❌ No se proporcionaron nodos del workflow`);
    return { mappings: [], tables: [] };
  }
  
  for (const node of workflowNodes) {
    console.log(`\n   📦 Analizando nodo: "${node.name}" (type: ${node.type})`);
    
    // Detectar nodos de Supabase
    if (node.type === 'n8n-nodes-base.supabase' || node.name?.toLowerCase().includes('supabase')) {
      console.log(`      ✅ Nodo de Supabase detectado!`);
      const params = node.parameters || {};
      
      // Buscar tabla en diferentes ubicaciones posibles
      const table = params.table || 
                    params.tableName || 
                    params.tableId ||
                    params.resource ||
                    (params.operation?.table) ||
                    null;
      
      // También buscar en todo el JSON por strings que parezcan nombres de tabla
      const nodeStr = JSON.stringify(params).toLowerCase();
      const tableMatches = nodeStr.match(/"(?:table|tablename|tableid)":\s*"([^"]+)"/i);
      const detectedTable = table || (tableMatches ? tableMatches[1] : null);
      
      if (!detectedTable) {
        console.log(`      ⚠️ Sin tabla detectada`);
        console.log(`      Params completos:`, JSON.stringify(params, null, 2).substring(0, 500));
        continue;
      }
      
      tablesSet.add(detectedTable);
      console.log(`      📊 Tabla: ${detectedTable}`);
      
      // 🔥 DEBUG: Ver estructura completa de params para diagnosticar
      console.log(`      📦 Params del nodo:`, JSON.stringify(params, null, 2));
      
      // Analizar filtros en MÚLTIPLES formatos posibles de n8n
      let filtersFound = false;
      
      // 🔥 FORMATO NUEVO: filters.conditions con keyName/keyValue (Supabase moderno)
      console.log(`      🔍 Verificando params.filters?.conditions:`, params.filters?.conditions);
      if (params.filters?.conditions && Array.isArray(params.filters.conditions)) {
        console.log(`      ✅ ENTRÓ al bloque filters.conditions`);

        for (const condition of params.filters.conditions) {
          const filterField = condition.keyName || condition.key || condition.field;
          const sourceValue = condition.keyValue || condition.value;
          const operator = condition.condition || 'eq'; // eq, ilike, gt, lt, etc.
          
          if (filterField && sourceValue) {
            const sourceField = extractFieldName(sourceValue);
            if (sourceField) {
              console.log(`      🎯 Filtro detectado (filters.conditions): ${filterField} ${operator} ${sourceField}`);
              mappings.push({ table: detectedTable, filterField, sourceField, operator });
              filtersFound = true;
            }
          }
        }
      }
      
      // Formato 1: conditions.string (n8n moderno con UI de condiciones)
      console.log(`      🔍 Verificando conditions.string:`, params.conditions?.string);
      const conditions = params.conditions || params.where || {};
      if (conditions.string && Array.isArray(conditions.string)) {
        console.log(`      ✅ ENTRÓ al bloque conditions.string`);

        for (const condition of conditions.string) {
          const filterField = condition.value1 || condition.field || condition.column;
          const sourceValue = condition.value2 || condition.value;
          
          if (filterField && sourceValue) {
            const sourceField = extractFieldName(sourceValue);
            if (sourceField) {
              console.log(`      🎯 Filtro detectado (conditions.string): ${filterField} = ${sourceField}`);
              mappings.push({ table: detectedTable, filterField, sourceField });
              filtersFound = true;
            }
          }
        }
      }
      
      // Formato 2: filterType manual con matchMode (n8n Supabase específico)
      console.log(`      🔍 Verificando filterType manual:`, params.filterType, params.filterValues);
      if (params.filterType === 'manual' && params.filterValues) {
        console.log(`      ✅ ENTRÓ al bloque filterType manual`);

        const filters = Array.isArray(params.filterValues) ? params.filterValues : [params.filterValues];
        for (const filter of filters) {
          const filterField = filter.key || filter.field || filter.column;
          const sourceValue = filter.value || filter.val;
          
          if (filterField && sourceValue) {
            const sourceField = extractFieldName(sourceValue);
            if (sourceField) {
              console.log(`      🎯 Filtro detectado (filterValues): ${filterField} = ${sourceField}`);
              mappings.push({ table: detectedTable, filterField, sourceField });
              filtersFound = true;
            }
          }
        }
      }
      
      // Formato 3: options.qs (query string directo)
      console.log(`      🔍 Verificando options.qs:`, params.options?.qs);
      if (params.options?.qs) {
        console.log(`      ✅ ENTRÓ al bloque options.qs`);

        const qs = params.options.qs;
        for (const [key, value] of Object.entries(qs)) {
          if (typeof value === 'string') {
            const sourceField = extractFieldName(value);
            if (sourceField) {
              console.log(`      🎯 Filtro detectado (options.qs): ${key} = ${sourceField}`);
              mappings.push({ table: detectedTable, filterField: key, sourceField });
              filtersFound = true;
            }
          }
        }
      }
      
      // Formato 4: Búsqueda exhaustiva en el JSON completo del nodo
      // Buscar patrones como "session_id": "={{$json.sessionId}}"
      console.log(`      🔍 filtersFound hasta ahora: ${filtersFound}`);
      if (!filtersFound) {
        console.log(`      ⚠️ NINGÚN formato detectó filtros, usando búsqueda exhaustiva...`);

        const paramsStr = JSON.stringify(params);
        const filterPatterns = [
          /["'](\w+)["']\s*:\s*["']={{[\$\s]*json\.(\w+)}}["']/g,  // "field": "={{$json.value}}"
          /["'](\w+)["']\s*:\s*["']{{[\$\s]*json\.(\w+)}}["']/g,     // "field": "{{$json.value}}"
          /["'](\w+)["']\s*:\s*["']={{[\s]*(\w+)}}["']/g,            // "field": "={{value}}"
        ];
        
        for (const pattern of filterPatterns) {
          let match;
          while ((match = pattern.exec(paramsStr)) !== null) {
            const filterField = match[1];
            const sourceField = match[2];
            
            // Filtrar campos técnicos
            if (!filterField.startsWith('_') && !['table', 'operation', 'returnAll'].includes(filterField)) {
              console.log(`      🎯 Filtro detectado (pattern search): ${filterField} = ${sourceField}`);
              mappings.push({ table: detectedTable, filterField, sourceField });
              filtersFound = true;
            }
          }
        }
      }
      
      // Si aún no encontramos filtros, intentar detectar campos comunes
      if (!filtersFound) {
        const paramsStr = JSON.stringify(params);
        const commonFields = ['session_id', 'sessionId', 'session', 'telefono', 'phone', 'email', 'user_id', 'userId'];
        
        for (const field of commonFields) {
          if (paramsStr.includes(field)) {
            console.log(`      💡 Campo común detectado en params: ${field} (usando como hint para auto-detect)`);
            // No agregamos al mapping, pero el auditor lo usará como hint
          }
        }
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
  
  // 🔥 DEBUG: Mostrar todos los mappings encontrados
  if (mappings.length > 0) {
    console.log(`      📋 Detalle de mappings:`);
    mappings.forEach((m, i) => {
      console.log(`         ${i + 1}. ${m.table}.${m.filterField} ${m.operator || 'eq'} ${m.sourceField}`);
    });
  } else {
    console.log(`      ⚠️ NO SE DETECTARON MAPPINGS - Auditoría usará auto-detect`);
  }
  
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
 *   "={{$('Input1').item.json.telefonos.trim()}}" → "telefonos"
 *   "={{$json.data.last().teléfono.trim()}}" → "teléfono" (último campo en cadena)
 *   "={{$json.data[0].session_id}}" → "session_id" (acceso con índice)
 *   "{{$node['Webhook'].json['session_id']}}" → "session_id"
 *   "123456" → null (valor literal, no variable)
 */
function extractFieldName(expression: string): string | null {
  if (!expression || typeof expression !== 'string') return null;
  
  console.log(`         🔎 Extrayendo campo de: "${expression}"`);
  
  // Caso 1: ={{$json.data[0].fieldName}} o ={{$json.data.last().fieldName}}
  // Busca el ÚLTIMO campo en la cadena antes de métodos como .trim()
  const match1 = expression.match(/\.(\w+)(?:\s*\.\s*\w+\s*\(\s*\)\s*)*\s*\}*$/);
  if (match1) {
    console.log(`         ✅ Extraído (último campo): "${match1[1]}"`);
    return match1[1];
  }
  
  // Caso 2: ={{$json.fieldName}} (simple)
  const match2 = expression.match(/\$json\.(\w+)/);
  if (match2) {
    console.log(`         ✅ Extraído ($json): "${match2[1]}"`);
    return match2[1];
  }
  
  // Caso 3: ={{$('NodeName').item.json.fieldName}}
  const match3 = expression.match(/\$\([^)]+\)\.item\.json\.(\w+)/);
  if (match3) {
    console.log(`         ✅ Extraído (node reference): "${match3[1]}"`);
    return match3[1];
  }
  
  // Caso 4: ={{$node['Webhook'].json['fieldName']}} o ["fieldName"]
  const match4 = expression.match(/json\[['"](\w+)['"]\]/);
  if (match4) {
    console.log(`         ✅ Extraído (bracket notation): "${match4[1]}"`);
    return match4[1];
  }
  
  console.log(`         ⚠️ No se pudo extraer campo (valor literal?)`);
  // Caso 5: Valor literal (no es variable)
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
 * Encuentra el MEJOR mapping disponible para una tabla (el primero con valor en payload)
 * IMPORTANTE: Si una tabla tiene múltiples mappings, intenta TODOS hasta encontrar uno que funcione
 */
export function findMappingForTable(
  tableName: string,
  workflowInfo: WorkflowDatabaseInfo,
  payload?: Record<string, any>
): DatabaseTableMapping | undefined {
  // Obtener TODOS los mappings para esta tabla
  const candidateMappings = workflowInfo.mappings.filter(m => 
    m.table.toLowerCase() === tableName.toLowerCase()
  );
  
  console.log(`      📋 Encontrados ${candidateMappings.length} mappings para tabla "${tableName}"`);
  
  // Si no hay payload, devolver el primero
  if (!payload) {
    return candidateMappings[0];
  }
  
  // Probar cada mapping hasta encontrar uno que tenga valor en payload
  for (const mapping of candidateMappings) {
    const value = getFilterValue(mapping, payload);
    if (value !== undefined && value !== null && value !== '') {
      console.log(`      ✅ Mapping seleccionado: ${mapping.filterField} ${mapping.operator} ${mapping.sourceField} (valor="${value}")`);
      return mapping;
    } else {
      console.log(`      ⏭️ Mapping descartado: ${mapping.sourceField} no existe en payload`);
    }
  }
  
  console.log(`      ⚠️ Ningún mapping tiene valor en payload`);
  return candidateMappings[0]; // Fallback al primero
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

