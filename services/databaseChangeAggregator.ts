/**
 * Sistema de Agregación Inteligente de Cambios en BD
 * 
 * PROBLEMA RESUELTO:
 * - Antes: "12 registros modificados" cuando era EL MISMO registro 12 veces
 * - Ahora: "1 registro modificado 12 veces en 12 turnos"
 * 
 * FUNCIONALIDADES:
 * 1. Agrupa múltiples UPDATEs al mismo registro por su Primary Key
 * 2. Genera timeline detallado por conversación (INSERT → N UPDATEs → DELETE)
 * 3. Detecta limpieza de tablas temporales como comportamiento esperado
 * 4. Distingue entre "nuevos registros" y "actualizaciones a registro existente"
 */

import type { DatabaseChange } from '../types';
import { classifyTable, type TableClassification } from './tableClassifier';

// Tipos para el análisis agregado
export interface AggregatedUpdate {
  recordId: string;
  table: string;
  updateCount: number; // Cuántas veces se actualizó
  firstUpdate: DatabaseChange;
  lastUpdate: DatabaseChange;
  allUpdates: DatabaseChange[];
  fieldsChanged: Set<string>; // Campos únicos que cambiaron a lo largo de todos los updates
  timeline: string; // "Turn 1 → Turn 5 → Turn 8" (cuándo se modificó)
}

export interface AggregatedInsert {
  recordId: string;
  table: string;
  insert: DatabaseChange;
  subsequentUpdates?: AggregatedUpdate; // Si después hubo updates al mismo registro
}

export interface AggregatedDelete {
  recordId: string;
  table: string;
  delete: DatabaseChange;
  wasCreatedInConversation: boolean; // Si el registro fue creado en esta misma conversación
  classification: TableClassification;
}

export interface ConversationDatabaseTimeline {
  // Registros que pasaron por todo el ciclo de vida
  fullLifecycle: Array<{
    recordId: string;
    table: string;
    created: DatabaseChange;
    updated?: AggregatedUpdate;
    deleted: DatabaseChange;
    duration: number; // Tiempo entre creación y eliminación (ms)
    classification: TableClassification;
  }>;
  
  // Registros nuevos que siguen existiendo
  newRecords: AggregatedInsert[];
  
  // Updates a registros pre-existentes (no creados en esta conversación)
  existingRecordUpdates: AggregatedUpdate[];
  
  // Deletes de registros pre-existentes (no creados en esta conversación)
  existingRecordDeletes: AggregatedDelete[];
  
  // Resumen por tabla
  byTable: Map<string, {
    inserts: number;
    uniqueRecordsUpdated: number; // Cuántos registros ÚNICOS se modificaron
    totalUpdateOperations: number; // Total de operaciones UPDATE (puede ser > uniqueRecordsUpdated)
    deletes: number;
    classification: TableClassification;
  }>;
  
  // Estadísticas generales
  stats: {
    totalInserts: number;
    totalUniqueRecordsUpdated: number;
    totalUpdateOperations: number;
    totalDeletes: number;
    temporaryCleanupDetected: boolean; // Si hubo limpieza de memoria temporal
    temporaryRecordsCleaned: number;
  };
}

/**
 * Extrae el ID de un registro desde el objeto DatabaseChange
 */
function extractRecordId(change: DatabaseChange): string | null {
  const record = change.after || change.before || change.record;
  if (!record) return null;
  
  // Intentar campos comunes de ID
  const idFields = ['id', 'uuid', '_id', 'key', 'pk'];
  for (const field of idFields) {
    if (record[field] !== undefined && record[field] !== null) {
      return String(record[field]);
    }
  }
  
  // Si el record tiene un campo 'id' en su estructura interna
  if (typeof record === 'object' && 'id' in record) {
    return String(record.id);
  }
  
  // Fallback: hash del objeto completo
  return JSON.stringify(record).substring(0, 100);
}

