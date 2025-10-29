/**
 * Analiza el workflow para extraer la estructura del payload
 * ESTRATEGIA: Lee el SEGUNDO nodo (que setea las variables) para generar el payload
 */

export interface PayloadField {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  required: boolean;
  defaultValue?: any;
  example?: any;
}

export interface PayloadSchema {
  fields: PayloadField[];
  examplePayload: Record<string, any>;
}

/**
 * Analiza el workflow y extrae la estructura del payload del SEGUNDO nodo
 */
export function analyzeWorkflowPayload(workflowNodes: any[]): PayloadSchema | null {
  console.log(`\n🔍 [Payload Analyzer] Analizando workflow para extraer payload...`);
  console.log(`   Total nodos: ${workflowNodes.length}`);
  
  if (workflowNodes.length < 2) {
    console.log(`   ⚠️ No hay suficientes nodos (se necesitan al menos 2)`);
    return null;
  }
  
  // El SEGUNDO nodo es el que setea las variables
  const secondNode = workflowNodes[1];
  console.log(`\n   📋 Analizando nodo #2: "${secondNode.name}" (${secondNode.type})`);
  
  const fields: PayloadField[] = [];
  const examplePayload: Record<string, any> = {};
  
  // CASO 1: Nodo "Set" o "Edit Fields" de n8n
  if (secondNode.type === 'n8n-nodes-base.set' || 
      secondNode.type === 'n8n-nodes-base.edit') {
    
    console.log(`   🎯 Nodo tipo SET detectado: ${secondNode.type}`);
    console.log(`   📋 Parámetros del nodo:`, JSON.stringify(secondNode.parameters, null, 2).substring(0, 500));
    
    const parameters = secondNode.parameters || {};
    
    // 🔥 n8n v3.x: Formato assignments.assignments
    let assignmentsList = parameters.assignments?.assignments;
    
    // 🔥 n8n v2.x: Formato values.string
    let values = parameters.values;
    
    // FORMATO 1: assignments.assignments (n8n v3.x)
    if (assignmentsList && Array.isArray(assignmentsList) && assignmentsList.length > 0) {
      console.log(`   📝 Formato n8n v3.x detectado: ${assignmentsList.length} campos en assignments.assignments`);
      
      assignmentsList.forEach((item: any) => {
        const fieldName = item.name;
        const fieldValue = item.value;
        const fieldType = item.type || 'string'; // Tipo explícito en v3.x
        
        if (fieldName && typeof fieldName === 'string') {
          let exampleValue;
          
          switch (fieldType) {
            case 'string':
              exampleValue = extractExampleValue(fieldValue, 'string');
              fields.push({ name: fieldName, type: 'string', required: true, example: exampleValue });
              break;
            case 'number':
              exampleValue = extractExampleValue(fieldValue, 'number');
              fields.push({ name: fieldName, type: 'number', required: true, example: exampleValue });
              break;
            case 'boolean':
              exampleValue = extractExampleValue(fieldValue, 'boolean');
              fields.push({ name: fieldName, type: 'boolean', required: true, example: exampleValue });
              break;
            default:
              exampleValue = extractExampleValue(fieldValue, 'string');
              fields.push({ name: fieldName, type: 'string', required: true, example: exampleValue });
          }
          
          examplePayload[fieldName] = exampleValue;
          console.log(`      ✅ Campo ${fieldType}: "${fieldName}" = "${exampleValue}"`);
          console.log(`         Expresión original: ${typeof fieldValue === 'string' ? fieldValue.substring(0, 100) : fieldValue}`);
        }
      });
    }
    
    // FORMATO 2: values.string (n8n v2.x)
    else if (values && typeof values === 'object') {
      console.log(`   📝 Formato n8n v2.x detectado: values.*`);
      
      if (values.string && Array.isArray(values.string) && values.string.length > 0) {
        console.log(`   📝 Encontrados ${values.string.length} campos tipo string`);
        values.string.forEach((item: any) => {
          const fieldName = item.name;
          const fieldValue = item.value;
          
          if (fieldName && typeof fieldName === 'string') {
            const exampleValue = extractExampleValue(fieldValue, 'string');
            
            fields.push({
              name: fieldName,
              type: 'string',
              required: true,
              example: exampleValue
            });
            
            examplePayload[fieldName] = exampleValue;
            console.log(`      ✅ Campo string: "${fieldName}" = "${exampleValue}"`);
            console.log(`         Expresión original: ${typeof fieldValue === 'string' ? fieldValue.substring(0, 100) : fieldValue}`);
          }
        });
      }
      
      if (values.number && Array.isArray(values.number) && values.number.length > 0) {
        console.log(`   📝 Encontrados ${values.number.length} campos tipo number`);
        values.number.forEach((item: any) => {
          const fieldName = item.name;
          const fieldValue = item.value;
          
          if (fieldName && typeof fieldName === 'string') {
            const exampleValue = extractExampleValue(fieldValue, 'number');
            
            fields.push({
              name: fieldName,
              type: 'number',
              required: true,
              example: exampleValue
            });
            
            examplePayload[fieldName] = exampleValue;
            console.log(`      ✅ Campo number: "${fieldName}" = ${exampleValue}`);
          }
        });
      }
      
      if (values.boolean && Array.isArray(values.boolean) && values.boolean.length > 0) {
        console.log(`   📝 Encontrados ${values.boolean.length} campos tipo boolean`);
        values.boolean.forEach((item: any) => {
          const fieldName = item.name;
          const fieldValue = item.value;
          
          if (fieldName && typeof fieldName === 'string') {
            const exampleValue = extractExampleValue(fieldValue, 'boolean');
            
            fields.push({
              name: fieldName,
              type: 'boolean',
              required: true,
              example: exampleValue
            });
            
            examplePayload[fieldName] = exampleValue;
            console.log(`      ✅ Campo boolean: "${fieldName}" = ${exampleValue}`);
          }
        });
      }
    }
    
    // FORMATO 3: Ni assignments ni values (error)
    else {
      console.log(`   ❌ ERROR: Nodo Set sin formato reconocido`);
      console.log(`   📋 Se esperaba: parameters.assignments.assignments O parameters.values.string`);
      console.log(`   📋 Estructura completa del nodo:`, JSON.stringify(secondNode, null, 2));
      return null;
    }
    
    // Validación final: Si no encontramos NINGÚN campo
    if (fields.length === 0) {
      console.log(`   ❌ ERROR: Nodo Set encontrado pero NO tiene campos configurados`);
      console.log(`   📋 Verifica que el nodo Set tenga al menos un campo definido`);
      return null;
    }
  }
  
  // CASO 2: Nodo "Code" (JavaScript/Python)
  else if (secondNode.type === 'n8n-nodes-base.code' || 
           secondNode.type === 'n8n-nodes-base.function') {
    
    console.log(`   🎯 Nodo tipo CODE detectado`);
    
    const code = secondNode.parameters?.jsCode || 
                 secondNode.parameters?.pythonCode || 
                 secondNode.parameters?.code || '';
    
    // Intentar extraer asignaciones del código
    const assignments = extractAssignmentsFromCode(code);
    
    assignments.forEach(({ name, value, type }) => {
      fields.push({
        name,
        type,
        required: true,
        example: value
      });
      
      examplePayload[name] = value;
      console.log(`      ✅ Campo detectado en código: ${name} = ${value}`);
    });
  }
  
  // CASO 3: Nodo no soportado
  else {
    console.log(`   ❌ Nodo tipo NO SOPORTADO: ${secondNode.type}`);
    console.log(`   ℹ️ Solo se soportan nodos: Set, Edit Fields, Code`);
    console.log(`   💡 Tip: Asegúrate de que el segundo nodo sea un nodo "Set" que defina las variables`);
    return null;
  }
  
  // Validación final
  if (fields.length === 0) {
    console.log(`\n   ❌ NO se detectaron campos en el nodo #2`);
    console.log(`   📋 Nodo completo:`, JSON.stringify(secondNode, null, 2));
    return null;
  }
  
  console.log(`\n   ✅ Análisis completo:`);
  console.log(`      Campos detectados: ${fields.length}`);
  console.log(`      Payload ejemplo:`, JSON.stringify(examplePayload, null, 2));
  
  return {
    fields,
    examplePayload
  };
}

