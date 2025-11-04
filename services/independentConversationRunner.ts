/**
 * 🚀 Independent Conversation Runner
 * 
 * Este módulo permite que cada conversación avance a su propio ritmo,
 * sin esperar a que otras conversaciones terminen sus turnos.
 * 
 * VENTAJAS:
 * - UI más dinámica y realista
 * - No más tiempos de espera artificiales
 * - Mismo costo (misma cantidad de llamadas a API)
 * - Mejor experiencia de usuario
 */

import type { AuditConfig, ExecutionStep } from '../types';
import type { ConversationState, ProgressCallback } from './geminiService';
import { generateUserMessageText, findUserMessageText, findAgentMessageText, getGlobalIntegrationManager } from './geminiService';
import { getRealDatabaseAuditor } from './realDatabaseAuditor';
import { extractBotPromises, verifyBotPromises } from './intelligentDatabaseVerifier';
import { IntegrationManager, type ToolActionVerification } from './IntegrationManager';
import { fetchWithTimeout, retryAsync, promiseWithTimeout, isRetryableError, delay } from './apiUtils';

const MAX_CONVERSATION_TURNS = 12;
const FETCH_TIMEOUT_MS = 5 * 60 * 1000; // 🔥 5 MINUTOS para cada request al webhook (workflows complejos pueden tardar)
const MESSAGE_GENERATION_TIMEOUT_MS = 60000; // 🔥 1 MINUTO para generar mensajes con Gemini (más contexto = más tiempo)

/**
 * Ejecuta una conversación completa de manera independiente
 */