/**
 * Extrae los campos que cambiaron de un UPDATE
 */
function extractChangedFields(change: DatabaseChange): string[] {
  if (change.type !== 'UPDATE') return [];
  
  // Si ya vienen explícitos en change.record.changedFields
  if (change.record && typeof change.record === 'object' && 'changedFields' in change.record) {
    const changedFields = (change.record as any).changedFields;
    if (Array.isArray(changedFields)) {
      return changedFields;
    }
  }
  
  // Comparar before vs after manualmente
  if (change.before && change.after) {
    const fields: string[] = [];
    const allKeys = new Set([
      ...Object.keys(change.before),
      ...Object.keys(change.after)
    ]);
    
    allKeys.forEach(key => {
      if (JSON.stringify(change.before[key]) !== JSON.stringify(change.after[key])) {
        fields.push(key);
      }
    });
    
    return fields;
  }
  
  return [];
}

/**
 * FUNCIÓN PRINCIPAL: Agrega y analiza cambios de BD para generar timeline detallado
 */
export function aggregateDatabaseChanges(changes: DatabaseChange[]): ConversationDatabaseTimeline {
  console.log(`\n🔍 [DB Aggregator] Analizando ${changes.length} cambios de BD...`);
  
  // Mapas para tracking
  const insertsMap = new Map<string, DatabaseChange>(); // recordId -> INSERT change
  const updatesMap = new Map<string, DatabaseChange[]>(); // recordId -> array de UPDATEs
  const deletesMap = new Map<string, DatabaseChange>(); // recordId -> DELETE change
  
  // Clasificar cambios por tipo y recordId
  for (const change of changes) {
    const recordId = extractRecordId(change);
    if (!recordId) {
      console.warn(`   ⚠️ No se pudo extraer ID del cambio:`, change);
      continue;
    }
    
    const key = `${change.table}::${recordId}`;
    
    switch (change.type) {
      case 'INSERT':
        insertsMap.set(key, change);
        break;
      
      case 'UPDATE':
        const existing = updatesMap.get(key) || [];
        existing.push(change);
        updatesMap.set(key, existing);
        break;
      
      case 'DELETE':
        deletesMap.set(key, change);
        break;
    }
  }
  
  console.log(`   📊 Clasificación inicial:`);
  console.log(`      INSERTs: ${insertsMap.size} registros únicos`);
  console.log(`      UPDATEs: ${updatesMap.size} registros únicos (${changes.filter(c => c.type === 'UPDATE').length} operaciones totales)`);
  console.log(`      DELETEs: ${deletesMap.size} registros únicos`);
  
  // 1️⃣ CICLO DE VIDA COMPLETO: INSERT → UPDATE* → DELETE
  const fullLifecycle: ConversationDatabaseTimeline['fullLifecycle'] = [];
  
  insertsMap.forEach((insert, key) => {
    if (deletesMap.has(key)) {
      const deleteChange = deletesMap.get(key)!;
      const updates = updatesMap.get(key);
      const [table, recordId] = key.split('::');
      const classification = classifyTable(table);
      
      fullLifecycle.push({
        recordId,
        table,
        created: insert,
        updated: updates ? aggregateUpdatesForRecord(recordId, table, updates) : undefined,
        deleted: deleteChange,
        duration: deleteChange.timestamp - insert.timestamp,
        classification
      });
      
      // Remover de los mapas para no contarlos dos veces
      insertsMap.delete(key);
      deletesMap.delete(key);
      if (updates) updatesMap.delete(key);
      
      console.log(`   🔄 Ciclo completo detectado: ${table}::${recordId.substring(0, 30)} (${classification.type})`);
    }
  });
  
  // 2️⃣ REGISTROS NUEVOS (INSERT sin DELETE posterior)
  const newRecords: AggregatedInsert[] = [];
  
  insertsMap.forEach((insert, key) => {
    const [table, recordId] = key.split('::');
    const updates = updatesMap.get(key);
    
    newRecords.push({
      recordId,
      table,
      insert,
      subsequentUpdates: updates ? aggregateUpdatesForRecord(recordId, table, updates) : undefined
    });
    
    // Remover updates ya contabilizados
    if (updates) updatesMap.delete(key);
  });
  
  // 3️⃣ UPDATES A REGISTROS PRE-EXISTENTES (UPDATE sin INSERT previo)
  const existingRecordUpdates: AggregatedUpdate[] = [];
  
  updatesMap.forEach((updates, key) => {
    const [table, recordId] = key.split('::');
    existingRecordUpdates.push(aggregateUpdatesForRecord(recordId, table, updates));
  });
  
  // 4️⃣ DELETES A REGISTROS PRE-EXISTENTES (DELETE sin INSERT previo)
  const existingRecordDeletes: AggregatedDelete[] = [];
  
  deletesMap.forEach((deleteChange, key) => {
    const [table, recordId] = key.split('::');
    const classification = classifyTable(table);
    
    existingRecordDeletes.push({
      recordId,
      table,
      delete: deleteChange,
      wasCreatedInConversation: false,
      classification
    });
  });
  
  // 5️⃣ RESUMEN POR TABLA
  const byTable = new Map<string, {
    inserts: number;
    uniqueRecordsUpdated: number;
    totalUpdateOperations: number;
    deletes: number;
    classification: TableClassification;
  }>();
  
  // Función helper para actualizar stats de tabla
  const updateTableStats = (table: string, inserts: number, uniqueUpdates: number, totalUpdates: number, deletes: number) => {
    const existing = byTable.get(table);
    const classification = classifyTable(table);
    
    if (existing) {
      existing.inserts += inserts;
      existing.uniqueRecordsUpdated += uniqueUpdates;
      existing.totalUpdateOperations += totalUpdates;
      existing.deletes += deletes;
    } else {
      byTable.set(table, {
        inserts,
        uniqueRecordsUpdated: uniqueUpdates,
        totalUpdateOperations: totalUpdates,
        deletes,
        classification
      });
    }
  };
  
  // Contar desde full lifecycle
  fullLifecycle.forEach(lc => {
    updateTableStats(
      lc.table,
      1, // insert
      lc.updated ? 1 : 0, // unique records updated
      lc.updated ? lc.updated.updateCount : 0, // total update operations
      1 // delete
    );
  });
  
  // Contar desde new records
  newRecords.forEach(nr => {
    updateTableStats(
      nr.table,
      1, // insert
      nr.subsequentUpdates ? 1 : 0,
      nr.subsequentUpdates ? nr.subsequentUpdates.updateCount : 0,
      0
    );
  });
  
  // Contar desde existing updates
  existingRecordUpdates.forEach(upd => {
    updateTableStats(
      upd.table,
      0,
      1, // unique record updated
      upd.updateCount, // total operations
      0
    );
  });
  
  // Contar desde existing deletes
  existingRecordDeletes.forEach(del => {
    updateTableStats(del.table, 0, 0, 0, 1);
  });
  
  // 6️⃣ ESTADÍSTICAS GENERALES
  const totalInserts = fullLifecycle.length + newRecords.length;
  const totalUniqueRecordsUpdated = 
    fullLifecycle.filter(lc => lc.updated).length +
    newRecords.filter(nr => nr.subsequentUpdates).length +
    existingRecordUpdates.length;
  
  const totalUpdateOperations = 
    fullLifecycle.reduce((sum, lc) => sum + (lc.updated?.updateCount || 0), 0) +
    newRecords.reduce((sum, nr) => sum + (nr.subsequentUpdates?.updateCount || 0), 0) +
    existingRecordUpdates.reduce((sum, upd) => sum + upd.updateCount, 0);
  
  const totalDeletes = fullLifecycle.length + existingRecordDeletes.length;
  
  // Detectar limpieza de memoria temporal
  const temporaryCleanupDetected = fullLifecycle.some(lc => 
    lc.classification.type === 'TEMPORARY' && lc.duration < 3600000 // < 1 hora
  );
  
  const temporaryRecordsCleaned = fullLifecycle.filter(lc => 
    lc.classification.type === 'TEMPORARY'
  ).length;
  
  console.log(`\n   ✅ Agregación completada:`);
  console.log(`      📝 ${totalInserts} registros insertados`);
  console.log(`      🔄 ${totalUniqueRecordsUpdated} registros únicos modificados (${totalUpdateOperations} operaciones UPDATE totales)`);
  console.log(`      🗑️ ${totalDeletes} registros eliminados`);
  console.log(`      ⏱️ Limpieza temporal detectada: ${temporaryCleanupDetected ? 'Sí' : 'No'}`);
  if (temporaryCleanupDetected) {
    console.log(`      🧹 ${temporaryRecordsCleaned} registros temporales limpiados`);
  }
  
  return {
    fullLifecycle,
    newRecords,
    existingRecordUpdates,
    existingRecordDeletes,
    byTable,
    stats: {
      totalInserts,
      totalUniqueRecordsUpdated,
      totalUpdateOperations,
      totalDeletes,
      temporaryCleanupDetected,
      temporaryRecordsCleaned
    }
  };
}

