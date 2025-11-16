/**
 * 🔗 Custom Hook Integrator
 * 
 * Integra los custom hooks detectados en el análisis de código
 * con el auditor de base de datos para queries más inteligentes
 */

export interface CustomHook {
  name: string;
  table: string;
  operation: 'read' | 'write' | 'delete';
  fields: string[];
  filterField?: string; // Campo usado para filtrar (ej: session_id)
  sourceField?: string; // Campo del payload que se usa (ej: from)
}

export interface HookMapping {
  hookName: string;
  table: string;
  filterStrategy: 'session' | 'user' | 'catalog' | 'auto';
  filterField?: string;
  sourceField?: string;
}

/**
 * Extrae custom hooks de la configuración del proyecto
 */
export function extractCustomHooks(codeProject: any): CustomHook[] {
  const hooks: CustomHook[] = [];
  
  if (!codeProject?.deepAnalysis?.hooks) {
    console.log('📝 [Custom Hooks] No deep analysis hooks found');
    return hooks;
  }
  
  console.log('\n🔍 [Custom Hooks] Extracting from deep analysis...');
  console.log(`   Found ${codeProject.deepAnalysis.hooks.length} hooks`);
  
  for (const hook of codeProject.deepAnalysis.hooks) {
    // Detectar operación basándose en el nombre
    let operation: 'read' | 'write' | 'delete' = 'read';
    const lowerName = hook.name.toLowerCase();
    
    if (/insert|create|add|save|store/.test(lowerName)) {
      operation = 'write';
    } else if (/update|modify|edit|change/.test(lowerName)) {
      operation = 'write';
    } else if (/delete|remove|destroy/.test(lowerName)) {
      operation = 'delete';
    }
    
    hooks.push({
      name: hook.name,
      table: hook.table || '',
      operation,
      fields: hook.fields || [],
      filterField: hook.filterField,
      sourceField: hook.sourceField
    });
    
    console.log(`   ✅ ${hook.name} → ${hook.table} (${operation})`);
  }
  
  return hooks;
}

/**
 * Genera mappings inteligentes para el auditor
 */
export function generateHookMappings(hooks: CustomHook[], payload: Record<string, any>): HookMapping[] {
  const mappings: HookMapping[] = [];
  
  console.log('\n🧠 [Custom Hooks] Generating intelligent mappings...');
  
  for (const hook of hooks) {
    if (!hook.table) continue;
    
    const mapping: HookMapping = {
      hookName: hook.name,
      table: hook.table,
      filterStrategy: 'auto',
      filterField: hook.filterField,
      sourceField: hook.sourceField
    };
    
    // 🔍 ESTRATEGIA 1: Hook tiene filterField explícito
    if (hook.filterField && hook.sourceField) {
      mapping.filterStrategy = 'session';
      mapping.filterField = hook.filterField;
      mapping.sourceField = hook.sourceField;
      console.log(`   🎯 ${hook.name}: Filtrar por ${hook.filterField} = payload.${hook.sourceField}`);
    }
    // 🔍 ESTRATEGIA 2: Detectar por nombre de tabla
    else if (/histor|chat|conversacion|message|memoria/i.test(hook.table)) {
      mapping.filterStrategy = 'session';
      mapping.filterField = 'session_id'; // Guess común
      mapping.sourceField = 'from'; // Guess común para WhatsApp
      console.log(`   📋 ${hook.name}: Tabla de historial → Filtrar por session_id`);
    }
    else if (/user|usuario|cliente|customer/.test(hook.table)) {
      mapping.filterStrategy = 'user';
      mapping.filterField = 'id';
      mapping.sourceField = 'from';
      console.log(`   👤 ${hook.name}: Tabla de usuarios → Filtrar por id`);
    }
    else if (/product|precio|catalog|item/.test(hook.table)) {
      mapping.filterStrategy = 'catalog';
      console.log(`   📦 ${hook.name}: Tabla de catálogo → Sin filtro (traer todo)`);
    }
    // 🔍 ESTRATEGIA 3: Auto-detectar por campos
    else if (hook.fields.includes('session_id') || hook.fields.includes('sessionId')) {
      mapping.filterStrategy = 'session';
      mapping.filterField = hook.fields.includes('session_id') ? 'session_id' : 'sessionId';
      mapping.sourceField = 'from';
      console.log(`   🔎 ${hook.name}: Campo session_id detectado → Filtrar por ${mapping.filterField}`);
    }
    else {
      mapping.filterStrategy = 'auto';
      console.log(`   ⚙️ ${hook.name}: Auto-detectar estrategia durante query`);
    }
    
    mappings.push(mapping);
  }
  
  return mappings;
}

/**
 * Aplica mapping de hook a una query de Supabase
 */
export function applyHookMapping(
  query: any,
  mapping: HookMapping,
  payload: Record<string, any>
): any {
  if (!mapping.filterField || !mapping.sourceField) {
    return query; // Sin filtro
  }
  
  const filterValue = payload[mapping.sourceField];
  
  if (!filterValue) {
    console.log(`   ⚠️ [Hook Mapping] No se encontró ${mapping.sourceField} en payload`);
    return query;
  }
  
  console.log(`   🎯 [Hook Mapping] Filtrando ${mapping.table}.${mapping.filterField} = "${filterValue}"`);
  return query.eq(mapping.filterField, filterValue);
}

/**
 * Valida que los hooks detectados coincidan con las tablas en BD
 */
export function validateHooksWithDatabase(
  hooks: CustomHook[],
  databaseTables: string[]
): { valid: CustomHook[]; invalid: CustomHook[] } {
  const valid: CustomHook[] = [];
  const invalid: CustomHook[] = [];
  
  console.log('\n✅ [Custom Hooks] Validating against database tables...');
  console.log(`   Database tables: ${databaseTables.join(', ')}`);
  
  for (const hook of hooks) {
    if (databaseTables.includes(hook.table)) {
      valid.push(hook);
      console.log(`   ✅ ${hook.name} → ${hook.table} (válido)`);
    } else {
      invalid.push(hook);
      console.warn(`   ⚠️ ${hook.name} → ${hook.table} (tabla no encontrada en BD)`);
    }
  }
  
  return { valid, invalid };
}

/**
 * Genera descripción legible de un hook para UI
 */
export function describeHook(hook: CustomHook): string {
  const operation = hook.operation === 'read' ? 'Lee' : hook.operation === 'write' ? 'Escribe' : 'Borra';
  const fields = hook.fields.length > 0 ? ` (campos: ${hook.fields.join(', ')})` : '';
  return `${operation} en tabla ${hook.table}${fields}`;
}

