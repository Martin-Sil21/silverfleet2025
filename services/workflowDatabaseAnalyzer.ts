/**
 * Analiza el workflow de n8n para extraer información de cómo se usan las bases de datos
 * Detecta automáticamente qué campos usar para filtrar en cada tabla
 */

// 🔥 ALIASES: Mapeo de campos comunes entre payload y BD
const FIELD_ALIASES: Record<string, string[]> = {
  'session_id': ['sessionId', 'session', 'conversationId', 'conversation_id', 'telefono', 'from', 'phone', 'tel'],
  'user_id': ['userId', 'user', 'from', 'userName'],
  'conversation_id': ['conversationId', 'conversation', 'sessionId', 'session_id', 'chatId', 'chat_id'],
  'telefono': ['phone', 'telephone', 'tel', 'from', 'numero', 'session_id', 'sessionId'],
  'from': ['telefono', 'phone', 'session_id', 'sessionId', 'numero']
};

export interface DatabaseTableMapping {
  table: string;
  filterField: string; // Campo que se usa para filtrar (ej: "session_id", "telefono")
  sourceField: string; // De dónde viene el valor (ej: "sessionId", "telefono" del payload)
  operator?: string; // Operador SQL (eq, ilike, gt, lt, etc.)
}

export interface WorkflowDatabaseInfo {
  mappings: DatabaseTableMapping[];
  tables: string[];
  unmappedNodes?: Array<{ nodeName: string; nodeType: string; reason: string }>; // 🔥 NUEVO: Nodos que no se pudieron mapear
  warnings?: string[]; // 🔥 NUEVO: Advertencias generales
}

/**
 * Analiza el workflow JSON para extraer información de bases de datos
 */
