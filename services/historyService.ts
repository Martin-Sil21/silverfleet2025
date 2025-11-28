import type { AuditConfig, AuditResult, HistoricalAudit } from '../types';

const HISTORY_KEY = 'silver-fleet-audit-history';

export const getAudits = (): HistoricalAudit[] => {
  try {
    console.log('📖 [historyService] Leyendo auditorías desde localStorage...');
    console.log('📖 [historyService] Key:', HISTORY_KEY);
    
    const rawHistory = localStorage.getItem(HISTORY_KEY);
    console.log('📖 [historyService] Raw data existe:', !!rawHistory);
    
    if (!rawHistory) {
      console.log('📖 [historyService] No hay historial guardado (primera vez)');
      return [];
    }
    
    console.log('📖 [historyService] Tamaño raw data:', rawHistory.length, 'caracteres');
    
    const audits: HistoricalAudit[] = JSON.parse(rawHistory);
    console.log('📖 [historyService] Auditorías parseadas:', audits.length);
    
    if (audits.length > 0) {
      console.log('📖 [historyService] Primera auditoría:', {
        id: audits[0].id,
        name: audits[0].config.name,
        timestamp: new Date(audits[0].timestamp).toLocaleString(),
        resultsCount: audits[0].results.length
      });
      console.log('📖 [historyService] Última auditoría:', {
        id: audits[audits.length - 1].id,
        name: audits[audits.length - 1].config.name,
        timestamp: new Date(audits[audits.length - 1].timestamp).toLocaleString()
      });
    }
    
    // Sort by most recent first
    const sorted = audits.sort((a, b) => b.timestamp - a.timestamp);
    console.log('📖 [historyService] Auditorías ordenadas por fecha (más reciente primero)');
    
    return sorted;
  } catch (error) {
    console.error("❌ [historyService] Failed to retrieve audit history:", error);
    if (error instanceof Error) {
      console.error("❌ [historyService] Error message:", error.message);
    }
    return [];
  }
};

export const saveAudit = (config: AuditConfig, results: AuditResult[]): void => {
  try {
    console.log('💾 [historyService] Iniciando guardado de auditoría');
    console.log('💾 [historyService] Config:', config.name);
    console.log('💾 [historyService] Results:', results.length);
    
    // 🔥 NUEVO: Verificar que localStorage esté disponible
    if (typeof localStorage === 'undefined') {
      console.error('❌ [historyService] localStorage no está disponible!');
      throw new Error('localStorage is not available');
    }
    
    // 🔥 NUEVO: Test de escritura/lectura en localStorage
    try {
      localStorage.setItem('test-key', 'test-value');
      const testRead = localStorage.getItem('test-key');
      localStorage.removeItem('test-key');
      console.log('✅ [historyService] localStorage funcionando correctamente:', testRead === 'test-value');
    } catch (e) {
      console.error('❌ [historyService] Error al probar localStorage:', e);
      throw new Error('localStorage test failed: ' + e);
    }
    
    const overallScore = results.length > 0
      ? results.reduce((sum, r) => sum + r.analysis.overallScore, 0) / results.length
      : 0;

    console.log('💾 [historyService] Score promedio calculado:', overallScore.toFixed(2));

    const newAudit: HistoricalAudit = {
      id: `audit_${Date.now()}`,
      timestamp: Date.now(),
      config,
      results,
      overallScore,
    };
    
    console.log('💾 [historyService] Nuevo audit creado:', newAudit.id);
    console.log('💾 [historyService] Timestamp:', new Date(newAudit.timestamp).toLocaleString());
    
    const audits = getAudits();
    console.log('💾 [historyService] Auditorías existentes:', audits.length);
    
    audits.unshift(newAudit); // Add to the beginning

    // Limit history to 10 entries (reduced from 20 to save space)
    if (audits.length > 10) {
        console.log('💾 [historyService] Limitando historial a 10 entradas (había', audits.length, ')');
        audits.length = 10;
    }

    console.log('💾 [historyService] Intentando guardar en localStorage...');
    console.log('💾 [historyService] Key:', HISTORY_KEY);
    const dataToSave = JSON.stringify(audits);
    console.log('💾 [historyService] Tamaño de datos:', dataToSave.length, 'caracteres');
    
    // Try to save, if quota exceeded, reduce history further
    try {
      localStorage.setItem(HISTORY_KEY, dataToSave);
      console.log('✅ [historyService] Auditoría guardada en localStorage');
    } catch (quotaError) {
      if (quotaError instanceof Error && quotaError.name === 'QuotaExceededError') {
        console.warn('⚠️ [historyService] Cuota excedida, reduciendo historial a 5 entradas...');
        audits.length = 5; // Keep only newest 5
        localStorage.setItem(HISTORY_KEY, JSON.stringify(audits));
        console.log('✅ [historyService] Auditoría guardada tras reducir historial');
      } else {
        throw quotaError;
      }
    }
    
    // 🔥 NUEVO: Verificar inmediatamente que se guardó
    const verification = localStorage.getItem(HISTORY_KEY);
    if (verification) {
      const parsed = JSON.parse(verification);
      console.log('✅ [historyService] Verificación exitosa - auditorías en storage:', parsed.length);
      console.log('📊 [historyService] Primera auditoría:', {
        id: parsed[0]?.id,
        name: parsed[0]?.config?.name,
        timestamp: parsed[0]?.timestamp ? new Date(parsed[0].timestamp).toLocaleString() : 'N/A'
      });
    } else {
      console.error('❌ [historyService] ERROR: No se pudo leer después de guardar!');
    }
    
    console.log('📊 [historyService] Total auditorías ahora:', audits.length);
  } catch (error) {
    console.error("❌ [historyService] Failed to save audit:", error);
    if (error instanceof Error) {
      console.error("❌ [historyService] Error message:", error.message);
      console.error("❌ [historyService] Error stack:", error.stack);
    }
    throw error; // Re-throw para que el llamador sepa que falló
  }
};

export const deleteAudit = (id: string): HistoricalAudit[] => {
  try {
    let audits = getAudits();
    audits = audits.filter(audit => audit.id !== id);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(audits));
    return audits;
  } catch (error) {
    console.error("Failed to delete audit:", error);
    return getAudits();
  }
};

export const clearHistory = (): void => {
    try {
        localStorage.removeItem(HISTORY_KEY);
    } catch (error) {
        console.error("Failed to clear history:", error);
    }
}
