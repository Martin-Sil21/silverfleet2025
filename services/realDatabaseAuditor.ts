import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type { DatabaseOperationSummary, DatabaseChange } from '../types';
import { analyzeAndMapDatabase, type FieldMappings } from './databaseSchemaAnalyzer';
import { analyzeWorkflowDatabases, findMappingForTable, getFilterValue } from './workflowDatabaseAnalyzer';
import type { WorkflowDatabaseInfo } from './workflowDatabaseAnalyzer';

/**
 * Sistema de Auditoría de Base de Datos REAL
 * 
 * Conecta a la base de datos de producción (Supabase, Airtable, etc.)
 * para VERIFICAR que el agente realmente hizo lo que dijo que haría.
 * 
 * ✨ AUTO-DETECCIÓN: Usa Gemini AI para mapear campos automáticamente
 */

interface DatabaseConfig {
  type: 'supabase' | 'airtable' | 'google-sheets';
  credentials: {
    url?: string;
    key?: string;
    apiKey?: string;
    baseId?: string;
  };
  tables: string[]; // Tablas a monitorear
}

interface DatabaseSnapshot {
  timestamp: number;
  data: Record<string, any[]>; // table -> rows
}

interface DatabaseDiscrepancy {
  type: 'missing_record' | 'incorrect_data' | 'unauthorized_action' | 'data_mismatch';
  severity: 'critical' | 'warning' | 'info';
  description: string;
  expected?: any;
  actual?: any;
  table?: string;
  timestamp: number;
}

// Shared Supabase client instances (one per URL+Key combination)
const supabaseClients = new Map<string, SupabaseClient>();

function getOrCreateSupabaseClient(url: string, key: string): SupabaseClient {
  const clientKey = `${url}::${key.substring(0, 20)}`; // Use part of key for uniqueness
  
  if (!supabaseClients.has(clientKey)) {
    console.log(`🔗 [DB Audit] Creando nuevo cliente Supabase compartido`);
    const client = createClient(url, key, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      }
    });
    supabaseClients.set(clientKey, client);
  } else {
    console.log(`♻️ [DB Audit] Reutilizando cliente Supabase compartido`);
  }
  
  return supabaseClients.get(clientKey)!;
}

class RealDatabaseAuditor {
  private client: any;
  private config: DatabaseConfig;
  public snapshots: Map<number, DatabaseSnapshot> = new Map(); // Público para tracking
  public discrepancies: DatabaseDiscrepancy[] = [];
  public changes: DatabaseChange[] = [];
  private conversationId: string;
  private searchIdentifiers: string[] = []; // 🔍 TODOS los posibles identificadores (conversationId, teléfono, etc.)
  private fieldMappings: FieldMappings | null = null;
  private mappingsInitialized: boolean = false;
  private workflowInfo: WorkflowDatabaseInfo | null = null; // 🔥 INFO del workflow
  private payload: Record<string, any> | undefined; // 🔥 Payload original

