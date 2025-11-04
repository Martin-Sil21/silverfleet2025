/**
 * 🧠 Clasificador Inteligente de Tablas
 * 
 * Analiza nombres de tablas y patrones de uso para clasificarlas en:
 * - BUSINESS: Datos de negocio importantes (resumen conversaciones, clientes, pedidos, productos)
 * - TEMPORARY: Memoria temporal/caché (chat_histories, n8n_chat)
 * - RAG: Vectorstores y embeddings
 * - CRM: Sistemas CRM/contactos
 * - ANALYTICS: Logs y analytics
 */

export type TableType = 'BUSINESS' | 'TEMPORARY' | 'RAG' | 'CRM' | 'ANALYTICS' | 'UNKNOWN';

export interface TableClassification {
  tableName: string;
  type: TableType;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  reason: string;
  icon: string;
  priority: number; // Para ordenar por importancia (1 = más importante)
}

/**
 * Patrones para clasificar tablas
 */
const TABLE_PATTERNS = {
  // 📊 Datos de negocio importantes
  BUSINESS: [
    // Resúmenes y conversaciones permanentes
    { pattern: /^resumen[_-]?conversacion/i, reason: 'Tabla de resúmenes de conversaciones', priority: 1 },
    { pattern: /^conversacion(?:es)?$/i, reason: 'Tabla principal de conversaciones', priority: 1 },
    { pattern: /^summar(?:y|ies)/i, reason: 'Tabla de resúmenes', priority: 1 },
    { pattern: /^memoria_temporal_[^_]+_silverfleet$/i, reason: 'Tabla de memoria temporal estructurada', priority: 2 },
    
    // Clientes y usuarios
    { pattern: /^client(?:e|es?)/i, reason: 'Tabla de clientes', priority: 1 },
    { pattern: /^usuario?s?$/i, reason: 'Tabla de usuarios', priority: 1 },
    { pattern: /^customer/i, reason: 'Tabla de clientes', priority: 1 },
    { pattern: /^user(?:s)?$/i, reason: 'Tabla de usuarios', priority: 1 },
    
    // Operaciones comerciales
    { pattern: /^pedidos?$/i, reason: 'Tabla de pedidos', priority: 1 },
    { pattern: /^order(?:s)?$/i, reason: 'Tabla de pedidos', priority: 1 },
    { pattern: /^venta(?:s)?$/i, reason: 'Tabla de ventas', priority: 1 },
    { pattern: /^sale(?:s)?$/i, reason: 'Tabla de ventas', priority: 1 },
    { pattern: /^factura(?:s)?$/i, reason: 'Tabla de facturas', priority: 1 },
    { pattern: /^invoice(?:s)?$/i, reason: 'Tabla de facturas', priority: 1 },
    { pattern: /^presupuesto(?:s)?$/i, reason: 'Tabla de presupuestos', priority: 1 },
    { pattern: /^quote(?:s)?$/i, reason: 'Tabla de presupuestos', priority: 1 },
    
    // Catálogos
    { pattern: /^producto(?:s)?$/i, reason: 'Tabla de productos', priority: 2 },
    { pattern: /^product(?:s)?$/i, reason: 'Tabla de productos', priority: 2 },
    { pattern: /^catalogo$/i, reason: 'Tabla de catálogo', priority: 2 },
    { pattern: /^catalog(?:ue)?$/i, reason: 'Tabla de catálogo', priority: 2 },
    { pattern: /^inventor(?:y|io)$/i, reason: 'Tabla de inventario', priority: 2 },
    
    // Agendamiento
    { pattern: /^cita(?:s)?$/i, reason: 'Tabla de citas', priority: 1 },
    { pattern: /^appointment(?:s)?$/i, reason: 'Tabla de citas', priority: 1 },
    { pattern: /^reserva(?:s)?$/i, reason: 'Tabla de reservas', priority: 1 },
    { pattern: /^booking(?:s)?$/i, reason: 'Tabla de reservas', priority: 1 },
    
    // Estados y bloqueos
    { pattern: /^estado(?:s)?[_-]usuario/i, reason: 'Tabla de estados de usuarios', priority: 2 },
    { pattern: /^user[_-]state/i, reason: 'Tabla de estados', priority: 2 },
    { pattern: /^bloqueado(?:s)?$/i, reason: 'Tabla de bloqueos', priority: 2 },
    { pattern: /^blocked[_-]user/i, reason: 'Tabla de usuarios bloqueados', priority: 2 },
  ],
  
  // 💬 Memoria temporal (no crítico para auditoría)
  TEMPORARY: [
    { pattern: /^n8n[_-]chat/i, reason: 'Memoria temporal de n8n', priority: 10 },
    { pattern: /^chat[_-]histor(?:y|ies)/i, reason: 'Historial temporal de chat', priority: 10 },
    { pattern: /^temp[_-]/i, reason: 'Tabla temporal', priority: 10 },
    { pattern: /^cache[_-]/i, reason: 'Caché temporal', priority: 10 },
    { pattern: /^session[_-]/i, reason: 'Sesiones temporales', priority: 10 },
    { pattern: /^memoria[_-]chat/i, reason: 'Memoria temporal de chat', priority: 10 },
    { pattern: /[_-]temp$/i, reason: 'Tabla temporal', priority: 10 },
    { pattern: /^buffer/i, reason: 'Buffer temporal', priority: 10 },
  ],
  
  // 🧠 RAG y vectores
  RAG: [
    { pattern: /vectorstore/i, reason: 'Base de vectores (RAG)', priority: 9 },
    { pattern: /embedding/i, reason: 'Embeddings (RAG)', priority: 9 },
    { pattern: /^rag[_-]/i, reason: 'Sistema RAG', priority: 9 },
    { pattern: /^document(?:s)?$/i, reason: 'Documentos para RAG', priority: 9 },
    { pattern: /^knowledge[_-]base/i, reason: 'Base de conocimiento', priority: 9 },
    { pattern: /^chunks?$/i, reason: 'Chunks de documentos (RAG)', priority: 9 },
  ],
  
  // 👥 CRM
  CRM: [
    { pattern: /^crm[_-]/i, reason: 'Datos de CRM', priority: 3 },
    { pattern: /^contact(?:o|s)?$/i, reason: 'Contactos de CRM', priority: 3 },
    { pattern: /^lead(?:s)?$/i, reason: 'Leads de CRM', priority: 3 },
    { pattern: /^deal(?:s)?$/i, reason: 'Deals de CRM', priority: 3 },
    { pattern: /^opportunit(?:y|ies)/i, reason: 'Oportunidades de CRM', priority: 3 },
    { pattern: /^pipeline/i, reason: 'Pipeline de CRM', priority: 3 },
  ],
  
  // 📈 Analytics y logs
  ANALYTICS: [
    { pattern: /^log(?:s)?$/i, reason: 'Tabla de logs', priority: 8 },
    { pattern: /^audit[_-]log/i, reason: 'Logs de auditoría', priority: 8 },
    { pattern: /^event(?:s)?$/i, reason: 'Tabla de eventos', priority: 8 },
    { pattern: /^metric(?:s)?$/i, reason: 'Métricas', priority: 8 },
    { pattern: /^analy(?:tic|sis)/i, reason: 'Analytics', priority: 8 },
    { pattern: /^tracking/i, reason: 'Tracking de eventos', priority: 8 },
  ],
};

