/**
 * 🔧 Tool Verificator
 * Verifica que las herramientas externas (emails, calendarios, etc.) 
 * hayan sido ejecutadas según lo que el agente prometió al usuario.
 * 
 * Usa análisis de workflow + respuestas del agente + cambios en BD para detectar:
 * - ¿El agente dijo que enviaría un email?
 * - ¿Realmente se ejecutó el nodo de email o subworkflow que envía emails?
 * - ¿Se registró en la BD el envío exitoso?
 */

import { DetectedTool, DetectedSubflow } from './workflowDependencyAnalyzer';

export interface ToolVerification {
  toolType: 'email' | 'calendar' | 'crm' | 'messaging' | 'database' | 'payment' | 'storage' | 'other';
  toolName: string;
  nodeId?: string;
  agentClaimed: boolean; // ¿El agente dijo que lo haría?
  agentClaimText?: string; // Texto exacto donde lo mencionó
  actuallyExecuted: boolean; // ¿Realmente se ejecutó?
  executionEvidence?: string; // Evidencia de la ejecución
  verdict: 'VERIFIED' | 'FAILED' | 'UNCHECKED'; // Resultado final
  details: string;
}

export interface ToolVerificationResult {
  conversationId: string;
  turnNumber: number;
  verifications: ToolVerification[];
  overallSuccess: boolean;
  summary: string;
}

/**
 * Detecta menciones de herramientas en la respuesta del agente
 */
async function detectToolMentionsInResponse(
  agentResponse: string,
  detectedTools: DetectedTool[],
  detectedSubflows: DetectedSubflow[]
): Promise<Map<string, { claimed: boolean; text: string }>> {
  
  const mentions = new Map<string, { claimed: boolean; text: string }>();

  const lowerResponse = agentResponse.toLowerCase();

  // Buscar menciones explícitas de herramientas
  const emailKeywords = ['enviar email', 'envío el email', 'te envío', 'te mando por email', 
                         'enviaré', 'te llega', 'mail', 'correo', 'propuesta formal'];
  const calendarKeywords = ['agendar', 'calendario', 'reunión', 'evento', 'cita'];
  const crmKeywords = ['registrar en crm', 'actualizar crm', 'contacto en'];

  // Detectar emails
  const emailMentioned = emailKeywords.some(kw => lowerResponse.includes(kw));
  if (emailMentioned) {
    // Encontrar la herramienta de email en los nodos detectados
    const emailTools = detectedTools.filter(t => t.toolType === 'email');
    const emailSubflows = detectedSubflows.filter(sf => 
      sf.nodeName.toLowerCase().includes('email') || 
      sf.nodeName.toLowerCase().includes('propuesta') ||
      sf.nodeName.toLowerCase().includes('send')
    );

    if (emailTools.length > 0) {
      emailTools.forEach(tool => {
        mentions.set(tool.nodeId, {
          claimed: true,
          text: agentResponse
        });
      });
    }

    if (emailSubflows.length > 0) {
      emailSubflows.forEach(sf => {
        mentions.set(sf.nodeId, {
          claimed: true,
          text: agentResponse
        });
      });
    }

    // Si mencionó email pero no hay nodos detectados, crear entrada genérica
    if (emailTools.length === 0 && emailSubflows.length === 0) {
      mentions.set('email-generic', {
        claimed: true,
        text: agentResponse
      });
    }
  }

  // Detectar calendarios
  const calendarMentioned = calendarKeywords.some(kw => lowerResponse.includes(kw));
  if (calendarMentioned) {
    const calendarTools = detectedTools.filter(t => t.toolType === 'calendar');
    calendarTools.forEach(tool => {
      mentions.set(tool.nodeId, {
        claimed: true,
        text: agentResponse
      });
    });

    if (calendarTools.length === 0) {
      mentions.set('calendar-generic', {
        claimed: true,
        text: agentResponse
      });
    }
  }

  // Detectar CRM
  const crmMentioned = crmKeywords.some(kw => lowerResponse.includes(kw));
  if (crmMentioned) {
    const crmTools = detectedTools.filter(t => t.toolType === 'crm');
    crmTools.forEach(tool => {
      mentions.set(tool.nodeId, {
        claimed: true,
        text: agentResponse
      });
    });
  }

  return mentions;
}

