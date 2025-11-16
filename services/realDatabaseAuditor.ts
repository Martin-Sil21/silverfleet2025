import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type { DatabaseOperationSummary, DatabaseChange } from '../types';
import { analyzeAndMapDatabase, type FieldMappings } from './databaseSchemaAnalyzer';
import { analyzeWorkflowDatabases, findMappingForTable, getFilterValue } from './workflowDatabaseAnalyzer';
import type { WorkflowDatabaseInfo } from './workflowDatabaseAnalyzer';
import { verifyTools, type ToolVerificationResult } from './toolVerificator';
import { DetectedTool, DetectedSubflow } from './workflowDependencyAnalyzer';
import snapshotCache from './snapshotCache'; // 🔥 NUEVO: Caché de snapshots

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
  
  // 🔧 NUEVO: Almacenar herramientas detectadas del workflow para verificación
  public detectedTools: DetectedTool[] = [];
  public detectedSubflows: DetectedSubflow[] = [];
  public toolVerifications: ToolVerificationResult[] = []; // Público para reporting
  
  // 🔥 Accessor para dependencias (tools + subflows)
  public get dependencies() {
    return {
      tools: this.detectedTools,
      subflows: this.detectedSubflows
    };
  }

  constructor(
    conversationId: string, 
    config: DatabaseConfig, 
    payload?: Record<string, any>, 
    workflowNodes?: any[],
    detectedTools?: DetectedTool[],
    detectedSubflows?: DetectedSubflow[]
  ) {
    // ========== VALIDACIÓN ROBUSTA ==========
    console.log(`\n🔍 [DB Auditor] Validando configuración...`);

    // Validación 1: Config existe
    if (!config) {
      const error = `Config is null/undefined for conversation ${conversationId}`;
      console.error(`   ❌ ${error}`);
      throw new Error(`[DB Auditor] ${error}`);
    }

    // Validación 2: Credentials exist
    if (!config.credentials) {
      const error = `Config.credentials is null/undefined`;
      console.error(`   ❌ ${error}`);
      console.error(`   Config recibido:`, JSON.stringify(config, null, 2).substring(0, 300));
      throw new Error(`[DB Auditor] ${error}`);
    }

    // Validación 3: URL existe y es válida
    if (!config.credentials.url) {
      const error = `Supabase URL is missing`;
      console.error(`   ❌ ${error}`);
      console.error(`   Credentials:`, config.credentials);
      throw new Error(`[DB Auditor] ${error}`);
    }

    if (!config.credentials.url.startsWith('http')) {
      const error = `Supabase URL is invalid: ${config.credentials.url}`;
      console.error(`   ❌ ${error}`);
      throw new Error(`[DB Auditor] ${error}`);
    }

    // Validación 4: Key existe
    if (!config.credentials.key) {
      const error = `Supabase key is missing`;
      console.error(`   ❌ ${error}`);
      throw new Error(`[DB Auditor] ${error}`);
    }

    // Validación 5: Key es formato JWT (service_role)
    if (!config.credentials.key.startsWith('eyJ')) {
      console.warn(`   ⚠️ La key no parece ser JWT (service_role). RLS puede bloquear queries.`);
      console.warn(`   Key comienza con: ${config.credentials.key.substring(0, 10)}...`);
    }

    // Validación 6: Tablas especificadas
    if (!config.tables || config.tables.length === 0) {
      console.warn(`   ⚠️ No se especificaron tablas para monitorear`);
      config.tables = []; // Asegurar que sea array vacío en lugar de undefined
    }

    console.log(`   ✅ Configuración válida`);
    console.log(`   URL: ${config.credentials.url}`);
    console.log(`   Key: ${config.credentials.key.substring(0, 20)}...`);
    console.log(`   Tablas: ${config.tables.join(', ')}`);
    // ========================================
    
    this.conversationId = conversationId;
    this.config = config;
    this.payload = payload;
    this.detectedTools = detectedTools || [];
    this.detectedSubflows = detectedSubflows || [];
    
    // 🔥 DEBUG: Ver qué nos llega
    console.log(`\n🔥 [Constructor RealDatabaseAuditor]`);
    console.log(`   conversationId: ${conversationId}`);
    console.log(`   workflowNodes recibido: ${workflowNodes ? `array de ${workflowNodes.length} elementos` : 'undefined/null'}`);
    if (workflowNodes && workflowNodes.length > 0) {
      console.log(`   Primer nodo:`, JSON.stringify(workflowNodes[0]).substring(0, 200));
    }
    
    // 🔥 ANALIZAR EL WORKFLOW para obtener mappings de tablas → campos de filtro
    if (workflowNodes && workflowNodes.length > 0) {
      console.log(`\n🔍 [DB Audit] Analizando workflow para detectar uso de BD...`);
      this.workflowInfo = analyzeWorkflowDatabases(workflowNodes);
      
      // 🔥 DEBUG: Mostrar lo que se detectó
      if (this.workflowInfo) {
        console.log(`\n📊 [DB Audit] RESULTADO DEL ANÁLISIS DEL WORKFLOW:`);
        console.log(`   Tablas detectadas: ${this.workflowInfo.tables.join(', ')}`);
        console.log(`   Total mappings: ${this.workflowInfo.mappings.length}`);
        
        if (this.workflowInfo.mappings.length > 0) {
          console.log(`\n   📋 MAPPINGS DETECTADOS:`);
          this.workflowInfo.mappings.forEach((m, idx) => {
            console.log(`      ${idx + 1}. Tabla: "${m.table}"`);
            console.log(`         - Campo filtro: ${m.filterField}`);
            console.log(`         - Campo payload: ${m.sourceField}`);
          });
        } else {
          console.warn(`   ⚠️ NO SE DETECTARON MAPPINGS - Se usará auto-detect`);
        }
      } else {
        console.error(`   ❌ analyzeWorkflowDatabases devolvió null/undefined`);
      }
    } else {
      console.log(`\n⚠️ [DB Audit] No se proporcionó información del workflow, usando detección automática`);
    }
    
    // 🔍 Extraer TODOS los posibles identificadores del payload (INTELIGENTE)
    // Evitar agregar IDs internos de test (ej: TC-001) que no existen en la BD
    // Sólo agregar si el conversationId parece un identificador real (teléfono, uuid, etc.)
    const isLikelyExternalId = (id: string) => {
      if (!id || typeof id !== 'string') return false;
      
      // ❌ Excluir test IDs completamente
      if (/^TC[-_]/i.test(id)) return false;
      
      // ❌ Excluir IDs muy cortos (probablemente internos)
      if (id.length < 8) return false;
      
      // ✅ Incluir teléfonos con prefijo internacional
      if (id.includes('+') && /\d{8,}/.test(id)) return true;
      
      // ✅ Incluir IDs que empiezan con prefijos conocidos
      if (id.startsWith('conv_') || id.startsWith('session_') || id.startsWith('chat_') || id.startsWith('user_')) return true;
      
      // ✅ Incluir UUIDs
      if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return true;
      
      // ✅ Incluir timestamps largos (13+ dígitos)
      if (/^\d{13,}$/.test(id)) return true;
      
      return false;
    };

    if (isLikelyExternalId(conversationId)) {
      this.searchIdentifiers.push(conversationId);
      console.log(`   📌 Identificador base agregado: ${conversationId}`);
    } else {
      console.log(`   ⏭️ Identificador base ignorado (no es ID real): ${conversationId}`);
    }
    
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
          // 🔥 VALIDAR que sea un ID real (no test ID, no muy corto)
          if (isLikelyExternalId(value) && !this.searchIdentifiers.includes(value)) {
            this.searchIdentifiers.push(value);
            console.log(`   ✅ Identificador (prioritario): ${field}="${value}"`);
          } else if (!isLikelyExternalId(value)) {
            console.log(`   ⏭️ Campo prioritario ignorado: ${field}="${value}" (no es ID válido)`);
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
          !key.toLowerCase().includes('query') && // No es query
          isLikelyExternalId(valueStr) // 🔥 VALIDAR con la función estricta
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
   * 🔥 NUEVO: Actualiza los identificadores de búsqueda con valores reales
   * Útil para agregar IDs generados durante la ejecución del workflow
   * @param newIdentifiers Array de nuevos identificadores (sessionId, conversationId, etc.)
   */
  public updateSearchIdentifiers(newIdentifiers: string[]): void {
    console.log(`\n🔄 [DB Audit] Actualizando identificadores de búsqueda...`);
    console.log(`   Identificadores actuales: [${this.searchIdentifiers.join(', ')}]`);
    console.log(`   Nuevos identificadores recibidos: [${newIdentifiers.join(', ')}]`);
    
    let added = 0;
    const isLikelyExternalId = (id: string) => {
      if (!id || typeof id !== 'string') return false;
      if (/^TC[-_]/i.test(id)) return false;
      if (id.length < 8) return false;
      if (id.includes('+') && /\d{8,}/.test(id)) return true;
      if (id.startsWith('conv_') || id.startsWith('session_') || id.startsWith('chat_') || id.startsWith('user_')) return true;
      if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return true;
      if (/^\d{13,}$/.test(id)) return true;
      return false;
    };
    
    for (const id of newIdentifiers) {
      if (id && !this.searchIdentifiers.includes(id)) {
        // Validar que sea un ID real (no test ID)
        if (isLikelyExternalId(id)) {
          this.searchIdentifiers.push(id);
          added++;
          console.log(`      ✅ Agregado: ${id}`);
        } else {
          console.log(`      ⏭️ Ignorado (no es ID válido): ${id}`);
        }
      }
    }
    
    console.log(`   Total agregados: ${added}`);
    console.log(`   Total identificadores ahora: ${this.searchIdentifiers.length}`);
    console.log(`   📋 Lista actualizada: [${this.searchIdentifiers.join(', ')}]\n`);
  }
  
  /**
   * 🔥 NUEVO: Extrae IDs reales de la respuesta del webhook
   * Busca campos como sessionId, conversationId, chatId, etc.
   * @param webhookResponse Respuesta del webhook (puede ser anidada)
   * @returns Array de identificadores encontrados
   */
  public static extractRealIdentifiers(webhookResponse: any): string[] {
    const identifiers: string[] = [];
    
    const fieldNames = [
      'sessionId', 'session_id', 'session',
      'conversationId', 'conversation_id', 'conversation',
      'chatId', 'chat_id', 'chat',
      'userId', 'user_id', 'user',
      'telefono', 'phone', 'telephone', 'tel'
    ];
    
    function extractFromObject(obj: any, path: string = '') {
      if (!obj || typeof obj !== 'object') return;
      
      for (const [key, value] of Object.entries(obj)) {
        const fullPath = path ? `${path}.${key}` : key;
        
        // Si el campo está en la lista de nombres comunes
        if (fieldNames.some(f => key.toLowerCase() === f.toLowerCase())) {
          const strValue = String(value);
          if (strValue && strValue.length >= 8 && !/^TC[-_]/i.test(strValue)) {
            identifiers.push(strValue);
            console.log(`   📌 ID real encontrado en webhook: ${key}="${strValue}"`);
          }
        }
        
        // Recursivo para objetos anidados
        if (typeof value === 'object' && value !== null) {
          extractFromObject(value, fullPath);
        }
      }
    }
    
    extractFromObject(webhookResponse);
    
    // Eliminar duplicados
    return Array.from(new Set(identifiers));
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
        
        // 🔥 USAR CACHÉ para evitar consultas duplicadas cuando múltiples conversaciones consultan al mismo tiempo
        const cacheKey = `${table}_${this.conversationId}_${Math.floor(timestamp / 2000)}`; // Cache por 2 segundos
        const rows = await snapshotCache.getOrFetch(cacheKey, () => this.queryTable(table));
        
        const duration = Date.now() - startTime;
        
        data[table] = rows;
        console.log(`   ✅ [${table}] ${rows.length} registros (${duration}ms)`);
        
        // ℹ️ Info si 0 registros (normal al inicio de auditoría)
        if (rows.length === 0) {
          console.log(`   ℹ️ Tabla "${table}" devolvió 0 registros (puede ser normal al inicio)`);
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
    
    // ℹ️ Info si TODAS las tablas están en 0 (es normal en el primer snapshot)
    if (totalRecords === 0 && this.snapshots.size > 1) {
      // Solo advertir si ya pasó el primer snapshot y sigue en 0
      console.warn(`\n   ⚠️ Todas las tablas siguen en 0 registros después de ${this.snapshots.size} snapshots`);
      console.warn(`   Posibles causas:`);
      console.warn(`     1. El agente no ha escrito en BD aún`);
      console.warn(`     2. Row Level Security (RLS) está bloqueando la consulta`);
      console.warn(`     3. Estás usando 'anon' key en vez de 'service_role' key\n`);
    } else if (totalRecords === 0) {
      console.log(`   ℹ️ Primer snapshot sin datos (normal al inicio de la auditoría)`);
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
          console.log(`\n   🔍 [${table}] Iniciando consulta...`);
          console.log(`      workflowInfo existe: ${!!this.workflowInfo}`);
          console.log(`      payload existe: ${!!this.payload}`);
          
          if (this.workflowInfo && this.payload) {
            console.log(`      Buscando mapping para tabla: ${table}`);
            const mapping = findMappingForTable(table, this.workflowInfo, this.payload);
            console.log(`      Mapping encontrado: ${!!mapping}`);
            
            if (mapping) {
              console.log(`\n   🎯 [${table}] USANDO MAPPING DEL WORKFLOW`);
              console.log(`      Campo de filtro: ${mapping.filterField}`);
              console.log(`      Campo del payload: ${mapping.sourceField}`);
              
              const filterValue = getFilterValue(mapping, this.payload);
              console.log(`      Valor extraído: ${filterValue}`);
              
              if (filterValue) {
                console.log(`      Valor a filtrar: "${filterValue}"`);
                console.log(`      Operador: ${mapping.operator || 'eq'}`);
                
                try {
                  let query = this.client.from(table).select('*');
                  
                  // Aplicar operador correcto según el workflow
                  const operator = mapping.operator || 'eq';
                  switch (operator) {
                    case 'eq':
                      query = query.eq(mapping.filterField, filterValue);
                      break;
                    case 'ilike':
                      query = query.ilike(mapping.filterField, `%${filterValue}%`);
                      break;
                    case 'like':
                      query = query.like(mapping.filterField, `%${filterValue}%`);
                      break;
                    case 'gt':
                      query = query.gt(mapping.filterField, filterValue);
                      break;
                    case 'lt':
                      query = query.lt(mapping.filterField, filterValue);
                      break;
                    case 'gte':
                      query = query.gte(mapping.filterField, filterValue);
                      break;
                    case 'lte':
                      query = query.lte(mapping.filterField, filterValue);
                      break;
                    case 'neq':
                      query = query.neq(mapping.filterField, filterValue);
                      break;
                    default:
                      // Fallback a eq si es operador desconocido
                      query = query.eq(mapping.filterField, filterValue);
                  }
                  
                  const { data, error } = await query
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
                console.log(`      Payload disponible:`, Object.keys(this.payload));
              }
            } else {
              console.log(`      ⚠️ No se encontró mapping para tabla "${table}"`);
            }
          } else {
            if (!this.workflowInfo) console.log(`      ⚠️ No hay workflowInfo`);
            if (!this.payload) console.log(`      ⚠️ No hay payload`);
          }
          
          // 🔄 Si llegamos aquí: no hay mapping O el mapping falló
          console.log(`\n   🔍 [${table}] Usando detección automática por estructura...`);
          return await this.queryTableWithAutoDetect(table);
          
        } catch (error) {
          console.error(`   ✗ Error general en queryTable para ${table}:`, error);
          return [];
        }
        
      default:
        return [];
    }
  }
  
  /**
   * Método privado que realiza auto-detección de campos cuando no hay mapping del workflow
   */
  private async queryTableWithAutoDetect(table: string): Promise<any[]> {
      try {
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
          
          // 🔥 PRIORIZAR CAMPOS CONOCIDOS DE SESIÓN (session_id, sessionId, etc.)
          const priorityFields = [
            'session_id', 'sessionId', 'session',
            'conversationId', 'conversation_id',
            'chatId', 'chat_id',
            'telefono', 'telefonos', 'phone'
          ];
          
          // PASO 1: Intentar encontrar coincidencia directa consultando la tabla
          // 🔥 SOLO en campos prioritarios (evita buscar en is_blocked, created_at, etc.)
          const fieldsToCheck = availableFields.filter(f => 
            priorityFields.some(pf => f.toLowerCase().includes(pf.toLowerCase()))
          );
          
          console.log(`   🎯 Campos de sesión detectados: ${fieldsToCheck.join(', ') || 'ninguno, usando todos'}`);
          const searchFields = fieldsToCheck.length > 0 ? fieldsToCheck : priorityFields.filter(f => availableFields.includes(f));
          
          for (const field of searchFields) {
            if (!availableFields.includes(field)) continue;
            
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
      // Evitar falsos positivos: marcar DELETE sólo si el registro pertenece a una sesión
      // relevante (ej. tiene session_id/telefono que esté en searchIdentifiers).
      const deletedRecords = beforeData.filter(beforeRec => {
        const stillExists = afterData.some(afterRec => this.getRecordId(afterRec) === this.getRecordId(beforeRec));
        if (stillExists) return false;

        // Extraer posible campo de sesión del registro
        const sessionCandidates = [
          beforeRec.session_id, beforeRec.sessionId, beforeRec.session, beforeRec.phone, beforeRec.telefono
        ].filter(Boolean).map(String);

        // Si no hay candidato de sesión, no asumimos DELETE (podría ser fuera del top-N)
        if (sessionCandidates.length === 0) return false;

        // Si alguno de los sessionCandidates aparece en nuestros identificadores, consideramos DELETE
        for (const val of sessionCandidates) {
          if (this.searchIdentifiers.includes(val)) return true;
          // Normalizar números con y sin '+' para comparar
          const normalized = val.replace(/\D/g, '');
          if (normalized && this.searchIdentifiers.some(id => id.replace(/\D/g, '') === normalized)) return true;
        }

        return false;
      });
      
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
   * 🔧 Verifica que las herramientas externas fueron ejecutadas
   * Debe llamarse DESPUÉS de cada turno con la respuesta del agente
   */
  async verifyToolsForTurn(
    turnNumber: number,
    agentResponse: string,
    dbChangesThisTurn: DatabaseChange[],
    responsePayload?: any
  ): Promise<void> {
    console.log(`\n🔧 [Tool Verificator] Verificando herramientas para Turno ${turnNumber}`);
    console.log(`   Herramientas detectadas en auditor: ${this.detectedTools.length}`);
    console.log(`   Subflows detectados en auditor: ${this.detectedSubflows.length}`);
    
    if (this.detectedTools.length === 0 && this.detectedSubflows.length === 0) {
      console.log(`   ⚠️ ALERTA: No hay herramientas ni subflows en este auditor`);
      console.log(`   Conversation ID: ${this.conversationId}`);
      console.log(`   Esto significa que las herramientas no se pasaron correctamente al constructor`);
    } else {
      console.log(`   📋 Herramientas disponibles para verificar:`);
      this.detectedTools.forEach((tool, idx) => {
        console.log(`      ${idx + 1}. ${tool.nodeName} (${tool.toolType})`);
      });
      if (this.detectedSubflows.length > 0) {
        console.log(`   📋 Subflows disponibles:`);
        this.detectedSubflows.forEach((sf, idx) => {
          console.log(`      ${idx + 1}. ${sf.nodeName || sf.workflowName || 'Unnamed'}`);
        });
      }
    }
    
    try {
      const verification = await verifyTools(
        this.conversationId,
        turnNumber,
        agentResponse,
        this.detectedTools,
        this.detectedSubflows,
        dbChangesThisTurn,
        responsePayload
      );
      
      this.toolVerifications.push(verification);
      
      console.log(`   ${verification.summary}`);
      if (verification.verifications.length > 0) {
        console.log(`   Verificaciones realizadas:`);
        verification.verifications.forEach(v => {
          const icon = v.verdict === 'VERIFIED' ? '✅' : '❌';
          console.log(`      ${icon} ${v.toolName}: ${v.details}`);
        });
      }
    } catch (error) {
      console.error(`   ❌ Error al verificar herramientas:`, error);
    }
  }

  /**
   * Obtiene el resumen de la auditoría
   */
  getSummary(): DatabaseOperationSummary & { 
    discrepancies: DatabaseDiscrepancy[], 
    changes: DatabaseChange[],
    toolVerifications?: any[] // 🔧 NUEVO: Verificaciones de herramientas
  } {
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
    console.log(`   🔧 Verificaciones de herramientas: ${this.toolVerifications.length}`);
    
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
      changes: this.changes,
      toolVerifications: this.toolVerifications // 🔧 NUEVO
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
  workflowNodes?: any[], // 🔥 Nodos del workflow para análisis inteligente
  detectedTools?: DetectedTool[],
  detectedSubflows?: DetectedSubflow[]
): RealDatabaseAuditor => {
  console.log(`\n🗄️ ===== INICIALIZANDO AUDITOR DE BD =====`);
  console.log(`   Conversación: ${conversationId}`);
  console.log(`   Tipo BD: ${config.type}`);
  console.log(`   URL: ${config.credentials.url}`);
  console.log(`   Tablas a monitorear: ${config.tables.join(', ')}`);
  console.log(`   Identificadores extraídos del payload:`, payload ? Object.keys(payload).slice(0, 5).join(', ') : 'ninguno');
  console.log(`   Nodos del workflow: ${workflowNodes ? workflowNodes.length : 'no proporcionados'}`);
  console.log(`   Herramientas detectadas: ${detectedTools?.length || 0}`);
  console.log(`   Subflows detectados: ${detectedSubflows?.length || 0}`);
  
  const auditor = new RealDatabaseAuditor(
    conversationId, 
    config, 
    payload, 
    workflowNodes, 
    detectedTools, 
    detectedSubflows
  );
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

