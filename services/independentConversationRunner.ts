import { GoogleGenAI, Type } from "@google/genai";
import type { AuditConfig, ExecutionStep } from '../types';
import type { ConversationState, ProgressCallback } from './geminiService';
import { 
    generateUserMessageText, 
    findAgentMessageText, 
    findUserMessageText,
    getGlobalIntegrationManager 
} from './geminiService';
import { getRealDatabaseAuditor } from './realDatabaseAuditor';
import { costTracker } from './costTracker';

const MAX_CONVERSATION_TURNS = 12;
const WEBHOOK_TIMEOUT_MS = 60000; // 60 segundos por llamada al webhook (algunos agentes son lentos)

/**
 * Ejecuta una conversación de manera independiente (para ejecución paralela)
 * 
 * @param conv - Estado de la conversación (testCase, history, etc.)
 * @param index - Índice de la conversación (para logs)
 * @param config - Configuración de la auditoría
 * @param onProgress - Callback para actualizar la UI
 * @param language - Idioma para generar mensajes
 * @param abortSignal - Signal para cancelar la ejecución
 */
export async function runConversationIndependently(
    conv: ConversationState,
    index: number,
    config: AuditConfig,
    onProgress: ProgressCallback,
    language: string,
    abortSignal: AbortSignal
): Promise<void> {
    const conversationStartTime = Date.now();
    
    console.log(`\n🎬 [${ conv.testCase.title}] ========== INICIANDO CONVERSACIÓN ==========`);
    console.log(`   Conversación: ${index + 1}`);
    console.log(`   Objetivo: ${conv.testCase.conversationGoal}`);
    console.log(`   Persona: ${conv.testCase.persona}`);
    console.log(`   Endpoint: ${config.endpointUrl}`);
    console.log(`   BD habilitada: ${!!config.realDatabaseConfig}`);
    console.log(`=========================================\n`);
    
    // Actualizar UI: conversación iniciada
    onProgress({ 
        message: `🎬 [${conv.testCase.title}] Conversación iniciada`,
        testCaseId: conv.testCase.id
    });
    
    // BUCLE DE TURNOS
    for (let turnNumber = 1; turnNumber <= MAX_CONVERSATION_TURNS; turnNumber++) {
        const turnStartTime = Date.now();
        
        // 🛑 Verificar si fue cancelado
        if (abortSignal.aborted) {
            console.log(`🛑 [${conv.testCase.title}] Cancelado en turno ${turnNumber}`);
            onProgress({ 
                message: `🛑 [${conv.testCase.title}] Cancelado por el usuario`,
                testCaseId: conv.testCase.id
            });
            conv.isComplete = true;
            conv.finalStatus = 'ERROR';
            throw new Error('Conversación cancelada por el usuario');
        }
        
        console.log(`\n💬 [${conv.testCase.title}] ========== TURNO ${turnNumber}/${MAX_CONVERSATION_TURNS} ==========`);
        
        try {
            // ========== 1. SNAPSHOT ANTES (si BD habilitada) ==========
            let snapshotBefore;
            const auditor = config.realDatabaseConfig ? getRealDatabaseAuditor(conv.testCase.id) : null;
            
            if (auditor) {
                console.log(`   📸 Tomando snapshot ANTES del turno...`);
                try {
                    snapshotBefore = await auditor.takeSnapshot();
                    console.log(`   ✅ Snapshot ANTES completado`);
                } catch (snapshotError) {
                    console.error(`   ⚠️ Error en snapshot ANTES:`, snapshotError);
                    // Continuar sin snapshot (no es crítico)
                }
            }
            
            // ========== 2. EXTRAER CONTEXTO DE BD Y HERRAMIENTAS ==========
            const databaseContext = auditor ? extractDatabaseContext(auditor) : null;
            const toolsContext = extractToolsContext(config);
            
            // ========== 3. GENERAR MENSAJE DEL USUARIO ==========
            console.log(`   🧠 Generando mensaje del usuario...`);
            let userMessage: string;
            
            try {
                userMessage = await generateUserMessageText(
                    conv.testCase,
                    conv.history,
                    language,
                    databaseContext,
                    toolsContext
                );
                console.log(`   ✅ Mensaje generado: "${userMessage}"`);
            } catch (genError) {
                console.error(`   ❌ Error generando mensaje:`, genError);
                throw new Error(`Error generando mensaje: ${genError instanceof Error ? genError.message : String(genError)}`);
            }
            
            // ========== 4. PREPARAR PAYLOAD PARA EL WEBHOOK ==========
            // 🔥 CRÍTICO: NO hacer spread del initialPayload completo porque incluye el body original
            // Solo copiar los campos de identificación (session_id, from, pushName) y usar el NUEVO mensaje
            const webhookPayload: Record<string, any> = {
                // Campos de identificación (sin el body original)
                session_id: conv.testCase.initialPayload.session_id || conv.testCase.initialPayload.sessionId || conv.testCase.id,
                from: conv.testCase.initialPayload.from || conv.testCase.initialPayload.session_id || conv.testCase.id,
                pushName: conv.testCase.initialPayload.pushName || conv.testCase.initialPayload.nombre || conv.testCase.initialPayload.name || 'Test User',
                
                // MENSAJE NUEVO (usar 'body' porque es lo que espera el webhook de WhatsApp/BuilderBot)
                body: userMessage,
                
                // Campos adicionales útiles
                conversationId: conv.testCase.id,
                turnNumber: turnNumber
            };
            
            console.log(`   🌐 Enviando al webhook: ${config.endpointUrl}`);
            console.log(`   📦 Payload:`, JSON.stringify(webhookPayload, null, 2).substring(0, 300));
            
            // Actualizar UI: enviando mensaje
            onProgress({
                message: `💬 [${conv.testCase.title}] Turno ${turnNumber}: Enviando mensaje...`,
                testCaseId: conv.testCase.id,
                step: {
                    nodeId: `Turn ${turnNumber}`,
                    status: 'RUNNING',
                    input: { message: userMessage },
                    output: null,
                    log: 'Enviando mensaje al webhook...',
                    durationMs: 0,
                    timestamp: Date.now()
                }
            });
            
            // ========== 5. VERIFICAR BLOQUEO ANTES DE ENVIAR ==========
            // 🔥 NUEVO: Verificar si el usuario está bloqueado en BD ANTES del timeout
            const dbAuditor = getRealDatabaseAuditor(conv.testCase.id);
            if (dbAuditor && turnNumber > 1) { // Solo después del primer turno
                try {
                    const userId = webhookPayload.session_id || webhookPayload.from || conv.testCase.id;
                    const isNotBlocked = await dbAuditor.verifyNotBlocked(userId, `Before Turn ${turnNumber}`);
                    
                    if (!isNotBlocked) {
                        console.log(`   🚫 Usuario bloqueado en BD - Finalizando conversación`);
                        onProgress({
                            message: `🚫 [${conv.testCase.title}] Usuario bloqueado en base de datos`,
                            testCaseId: conv.testCase.id,
                            step: {
                                nodeId: `Turn ${turnNumber}`,
                                status: 'SUCCESS',
                                input: { message: userMessage },
                                output: { blocked: true, reason: 'Usuario bloqueado en BD' },
                                log: 'Usuario bloqueado - Conversación finalizada correctamente',
                                durationMs: 0,
                                timestamp: Date.now()
                            }
                        });
                        break; // Finalizar conversación
                    }
                } catch (blockCheckError) {
                    console.warn(`   ⚠️ No se pudo verificar bloqueo:`, blockCheckError);
                    // Continuar de todos modos
                }
            }
            
            // ========== 6. ENVIAR AL WEBHOOK CON TIMEOUT ==========
            let agentResponse: any;
            let webhookError = false;
            
            try {
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), WEBHOOK_TIMEOUT_MS);
                
                // Combinar el signal de timeout con el signal de cancelación del usuario
                const combinedSignal = abortSignal.aborted ? abortSignal : controller.signal;
                
                const webhookResponse = await fetch(config.endpointUrl!, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-Audit-Mode': 'true', // 🔥 CRÍTICO: El bot NO debe escribir en BD
                        'X-Audit-Session': conv.testCase.id, // Para tracking de auditorías
                    },
                    body: JSON.stringify(webhookPayload),
                    signal: combinedSignal
                });
                
                clearTimeout(timeoutId);
                
                if (!webhookResponse.ok) {
                    throw new Error(`Webhook respondió con status ${webhookResponse.status}: ${webhookResponse.statusText}`);
                }
                
                agentResponse = await webhookResponse.json();
                console.log(`   ✅ Respuesta del webhook recibida`);
                console.log(`   🤖 Agente: "${findAgentMessageText(agentResponse)}"`);
                
            } catch (webhookErr: any) {
                webhookError = true;
                
                if (webhookErr.name === 'AbortError') {
                    if (abortSignal.aborted) {
                        console.log(`   🛑 Webhook cancelado por el usuario`);
                        throw new Error('Conversación cancelada por el usuario');
                    } else {
                        console.error(`   ⏱️ TIMEOUT: Webhook no respondió en ${WEBHOOK_TIMEOUT_MS}ms`);
                        agentResponse = { 
                            error: 'Webhook timeout',
                            message: 'El agente no respondió a tiempo'
                        };
                    }
                } else {
                    console.error(`   ❌ Error llamando al webhook:`, webhookErr);
                    agentResponse = { 
                        error: webhookErr.message || 'Unknown error',
                        message: 'Error conectando con el agente'
                    };
                }
            }
            
            const turnDuration = Date.now() - turnStartTime;
            
            // ========== 6. SNAPSHOT DESPUÉS (si BD habilitada) ==========
            let snapshotAfter;
            let dbChangesThisTurn: any[] = [];
            
            if (auditor && !webhookError) {
                console.log(`   📸 Tomando snapshot DESPUÉS del turno...`);
                try {
                    snapshotAfter = await auditor.takeSnapshot();
                    console.log(`   ✅ Snapshot DESPUÉS completado`);
                    
                    // ========== 7. COMPARAR SNAPSHOTS ==========
                    if (snapshotBefore && snapshotAfter) {
                        console.log(`   🔍 Comparando snapshots...`);
                        const changesBefore = auditor.changes.length;
                        auditor.compareSnapshots(snapshotBefore, snapshotAfter);
                        const changesAfter = auditor.changes.length;
                        
                        dbChangesThisTurn = auditor.changes.slice(changesBefore);
                        
                        if (dbChangesThisTurn.length > 0) {
                            console.log(`   📊 Cambios detectados en BD: ${dbChangesThisTurn.length}`);
                            dbChangesThisTurn.forEach((change, idx) => {
                                console.log(`      ${idx + 1}. ${change.type} en tabla "${change.table}"`);
                            });
                        } else {
                            console.log(`   ℹ️ No se detectaron cambios en BD`);
                        }
                    }
                } catch (snapshotError) {
                    console.error(`   ⚠️ Error en snapshot DESPUÉS:`, snapshotError);
                }
            }
            
            // ========== 8. VERIFICAR HERRAMIENTAS EXTERNAS (Gmail, Calendar, etc.) ==========
            if (!webhookError) {
                const integrationManager = getGlobalIntegrationManager();
                if (integrationManager) {
                    console.log(`   🔧 Verificando herramientas externas...`);
                    try {
                        const agentMessageText = findAgentMessageText(agentResponse);
                        const verifications = await integrationManager.verifyAllActions(
                            agentMessageText,
                            turnNumber
                        );
                        
                        if (verifications.length > 0) {
                            console.log(`   ✅ Verificación de herramientas completada: ${verifications.length} acción(es)`);
                            verifications.forEach(v => {
                                const icon = v.verified ? '✅' : '❌';
                                console.log(`      ${icon} ${v.claim.type}: ${v.message}`);
                            });
                            
                            // Guardar verifications en el estado de la conversación
                            if (!conv.toolVerifications) {
                                conv.toolVerifications = [];
                            }
                            conv.toolVerifications.push(...verifications);
                        } else {
                            console.log(`   ℹ️ No se detectaron acciones de herramientas en este turno`);
                        }
                    } catch (toolError) {
                        console.error(`   ⚠️ Error verificando herramientas:`, toolError);
                        // No es crítico, continuar
                    }
                }
            }
            
            // ========== 9. GUARDAR EN HISTORY ==========
            const executionStep: ExecutionStep = {
                nodeId: `Turn ${turnNumber}`,
                status: webhookError ? 'ERROR' : 'SUCCESS',
                input: { message: userMessage, ...webhookPayload },
                output: agentResponse,
                log: webhookError 
                    ? `Error: ${agentResponse.error || 'Unknown error'}`
                    : `Turno ${turnNumber} completado exitosamente`,
                durationMs: turnDuration,
                timestamp: Date.now()
            };
            
            conv.history.push(executionStep);
            
            // ========== 10. ACTUALIZAR UI CON RESULTADO DEL TURNO ==========
            onProgress({
                message: `${webhookError ? '❌' : '✅'} [${conv.testCase.title}] Turno ${turnNumber}/${MAX_CONVERSATION_TURNS} ${webhookError ? 'con error' : 'completado'}`,
                testCaseId: conv.testCase.id,
                step: executionStep
            });
            
            console.log(`   ⏱️ Turno completado en ${turnDuration}ms`);
            console.log(`=========================================\n`);
            
            // ========== 11. VERIFICAR SI DEBE TERMINAR ==========
            
            // Si hubo error en el webhook, terminar la conversación
            if (webhookError) {
                console.log(`   🛑 Terminando conversación por error en webhook`);
                break;
            }
            
            // Verificar si el objetivo fue logrado
            if (turnNumber >= 3) { // Mínimo 3 turnos antes de verificar
                console.log(`   🎯 Verificando si el objetivo fue logrado...`);
                const goalAchieved = await shouldEndConversation(
                    conv.testCase, 
                    conv.history, 
                    language
                );
                
                if (goalAchieved) {
                    console.log(`   ✅ ¡Objetivo logrado! Terminando conversación.`);
                    onProgress({
                        message: `🎯 [${conv.testCase.title}] Objetivo logrado en ${turnNumber} turnos`,
                        testCaseId: conv.testCase.id
                    });
                    break;
                } else {
                    console.log(`   ↻ Objetivo no logrado aún, continuando...`);
                }
            }
            
        } catch (turnError: any) {
            console.error(`   ❌ Error en turno ${turnNumber}:`, turnError);
            
            // Si es cancelación, propagar
            if (turnError.message?.includes('cancelada por el usuario') || turnError.name === 'AbortError') {
                throw turnError;
            }
            
            // Para otros errores, registrar y terminar conversación
            conv.history.push({
                nodeId: `Turn ${turnNumber}`,
                status: 'ERROR',
                input: { error: 'Turn failed to complete' },
                output: { error: turnError.message || 'Unknown error' },
                log: `Error en turno ${turnNumber}: ${turnError.message || String(turnError)}`,
                durationMs: Date.now() - turnStartTime,
                timestamp: Date.now()
            });
            
            onProgress({
                message: `❌ [${conv.testCase.title}] Error en turno ${turnNumber}: ${turnError.message}`,
                testCaseId: conv.testCase.id,
                step: conv.history[conv.history.length - 1]
            });
            
            // Terminar conversación después de un error
            break;
        }
    }
    
    // ========== MARCAR CONVERSACIÓN COMO COMPLETA ==========
    conv.isComplete = true;
    
    if (conv.finalStatus === 'PENDING') {
        conv.finalStatus = 'SUCCESS';
    }
    
    conv.endTime = Date.now();
    const totalDuration = conv.endTime - conversationStartTime;
    
    console.log(`\n✅ [${conv.testCase.title}] ========== CONVERSACIÓN FINALIZADA ==========`);
    console.log(`   Total turnos: ${conv.history.length}`);
    console.log(`   Status final: ${conv.finalStatus}`);
    console.log(`   Duración total: ${(totalDuration / 1000).toFixed(1)}s`);
    console.log(`=========================================\n`);
    
    onProgress({
        message: `✅ [${conv.testCase.title}] Conversación finalizada (${conv.history.length} turnos, ${(totalDuration / 1000).toFixed(1)}s)`,
        testCaseId: conv.testCase.id
    });
}

