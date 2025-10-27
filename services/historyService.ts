import type { AuditConfig, AuditResult, HistoricalAudit } from '../types';

const HISTORY_KEY = 'silver-fleet-audit-history';

export const getAudits = (): HistoricalAudit[] => {
  try {
    const rawHistory = localStorage.getItem(HISTORY_KEY);
    if (!rawHistory) return [];
    const audits: HistoricalAudit[] = JSON.parse(rawHistory);
    // Sort by most recent first
    return audits.sort((a, b) => b.timestamp - a.timestamp);
  } catch (error) {
    console.error("Failed to retrieve audit history:", error);
    return [];
  }
};

export const saveAudit = (config: AuditConfig, results: AuditResult[]): void => {
  try {
    const overallScore = results.length > 0
      ? results.reduce((sum, r) => sum + r.analysis.overallScore, 0) / results.length
      : 0;

    const newAudit: HistoricalAudit = {
      id: `audit_${Date.now()}`,
      timestamp: Date.now(),
      config,
      results,
      overallScore,
    };
    
    const audits = getAudits();
    audits.unshift(newAudit); // Add to the beginning

    // Limit history to 20 entries
    if (audits.length > 20) {
        audits.length = 20;
    }

    localStorage.setItem(HISTORY_KEY, JSON.stringify(audits));
  } catch (error) {
    console.error("Failed to save audit:", error);
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