  constructor(conversationId: string, config: DatabaseConfig, payload?: Record<string, any>, workflowNodes?: any[]) {
    this.conversationId = conversationId;
    this.config = config;
    this.payload = payload;
    
    // 🔥 ANALIZAR EL WORKFLOW para obtener mappings de tablas → campos de filtro
    if (workflowNodes && workflowNodes.length > 0) {
      console.log(`\n🔍 [DB Audit] Analizando workflow para detectar uso de BD...`);
      this.workflowInfo = analyzeWorkflowDatabases(workflowNodes);
    } else {
      console.log(`\n⚠️ [DB Audit] No se proporcionó información del workflow, usando detección automática`);
    }
    
    // 🔍 Extraer TODOS los posibles identificadores del payload (INTELIGENTE)
    this.searchIdentifiers.push(conversationId);
    
    if (payload) {
      console.log(`\n🔍 [DB Audit] Analizando payload para extraer identificadores...`);
      console.log(`   Payload recibido:`, JSON.stringify(payload, null, 2).substring(0, 500));
      
      // 🔥 NUEVO: Campos prioritarios (se buscan primero)
      const priorityFields = [
        'sessionId', 'session_id', 'sessionid',
        'conversationId', 'conversation_id', 'conversationid',
        'chatId', 'chat_id', 'chatid',
        'userId', 'user_id', 'userid',
        'telefono', 'telefonos', 'phone', 'telephone', 'tel'
      ];
      
      // 🔥 NUEVO: Extraer identificadores de campos prioritarios
      for (const field of priorityFields) {
        if (payload[field]) {
          const value = String(payload[field]);
          if (!this.searchIdentifiers.includes(value)) {
            this.searchIdentifiers.push(value);
            console.log(`   ✅ Identificador (prioritario): ${field}="${value}"`);
          }
        }
      }
      
      // 🔥 NUEVO: Extraer CUALQUIER campo tipo string/number que podría ser ID
      // (esto detecta automáticamente campos custom como "customSessionKey", "myUserId", etc.)
      console.log(`   🔍 Buscando campos adicionales tipo ID...`);
      for (const [key, value] of Object.entries(payload)) {
        // Skip campos que ya procesamos
        if (priorityFields.includes(key.toLowerCase())) continue;
        
        // Solo valores string/number que parezcan IDs
        const valueStr = String(value);
        const looksLikeId = (
          (typeof value === 'string' || typeof value === 'number') &&
          valueStr.length > 0 &&
          valueStr.length < 100 && // IDs no son muy largos
          !valueStr.includes(' ') && // IDs no tienen espacios
          !key.toLowerCase().includes('message') && // No es un mensaje
          !key.toLowerCase().includes('text') && // No es texto
          !key.toLowerCase().includes('content') && // No es contenido
          !key.toLowerCase().includes('body') && // No es body
          !key.toLowerCase().includes('prompt') && // No es prompt
          !key.toLowerCase().includes('query') // No es query
        );
        
        if (looksLikeId && !this.searchIdentifiers.includes(valueStr)) {
          this.searchIdentifiers.push(valueStr);
          console.log(`   📌 Identificador (detectado): ${key}="${valueStr}"`);
        }
      }
    }
    
    console.log(`\n   📊 Total identificadores extraídos: ${this.searchIdentifiers.length}`);
    console.log(`   📋 Lista completa:`, this.searchIdentifiers);
    console.log(`   ✅ Estos valores se buscarán en las tablas de BD\n`);
    this.initializeClient();
  }
  
  /**
   * Inicializa los field mappings automáticamente usando AI
   * Se llama lazy cuando se necesita por primera vez
   */
  private async initializeFieldMappings(): Promise<void> {
    if (this.mappingsInitialized) return;
    
    console.log(`\n🤖 [DB Audit] Iniciando auto-detección de estructura de BD...`);
    
    try {
      this.fieldMappings = await analyzeAndMapDatabase(
        this.client,
        this.config.credentials.url || '',
        this.config.tables
      );
      this.mappingsInitialized = true;
      console.log(`✅ [DB Audit] Estructura detectada automáticamente`);
    } catch (error) {
      console.error(`❌ [DB Audit] Error en auto-detección:`, error);
      this.fieldMappings = {};
      this.mappingsInitialized = true; // Mark as initialized even if failed
    }
  }

  private initializeClient() {
    switch (this.config.type) {
      case 'supabase':
        if (!this.config.credentials.url || !this.config.credentials.key) {
          throw new Error('Supabase requires url and key');
        }
        // Use shared client to avoid multiple instances warning
        this.client = getOrCreateSupabaseClient(
          this.config.credentials.url,
          this.config.credentials.key
        );
        break;
      
      case 'airtable':
        // TODO: Implementar Airtable
        throw new Error('Airtable not implemented yet');
      
      case 'google-sheets':
        // TODO: Implementar Google Sheets
        throw new Error('Google Sheets not implemented yet');
      
      default:
        throw new Error(`Unsupported database type: ${this.config.type}`);
    }
  }

