/**
 * 🧪 Tool Execution Verifier
 * Verifica si las herramientas externas (email, calendar, etc.) realmente ejecutaron
 * durante una auditoría real, basándose en las credenciales configuradas
 */

import type { ExecutionStep } from '../types';
import type { AuditConfig } from '../types';
import { getCredentialById } from './credentialsManager';

export interface ToolVerificationResult {
  toolType: string;
  expectedActions: string[];
  verifiedActions: string[];
  unverifiedActions: string[];
  verificationMethod: string;
  success: boolean;
}

/**
 * Analiza el trace de ejecución para detectar qué herramientas se deberían haber ejecutado
 */
export function extractExpectedToolExecutions(
  executionTrace: ExecutionStep[],
  config: AuditConfig
): Map<string, string[]> {
  const expectedTools = new Map<string, string[]>(); // toolType -> array of expected actions
  
  for (const step of executionTrace) {
    // Buscar en el output menciones de acciones con herramientas
    const output = step.output;
    if (!output || typeof output !== 'object') continue;
    
    const text = JSON.stringify(output).toLowerCase();
    
    // Email detection
    if (text.includes('email') || text.includes('correo') || text.includes('enviar')) {
      const actions = expectedTools.get('email') || [];
      actions.push(`Email mentioned in ${step.nodeId}`);
      expectedTools.set('email', actions);
    }
    
    // Calendar detection
    if (text.includes('calendar') || text.includes('evento') || text.includes('reunion') || text.includes('cita')) {
      const actions = expectedTools.get('calendar') || [];
      actions.push(`Calendar event mentioned in ${step.nodeId}`);
      expectedTools.set('calendar', actions);
    }
    
    // CRM detection
    if (text.includes('contact') || text.includes('lead') || text.includes('cliente agregado')) {
      const actions = expectedTools.get('crm') || [];
      actions.push(`CRM action mentioned in ${step.nodeId}`);
      expectedTools.set('crm', actions);
    }
  }
  
  return expectedTools;
}

/**
 * Verifica las herramientas que se ejecutaron
 */
export async function verifyToolExecutions(
  executionTrace: ExecutionStep[],
  config: AuditConfig
): Promise<ToolVerificationResult[]> {
  const results: ToolVerificationResult[] = [];
  
  if (!config.toolCredentials || config.toolCredentials.size === 0) {
    return results; // No hay herramientas configuradas para verificar
  }
  
  const expectedTools = extractExpectedToolExecutions(executionTrace, config);
  
  // Verificar cada tipo de herramienta detectado
  for (const [toolType, expectedActions] of expectedTools.entries()) {
    // Por ahora, solo reportamos qué se esperaba
    // La verificación real (consultar Gmail API, Calendar API, etc.) requiere
    // implementaciones específicas por servicio
    
    results.push({
      toolType,
      expectedActions,
      verifiedActions: [], // TODO: Implementar verificación real por tipo
      unverifiedActions: expectedActions, // Todo queda sin verificar por ahora
      verificationMethod: 'Pattern detection in conversation',
      success: false // TODO: Cambiar a true cuando se implemente verificación real
    });
  }
  
  return results;
}

/**
 * Genera un resumen legible de la verificación de herramientas
 */
export function generateToolVerificationSummary(results: ToolVerificationResult[]): string {
  if (results.length === 0) {
    return 'No external tools were detected or configured for verification.';
  }
  
  const lines: string[] = ['### External Tools Verification:', ''];
  
  for (const result of results) {
    lines.push(`**${result.toolType.toUpperCase()}:**`);
    lines.push(`- Expected actions: ${result.expectedActions.length}`);
    lines.push(`- Verification method: ${result.verificationMethod}`);
    lines.push(`- Status: ${result.success ? '✅ Verified' : '⚠️ Detection only (full verification pending)'}`);
    lines.push('');
  }
  
  return lines.join('\n');
}