/**
 * Iconos por tipo de tabla
 */
const TYPE_ICONS: Record<TableType, string> = {
  BUSINESS: '💼',
  TEMPORARY: '⏱️',
  RAG: '🧠',
  CRM: '👥',
  ANALYTICS: '📈',
  UNKNOWN: '❓',
};

/**
 * Clasifica una tabla según su nombre
 */
export function classifyTable(tableName: string): TableClassification {
  const lowerName = tableName.toLowerCase();
  
  // Buscar en cada categoría
  for (const [type, patterns] of Object.entries(TABLE_PATTERNS)) {
    for (const { pattern, reason, priority } of patterns) {
      if (pattern.test(lowerName)) {
        return {
          tableName,
          type: type as TableType,
          confidence: 'HIGH',
          reason,
          icon: TYPE_ICONS[type as TableType],
          priority,
        };
      }
    }
  }
  
  // Si no coincide con ningún patrón, clasificar como UNKNOWN
  return {
    tableName,
    type: 'UNKNOWN',
    confidence: 'LOW',
    reason: 'No se pudo clasificar automáticamente',
    icon: TYPE_ICONS.UNKNOWN,
    priority: 5,
  };
}

/**
 * Clasifica múltiples tablas y las agrupa por tipo
 */
export function classifyTables(tableNames: string[]): Map<TableType, TableClassification[]> {
  const classifications = tableNames.map(classifyTable);
  
  const grouped = new Map<TableType, TableClassification[]>();
  
  for (const classification of classifications) {
    const existing = grouped.get(classification.type) || [];
    existing.push(classification);
    grouped.set(classification.type, existing);
  }
  
  // Ordenar cada grupo por prioridad
  for (const [type, tables] of grouped.entries()) {
    tables.sort((a, b) => a.priority - b.priority);
  }
  
  return grouped;
}