/**
 * Determina si la conversación debe terminar (objetivo logrado)
 * Usa IA para analizar el historial y determinar si el goal fue alcanzado
 */
async function shouldEndConversation(
    testCase: any,
    conversationHistory: ExecutionStep[],
    language: string
): Promise<boolean> {
    if (conversationHistory.length === 0) return false;
    
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const historyString = conversationHistory.map(turn =>
        `User: ${findUserMessageText(turn.input)}\nAgent: ${findAgentMessageText(turn.output)}`
    ).join('\n\n');
    
    const prompt = `
    You are a QA Analyst judging a conversation.
    The user's goal was: "${testCase.conversationGoal}"
    
    Here is the conversation history:
    ${historyString}
    
    Has the user's goal been fully and satisfactorily achieved?
    Answer with a single boolean value in a JSON object. For example: {"goalAchieved": true}
    
    Be strict: the goal must be COMPLETED, not just in progress.
    `;
    
    try {
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt,
            config: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        goalAchieved: { type: Type.BOOLEAN },
                    },
                    required: ['goalAchieved'],
                }
            }
        });
        
        // 💰 Track usage
        if (response.usageMetadata) {
            costTracker.recordUsage({
                promptTokens: response.usageMetadata.promptTokenCount || 0,
                responseTokens: response.usageMetadata.candidatesTokenCount || 0,
                totalTokens: response.usageMetadata.totalTokenCount || 0,
                model: 'gemini-2.5-flash',
                operation: 'check_goal_achieved',
                conversationId: testCase.id
            });
        }
        
        const result = JSON.parse(response.text);
        return result.goalAchieved === true;
    } catch (e) {
        console.error(`   ⚠️ Error verificando objetivo:`, e);
        return false; // Si falla, asumir que no se logró
    }
}

