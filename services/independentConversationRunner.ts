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
import { generateUserMessageText, findUserMessageText, findAgentMessageText } from './geminiService';
import { getRealDatabaseAuditor } from './realDatabaseAuditor';
import { extractBotPromises, verifyBotPromises } from './intelligentDatabaseVerifier';

const MAX_CONVERSATION_TURNS = 12;

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
            // 1️⃣ Generar mensaje del usuario
            onProgress({ message: `  [${conv.testCase.title}] ✍️ Turno ${turnCount}: Generando mensaje...` });
            const messageText = await generateUserMessageText(conv.testCase, conv.history, language);
            
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
            
            // 5️⃣ Enviar request al webhook
            const turnStartTime = Date.now();
            console.log(`🌐 [${conv.testCase.title}] POST ${config.endpointUrl}`);
            
            const response = await fetch(config.endpointUrl!, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(userInput),
                signal: abortSignal // 🛑 Pasar señal de cancelación
            });
            
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
                        await new Promise(resolve => setTimeout(resolve, 3000)); // 3 segundos
                        onProgress({ message: `    [${conv.testCase.title}] ⏱️ Esperando actualización de BD...` });
                        
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
                            for (const table of auditor.config.tables) {
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
            
            // 🔟 Verificación inteligente de promesas
            if (config.realDatabaseConfig) {
                try {
                    const userMsg = findUserMessageText(step.input);
                    const botResponse = findAgentMessageText(step.output);
                    const conversationContext = conv.history.slice(0, -1).map(h => 
                        `Usuario: ${findUserMessageText(h.input)}\nBot: ${findAgentMessageText(h.output)}`
                    ).join('\n\n');
                    
                    const promises = await extractBotPromises(botResponse, userMsg, conversationContext);
                    if (promises.length > 0) {
                        const userId = (conv.testCase.initialPayload as any).telefono || 
                                      (conv.testCase.initialPayload as any).phone || 
                                      conv.testCase.id;
                        const newDiscrepancies = await verifyBotPromises(conv.testCase.id, promises, userId);
                        
                        if (newDiscrepancies.length > 0) {
                            onProgress({ message: `    [${conv.testCase.title}] ⚠️ ${newDiscrepancies.length} discrepancia(s) en BD` });
                        }
                    }
                } catch (error) {
                    console.error(`[Verifier] Error:`, error);
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