export function analyzeWorkflowDatabases(workflowNodes: any[]): WorkflowDatabaseInfo {
  const mappings: DatabaseTableMapping[] = [];
  const tablesSet = new Set<string>();
  const unmappedNodes: Array<{ nodeName: string; nodeType: string; reason: string }> = []; // 🔥 NUEVO
  const warnings: string[] = []; // 🔥 NUEVO
  
  console.log(`\n🔍 [Workflow Analyzer] Analizando ${workflowNodes.length} nodos del workflow...`);
  
  if (!workflowNodes || workflowNodes.length === 0) {
    console.error(`   ❌ No se proporcionaron nodos del workflow`);
    return { mappings: [], tables: [], unmappedNodes: [], warnings: ['No se proporcionaron nodos del workflow'] };
  }
  
  for (const node of workflowNodes) {
    console.log(`\n   📦 Analizando nodo: "${node.name}" (type: ${node.type})`);
    
    // Detectar nodos de Supabase
    if (node.type === 'n8n-nodes-base.supabase' || node.name?.toLowerCase().includes('supabase')) {
      console.log(`      ✅ Nodo de Supabase detectado!`);
      const params = node.parameters || {};
      
      // 🔥 NUEVO: Usar búsqueda exhaustiva
      const detectedTable = extractTableNameExhaustive(node);
      
      if (!detectedTable) {
        console.warn(`\n      ⚠️⚠️⚠️ ADVERTENCIA: No se detectó tabla en nodo "${node.name}"`);
        console.warn(`      Estructura del nodo (primeros 800 chars):`, JSON.stringify(params, null, 2).substring(0, 800));
        console.warn(`      Este nodo NO será monitoreado en la auditoría de BD`);
        console.warn(`      👉 ACCIÓN RECOMENDADA: Especifica la tabla manualmente en la UI\n`);
        
        // 🔥 NO hacer continue, registrar el nodo como "requiere atención"
        unmappedNodes.push({
          nodeName: node.name,
          nodeType: node.type,
          reason: 'No se pudo detectar tabla automáticamente'
        });
        continue; // Ahora sí hacemos continue pero después de registrar
      }
      
      tablesSet.add(detectedTable);
      console.log(`      📊 Tabla detectada: ${detectedTable}`);
      
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
      
      // 🔥 FORMATO 4: additionalFields.filter (algunos nodos de Supabase)
      console.log(`      🔍 Verificando additionalFields.filter:`, params.additionalFields?.filter);
      if (!filtersFound && params.additionalFields?.filter) {
        console.log(`      ✅ ENTRÓ al bloque additionalFields.filter`);
        
        const filter = params.additionalFields.filter;
        
        // Puede ser string "field=value" o objeto { field: "value" }
        if (typeof filter === 'string') {
          const match = filter.match(/(\w+)\s*=\s*(.+)/);
          if (match) {
            const filterField = match[1];
            const sourceValue = match[2];
            const sourceField = extractFieldName(sourceValue);
            
            if (sourceField) {
              console.log(`      🎯 Filtro detectado (string filter): ${filterField} = ${sourceField}`);
              mappings.push({ table: detectedTable, filterField, sourceField });
              filtersFound = true;
            }
          }
        } else if (typeof filter === 'object' && filter !== null) {
          for (const [key, value] of Object.entries(filter)) {
            const sourceField = extractFieldName(String(value));
            if (sourceField) {
              console.log(`      🎯 Filtro detectado (object filter): ${key} = ${sourceField}`);
              mappings.push({ table: detectedTable, filterField: key, sourceField });
              filtersFound = true;
            }
          }
        }
      }
      
      // 🔥 FORMATO 5: params.where (condiciones WHERE directas)
      console.log(`      🔍 Verificando params.where:`, params.where);
      if (!filtersFound && params.where && typeof params.where === 'object') {
        console.log(`      ✅ ENTRÓ al bloque params.where`);
        
        for (const [key, value] of Object.entries(params.where)) {
          if (typeof value === 'string') {
            const sourceField = extractFieldName(value);
            if (sourceField) {
              console.log(`      🎯 Filtro detectado (where clause): ${key} = ${sourceField}`);
              mappings.push({ table: detectedTable, filterField: key, sourceField });
              filtersFound = true;
            }
          }
        }
      }
      
      // 🔥 FORMATO 6: params.eq / params.ilike / params.like (operadores directos)
      const operatorParams = ['eq', 'ilike', 'like', 'neq', 'gt', 'lt', 'gte', 'lte'];
      for (const op of operatorParams) {
        if (!filtersFound && params[op] && typeof params[op] === 'object') {
          console.log(`      ✅ ENTRÓ al bloque params.${op}`);
          
          for (const [key, value] of Object.entries(params[op])) {
            if (typeof value === 'string') {
              const sourceField = extractFieldName(value);
              if (sourceField) {
                console.log(`      🎯 Filtro detectado (${op} operator): ${key} ${op} ${sourceField}`);
                mappings.push({ table: detectedTable, filterField: key, sourceField, operator: op });
                filtersFound = true;
              }
            }
          }
        }
      }
      
      // 🔥 FORMATO 7: SELECT ... WHERE en additionalFields.queryString
      console.log(`      🔍 Verificando additionalFields.queryString:`, params.additionalFields?.queryString);
      if (!filtersFound && params.additionalFields?.queryString) {
        console.log(`      ✅ ENTRÓ al bloque queryString`);
        
        const queryString = params.additionalFields.queryString;
        
        // Parsear query string: "field1=value1&field2=value2"
        const pairs = queryString.split('&');
        for (const pair of pairs) {
          const [key, value] = pair.split('=');
          if (key && value) {
            const sourceField = extractFieldName(decodeURIComponent(value));
            if (sourceField) {
              console.log(`      🎯 Filtro detectado (queryString): ${key} = ${sourceField}`);
              mappings.push({ table: detectedTable, filterField: key, sourceField });
              filtersFound = true;
            }
          }
        }
      }
      
      // 🔥 FORMATO 8: params.match (filtros de Supabase con match())
      console.log(`      🔍 Verificando params.match:`, params.match);
      if (!filtersFound && params.match && typeof params.match === 'object') {
        console.log(`      ✅ ENTRÓ al bloque params.match`);
        
        for (const [key, value] of Object.entries(params.match)) {
          if (typeof value === 'string') {
            const sourceField = extractFieldName(value);
            if (sourceField) {
              console.log(`      🎯 Filtro detectado (match): ${key} = ${sourceField}`);
              mappings.push({ table: detectedTable, filterField: key, sourceField, operator: 'eq' });
              filtersFound = true;
            }
          }
        }
      }
      
      // Formato 9: Búsqueda exhaustiva en el JSON completo del nodo
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
    
    // 🔥 NUEVO: Detectar tablas sin mappings
    const tablesWithMappings = new Set(mappings.map(m => m.table));
    const tablesWithoutMappings = Array.from(tablesSet).filter(t => !tablesWithMappings.has(t));
    
    if (tablesWithoutMappings.length > 0) {
      console.warn(`\n      ⚠️ ATENCIÓN: ${tablesWithoutMappings.length} tabla(s) detectadas SIN filtros:`);
      tablesWithoutMappings.forEach((table, idx) => {
        console.warn(`         ${idx + 1}. "${table}" - NO tiene filtros configurados`);
      });
      console.warn(`      💡 Estas tablas traerán TODOS los registros (puede ser lento)`);
      console.warn(`      👉 Considera configurar filtros manualmente para estas tablas\n`);
      warnings.push(`${tablesWithoutMappings.length} tabla(s) sin filtros: ${tablesWithoutMappings.join(', ')}`);
    }
  } else {
    console.log(`      ⚠️ NO SE DETECTARON MAPPINGS - Auditoría usará auto-detect`);
    warnings.push('No se detectaron mappings automáticamente');
    
    if (tablesSet.size > 0) {
      console.warn(`\n      ⚠️ Se detectaron ${tablesSet.size} tabla(s) pero SIN filtros:`);
      Array.from(tablesSet).forEach((table, idx) => {
        console.warn(`         ${idx + 1}. "${table}" - Sin filtros`);
      });
      console.warn(`      💡 El auto-detect intentará encontrar campos comunes (session_id, etc.)`);
      console.warn(`      👉 Si falla, traerá TODAS las filas de estas tablas\n`);
    }
  }
  
  // 🔥 NUEVO: Reportar nodos sin mapear
  if (unmappedNodes.length > 0) {
    console.warn(`\n   ⚠️⚠️⚠️ ATENCIÓN: ${unmappedNodes.length} nodo(s) de BD NO fueron mapeados:`);
    unmappedNodes.forEach((node, idx) => {
      console.warn(`      ${idx + 1}. ${node.nodeName} (${node.nodeType})`);
      console.warn(`         Razón: ${node.reason}`);
    });
    console.warn(`   👉 Esto puede causar que la auditoría NO detecte cambios en estas tablas\n`);
    warnings.push(`${unmappedNodes.length} nodo(s) de BD no pudieron ser mapeados automáticamente`);
  }
  
  // 🔥 NUEVO: Advertencia crítica si NO se detectó NADA
  if (tablesSet.size === 0) {
    console.error(`\n   🚨🚨🚨 PROBLEMA CRÍTICO 🚨🚨🚨`);
    console.error(`   NO se detectaron TABLAS en el workflow`);
    console.error(`   La auditoría de BD NO funcionará`);
    console.error(`\n   💡 POSIBLES CAUSAS:`);
    console.error(`      1. El workflow no tiene nodos de BD (Supabase, Postgres, etc.)`);
    console.error(`      2. Los nodos usan un formato no soportado`);
    console.error(`      3. Los nombres de tabla están en variables/expresiones complejas`);
    console.error(`\n   🛠️ SOLUCIONES:`);
    console.error(`      1. Verifica que el workflow tenga nodos de Supabase o Postgres`);
    console.error(`      2. Especifica las tablas manualmente en la configuración`);
    console.error(`      3. Comparte el archivo .json del workflow para análisis\n`);
    warnings.push('CRÍTICO: No se detectaron tablas en el workflow');
  }
  
  return {
    mappings,
    tables: Array.from(tablesSet),
    unmappedNodes,
    warnings
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
  
  // 🔥 NUEVO: Intentar aliases del filterField (ej: session_id → sessionId, conversationId, etc.)
  const filterFieldLower = mapping.filterField.toLowerCase();
  const aliases = FIELD_ALIASES[filterFieldLower] || FIELD_ALIASES[mapping.filterField] || [];
  
  for (const alias of aliases) {
    if (payload[alias] !== undefined && payload[alias] !== null) {
      console.log(`      🔄 Usando alias "${alias}" para campo "${mapping.filterField}"`);
      return String(payload[alias]);
    }
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

/**
 * 🔥 NUEVO: Busca nombre de tabla de manera EXHAUSTIVA en el nodo
 * Intenta múltiples estrategias hasta encontrar la tabla
 */
function extractTableNameExhaustive(node: any): string | null {
  console.log(`      🔍 Búsqueda exhaustiva de tabla en nodo "${node.name}"`);
  
  const params = node.parameters || {};
  
  // ESTRATEGIA 1: Ubicaciones conocidas en params
  const knownLocations = [
    params.table,
    params.tableName,
    params.tableId,
    params.resource,
    params.operation?.table,
    params.operation?.resource,
    params.options?.table,
    params.options?.resource
  ];
  
  for (const loc of knownLocations) {
    if (loc && typeof loc === 'string' && loc.trim().length > 0) {
      console.log(`      ✅ Tabla encontrada (ubicación conocida): "${loc}"`);
      return loc.trim();
    }
  }
  
  // ESTRATEGIA 2: Buscar en additionalFields.queryName (queries SQL raw)
  if (params.additionalFields?.queryName) {
    const sqlQuery = params.additionalFields.queryName;
    const match = sqlQuery.match(/FROM\s+([`"])?(\w+)\1/i);
    if (match && match[2]) {
      console.log(`      ✅ Tabla encontrada (SQL query): "${match[2]}"`);
      return match[2];
    }
  }
  
  // ESTRATEGIA 3: Buscar en filters.conditions
  if (params.filters?.conditions && Array.isArray(params.filters.conditions)) {
    const firstCondition = params.filters.conditions[0];
    if (firstCondition?.table) {
      console.log(`      ✅ Tabla encontrada (filters.conditions): "${firstCondition.table}"`);
      return firstCondition.table;
    }
  }
  
  // ESTRATEGIA 4: Búsqueda en JSON RAW con múltiples patrones
  const nodeStr = JSON.stringify(node);
  
  // Patrón 1: "table": "nombre_tabla"
  const pattern1 = /"(?:table|tableName|tableId|resource)":\s*"([a-zA-Z_][a-zA-Z0-9_]*)"/gi;
  let match = pattern1.exec(nodeStr);
  if (match && match[1]) {
    console.log(`      ✅ Tabla encontrada (patrón JSON "table"): "${match[1]}"`);
    return match[1];
  }
  
  // Patrón 2: FROM table_name (en queries SQL embebidos)
  const pattern2 = /FROM\s+([`"])?([a-zA-Z_][a-zA-Z0-9_]*)\1/gi;
  match = pattern2.exec(nodeStr);
  if (match && match[2]) {
    console.log(`      ✅ Tabla encontrada (SQL FROM): "${match[2]}"`);
    return match[2];
  }
  
  // Patrón 3: .from('table_name') o .from("table_name") (Supabase client syntax)
  const pattern3 = /\.from\s*\(\s*['"]([a-zA-Z_][a-zA-Z0-9_]*)['"]\s*\)/gi;
  match = pattern3.exec(nodeStr);
  if (match && match[1]) {
    console.log(`      ✅ Tabla encontrada (.from() syntax): "${match[1]}"`);
    return match[1];
  }
  
  // ESTRATEGIA 5: Heurística - buscar palabras que parezcan nombres de tabla
  // Solo si TODO lo demás falló y es un nodo de BD
  if (node.type?.includes('supabase') || node.type?.includes('postgres')) {
    const commonTableWords = [
      'usuarios', 'users', 'clientes', 'customers', 
      'pedidos', 'orders', 'productos', 'products',
      'mensajes', 'messages', 'historico', 'history',
      'conversaciones', 'conversations', 'sesiones', 'sessions',
      'chats', 'contactos', 'contacts'
    ];
    
    const nodeLower = nodeStr.toLowerCase();
    for (const word of commonTableWords) {
      if (nodeLower.includes(`"${word}"`)) {
        console.log(`      💡 Posible tabla detectada (heurística): "${word}"`);
        console.log(`      ⚠️ ADVERTENCIA: Detección por heurística, puede ser incorrecta`);
        return word;
      }
    }
  }
  
  console.log(`      ❌ No se pudo detectar tabla con ningún método`);
  return null;
}

/**
 * Extrae nombre de tabla de ubicaciones menos obvias en params
 * @deprecated Usar extractTableNameExhaustive() en su lugar
 */
function extractTableFromParams(params: any): string | null {
  if (!params) return null;
  
  // 1. Buscar en additionalFields.queryName (queries SQL raw)
  if (params.additionalFields?.queryName) {
    const sqlQuery = params.additionalFields.queryName;
    const match = sqlQuery.match(/FROM\s+([`"])?(\w+)\1/i);
    if (match) {
      console.log(`      💡 Tabla extraída de SQL query: ${match[2]}`);
      return match[2];
    }
  }
  
  // 2. Buscar en filters.conditions (puede tener metadata de tabla)
  if (params.filters?.conditions && Array.isArray(params.filters.conditions)) {
    const firstCondition = params.filters.conditions[0];
    if (firstCondition?.table) {
      console.log(`      💡 Tabla extraída de filters.conditions: ${firstCondition.table}`);
      return firstCondition.table;
    }
  }
  
  // 3. Buscar en toda la estructura JSON (último recurso)
  const paramsStr = JSON.stringify(params);
  const tablePattern = /"(?:from|table)"\s*:\s*"(\w+)"/i;
  const match = paramsStr.match(tablePattern);
  if (match) {
    console.log(`      💡 Tabla extraída de JSON search: ${match[1]}`);
    return match[1];
  }
  
  return null;
}

