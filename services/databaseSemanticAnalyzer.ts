/**
 * 🧠 Database Semantic Analyzer
 * 
 * NO solo cuenta operaciones - COMPRENDE qué se guardó y por qué
 * 
 * Ejemplo:
 * ❌ Antes: "6 registros agregados en n8n_chat_histories"
 * ✅ Ahora: "Guardó historial completo de la conversación (6 turnos)"
 */

import type { DatabaseChange } from '../types';

export interface SemanticAnalysis {
  understood: boolean; // Si se pudo interpretar semánticamente
  summary: string; // Resumen en lenguaje humano
  concerns: string[]; // Problemas detectados
  strengths: string[]; // Cosas bien hechas
  missing: string[]; // Cosas que deberían estar pero no están
}

export interface TableSemanticInfo {
  table: string;
  purpose: string; // Para qué es esta tabla
  recordCount: number;
  analysis: SemanticAnalysis;
}

/**
 * Analiza SEMÁNTICAMENTE los cambios en BD
 */
export function analyzeDBSemantically(
  changes: DatabaseChange[],
  conversationGoal: string,
  conversationMessages: Array<{ user?: string; bot?: string }>
): TableSemanticInfo[] {
  const byTable = new Map<string, DatabaseChange[]>();
  
  changes.forEach(change => {
    const existing = byTable.get(change.table) || [];
    byTable.set(change.table, [...existing, change]);
  });

  const results: TableSemanticInfo[] = [];

  for (const [table, tableChanges] of byTable.entries()) {
    const purpose = inferTablePurpose(table);
    const analysis = analyzeTableChanges(table, tableChanges, conversationGoal, conversationMessages);

    results.push({
      table,
      purpose,
      recordCount: tableChanges.filter(c => c.type === 'INSERT').length,
      analysis
    });
  }

  return results;
}

/**
 * Infiere para qué sirve una tabla
 */
function inferTablePurpose(table: string): string {
  const lower = table.toLowerCase();

  // Chat / Historial
  if (/chat|history|histories|message|mensajes/i.test(lower)) {
    return 'Historial de conversación';
  }

  // Memoria / Contexto
  if (/memoria|memory|context|temporal/i.test(lower)) {
    return 'Memoria temporal de la conversación';
  }

  // Resumen
  if (/resumen|summary|conversation/i.test(lower)) {
    return 'Resumen de la conversación';
  }

  // Productos
  if (/product|producto|catalog|item/i.test(lower)) {
    return 'Catálogo de productos';
  }

  // Usuarios
  if (/user|usuario|customer|cliente/i.test(lower)) {
    return 'Datos de usuarios/clientes';
  }

  // Estado del sistema
  if (/estado|state|status|config/i.test(lower)) {
    return 'Estado del sistema';
  }

  return 'Tabla de datos';
}

/**
 * Analiza los cambios de una tabla y los interpreta semánticamente
 */