/**
 * Verifica si un nodo específico fue ejecutado basándose en cambios en BD
 */
function checkNodeExecution(
  nodeId: string,
  nodeName: string,
  dbChanges: any[],
  responsePayload: any
): { executed: boolean; evidence?: string } {
  
  // Estrategia 1: Buscar en cambios de BD si hay registros relacionados con este nodo
  // Por ejemplo, una tabla "email_logs" o "sent_emails"
  
  const emailLogTables = ['email_logs', 'sent_emails', 'mail_history', 'emails'];
  const hasEmailLog = dbChanges.some(change => 
    emailLogTables.some(table => change.table?.toLowerCase().includes(table))
  );

  if (hasEmailLog) {
    return {
      executed: true,
      evidence: 'Se detectó registro en tabla de logs de email'
    };
  }

  // Estrategia 2: Verificar si el payload de respuesta contiene indicadores de ejecución
  if (responsePayload) {
    const payloadStr = JSON.stringify(responsePayload).toLowerCase();
    
    // Indicadores comunes de ejecución exitosa
    const successIndicators = [
      'sent successfully',
      'email sent',
      'message sent',
      'delivered',
      'completed',
      'success: true',
      'status: "sent"'
    ];

    const hasSuccessIndicator = successIndicators.some(ind => payloadStr.includes(ind));
    if (hasSuccessIndicator) {
      return {
        executed: true,
        evidence: 'Payload de respuesta indica ejecución exitosa'
      };
    }
  }

  // Estrategia 3: Si es un subworkflow, verificar si hay cambios en BD después de la promesa
  const isSubworkflow = nodeName.toLowerCase().includes('workflow') || 
                        nodeName.toLowerCase().includes('subflow') ||
                        nodeName.toLowerCase().includes('call');
  
  if (isSubworkflow && dbChanges.length > 0) {
    return {
      executed: true,
      evidence: `Subworkflow "${nodeName}" ejecutado - se detectaron ${dbChanges.length} cambios en BD`
    };
  }

  // No se pudo verificar
  return {
    executed: false,
    evidence: undefined
  };
}

/**
 * Verifica todas las herramientas para un turno de conversación
 */