  /**
   * Toma una "foto" del estado actual de la base de datos
   */
  async takeSnapshot(): Promise<DatabaseSnapshot> {
    const timestamp = Date.now();
    const data: Record<string, any[]> = {};

    console.log(`\n📸 [DB Audit - ${this.conversationId}] Taking snapshot #${this.snapshots.size + 1} at ${new Date(timestamp).toLocaleTimeString()}`);
    console.log(`   Config:`, {
      type: this.config.type,
      url: this.config.credentials.url,
      tables: this.config.tables
    });

    for (const table of this.config.tables) {
      try {
        console.log(`\n   🔍 [${table}] Consultando...`);
        const startTime = Date.now();
        const rows = await this.queryTable(table);
        const duration = Date.now() - startTime;
        
        data[table] = rows;
        console.log(`   ✅ [${table}] ${rows.length} registros (${duration}ms)`);
        
        // 🚨 ALERTA si 0 registros
        if (rows.length === 0) {
          console.warn(`\n   ⚠️⚠️⚠️ ADVERTENCIA: Tabla "${table}" devolvió 0 registros`);
          console.warn(`   Esto IMPEDIRÁ el tracking de cambios en esta tabla`);
          console.warn(`   Posibles causas:`);
          console.warn(`     1. La tabla está vacía en la BD`);
          console.warn(`     2. Row Level Security (RLS) está bloqueando la consulta`);
          console.warn(`     3. Estás usando 'anon' key en vez de 'service_role' key`);
          console.warn(`     4. No tienes permisos de lectura en esta tabla\n`);
        }
      } catch (error) {
        console.error(`\n   ❌ [${table}] ERROR al consultar:`);
        console.error(`   Error type:`, error instanceof Error ? error.constructor.name : typeof error);
        console.error(`   Error message:`, error instanceof Error ? error.message : String(error));
        console.error(`   Error full:`, error);
        console.error(`   ⚠️ Esta tabla NO será monitoreada en este snapshot\n`);
        data[table] = [];
      }
    }

    const snapshot = { timestamp, data };
    this.snapshots.set(timestamp, snapshot);
    
    const totalRecords = Object.values(data).reduce((sum, rows) => sum + rows.length, 0);
    console.log(`\n   📊 Snapshot #${this.snapshots.size} completado: ${totalRecords} registros totales en ${this.config.tables.length} tablas`);
    
    // 🚨 ALERTA CRÍTICA si TODAS las tablas están en 0
    if (totalRecords === 0) {
      console.error(`\n   🚨🚨🚨 PROBLEMA CRÍTICO 🚨🚨🚨`);
      console.error(`   TODAS las tablas devolvieron 0 registros`);
      console.error(`   La auditoría de BD NO funcionará correctamente`);
      console.error(`   ACCIÓN REQUERIDA: Verifica RLS y usa 'service_role' key\n`);
    }
    
    return snapshot;
  }

