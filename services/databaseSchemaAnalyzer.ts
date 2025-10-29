import { GoogleGenAI } from "@google/genai";
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Auto-detección inteligente de estructura de BD usando Gemini AI
 */

export interface FieldMappings {
  // Productos / Inventory
  productTable?: string;
  productNameField?: string;
  productPriceField?: string;
  productStockField?: string;
  productIdField?: string;
  
  // Usuarios / Customers
  userTable?: string;
  userIdField?: string;
  userBlockedField?: string;
  userStatusField?: string;
  
  // Citas / Appointments
  appointmentTable?: string;
  appointmentDateField?: string;
  appointmentTimeField?: string;
  appointmentUserField?: string;
  
  // Pedidos / Orders
  orderTable?: string;
  orderTotalField?: string;
  orderUserField?: string;
  orderItemsField?: string;
}

interface TableSchema {
  table_name: string;
  columns: {
    column_name: string;
    data_type: string;
    is_nullable: string;
  }[];
}

// Cache de schemas analizados (key: supabaseUrl)
const schemaCache = new Map<string, FieldMappings>();

/**
 * Lee el schema completo de Supabase
 */
async function fetchDatabaseSchema(
  supabase: SupabaseClient,
  tables: string[]
): Promise<TableSchema[]> {
  console.log(`📊 [Schema Analyzer] Leyendo schema de ${tables.length} tablas...`);
  
  const schemas: TableSchema[] = [];
  
  for (const tableName of tables) {
    try {
      // Get table structure using Supabase introspection
      const { data, error } = await supabase
        .from(tableName)
        .select('*')
        .limit(0); // Get structure without data
      
      if (error) {
        console.warn(`   ⚠️ No se pudo leer schema de ${tableName}:`, error.message);
        continue;
      }
      
      // Get column names from first query (empty result set has column info)
      // We need to do a real query to get column names
      const { data: sampleData } = await supabase
        .from(tableName)
        .select('*')
        .limit(1);
      
      if (sampleData && sampleData.length > 0) {
        const columns = Object.keys(sampleData[0]).map(col => ({
          column_name: col,
          data_type: typeof sampleData[0][col],
          is_nullable: 'YES'
        }));
        
        schemas.push({
          table_name: tableName,
          columns
        });
        
        console.log(`   ✅ ${tableName}: ${columns.length} columnas`);
      }
    } catch (error) {
      console.warn(`   ⚠️ Error leyendo ${tableName}:`, error);
    }
  }
  
  return schemas;
}

/**
 * Usa Gemini AI para analizar el schema y detectar campos automáticamente
 */
async function analyzeSchemaWithAI(schemas: TableSchema[]): Promise<FieldMappings> {
  console.log(`🤖 [Schema Analyzer] Analizando schema con Gemini AI...`);
  
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  const schemaDescription = schemas.map(table => ({
    table: table.table_name,
    columns: table.columns.map(col => ({
      name: col.column_name,
      type: col.data_type
    }))
  }));
  
  const prompt = `
Eres un experto en bases de datos. Analiza el siguiente schema de Supabase y DETECTA AUTOMÁTICAMENTE qué tablas y campos corresponden a cada entidad del negocio.

**SCHEMA:**
${JSON.stringify(schemaDescription, null, 2)}

**TU TAREA:**
Identifica qué tabla y qué campos corresponden a:

1. **PRODUCTOS/INVENTORY** (productos que se venden):
   - Tabla principal de productos
   - Campo que tiene el NOMBRE del producto
   - Campo que tiene el PRECIO
   - Campo que tiene el STOCK (cantidad disponible)
   - Campo que es el ID único

2. **USUARIOS/CLIENTES** (personas que compran):
   - Tabla de usuarios/clientes
   - Campo de ID único
   - Campo que indica si está BLOQUEADO
   - Campo de ESTADO (activo/inactivo/bloqueado)

3. **CITAS/APPOINTMENTS** (reservas o agendas):
   - Tabla de citas/reservas
   - Campo de FECHA
   - Campo de HORA
   - Campo que relaciona con el usuario (foreign key)

4. **PEDIDOS/ORDERS** (compras realizadas):
   - Tabla de pedidos
   - Campo de TOTAL (precio total)
   - Campo que relaciona con el usuario
   - Campo de ITEMS (productos comprados)

**REGLAS:**
- Si una entidad NO existe en el schema, deja el campo como null
- Prioriza tablas/campos con nombres en español o inglés
- Usa lógica semántica: "precio", "price", "cost", "valor" son lo mismo
- Responde SOLO con JSON válido, sin explicaciones

**FORMATO DE RESPUESTA:**
{
  "productTable": "nombre_tabla_productos",
  "productNameField": "nombre_campo_nombre",
  "productPriceField": "nombre_campo_precio",
  "productStockField": "nombre_campo_stock",
  "productIdField": "id",
  "userTable": "nombre_tabla_usuarios",
  "userIdField": "id",
  "userBlockedField": "nombre_campo_bloqueado",
  "userStatusField": "nombre_campo_estado",
  "appointmentTable": "nombre_tabla_citas",
  "appointmentDateField": "fecha",
  "appointmentTimeField": "hora",
  "appointmentUserField": "usuario_id",
  "orderTable": "nombre_tabla_pedidos",
  "orderTotalField": "total",
  "orderUserField": "usuario_id",
  "orderItemsField": "items"
}

Si alguna entidad no existe, usa null. Ejemplo:
{
  "productTable": "productos_catalogo_ar",
  "productNameField": "nombre",
  "productPriceField": "precio",
  "productStockField": null,
  "productIdField": "id",
  "userTable": null,
  "userIdField": null,
  ...
}
`;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.0-flash-exp',
      contents: prompt,
      config: {
        responseMimeType: "application/json",
      },
    });
    
    const mappings = JSON.parse(response.text.trim());
    console.log(`✅ [Schema Analyzer] Mappings detectados automáticamente:`, mappings);
    
    return mappings;
  } catch (error) {
    console.error(`❌ [Schema Analyzer] Error en análisis con AI:`, error);
    // Fallback: retornar mappings vacíos
    return {};
  }
}

/**
 * Función principal: analiza el schema automáticamente
 */
export async function analyzeAndMapDatabase(
  supabase: SupabaseClient,
  supabaseUrl: string,
  tables: string[]
): Promise<FieldMappings> {
  // Check cache first
  if (schemaCache.has(supabaseUrl)) {
    console.log(`♻️ [Schema Analyzer] Usando mappings cacheados`);
    return schemaCache.get(supabaseUrl)!;
  }
  
  console.log(`\n🔍 [Schema Analyzer] INICIANDO ANÁLISIS AUTOMÁTICO DE BD`);
  console.log(`   Tablas a analizar: ${tables.join(', ')}`);
  
  // 1. Fetch schema
  const schemas = await fetchDatabaseSchema(supabase, tables);
  
  if (schemas.length === 0) {
    console.warn(`⚠️ [Schema Analyzer] No se pudo leer ningún schema`);
    return {};
  }
  
  // 2. Analyze with AI
  const mappings = await analyzeSchemaWithAI(schemas);
  
  // 3. Cache result
  schemaCache.set(supabaseUrl, mappings);
  
  console.log(`✅ [Schema Analyzer] Análisis completo. Mappings guardados en cache.`);
  return mappings;
}

/**
 * Clear cache (útil para testing)
 */
export function clearSchemaCache() {
  schemaCache.clear();
}