export async function verifyTools(
  conversationId: string,
  turnNumber: number,
  agentResponse: string,
  detectedTools: DetectedTool[],
  detectedSubflows: DetectedSubflow[],
  dbChangesThisTurn: any[],
  responsePayload?: any
): Promise<ToolVerificationResult> {
  
  const verifications: ToolVerification[] = [];

  // 1. Detectar qué herramientas mencionó el agente
  const toolMentions = await detectToolMentionsInResponse(
    agentResponse,
    detectedTools,
    detectedSubflows
  );

  // 2. Para cada herramienta mencionada, verificar si se ejecutó
  for (const [nodeId, mention] of toolMentions.entries()) {
    let toolInfo: { type: string; name: string } | null = null;

    // Buscar info del nodo
    const tool = detectedTools.find(t => t.nodeId === nodeId);
    if (tool) {
      toolInfo = { type: tool.toolType, name: tool.nodeName };
    }

    const subflow = detectedSubflows.find(sf => sf.nodeId === nodeId);
    if (subflow) {
      toolInfo = { type: 'email', name: subflow.nodeName }; // Asumimos email por ahora
    }

    if (!toolInfo && nodeId.includes('generic')) {
      toolInfo = { 
        type: nodeId.replace('-generic', ''),
        name: `${nodeId.replace('-generic', '')} genérico`
      };
    }

    if (!toolInfo) continue;

    // Verificar ejecución
    const execution = checkNodeExecution(
      nodeId,
      toolInfo.name,
      dbChangesThisTurn,
      responsePayload
    );

    const verification: ToolVerification = {
      toolType: toolInfo.type as any,
      toolName: toolInfo.name,
      nodeId: nodeId.includes('generic') ? undefined : nodeId,
      agentClaimed: mention.claimed,
      agentClaimText: mention.text,
      actuallyExecuted: execution.executed,
      executionEvidence: execution.evidence,
      verdict: execution.executed ? 'VERIFIED' : 'FAILED',
      details: execution.executed
        ? `✅ VERIFICADO: El agente prometió "${toolInfo.name}" y se ejecutó correctamente`
        : `❌ FALLIDO: El agente prometió "${toolInfo.name}" pero NO hay evidencia de ejecución`
    };

    verifications.push(verification);
  }

  // 3. Detectar herramientas ejecutadas que NO fueron mencionadas (sobre-ejecución)
  for (const tool of detectedTools) {
    if (!toolMentions.has(tool.nodeId)) {
      const execution = checkNodeExecution(
        tool.nodeId,
        tool.nodeName,
        dbChangesThisTurn,
        responsePayload
      );

      if (execution.executed) {
        verifications.push({
          toolType: tool.toolType,
          toolName: tool.nodeName,
          nodeId: tool.nodeId,
          agentClaimed: false,
          actuallyExecuted: true,
          executionEvidence: execution.evidence,
          verdict: 'VERIFIED',
          details: `ℹ️ EJECUTADO SIN MENCIONAR: "${tool.nodeName}" se ejecutó pero el agente no lo mencionó explícitamente`
        });
      }
    }
  }

  // 4. Generar resumen
  const failedCount = verifications.filter(v => v.verdict === 'FAILED').length;
  const verifiedCount = verifications.filter(v => v.verdict === 'VERIFIED').length;

  let summary = '';
  if (verifications.length === 0) {
    summary = 'No se detectaron herramientas externas en este turno';
  } else if (failedCount === 0) {
    summary = `✅ Todas las herramientas verificadas correctamente (${verifiedCount}/${verifications.length})`;
  } else {
    summary = `⚠️ ${failedCount} herramienta(s) fallaron la verificación de ${verifications.length} total`;
  }

  return {
    conversationId,
    turnNumber,
    verifications,
    overallSuccess: failedCount === 0,
    summary
  };
}

/**
 * Genera un reporte legible de las verificaciones
 */
export function generateToolVerificationReport(results: ToolVerificationResult[]): string {
  if (results.length === 0) {
    return 'No se realizaron verificaciones de herramientas.';
  }

  let report = '📋 **REPORTE DE VERIFICACIÓN DE HERRAMIENTAS**\n\n';

  for (const result of results) {
    report += `**Turno ${result.turnNumber}** (${result.conversationId})\n`;
    report += `${result.summary}\n\n`;

    if (result.verifications.length > 0) {
      for (const verification of result.verifications) {
        const icon = verification.verdict === 'VERIFIED' ? '✅' : 
                     verification.verdict === 'FAILED' ? '❌' : '⚠️';
        
        report += `  ${icon} **${verification.toolName}** (${verification.toolType})\n`;
        report += `     ${verification.details}\n`;
        
        if (verification.executionEvidence) {
          report += `     📝 Evidencia: ${verification.executionEvidence}\n`;
        }
        
        report += '\n';
      }
    }

    report += '---\n\n';
  }

  // Resumen general
  const totalVerifications = results.reduce((sum, r) => sum + r.verifications.length, 0);
  const totalFailed = results.reduce(
    (sum, r) => sum + r.verifications.filter(v => v.verdict === 'FAILED').length,
    0
  );
  const totalVerified = results.reduce(
    (sum, r) => sum + r.verifications.filter(v => v.verdict === 'VERIFIED').length,
    0
  );

  report += '**RESUMEN GENERAL**\n';
  report += `- Total de verificaciones: ${totalVerifications}\n`;
  report += `- Verificadas exitosamente: ${totalVerified}\n`;
  report += `- Fallidas: ${totalFailed}\n`;
  
  if (totalVerifications > 0) {
    const successRate = ((totalVerified / totalVerifications) * 100).toFixed(1);
    report += `- Tasa de éxito: ${successRate}%\n`;
  }

  return report;
}