  /**
   * Consulta una tabla según el tipo de BD
   * FILTRA por conversationId para solo traer registros relevantes
   */
  private async queryTable(table: string): Promise<any[]> {
    switch (this.config.type) {
      case 'supabase':
        try {
          // 🔥 ESTRATEGIA 1: Usar información del WORKFLOW (si está disponible)
          if (this.workflowInfo && this.payload) {
            const mapping = findMappingForTable(table, this.workflowInfo);
            
            if (mapping) {
              console.log(`\n   🎯 [${table}] USANDO MAPPING DEL WORKFLOW`);
              console.log(`      Campo de filtro: ${mapping.filterField}`);
              console.log(`      Campo del payload: ${mapping.sourceField}`);
              
              const filterValue = getFilterValue(mapping, this.payload);
              
              if (filterValue) {
                console.log(`      Valor a filtrar: "${filterValue}"`);
                
                try {
                  const { data, error } = await this.client
                    .from(table)
                    .select('*')
                    .eq(mapping.filterField, filterValue)
                    .order('created_at', { ascending: false, nullsFirst: false })
                    .limit(150);
                  
                  if (!error && data) {
                    console.log(`      ✅ ${data.length} registros encontrados usando mapping del workflow`);
                    return data;
                  }
                  
                  console.log(`      ⚠️ Error con filtro del workflow:`, error?.message);
                } catch (err) {
                  console.log(`      ⚠️ Filtro del workflow falló:`, err);
                }
              } else {
                console.log(`      ⚠️ No se encontró el valor de "${mapping.sourceField}" en el payload`);
              }
            } else {
              console.log(`\n   ℹ️ [${table}] No se encontró mapping en el workflow para esta tabla`);
            }
          }
          
          // 🔥 ESTRATEGIA 2 (FALLBACK): Detectar por ESTRUCTURA (método anterior)
          console.log(`\n   🔍 [${table}] Usando detección automática por estructura...`);
          
          // 1️⃣ Obtener un registro de muestra para ver qué campos tiene
          const { data: sampleData, error: sampleError } = await this.client
            .from(table)
            .select('*')
            .limit(1);
          
          if (sampleError) {
            console.log(`   ⚠️ Error obteniendo muestra:`, sampleError.message);
            return [];
          }
          
          if (!sampleData || sampleData.length === 0) {
            console.log(`   ℹ️ Tabla ${table} vacía (0 registros en BD)`);
            return [];
          }
          
          const availableFields = Object.keys(sampleData[0]);
          console.log(`   📋 Campos detectados: ${availableFields.join(', ')}`);
          
          // 2️⃣ ESTRATEGIA INTELIGENTE: Buscar campos que coincidan con VALORES de los identificadores
          // En vez de buscar por NOMBRE de campo, buscar por COINCIDENCIA de VALORES
          console.log(`   🧠 Buscando coincidencias entre campos de la tabla y mis identificadores...`);
          console.log(`   📝 Mis identificadores: ${this.searchIdentifiers.join(', ')}`);
          
          let filterField: string | undefined;
          let filterValue: string | undefined;
          
          // PASO 1: Intentar encontrar coincidencia directa consultando la tabla
          for (const field of availableFields) {
            // Buscar si alguno de nuestros identificadores está en esta columna
            for (const identifier of this.searchIdentifiers) {
              try {
                const { data, error } = await this.client
                  .from(table)
                  .select(field)
                  .eq(field, identifier)
                  .limit(1);
                
                if (!error && data && data.length > 0) {
                  // ¡Encontramos una coincidencia!
                  filterField = field;
                  filterValue = identifier;
                  console.log(`   🎯 COINCIDENCIA ENCONTRADA: Campo "${field}" contiene el valor "${identifier}"`);
                  break;
                }
              } catch (err) {
                // Este campo no es filtrable o no existe, continuar
                continue;
              }
            }
            
            if (filterField && filterValue) break;
          }
          
          // 3️⃣ CASO A: Encontramos un campo que coincide con nuestros identificadores
          if (filterField && filterValue) {
            console.log(`   🎯 TABLA DE HISTORIAL/SESIÓN DETECTADA`);
            console.log(`   📌 Filtrando por: ${filterField} = "${filterValue}"`);
            
            try {
              // Intentar con todos los identificadores (OR)
              const orConditions = this.searchIdentifiers.map(id => 
                `${filterField}.eq.${id}`
              );
              
              const { data, error } = await this.client
                .from(table)
                .select('*')
                .or(orConditions.join(','))
                .order('created_at', { ascending: false, nullsFirst: false })
                .limit(150);
              
              if (!error && data) {
                console.log(`   ✅ ${table}: ${data.length} registros encontrados`);
                
                if (data.length > 0) {
                  const uniqueValues = [...new Set(data.map(r => r[filterField]))];
                  console.log(`   📝 Valores de ${filterField}: ${uniqueValues.join(', ')}`);
                }
                
                return data;
              }
              
              console.log(`   ⚠️ Filtro OR falló, intentando uno por uno...`);
            } catch (orError) {
              console.log(`   ⚠️ Error en filtro OR:`, orError);
            }
            
            // Fallback: buscar uno por uno
            let allRows: any[] = [];
            for (const id of this.searchIdentifiers) {
              try {
                const { data, error } = await this.client
                  .from(table)
                  .select('*')
                  .eq(filterField, id)
                  .order('created_at', { ascending: false, nullsFirst: false })
                  .limit(150);
                
                if (!error && data && data.length > 0) {
                  console.log(`   ✅ Encontrados ${data.length} registros para ${filterField}="${id}"`);
                  allRows.push(...data);
                  break;
                }
              } catch (err) {
                console.log(`   ⚠️ Error buscando "${id}":`, err);
              }
            }
            
            console.log(`   ✓ Total: ${allRows.length} registros`);
            return allRows;
          }
          
          // 4️⃣ CASO B: NO encontramos coincidencia → Es tabla de CATÁLOGO/PRODUCTOS/REFERENCIA
          console.log(`   📦 TABLA DE CATÁLOGO/REFERENCIA DETECTADA (sin coincidencia con identificadores)`);
          console.log(`   📌 Esta tabla no tiene registros filtrados por sesión, trayendo TODA la tabla`);
          
          // Para tablas de catálogo (productos, precios, etc), traer TODO
          const { data: catalogData, error: catalogError } = await this.client
            .from(table)
            .select('*')
            .limit(1000); // Límite alto para catálogos
          
          if (catalogError) throw catalogError;
          
          console.log(`   ✅ ${table}: ${catalogData?.length || 0} registros (tabla completa)`);
          return catalogData || [];
          
        } catch (err) {
          console.error(`   ✗ Error específico en ${table}:`, err);
          // Fallback: traer todo limitado
          const { data, error } = await this.client
            .from(table)
            .select('*')
            .limit(100);
          
          if (error) throw error;
          return data || [];
        }
      
      default:
        return [];
    }
  }