function analyzeTableChanges(
  table: string,
  changes: DatabaseChange[],
  goal: string,
  messages: Array<{ user?: string; bot?: string }>
): SemanticAnalysis {
  const concerns: string[] = [];
  const strengths: string[] = [];
  const missing: string[] = [];
  
  const inserts = changes.filter(c => c.type === 'INSERT');
  const updates = changes.filter(c => c.type === 'UPDATE');
  const deletes = changes.filter(c => c.type === 'DELETE');

  // Análisis específico según tipo de tabla
  const lowerTable = table.toLowerCase();

  // 🔍 TABLA DE HISTORIAL
  if (/chat|history|histories|message/i.test(lowerTable)) {
    const turnCount = messages.length;
    const recordCount = inserts.length;

    if (recordCount === turnCount) {
      strengths.push(`Guardó el historial completo (${recordCount} de ${turnCount} turnos)`);
    } else if (recordCount > 0 && recordCount < turnCount) {
      concerns.push(`Solo guardó ${recordCount} de ${turnCount} turnos de conversación`);
    } else if (recordCount === 0) {
      missing.push('No guardó ningún registro de la conversación');
    }

    // Verificar contenido
    const hasUserMessages = inserts.some(i => {
      const record = i.record || i.after;
      return record && (record.role === 'user' || record.from_user || record.user);
    });

    const hasBotMessages = inserts.some(i => {
      const record = i.record || i.after;
      return record && (record.role === 'assistant' || record.from_bot || record.bot);
    });

    if (hasUserMessages && hasBotMessages) {
      strengths.push('Guardó mensajes de usuario Y bot correctamente');
    } else if (!hasUserMessages || !hasBotMessages) {
      concerns.push('Falta guardar mensajes de usuario o bot');
    }

    return {
      understood: true,
      summary: recordCount === turnCount
        ? `✅ Historial completo guardado (${recordCount} turnos)`
        : recordCount > 0
        ? `⚠️ Historial parcial (${recordCount}/${turnCount} turnos)`
        : `❌ No guardó historial de conversación`,
      concerns,
      strengths,
      missing
    };
  }

  // 🔍 TABLA DE RESUMEN
  if (/resumen|summary/i.test(lowerTable)) {
    if (inserts.length > 0) {
      strengths.push('Generó resumen de la conversación');
      
      // Verificar si tiene el objetivo
      const hasGoal = inserts.some(i => {
        const record = i.record || i.after;
        const text = JSON.stringify(record || {}).toLowerCase();
        return goal.toLowerCase().split(' ').some(word => text.includes(word));
      });

      if (hasGoal) {
        strengths.push('El resumen incluye el objetivo de la conversación');
      }
    } else if (updates.length > 0) {
      strengths.push('Actualizó el resumen durante la conversación');
    } else {
      missing.push('No generó resumen de la conversación');
    }

    return {
      understood: true,
      summary: inserts.length > 0 || updates.length > 0
        ? `✅ Resumen generado/actualizado (${inserts.length + updates.length} ops)`
        : `❌ No generó resumen`,
      concerns,
      strengths,
      missing
    };
  }

  // 🔍 TABLA DE MEMORIA TEMPORAL
  if (/memoria|memory|temporal|context/i.test(lowerTable)) {
    if (inserts.length > 0) {
      strengths.push(`Guardó ${inserts.length} elementos en memoria temporal`);
      
      // Verificar si guardó info relevante al objetivo
      const relevantData = inserts.filter(i => {
        const record = i.record || i.after;
        const text = JSON.stringify(record || {}).toLowerCase();
        const goalWords = goal.toLowerCase().split(' ').filter(w => w.length > 3);
        return goalWords.some(word => text.includes(word));
      });

      if (relevantData.length > 0) {
        strengths.push(`${relevantData.length} registros relacionados al objetivo`);
      }
    } else {
      missing.push('No guardó información en memoria temporal');
    }

    return {
      understood: true,
      summary: inserts.length > 0
        ? `✅ Memoria temporal actualizada (${inserts.length} registros)`
        : `❌ No usó memoria temporal`,
      concerns,
      strengths,
      missing
    };
  }

  // 🔍 TABLA DE USUARIOS
  if (/user|usuario|customer|cliente/i.test(lowerTable)) {
    if (inserts.length > 0) {
      strengths.push(`Registró ${inserts.length} usuario(s)`);
    }

    if (updates.length > 0) {
      strengths.push(`Actualizó datos de ${updates.length} usuario(s)`);
    }

    // Verificar si guardó datos del payload (hardcoded)
    const hasHardcodedData = inserts.some(i => {
      const record = i.record || i.after;
      // Si tiene nombre + teléfono + fue un INSERT, probablemente es del payload
      return record && record.name && record.phone && i.type === 'INSERT';
    });

    if (hasHardcodedData) {
      concerns.push('Guardó datos del payload sin preguntar (minor issue)');
    }

    return {
      understood: true,
      summary: inserts.length > 0 || updates.length > 0
        ? `✅ Datos de usuario gestionados (${inserts.length} nuevos, ${updates.length} actualizados)`
        : `Sin cambios en usuarios`,
      concerns,
      strengths,
      missing
    };
  }

  // 🔍 TABLA GENÉRICA (no identificada)
  return {
    understood: false,
    summary: `${inserts.length} agregados, ${updates.length} modificados, ${deletes.length} eliminados`,
    concerns,
    strengths,
    missing
  };
}

/**
 * Genera un resumen ejecutivo de todos los cambios en BD
 */
export function generateExecutiveSummary(
  semanticInfo: TableSemanticInfo[],
  conversationGoal: string
): string {
  const allStrengths = semanticInfo.flatMap(t => t.analysis.strengths);
  const allConcerns = semanticInfo.flatMap(t => t.analysis.concerns);
  const allMissing = semanticInfo.flatMap(t => t.analysis.missing);

  let summary = `📊 **Análisis de Base de Datos**\n\n`;

  // Fortalezas
  if (allStrengths.length > 0) {
    summary += `✅ **Cosas bien hechas:**\n`;
    allStrengths.forEach(s => summary += `  - ${s}\n`);
    summary += `\n`;
  }

  // Problemas
  if (allConcerns.length > 0) {
    summary += `⚠️ **Problemas detectados:**\n`;
    allConcerns.forEach(c => summary += `  - ${c}\n`);
    summary += `\n`;
  }

  // Faltantes
  if (allMissing.length > 0) {
    summary += `❌ **Cosas que faltan:**\n`;
    allMissing.forEach(m => summary += `  - ${m}\n`);
    summary += `\n`;
  }

  // Conclusión
  const criticalMissing = allMissing.length;
  const minorConcerns = allConcerns.filter(c => c.includes('minor')).length;
  const majorConcerns = allConcerns.length - minorConcerns;

  if (criticalMissing > 0 || majorConcerns > 0) {
    summary += `🎯 **Conclusión:** Hay ${criticalMissing} problemas críticos y ${majorConcerns} problemas significativos que requieren atención.\n`;
  } else if (minorConcerns > 0) {
    summary += `🎯 **Conclusión:** Solo hay ${minorConcerns} problemas menores. La funcionalidad core está bien.\n`;
  } else {
    summary += `🎯 **Conclusión:** ✅ Todo se guardó correctamente en la base de datos.\n`;
  }

  return summary;
}