/**
 * Agrega múltiples UPDATEs al mismo registro en un objeto consolidado
 */
function aggregateUpdatesForRecord(recordId: string, table: string, updates: DatabaseChange[]): AggregatedUpdate {
  const fieldsChanged = new Set<string>();
  
  updates.forEach(upd => {
    const fields = extractChangedFields(upd);
    fields.forEach(f => fieldsChanged.add(f));
  });
  
  // Ordenar por timestamp
  const sorted = [...updates].sort((a, b) => a.timestamp - b.timestamp);
  
  // Generar timeline de turnos
  const turnNumbers = sorted
    .map((upd, idx) => `T${idx + 1}`) // T1, T2, T3, etc.
    .join(' → ');
  
  return {
    recordId,
    table,
    updateCount: updates.length,
    firstUpdate: sorted[0],
    lastUpdate: sorted[sorted.length - 1],
    allUpdates: sorted,
    fieldsChanged,
    timeline: turnNumbers
  };
}

/**
 * Genera un resumen textual amigable para mostrar en UI
 */
export function generateDatabaseSummaryText(timeline: ConversationDatabaseTimeline, language: 'es' | 'en' = 'es'): {
  title: string;
  details: string[];
  warnings: string[];
} {
  const { stats, fullLifecycle, newRecords, existingRecordUpdates, existingRecordDeletes, byTable } = timeline;
  
  const details: string[] = [];
  const warnings: string[] = [];
  
  if (language === 'es') {
    // Título principal
    let title = `Actividad de Base de Datos`;
    
    // Detalle de operaciones
    if (stats.totalInserts > 0) {
      details.push(`📝 ${stats.totalInserts} nuevo${stats.totalInserts > 1 ? 's' : ''} registro${stats.totalInserts > 1 ? 's' : ''} creado${stats.totalInserts > 1 ? 's' : ''}`);
    }
    
    if (stats.totalUniqueRecordsUpdated > 0) {
      if (stats.totalUpdateOperations > stats.totalUniqueRecordsUpdated) {
        details.push(
          `🔄 ${stats.totalUniqueRecordsUpdated} registro${stats.totalUniqueRecordsUpdated > 1 ? 's' : ''} único${stats.totalUniqueRecordsUpdated > 1 ? 's' : ''} modificado${stats.totalUniqueRecordsUpdated > 1 ? 's' : ''} ` +
          `(${stats.totalUpdateOperations} actualizaciones totales)`
        );
      } else {
        details.push(`🔄 ${stats.totalUniqueRecordsUpdated} registro${stats.totalUniqueRecordsUpdated > 1 ? 's' : ''} modificado${stats.totalUniqueRecordsUpdated > 1 ? 's' : ''}`);
      }
    }
    
    if (stats.totalDeletes > 0) {
      if (stats.temporaryCleanupDetected) {
        details.push(`🧹 ${stats.temporaryRecordsCleaned} registro${stats.temporaryRecordsCleaned > 1 ? 's' : ''} temporal${stats.temporaryRecordsCleaned > 1 ? 'es' : ''} limpiado${stats.temporaryRecordsCleaned > 1 ? 's' : ''} (comportamiento esperado)`);
        if (stats.totalDeletes > stats.temporaryRecordsCleaned) {
          const otherDeletes = stats.totalDeletes - stats.temporaryRecordsCleaned;
          warnings.push(`⚠️ ${otherDeletes} registro${otherDeletes > 1 ? 's' : ''} de negocio eliminado${otherDeletes > 1 ? 's' : ''}`);
        }
      } else {
        details.push(`🗑️ ${stats.totalDeletes} registro${stats.totalDeletes > 1 ? 's' : ''} eliminado${stats.totalDeletes > 1 ? 's' : ''}`);
      }
    }
    
    // Detalles por tabla
    if (byTable.size > 0) {
      const businessTables = Array.from(byTable.entries()).filter(
        ([_, stats]) => stats.classification.type === 'BUSINESS'
      );
      
      if (businessTables.length > 0) {
        details.push(`💼 Tablas de negocio afectadas: ${businessTables.map(([table]) => table).join(', ')}`);
      }
    }
    
    // Registros con ciclo de vida completo (creados y eliminados en la misma conversación)
    if (fullLifecycle.length > 0) {
      const temporaryLifecycles = fullLifecycle.filter(lc => lc.classification.type === 'TEMPORARY');
      if (temporaryLifecycles.length === fullLifecycle.length) {
        details.push(`⏱️ ${fullLifecycle.length} registro${fullLifecycle.length > 1 ? 's' : ''} temporal${fullLifecycle.length > 1 ? 'es' : ''} creado${fullLifecycle.length > 1 ? 's' : ''} y limpiado${fullLifecycle.length > 1 ? 's' : ''} durante la conversación`);
      }
    }
    
    return { title, details, warnings };
  } else {
    // English version
    let title = `Database Activity`;
    
    if (stats.totalInserts > 0) {
      details.push(`📝 ${stats.totalInserts} new record${stats.totalInserts > 1 ? 's' : ''} created`);
    }
    
    if (stats.totalUniqueRecordsUpdated > 0) {
      if (stats.totalUpdateOperations > stats.totalUniqueRecordsUpdated) {
        details.push(
          `🔄 ${stats.totalUniqueRecordsUpdated} unique record${stats.totalUniqueRecordsUpdated > 1 ? 's' : ''} modified ` +
          `(${stats.totalUpdateOperations} total updates)`
        );
      } else {
        details.push(`🔄 ${stats.totalUniqueRecordsUpdated} record${stats.totalUniqueRecordsUpdated > 1 ? 's' : ''} modified`);
      }
    }
    
    if (stats.totalDeletes > 0) {
      if (stats.temporaryCleanupDetected) {
        details.push(`🧹 ${stats.temporaryRecordsCleaned} temporary record${stats.temporaryRecordsCleaned > 1 ? 's' : ''} cleaned (expected behavior)`);
        if (stats.totalDeletes > stats.temporaryRecordsCleaned) {
          const otherDeletes = stats.totalDeletes - stats.temporaryRecordsCleaned;
          warnings.push(`⚠️ ${otherDeletes} business record${otherDeletes > 1 ? 's' : ''} deleted`);
        }
      } else {
        details.push(`🗑️ ${stats.totalDeletes} record${stats.totalDeletes > 1 ? 's' : ''} deleted`);
      }
    }
    
    return { title, details, warnings };
  }
}