  /**
   * Verifica si existe un registro específico en una tabla
   */
  async verifyRecordExists(
    table: string,
    conditions: Record<string, any>,
    context: string = 'unknown'
  ): Promise<boolean> {
    console.log(`🔍 [DB Audit] Verificando: ${context}`);
    console.log(`   Tabla: ${table}, Condiciones:`, conditions);

    try {
      let query = this.client.from(table).select('*');
      
      // Aplicar condiciones
      for (const [key, value] of Object.entries(conditions)) {
        query = query.eq(key, value);
      }

      const { data, error } = await query;
      
      if (error) throw error;
      
      const exists = data && data.length > 0;
      
      if (!exists) {
        this.discrepancies.push({
          type: 'missing_record',
          severity: 'critical',
          description: `${context}: No se encontró el registro esperado en ${table}`,
          expected: conditions,
          actual: null,
          table,
          timestamp: Date.now()
        });
        console.log(`   ❌ NO EXISTE`);
      } else {
        console.log(`   ✅ EXISTE:`, data[0]);
      }
      
      return exists;
    } catch (error) {
      console.error(`   ⚠️ Error al verificar:`, error);
      return false;
    }
  }

  /**
   * Verifica que un valor en la BD coincida con lo esperado
   */
  async verifyFieldValue(
    table: string,
    recordId: any,
    field: string,
    expectedValue: any,
    context: string = 'unknown'
  ): Promise<boolean> {
    console.log(`🔍 [DB Audit] Verificando campo: ${context}`);
    
    try {
      const { data, error } = await this.client
        .from(table)
        .select(field)
        .eq('id', recordId)
        .single();
      
      if (error) throw error;
      
      const actualValue = data[field];
      const matches = actualValue === expectedValue;
      
      if (!matches) {
        this.discrepancies.push({
          type: 'incorrect_data',
          severity: 'critical',
          description: `${context}: Valor incorrecto en ${table}.${field}`,
          expected: expectedValue,
          actual: actualValue,
          table,
          timestamp: Date.now()
        });
        console.log(`   ❌ NO COINCIDE: esperado="${expectedValue}", actual="${actualValue}"`);
      } else {
        console.log(`   ✅ COINCIDE: "${actualValue}"`);
      }
      
      return matches;
    } catch (error) {
      console.error(`   ⚠️ Error al verificar:`, error);
      return false;
    }
  }