/**
 * Extrae contexto relevante de los cambios en la base de datos
 * Para informar al usuario simulado de lo que pasó en BD
 */
function extractDatabaseContext(auditor: any): string | null {
    if (!auditor) return null;
    
    const changes = auditor.changes || [];
    if (changes.length === 0) return null;
    
    // Resumir los últimos cambios
    const recentChanges = changes.slice(-5); // Últimos 5 cambios
    
    const summaries = recentChanges.map((change: any) => {
        const { type, table, record } = change;
        
        switch (type) {
            case 'INSERT':
                return `Se creó un registro en ${table}`;
            case 'UPDATE':
                return `Se actualizó un registro en ${table}`;
            case 'DELETE':
                return `Se eliminó un registro de ${table}`;
            default:
                return `Cambio en ${table}`;
        }
    });
    
    return `FYI: ${summaries.join('. ')}.`;
}

/**
 * Extrae contexto sobre herramientas externas disponibles
 * Para que el usuario sepa qué puede pedir (emails, citas, etc.)
 */
function extractToolsContext(config: AuditConfig): string | null {
    if (!config.integrationConfig?.enabledIntegrations) return null;
    
    const tools: string[] = [];
    
    if (config.integrationConfig.enabledIntegrations.email) {
        tools.push('envío de emails');
    }
    
    if (config.integrationConfig.enabledIntegrations.calendar) {
        tools.push('agendamiento de citas');
    }
    
    if (tools.length === 0) return null;
    
    return `El agente puede hacer: ${tools.join(', ')}.`;
}