export const runConversationIndependently = async (
    conv: ConversationState,
    convIndex: number,
    config: AuditConfig,
    onProgress: ProgressCallback,
    language: string,
    abortSignal?: AbortSignal // 🔥 NUEVO: Para cancelar la conversación
): Promise<void> => {
    // 🛑 Verificar si ya fue cancelado antes de empezar
    if (abortSignal?.aborted) {
        console.log(`🛑 [${conv.testCase.title}] Conversación cancelada antes de iniciar`);
        return;
    }
    console.log(`\n🎭 [${conv.testCase.title}] Iniciando conversación independiente (${convIndex + 1})...`);
    
    // 📸 NUEVO: Tomar snapshot inicial ANTES del primer turno
    if (config.realDatabaseConfig) {
        const auditor = getRealDatabaseAuditor(conv.testCase.id);
        if (auditor) {
            try {
                console.log(`   📸 [${conv.testCase.title}] Tomando snapshot INICIAL (antes del Turn 1)...`);
                await auditor.takeSnapshot();
                console.log(`   ✅ Snapshot inicial completado`);
            } catch (error) {
                console.error(`   ❌ Error en snapshot inicial:`, error);
            }
        }
    }
    
    for (let turnCount = 1; turnCount <= MAX_CONVERSATION_TURNS; turnCount++) {
        // 🛑 Verificar cancelación antes de cada turno
        if (abortSignal?.aborted) {
            console.log(`🛑 [${conv.testCase.title}] Conversación cancelada en turno ${turnCount}`);
            conv.isComplete = true;
            conv.finalStatus = 'ERROR';
            break;
        }
        
        if (conv.isComplete) {
            console.log(`[${conv.testCase.title}] ⏹️ Conversación ya completada, saltando turnos restantes`);
            break;
        }
        
        console.log(`\n[${conv.testCase.title}] 📍 Turno ${turnCount}/${MAX_CONVERSATION_TURNS}`);
        
        try {
            // 1️⃣ Obtener contexto de BD y herramientas (si está disponible)
            let dbContext: string | null = null;
            let toolsContext: string | null = null;
            
            if (config.realDatabaseConfig) {
                const auditor = getRealDatabaseAuditor(conv.testCase.id);
                if (auditor) {
                    try {
                        // Tomar snapshot antes de generar mensaje para tener contexto actualizado
                        const currentSnapshot = await auditor.takeSnapshot();
                        
                        // 📊 Extraer información relevante de las tablas
                        const contextLines: string[] = [];
                        const summary = auditor.getSummary();
                        
                        for (const table of summary.tablesUsed) {
                            const records = currentSnapshot.data[table] || [];
                            if (records.length > 0) {
                                // Buscar registro que corresponda a esta conversación
                                const conversationRecord = records.find((r: any) => {
                                    const sessionId = r.session_id || r.sessionId || r.session || r.id;
                                    return sessionId && (
                                        sessionId.includes(conv.testCase.id) ||
                                        sessionId.includes(conv.testCase.initialPayload.telefonos) ||
                                        sessionId.includes(conv.testCase.initialPayload.telefono) ||
                                        sessionId.includes(conv.testCase.initialPayload.phone)
                                    );
                                });
                                
                                if (conversationRecord) {
                                    contextLines.push(`Current Database State for "${table}":`);
                                    
                                    // Campos relevantes para el contexto
                                    if (conversationRecord.is_blocked || conversationRecord.isBlocked) {
                                        contextLines.push(`- You are BLOCKED until: ${conversationRecord.blocked_until || 'unknown'}`);
                                        contextLines.push(`- Reason: ${conversationRecord.blocked_reason || 'Not specified'}`);
                                    } else {
                                        contextLines.push(`- You are NOT blocked (can continue conversation)`);
                                    }
                                    
                                    if (conversationRecord.cost_usd || conversationRecord.price) {
                                        contextLines.push(`- Current quoted price: $${conversationRecord.cost_usd || conversationRecord.price} USD`);
                                    }
                                    
                                    if (conversationRecord.senia_confirmada || conversationRecord.depositConfirmed) {
                                        contextLines.push(`- Deposit confirmed: ${conversationRecord.senia_confirmada || conversationRecord.depositConfirmed}`);
                                    }
                                    
                                    if (conversationRecord.prioridad || conversationRecord.priority) {
                                        contextLines.push(`- Priority level: ${conversationRecord.prioridad || conversationRecord.priority}`);
                                    }
                                }
                            }
                        }
                        
                        if (contextLines.length > 0) {
                            dbContext = contextLines.join('\n');
                            console.log(`[${conv.testCase.title}] 📊 Contexto de BD disponible:\n${dbContext}`);
                        }
                        
                        // 🔧 Detectar herramientas externas disponibles
                        const toolsLines: string[] = [];
                        const dependencies = auditor.dependencies;
                        
                        if (dependencies?.tools && dependencies.tools.length > 0) {
                            toolsLines.push('External Tools Available:');
                            for (const tool of dependencies.tools) {
                                if (tool.toolType === 'email') {
                                    toolsLines.push(`- Email system (${tool.specificType}) - can send proposals/quotes`);
                                } else if (tool.toolType === 'calendar') {
                                    toolsLines.push(`- Calendar (${tool.specificType}) - can schedule meetings/calls`);
                                } else if (tool.toolType === 'crm') {
                                    toolsLines.push(`- CRM system (${tool.specificType}) - can create leads/contacts`);
                                } else if (tool.toolType === 'messaging') {
                                    toolsLines.push(`- ${tool.specificType} messaging - can send notifications`);
                                }
                            }
                        }
                        
                        if (dependencies?.subflows && dependencies.subflows.length > 0) {
                            toolsLines.push('Available Automated Processes:');
                            for (const subflow of dependencies.subflows) {
                                toolsLines.push(`- ${subflow.workflowName || subflow.nodeName || 'Unnamed workflow'}`);
                            }
                        }
                        
                        if (toolsLines.length > 0) {
                            toolsContext = toolsLines.join('\n');
                            console.log(`[${conv.testCase.title}] 🔧 Herramientas disponibles:\n${toolsContext}`);
                        }
                    } catch (error) {
                        console.warn(`[${conv.testCase.title}] ⚠️ No se pudo obtener contexto de BD:`, error);
                    }
                }
            }
            
            // 2️⃣ Generar mensaje del usuario con contexto completo (CON TIMEOUT)
            onProgress({ message: `  [${conv.testCase.title}] ✍️ Turno ${turnCount}: Generando mensaje...` });
            
            const messageText = await retryAsync(
                () => promiseWithTimeout(
                    generateUserMessageText(
                        conv.testCase, 
                        conv.history, 
                        language, 
                        dbContext,
                        toolsContext
                    ),
                    MESSAGE_GENERATION_TIMEOUT_MS,
                    `Timeout generando mensaje para ${conv.testCase.title}`
                ),
                {
                    maxRetries: 3,
                    retryDelay: 2000,
                    shouldRetry: isRetryableError,
                    signal: abortSignal, // 🔥 Respeta cancelación durante retries
                    onRetry: (attempt, error) => {
                        console.warn(`⚠️ [${conv.testCase.title}] Reintentando generación de mensaje (intento ${attempt}/3):`, error);
                        onProgress({ message: `  [${conv.testCase.title}] ⚠️ Reintentando generación de mensaje (intento ${attempt}/3)` });
                    }
                }
            );
            
            // 2️⃣ Preparar payload
            const basePayload = { ...conv.testCase.initialPayload, conversationId: conv.testCase.id };
            
            // Detectar campo de mensaje
            let messageField = null;
            const commonFields = ['input', 'message', 'text', 'query', 'prompt', 'content', 'body', 'msg'];
            for (const field of commonFields) {
                const foundKey = Object.keys(basePayload).find(k => k.toLowerCase() === field || k.toLowerCase().includes(field));
                if (foundKey && typeof basePayload[foundKey] === 'string') {
                    messageField = foundKey;
                    break;
                }
            }
            
            if (!messageField) {
                const excludeFields = ['id', 'conversationid', 'sessionid', 'userid', 'timestamp', 'date'];
                messageField = Object.keys(basePayload).find(k => {
                    const lowerKey = k.toLowerCase();
                    return typeof basePayload[k] === 'string' && 
                           !excludeFields.some(exclude => lowerKey.includes(exclude));
                });
            }
            
            if (!messageField) {
                messageField = 'input';
            }
            
            const userInput = { 
                ...basePayload,
                [messageField]: messageText
            };
            
            console.log(`[${conv.testCase.title}] 📤 Campo: "${messageField}", Mensaje: "${messageText}"`);
            
            // 3️⃣ Mostrar mensaje pendiente en UI
            const pendingStep: ExecutionStep = {
                nodeId: `Turn ${turnCount}`,
                status: 'RUNNING',
                input: userInput,
                output: null,
                log: 'Esperando respuesta...',
                durationMs: 0,
                timestamp: Date.now(),
            };
            
            onProgress({ 
                message: `  [${conv.testCase.title}] 📨 Enviando mensaje...`,
                testCaseId: conv.testCase.id,
                step: pendingStep
            });
            
            // 4️⃣ Snapshot BEFORE (si DB audit activa)
            console.log(`\n🔍 [${conv.testCase.title}] ===== VERIFICANDO AUDITORÍA DE BD =====`);
            console.log(`   config.realDatabaseConfig existe:`, !!config.realDatabaseConfig);
            
            if (config.realDatabaseConfig) {
                console.log(`   ✅ Configuración de BD presente`);
                console.log(`   - URL:`, config.realDatabaseConfig.url);
                console.log(`   - Tablas:`, config.realDatabaseConfig.tables);
                console.log(`   🔍 Buscando auditor para conversación: ${conv.testCase.id}`);
                
                const auditor = getRealDatabaseAuditor(conv.testCase.id);
                console.log(`   Auditor encontrado:`, !!auditor);
                
                if (auditor) {
                    console.log(`   ✅ AUDITOR ENCONTRADO - Tomando snapshot BEFORE...`);
                    try {
                        const snapshot = await auditor.takeSnapshot();
                        console.log(`   ✅ Snapshot BEFORE completado`);
                        console.log(`   📊 Registros en snapshot:`, Object.entries(snapshot.data).map(([table, rows]) => `${table}=${rows.length}`).join(', '));
                    } catch (error) {
                        console.error(`   ❌ ERROR tomando snapshot BEFORE:`, error);
                        console.error(`   Stack trace:`, error instanceof Error ? error.stack : 'No stack');
                        onProgress({ message: `    [${conv.testCase.title}] ❌ Error en snapshot BD: ${error}` });
                    }
                } else {
                    console.error(`   ❌ AUDITOR NO ENCONTRADO para conversación: ${conv.testCase.id}`);
                    console.error(`   🚨 ESTO ES UN PROBLEMA - El auditor debería existir`);
                    onProgress({ message: `    [${conv.testCase.title}] ⚠️ Auditor de BD no encontrado` });
                }
            } else {
                console.log(`   ℹ️ No hay configuración de BD - skipping auditoría`);
            }
            console.log(`========================================\n`);
            
            // 5️⃣ Enviar request al webhook (CON TIMEOUT Y RETRY)
            const turnStartTime = Date.now();
            console.log(`🌐 [${conv.testCase.title}] POST ${config.endpointUrl}`);
            
            const response = await retryAsync(
                () => fetchWithTimeout(
                    config.endpointUrl!,
                    {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(userInput),
                        signal: abortSignal
                    },
                    FETCH_TIMEOUT_MS
                ),
                {
                    maxRetries: 2, // Solo 2 reintentos para no bloquear mucho
                    retryDelay: 3000,
                    signal: abortSignal, // 🔥 Respeta cancelación durante retries
                    shouldRetry: (error) => {
                        // No reintentar si es cancelación manual
                        if (error instanceof Error && error.name === 'AbortError') {
                            return false;
                        }
                        return isRetryableError(error);
                    },
                    onRetry: (attempt, error) => {
                        console.warn(`⚠️ [${conv.testCase.title}] Reintentando llamada al webhook (intento ${attempt}/2):`, error);
                        onProgress({ message: `  [${conv.testCase.title}] ⚠️ Reintentando llamada (intento ${attempt}/2)` });
                    }
                }
            );
            
            const durationMs = Date.now() - turnStartTime;
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            const responseText = await response.text();
            let responseData;
            
            // 6️⃣ Analizar respuesta
            if (!responseText || responseText.trim() === '') {
                // Respuesta vacía - analizar si es bloqueo
                console.warn(`⚠️ [${conv.testCase.title}] Respuesta vacía`);
                const { analyzeWebhookError, extractLastBotMessage, extractLastUserMessage } = await import('./intelligentErrorAnalyzer');
                
                const userId = (conv.testCase.initialPayload as any).telefono || 
                              (conv.testCase.initialPayload as any).phone || 
                              conv.testCase.id;
                
                const errorAnalysis = await analyzeWebhookError({
                    webhookResponse: null,
                    webhookError: 'Respuesta vacía',
                    conversationHistory: conv.history,
                    lastBotMessage: extractLastBotMessage(conv.history),
                    lastUserMessage: extractLastUserMessage(conv.history),
                    conversationId: conv.testCase.id,
                    userId
                });
                
                if (!errorAnalysis.isRealError) {
                    // Bloqueo intencional
                    onProgress({ message: `  [${conv.testCase.title}] 🚫 ${errorAnalysis.reason}` });
                    
                    const step: ExecutionStep = {
                        nodeId: `Turn ${turnCount}`,
                        status: 'SUCCESS',
                        input: userInput,
                        output: { 
                            intentional_end: true,
                            reason: errorAnalysis.reason,
                            evidence: errorAnalysis.evidence
                        },
                        log: `${errorAnalysis.actualStatus}: ${errorAnalysis.reason}`,
                        durationMs,
                        timestamp: Date.now(),
                    };
                    
                    conv.history.push(step);
                    conv.isComplete = true;
                    conv.finalStatus = 'SUCCESS';
                    
                    onProgress({ 
                        message: `  [${conv.testCase.title}] 🏁 Finalizada`,
                        testCaseId: conv.testCase.id,
                        step
                    });
                    
                    break;
                }
                
                throw new Error('Webhook devolvió respuesta vacía');
            }
            
            try {
                responseData = JSON.parse(responseText);
            } catch (parseError) {
                throw new Error(`JSON inválido: ${parseError instanceof Error ? parseError.message : 'Unknown'}`);
            }
            
            // 7️⃣ Detectar bloqueo explícito ({ blocked: true })
            if (responseData && responseData.blocked === true) {
                console.log(`🚫 [${conv.testCase.title}] Bloqueo explícito`);
                onProgress({ message: `  [${conv.testCase.title}] 🚫 Usuario bloqueado` });
                
                const step: ExecutionStep = {
                    nodeId: `Turn ${turnCount}`,
                    status: 'SUCCESS',
                    input: userInput,
                    output: {
                        ...responseData,
                        intentional_block: true
                    },
                    log: `USER_BLOCKED: ${responseData.reason || responseData.message || 'Usuario bloqueado'}`,
                    durationMs,
                    timestamp: Date.now(),
                };
                
                conv.history.push(step);
                conv.isComplete = true;
                conv.finalStatus = 'SUCCESS';
                
                onProgress({ 
                    message: `  [${conv.testCase.title}] 🏁 Bloqueado`,
                    testCaseId: conv.testCase.id,
                    step
                });
                
                break;
            }
            
            // 🔥 NUEVO: Capturar IDs reales de la respuesta del webhook
            if (config.realDatabaseConfig && responseData) {
                const auditor = getRealDatabaseAuditor(conv.testCase.id);
                if (auditor) {
                    console.log(`\n🔍 [${conv.testCase.title}] Extrayendo IDs reales de respuesta del webhook...`);
                    
                    // Buscar campos comunes de identificadores en la respuesta
                    const realIds: string[] = [];
                    const fieldNames = [
                        'sessionId', 'session_id', 'session',
                        'conversationId', 'conversation_id', 'conversation',
                        'chatId', 'chat_id', 'chat',
                        'userId', 'user_id', 'user',
                        'telefono', 'phone', 'telephone', 'tel'
                    ];
                    
                    function extractFromObject(obj: any) {
                        if (!obj || typeof obj !== 'object') return;
                        
                        for (const [key, value] of Object.entries(obj)) {
                            if (fieldNames.some(f => key.toLowerCase() === f.toLowerCase())) {
                                const strValue = String(value);
                                if (strValue && strValue.length >= 8 && !/^TC[-_]/i.test(strValue)) {
                                    realIds.push(strValue);
                                    console.log(`      📌 ID real: ${key}="${strValue}"`);
                                }
                            }
                            
                            if (typeof value === 'object' && value !== null) {
                                extractFromObject(value);
                            }
                        }
                    }
                    
                    extractFromObject(responseData);
                    
                    if (realIds.length > 0) {
                        console.log(`   ✅ Total IDs reales encontrados: ${realIds.length}`);
                        auditor.updateSearchIdentifiers(realIds);
                    } else {
                        console.log(`   ℹ️ No se encontraron IDs adicionales en la respuesta`);
                    }
                }
            }
            
            // 8️⃣ Snapshot AFTER y comparar
            console.log(`\n🔍 [${conv.testCase.title}] ===== SNAPSHOT AFTER =====`);
            if (config.realDatabaseConfig) {
                const auditor = getRealDatabaseAuditor(conv.testCase.id);
                console.log(`   Auditor encontrado:`, !!auditor);
                
                if (auditor) {
                    console.log(`   📊 Estado del auditor:`);
                    console.log(`      - Snapshots previos: ${auditor.snapshots.size}`);
                    console.log(`      - Cambios acumulados: ${auditor.changes.length}`);
                    
                    try {
                        // ⏱️ DELAY: Esperar a que el webhook del usuario guarde en BD
                        // Muchos webhooks guardan de forma asíncrona, necesitamos esperar
                        onProgress({ message: `    [${conv.testCase.title}] ⏱️ Esperando actualización de BD...` });
                        await delay(3000, abortSignal); // 3 segundos - respeta cancelación
                        
                        const changesBefore = auditor.changes.length;
                        console.log(`   📸 Tomando snapshot AFTER...`);
                        const afterSnap = await auditor.takeSnapshot();
                        console.log(`   ✅ Snapshot AFTER completado`);
                        console.log(`   📊 Total snapshots ahora: ${auditor.snapshots.size}`);
                        
                        if (auditor.snapshots.size >= 2) {
                            console.log(`   🔄 Comparando snapshots (tenemos ${auditor.snapshots.size})...`);
                            const timestamps = Array.from(auditor.snapshots.keys()).sort((a, b) => b - a);
                            const afterSnapshot = auditor.snapshots.get(timestamps[0])!;
                            const beforeSnapshot = auditor.snapshots.get(timestamps[1])!;
                            
                            // Log detallado de snapshots para diagnóstico
                            console.log(`\n   📊 Comparación detallada:`);
                            const summary = auditor.getSummary();
                            for (const table of summary.tablesUsed) {
                                const beforeCount = beforeSnapshot.data[table]?.length || 0;
                                const afterCount = afterSnapshot.data[table]?.length || 0;
                                const diff = afterCount - beforeCount;
                                console.log(`      ${table}: BEFORE=${beforeCount}, AFTER=${afterCount}, DIFF=${diff > 0 ? '+' : ''}${diff}`);
                                if (afterCount > beforeCount) {
                                    onProgress({ message: `    [${conv.testCase.title}] 🗄️ Tabla "${table}": +${afterCount - beforeCount} registros nuevos` });
                                }
                            }
                            
                            console.log(`   🔍 Ejecutando compareSnapshots()...`);
                            auditor.compareSnapshots(beforeSnapshot, afterSnapshot);
                            console.log(`   ✅ Comparación completada`);
                            
                            const newChanges = auditor.changes.length - changesBefore;
                            console.log(`   📝 Nuevos cambios detectados: ${newChanges}`);
                            
                            // 🔧 NUEVO: Verificar herramientas (emails, etc.) después de comparar BD
                            const latestChanges = auditor.changes.slice(-newChanges);
                            const botResponseText = typeof responseData === 'string' 
                                ? responseData 
                                : JSON.stringify(responseData);
                            
                            await auditor.verifyToolsForTurn(
                                turnCount,
                                botResponseText,
                                latestChanges,
                                responseData
                            );
                            
                            if (newChanges > 0) {
                                const latestChanges = auditor.changes.slice(-newChanges);
                                latestChanges.forEach(change => {
                                    const emoji = change.type === 'INSERT' ? '➕' : change.type === 'UPDATE' ? '🔄' : '➖';
                                    const details = change.type === 'INSERT' 
                                        ? ` (nuevo registro)`
                                        : change.type === 'UPDATE'
                                        ? ` (campos: ${change.record.changedFields?.join(', ')})`
                                        : ` (eliminado)`;
                                    onProgress({ message: `    [${conv.testCase.title}] ${emoji} BD: ${change.type} en "${change.table}"${details}` });
                                });
                            } else {
                                // Si no se detectaron cambios pero hay diferencia en conteos, avisar
                                const totalBefore = Object.values(beforeSnapshot.data).reduce((sum, rows) => sum + rows.length, 0);
                                const totalAfter = Object.values(afterSnapshot.data).reduce((sum, rows) => sum + rows.length, 0);
                                console.log(`   📊 Total registros: BEFORE=${totalBefore}, AFTER=${totalAfter}`);
                                if (totalAfter > totalBefore) {
                                    onProgress({ message: `    [${conv.testCase.title}] ℹ️ BD: +${totalAfter - totalBefore} registros totales (sin cambios rastreables)` });
                                } else if (totalBefore === 0 && totalAfter === 0) {
                                    console.warn(`   🚨 PROBLEMA: Ambos snapshots tienen 0 registros - RLS o tablas vacías`);
                                    onProgress({ message: `    [${conv.testCase.title}] ⚠️ BD: 0 registros detectados (verifica RLS)` });
                                }
                            }
                        } else {
                            console.warn(`   ⚠️ No hay suficientes snapshots para comparar (solo ${auditor.snapshots.size})`);
                        }
                    } catch (error) {
                        console.error(`   ❌ ERROR en snapshot AFTER:`, error);
                        console.error(`   Stack:`, error instanceof Error ? error.stack : 'No stack');
                        onProgress({ message: `    [${conv.testCase.title}] ❌ Error en snapshot AFTER: ${error}` });
                    }
                } else {
                    console.error(`   ❌ AUDITOR NO ENCONTRADO en AFTER`);
                }
            }
            console.log(`========================================\n`);
            
            // 9️⃣ Éxito - guardar step
            const step: ExecutionStep = {
                nodeId: `Turn ${turnCount}`,
                status: 'SUCCESS',
                input: userInput,
                output: responseData,
                log: `Success on Round ${turnCount}.`,
                durationMs,
                timestamp: Date.now(),
            };
            
            conv.history.push(step);
            
            onProgress({ 
                message: `  [${conv.testCase.title}] ✅ Turno ${turnCount} completo (${durationMs}ms)`,
                testCaseId: conv.testCase.id,
                step
            });
            
            // 🔟 Verificación inteligente de promesas (CON TIMEOUT)
            if (config.realDatabaseConfig) {
                try {
                    const userMsg = findUserMessageText(step.input);
                    const botResponse = findAgentMessageText(step.output);
                    const conversationContext = conv.history.slice(0, -1).map(h => 
                        `Usuario: ${findUserMessageText(h.input)}\nBot: ${findAgentMessageText(h.output)}`
                    ).join('\n\n');
                    
                    // 🚀 Timeout de 45 segundos para extractBotPromises (puede ser lento con Gemini)
                    const promises = await promiseWithTimeout(
                        extractBotPromises(botResponse, userMsg, conversationContext, language),
                        45000,
                        `Timeout extrayendo promesas del bot para ${conv.testCase.title}`
                    );
                    
                    if (promises.length > 0) {
                        const userId = (conv.testCase.initialPayload as any).telefono || 
                                      (conv.testCase.initialPayload as any).phone || 
                                      conv.testCase.id;
                        
                        // 🚀 Timeout de 30 segundos para verifyBotPromises
                        const newDiscrepancies = await promiseWithTimeout(
                            verifyBotPromises(conv.testCase.id, promises, userId),
                            30000,
                            `Timeout verificando promesas para ${conv.testCase.title}`
                        );
                        
                        if (newDiscrepancies.length > 0) {
                            onProgress({ message: `    [${conv.testCase.title}] ⚠️ ${newDiscrepancies.length} discrepancia(s) en BD` });
                        }
                    }
                } catch (error) {
                    const errorMsg = error instanceof Error ? error.message : 'Error desconocido';
                    console.error(`[Verifier] Error:`, errorMsg);
                    onProgress({ message: `    [${conv.testCase.title}] ⚠️ Error en verificación: ${errorMsg}` });
                }
            }
            
            // 🔗 NUEVO: Verificación de herramientas externas (Email, Calendar, etc.) CON TIMEOUT
            const integrationManager = getGlobalIntegrationManager();
            if (integrationManager && integrationManager.hasToolsConfigured()) {
                try {
                    const botResponse = findAgentMessageText(step.output);
                    
                    onProgress({ message: `    [${conv.testCase.title}] 🔍 Verificando herramientas...` });
                    
                    // 🚀 Timeout de 30 segundos para verificación de herramientas (Gmail API normalmente responde en 5-10s)
                    const toolVerifications = await promiseWithTimeout(
                        integrationManager.verifyAllActions(botResponse, turnCount),
                        30000, // 🔥 30s = suficiente para Gmail API (usualmente 5-10s)
                        `Timeout verificando herramientas para ${conv.testCase.title}`
                    );
                    
                    // Guardar verificaciones en el estado de la conversación
                    if (!conv.toolVerifications) {
                        conv.toolVerifications = [];
                    }
                    conv.toolVerifications.push(...toolVerifications);
                    
                    // Log resultados de verificación
                    if (toolVerifications.length > 0) {
                        const verifiedCount = toolVerifications.filter(v => v.verified).length;
                        const failedCount = toolVerifications.filter(v => !v.verified).length;
                        
                        if (failedCount > 0) {
                            onProgress({ message: `    [${conv.testCase.title}] ❌ ${failedCount} herramienta(s) fallaron verificación` });
                        } else {
                            onProgress({ message: `    [${conv.testCase.title}] ✅ ${verifiedCount} herramienta(s) verificadas` });
                        }
                        
                        // Log detallado por cada verificación
                        toolVerifications.forEach(v => {
                            const icon = v.verified ? '✅' : '❌';
                            onProgress({ message: `      ${icon} ${v.claim.type}: ${v.message}` });
                        });
                    }
                } catch (error) {
                    const errorMsg = error instanceof Error ? error.message : 'Error desconocido';
                    console.error(`[IntegrationManager] Error verificando herramientas:`, errorMsg);
                    
                    // No fallar la auditoría por timeout de verificación - solo advertir
                    if (errorMsg.includes('Timeout')) {
                        onProgress({ message: `    [${conv.testCase.title}] ⚠️ Timeout verificando herramientas (APIs lentas). Continuando...` });
                    } else {
                        onProgress({ message: `    [${conv.testCase.title}] ⚠️ Error verificando herramientas: ${errorMsg}` });
                    }
                }
            }
            
        } catch (error) {
            // 🛑 Verificar si es cancelación (AbortError)
            if (error instanceof Error && error.name === 'AbortError') {
                console.log(`🛑 [${conv.testCase.title}] Conversación cancelada por el usuario`);
                conv.isComplete = true;
                conv.finalStatus = 'ERROR';
                onProgress({ message: `  [${conv.testCase.title}] 🛑 Cancelado por usuario` });
                break; // Salir limpiamente
            }
            
            // ❌ Error real
            const durationMs = Date.now() - Date.now(); // Aproximado
            const logMessage = error instanceof Error ? error.message : "Error desconocido";
            
            console.error(`\n❌ [${conv.testCase.title}] ERROR:`, logMessage);
            onProgress({ message: `  [${conv.testCase.title}] ❌ Error: ${logMessage}` });
            
            const step: ExecutionStep = {
                nodeId: `Turn ${turnCount}`,
                status: 'ERROR',
                input: conv.history.length > 0 ? conv.history[conv.history.length - 1].input : {},
                output: null,
                log: logMessage,
                durationMs,
                timestamp: Date.now(),
            };
            
            conv.history.push(step);
            conv.isComplete = true;
            conv.finalStatus = 'ERROR';
            
            onProgress({ 
                message: `  [${conv.testCase.title}] ⛔ Conversación terminada por error`,
                testCaseId: conv.testCase.id,
                step
            });
            
            break;
        }
    }
    
    // Marcar como completada si llegó a todos los turnos
    if (!conv.isComplete && conv.history.length >= MAX_CONVERSATION_TURNS) {
        conv.isComplete = true;
        conv.finalStatus = 'SUCCESS';
        onProgress({ message: `  [${conv.testCase.title}] 🎯 Completó ${MAX_CONVERSATION_TURNS} turnos` });
    }
    
    // ⏱️ Marcar tiempo de finalización
    if (conv.isComplete && !conv.endTime) {
        conv.endTime = Date.now();
        const durationSeconds = conv.startTime ? (conv.endTime - conv.startTime) / 1000 : 0;
        console.log(`\n✅ [${conv.testCase.title}] Conversación finalizada. Duración: ${durationSeconds.toFixed(1)}s | Total turnos: ${conv.history.length}`);
    }
};