  /**
   * Busca productos por nombre parcial (case-insensitive)
   */
  async findProductByName(productName: string): Promise<any | null> {
    // ✨ Ensure mappings are initialized (AUTO-DETECTION)
    await this.initializeFieldMappings();
    
    if (!this.fieldMappings?.productTable || !this.fieldMappings?.productNameField) {
      console.warn(`⚠️ [DB Audit] No se detectó tabla de productos o campo de nombre`);
      return null;
    }
    
    const table = this.fieldMappings.productTable;
    const nameField = this.fieldMappings.productNameField;
    
    console.log(`🔍 [DB Audit] Buscando producto: "${productName}" en ${table}.${nameField}`);
    
    // Clean product name for search
    const searchTerm = productName
      .toLowerCase()
      .replace(/sistema completo/gi, '')
      .replace(/cielorraso de/gi, 'cielorraso')
      .replace(/zócalo de/gi, 'zócalo')
      .replace(/tabique de/gi, 'tabique')
      .trim();
    
    console.log(`   Término de búsqueda optimizado: "${searchTerm}"`);
    
    try {
      // Search using auto-detected mappings
      const { data, error } = await this.client
        .from(table)
        .select('*')
        .ilike(nameField, `%${searchTerm}%`)
        .limit(5);
      
      if (error) {
        console.error(`   ⚠️ Error en búsqueda:`, error);
        return null;
      }
      
      if (data && data.length > 0) {
        const priceField = this.fieldMappings.productPriceField;
        if (priceField) {
          console.log(`   ✅ Encontrados ${data.length} productos:`, 
            data.map((p: any) => `${p[nameField]} ($${p[priceField]})`));
        } else {
          console.log(`   ✅ Encontrados ${data.length} productos`);
        }
        return data[0]; // Return best match
      }
      
      console.log(`   ❌ No se encontró producto similar`);
      return null;
    } catch (error) {
      console.error(`   ⚠️ Error al buscar:`, error);
      return null;
    }
  }

  /**
   * Verifica que un usuario NO esté bloqueado
   * ✨ USA MAPPINGS AUTO-DETECTADOS
   */
  async verifyNotBlocked(userId: string, context: string = 'unknown'): Promise<boolean> {
    // Ensure mappings are initialized
    await this.initializeFieldMappings();
    
    console.log(`🔍 [DB Audit] Verificando que usuario NO esté bloqueado: ${context}`);
    
    // Try auto-detected user table first
    const detectedTables = this.fieldMappings?.userTable 
      ? [this.fieldMappings.userTable] 
      : [];
    
    // Fallback to common table names if not detected
    const possibleTables = [...detectedTables, 'usuarios', 'users', 'clientes', 'customers'];
    
    for (const tableName of possibleTables) {
      // Skip tables that aren't in our monitored list
      if (!this.config.tables.includes(tableName)) {
        continue;
      }
      
      try {
        // Use detected fields or fallback to common names
        const blockedFields = this.fieldMappings?.userBlockedField 
          ? [this.fieldMappings.userBlockedField]
          : ['bloqueado', 'blocked'];
        
        const statusFields = this.fieldMappings?.userStatusField
          ? [this.fieldMappings.userStatusField]
          : ['estado', 'status'];
        
        const selectFields = [...blockedFields, ...statusFields].join(', ');
        
        const { data, error } = await this.client
          .from(tableName)
          .select(selectFields)
          .eq('id', userId)
          .single();
        
        if (error) {
          // Table might not exist or user not found, try next table
          if (error.code === '42P01' || error.code === 'PGRST116') {
            console.log(`   ℹ️ Tabla ${tableName} no existe o usuario no encontrado, continuando...`);
            continue;
          }
          throw error;
        }
        
        // Check blocked status using detected or common field names
        const isBlocked = blockedFields.some(field => data[field] === true) ||
                         statusFields.some(field => data[field] === 'bloqueado' || data[field] === 'blocked');
        
        if (isBlocked) {
          this.discrepancies.push({
            type: 'unauthorized_action',
            severity: 'critical',
            description: `${context}: Usuario ${userId} fue bloqueado durante la conversación`,
            expected: { bloqueado: false },
            actual: { bloqueado: data.bloqueado, estado: data.estado },
            table: tableName,
            timestamp: Date.now()
          });
          console.log(`   ❌ USUARIO BLOQUEADO (tabla: ${tableName})`);
          return false;
        }
        
        console.log(`   ✅ Usuario NO bloqueado (verificado en ${tableName})`);
        return true;
      } catch (error) {
        console.log(`   ⚠️ Error al verificar en ${tableName}:`, error);
        continue;
      }
    }
    
    console.log(`   ℹ️ No se pudo verificar estado de bloqueo (tablas de usuarios no encontradas)`);
    return true; // Assume not blocked if can't verify
  }