/**
 * Extrae un valor de ejemplo de una expresión n8n
 */
function extractExampleValue(expression: any, type: 'string' | 'number' | 'boolean'): any {
  // Si es un valor literal, devolverlo EXACTAMENTE como está
  if (typeof expression === type) {
    return expression;
  }
  
  // Si es una expresión n8n (ej: "={{$json.sessionId}}"), generar un ejemplo SIMPLE
  if (typeof expression === 'string' && expression.includes('{{')) {
    // NO inventar valores, usar ejemplos simples y reconocibles
    switch (type) {
      case 'string':
        return '';  // String vacío por defecto
      case 'number':
        return 0;
      case 'boolean':
        return false;
    }
  }
  
  // Si no es una expresión válida, devolver valor vacío/neutral
  switch (type) {
    case 'string':
      return '';
    case 'number':
      return 0;
    case 'boolean':
      return false;
  }
}

/**
 * Extrae asignaciones de un bloque de código JavaScript/Python
 */
function extractAssignmentsFromCode(code: string): Array<{ name: string; value: any; type: PayloadField['type'] }> {
  const assignments: Array<{ name: string; value: any; type: PayloadField['type'] }> = [];
  
  // Patrón 1: item.fieldName = "value" o item.fieldName = 123
  const pattern1 = /item\.(\w+)\s*=\s*(['"])(.*?)\2|item\.(\w+)\s*=\s*(\d+)/g;
  let match;
  
  while ((match = pattern1.exec(code)) !== null) {
    if (match[1]) {
      // String
      assignments.push({
        name: match[1],
        value: match[3] || 'example_value',
        type: 'string'
      });
    } else if (match[4]) {
      // Number
      assignments.push({
        name: match[4],
        value: parseInt(match[5]),
        type: 'number'
      });
    }
  }
  
  // Patrón 2: const/let fieldName = value
  const pattern2 = /(?:const|let|var)\s+(\w+)\s*=\s*(['"])(.*?)\2|(?:const|let|var)\s+(\w+)\s*=\s*(\d+)/g;
  
  while ((match = pattern2.exec(code)) !== null) {
    if (match[1]) {
      assignments.push({
        name: match[1],
        value: match[3] || 'example_value',
        type: 'string'
      });
    } else if (match[4]) {
      assignments.push({
        name: match[4],
        value: parseInt(match[5]),
        type: 'number'
      });
    }
  }
  
  return assignments;
}

/**
 * Genera un payload de prueba basado en el schema
 */
export function generateTestPayload(schema: PayloadSchema, overrides?: Record<string, any>): Record<string, any> {
  return {
    ...schema.examplePayload,
    ...overrides
  };
}

/**
 * Valida si un payload cumple con el schema
 */
export function validatePayload(payload: Record<string, any>, schema: PayloadSchema): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  schema.fields.forEach(field => {
    if (field.required && !(field.name in payload)) {
      errors.push(`Campo requerido faltante: ${field.name}`);
    }
    
    if (field.name in payload) {
      const actualType = typeof payload[field.name];
      if (actualType !== field.type && payload[field.name] !== null) {
        errors.push(`Campo ${field.name}: esperado ${field.type}, recibido ${actualType}`);
      }
    }
  });
  
  return {
    valid: errors.length === 0,
    errors
  };
}