/**
 * Determina si una tabla es crítica para auditoría
 * (BUSINESS y CRM son críticas, TEMPORARY y RAG no)
 */
export function isBusinessCriticalTable(tableName: string): boolean {
  const classification = classifyTable(tableName);
  return classification.type === 'BUSINESS' || classification.type === 'CRM';
}

/**
 * Obtiene un resumen legible de las clasificaciones
 */
export function getClassificationSummary(tableNames: string[]): string {
  const grouped = classifyTables(tableNames);
  
  const lines: string[] = [];
  
  for (const [type, tables] of grouped.entries()) {
    const icon = TYPE_ICONS[type];
    lines.push(`${icon} ${type}: ${tables.map(t => t.tableName).join(', ')}`);
  }
  
  return lines.join('\n');
}

/**
 * Filtra solo tablas de negocio críticas
 */
export function getBusinessTables(tableNames: string[]): string[] {
  return tableNames.filter(isBusinessCriticalTable);
}

/**
 * Determina si se debe mostrar advertencia de "no guardó resumen"
 * basándose en si hay cambios en tablas de negocio
 */
export function shouldShowNoSaveWarning(
  changes: Array<{ table: string; type: string }>,
  conversationTurns: number
): boolean {
  // Si hay menos de 3 turnos, no mostrar advertencia (conversación muy corta)
  if (conversationTurns < 3) return false;
  
  // Buscar cambios en tablas de negocio
  const businessChanges = changes.filter(change => {
    const classification = classifyTable(change.table);
    return classification.type === 'BUSINESS';
  });
  
  // Si NO hay cambios en tablas de negocio, mostrar advertencia
  return businessChanges.length === 0;
}

/**
 * Analiza los cambios y genera un mensaje inteligente
 */
export function analyzeChanges(changes: Array<{ table: string; type: string }>): {
  hasBusinessChanges: boolean;
  hasTemporaryChanges: boolean;
  hasRAGChanges: boolean;
  summary: string;
  businessTables: string[];
  temporaryTables: string[];
} {
  const businessChanges = changes.filter(c => classifyTable(c.table).type === 'BUSINESS');
  const temporaryChanges = changes.filter(c => classifyTable(c.table).type === 'TEMPORARY');
  const ragChanges = changes.filter(c => classifyTable(c.table).type === 'RAG');
  
  const businessTables = [...new Set(businessChanges.map(c => c.table))];
  const temporaryTables = [...new Set(temporaryChanges.map(c => c.table))];
  
  let summary = '';
  
  if (businessChanges.length > 0) {
    summary = `✅ Guardó en BD de negocio: ${businessTables.join(', ')}`;
  } else if (temporaryChanges.length > 0) {
    summary = `⚠️ Solo guardó en memoria temporal: ${temporaryTables.join(', ')}`;
  } else if (ragChanges.length > 0) {
    summary = `🧠 Solo actualizó vectorstore/RAG`;
  } else {
    summary = `❌ No guardó ningún dato`;
  }
  
  return {
    hasBusinessChanges: businessChanges.length > 0,
    hasTemporaryChanges: temporaryChanges.length > 0,
    hasRAGChanges: ragChanges.length > 0,
    summary,
    businessTables,
    temporaryTables,
  };
}