  /**
   * Compara dos snapshots para detectar cambios y los guarda
   */
  /**
   * Encuentra el campo identificador de un registro
   * Intenta: id, uuid, _id, key, o el primer campo único
   */
  private getRecordId(record: any): string {
    const idFields = ['id', 'uuid', '_id', 'key', 'pk'];
    for (const field of idFields) {
      if (record[field] !== undefined && record[field] !== null) {
        return String(record[field]);
      }
    }
    // Fallback: usar JSON stringify del registro completo (menos eficiente pero funcional)
    return JSON.stringify(record);
  }

  compareSnapshots(before: DatabaseSnapshot, after: DatabaseSnapshot): void {
    console.log(`📊 [DB Audit] Comparando snapshots...`);
    console.log(`   Before timestamp: ${new Date(before.timestamp).toISOString()}`);
    console.log(`   After timestamp: ${new Date(after.timestamp).toISOString()}`);
    const timestamp = Date.now();
    
    for (const table of this.config.tables) {
      const beforeData = before.data[table] || [];
      const afterData = after.data[table] || [];
      
      console.log(`\n   📋 Tabla: ${table}`);
      console.log(`      BEFORE: ${beforeData.length} registros`);
      console.log(`      AFTER: ${afterData.length} registros`);
      
      // 1. INSERTS: Nuevos registros
      const newRecords = afterData.filter(
        afterRec => !beforeData.some(beforeRec => this.getRecordId(beforeRec) === this.getRecordId(afterRec))
      );
      
      console.log(`      ➕ INSERTS detectados: ${newRecords.length}`);
      newRecords.forEach(record => {
        const recordId = this.getRecordId(record);
        this.changes.push({
          type: 'INSERT',
          table,
          record,
          after: record,
          timestamp
        });
        console.log(`         ➕ ${table}: Nuevo registro ${recordId.substring(0, 50)}`);
      });
      
      // 2. UPDATES: Registros modificados
      const updates = [];
      afterData.forEach(afterRec => {
        const afterId = this.getRecordId(afterRec);
        const beforeRec = beforeData.find(b => this.getRecordId(b) === afterId);
        if (beforeRec && JSON.stringify(beforeRec) !== JSON.stringify(afterRec)) {
          // Detectar qué campos cambiaron
          const changedFields: string[] = [];
          Object.keys(afterRec).forEach(key => {
            if (JSON.stringify(beforeRec[key]) !== JSON.stringify(afterRec[key])) {
              changedFields.push(key);
            }
          });
          
          this.changes.push({
            type: 'UPDATE',
            table,
            record: { id: afterId, changedFields },
            before: beforeRec,
            after: afterRec,
            timestamp
          });
          updates.push({ id: afterId, fields: changedFields });
          console.log(`         🔄 ${table}: Modificado ${afterId.substring(0, 50)} (campos: ${changedFields.join(', ')})`);
        }
      });
      console.log(`      🔄 UPDATES detectados: ${updates.length}`);
      
      // 3. DELETES: Registros eliminados
      const deletedRecords = beforeData.filter(
        beforeRec => !afterData.some(afterRec => this.getRecordId(afterRec) === this.getRecordId(beforeRec))
      );
      
      console.log(`      ➖ DELETES detectados: ${deletedRecords.length}`);
      deletedRecords.forEach(record => {
        const recordId = this.getRecordId(record);
        this.changes.push({
          type: 'DELETE',
          table,
          record,
          before: record,
          timestamp
        });
        console.log(`         ➖ ${table}: Eliminado ${recordId.substring(0, 50)}`);
      });
    }
    
    console.log(`\n   📊 Total de cambios detectados en esta comparación: ${this.changes.length}`);
  }

  /**
   * Obtiene el resumen de la auditoría
   */
  getSummary(): DatabaseOperationSummary & { discrepancies: DatabaseDiscrepancy[], changes: DatabaseChange[] } {
    const criticalIssues = this.discrepancies.filter(d => d.severity === 'critical').length;
    const warnings = this.discrepancies.filter(d => d.severity === 'warning').length;
    
    const inserts = this.changes.filter(c => c.type === 'INSERT').length;
    const updates = this.changes.filter(c => c.type === 'UPDATE').length;
    const deletes = this.changes.filter(c => c.type === 'DELETE').length;
    
    // 🔥 CONTAR LECTURAS REALES: Cada snapshot consulta TODAS las tablas configuradas
    const totalReads = this.snapshots.size * this.config.tables.length;
    const totalOperations = totalReads + this.changes.length;
    
    console.log(`\n📋 [DB Audit] Resumen de Auditoría:`);
    console.log(`   Snapshots tomados: ${this.snapshots.size} (${totalReads} queries a BD)`);
    console.log(`   Tablas monitoreadas: ${this.config.tables.length}`);
    console.log(`   Lecturas totales: ${totalReads}`);
    console.log(`   Cambios detectados: ${this.changes.length}`);
    console.log(`   - Inserciones: ${inserts}`);
    console.log(`   - Actualizaciones: ${updates}`);
    console.log(`   - Eliminaciones: ${deletes}`);
    console.log(`   Operaciones totales: ${totalOperations}`);
    console.log(`   Discrepancias: ${this.discrepancies.length}`);
    console.log(`   - Críticas: ${criticalIssues}`);
    console.log(`   - Advertencias: ${warnings}`);
    
    return {
      totalOperations: totalOperations, // 🔥 Total real: lecturas + cambios
      reads: totalReads, // 🔥 Cada snapshot lee TODAS las tablas
      writes: inserts,
      updates: updates,
      deletes: deletes,
      tablesUsed: this.config.tables,
      recordsCreated: inserts,
      operations: [],
      discrepancies: this.discrepancies,
      changes: this.changes
    };
  }

  /**
   * Limpia recursos
   */
  cleanup() {
    this.snapshots.clear();
    this.discrepancies = [];
  }
}

// Registry de auditores por conversación
const auditorRegistry = new Map<string, RealDatabaseAuditor>();

export const initializeRealDatabaseAuditor = (
  conversationId: string,
  config: DatabaseConfig,
  payload?: Record<string, any>,
  workflowNodes?: any[] // 🔥 NUEVO: Nodos del workflow para análisis inteligente
): RealDatabaseAuditor => {
  console.log(`\n🗄️ ===== INICIALIZANDO AUDITOR DE BD =====`);
  console.log(`   Conversación: ${conversationId}`);
  console.log(`   Tipo BD: ${config.type}`);
  console.log(`   URL: ${config.credentials.url}`);
  console.log(`   Tablas a monitorear: ${config.tables.join(', ')}`);
  console.log(`   Identificadores extraídos del payload:`, payload ? Object.keys(payload).slice(0, 5).join(', ') : 'ninguno');
  console.log(`   Nodos del workflow: ${workflowNodes ? workflowNodes.length : 'no proporcionados'}`);
  
  const auditor = new RealDatabaseAuditor(conversationId, config, payload, workflowNodes);
  auditorRegistry.set(conversationId, auditor);
  
  console.log(`   ✅ Auditor registrado y listo`);
  console.log(`   Total auditores activos: ${auditorRegistry.size}`);
  console.log(`=========================================\n`);
  
  return auditor;
};

export const getRealDatabaseAuditor = (conversationId: string): RealDatabaseAuditor | undefined => {
  const auditor = auditorRegistry.get(conversationId);
  console.log(`\n🔍 [getRealDatabaseAuditor] Buscando auditor para: ${conversationId}`);
  console.log(`   Registry tiene ${auditorRegistry.size} auditores:`);
  console.log(`   IDs en registry:`, Array.from(auditorRegistry.keys()).join(', '));
  console.log(`   Auditor encontrado:`, !!auditor);
  
  if (!auditor) {
    console.error(`   🚨 AUDITOR NO ENCONTRADO`);
    console.error(`   Posibles causas:`);
    console.error(`     1. El ID de conversación no coincide`);
    console.error(`     2. El auditor nunca se inicializó`);
    console.error(`     3. El auditor fue limpiado prematuramente`);
  }
  
  return auditor;
};

export const cleanupRealDatabaseAuditor = (conversationId: string): void => {
  const auditor = auditorRegistry.get(conversationId);
  if (auditor) {
    auditor.cleanup();
    auditorRegistry.delete(conversationId);
    console.log(`🧹 [DB Audit] Limpiado auditor para conversación: ${conversationId}`);
  }
};

export { RealDatabaseAuditor };
export type { DatabaseConfig, DatabaseDiscrepancy };

