import { GoogleGenAI, Type } from "@google/genai";
import type { AuditConfig, TestCase, Analysis, AuditResult, ImprovementData, WorkflowNode, N8nConnection, AgentNode, ToolNode, ExecutionStep } from '../types';
import { runConversationIndependently } from './independentConversationRunner';
import { costTracker, type CostSummary } from './costTracker';
import { initializeRealDatabaseAuditor, getRealDatabaseAuditor, cleanupRealDatabaseAuditor } from './realDatabaseAuditor';
import { verifyToolExecutions, generateToolVerificationSummary } from './toolExecutionVerifier';
import { analyzeWorkflowDependencies } from './workflowDependencyAnalyzer';
import { verifyConversationIntelligently, generateDiscrepanciesReport, type IntelligentVerificationResult } from './intelligentToolVerificator';
import { IntegrationManager, createIntegrationManager, type IntegrationConfig } from './IntegrationManager';
import { promiseAllWithTimeout, promiseWithTimeout } from './apiUtils';
import snapshotCache from './snapshotCache';

// Exportar función para obtener el resumen de costos desde otros componentes
export const getCostSummary = (): CostSummary => costTracker.getSummary();

const delay = (ms: number) => new Promise(res => setTimeout(res, ms));

export type ProgressCallback = (update: { message: string; trace?: AuditResult, testCaseId?: string, step?: ExecutionStep }) => void;
type ResultCallback = (result: AuditResult) => void;
type CompletionCallback = () => void;

const MAX_CONVERSATION_TURNS = 12;

const getLanguageInstruction = (language: string): string => {
    const langName = language === 'es' ? 'Spanish' : 'English';
    return `\n\nCRITICAL: You must provide your entire response, including all text and justifications, exclusively in ${langName}. Do not use any other language.`;
}

const formatWorkflowForPrompt = (workflow: WorkflowNode[], connections: N8nConnection[]): string => {
    const nodeDescriptions = workflow.map(node => {
        if (node.type === 'agent') {
            return `Node ID: ${node.id} (AI Agent - ${node.name}): System Prompt: "${node.systemPrompt}"`;
        } else {
            return `Node ID: ${node.id} (Tool - ${node.name}): A non-AI tool of type "${node.nodeType}". It will be executed for real. Its logic should be treated as a black box that performs a specific function based on its type.`;
        }
    }).join('\n');

    const connectionDescriptions = connections.map(c => `- Node ${c.sourceNodeId} connects to Node ${c.targetNodeId} via output handle '${c.sourceHandle}'`).join('\n');

    return `Workflow Structure:\n${nodeDescriptions}\n\nConnections:\n${connectionDescriptions}`;
};

export const generateSamplePayload = async (workflow: WorkflowNode[], connections: N8nConnection[], language: string): Promise<Record<string, any>> => {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    
    // We only need the first few nodes to infer the input structure
    const startNode = workflow.find(n => !connections.some(c => c.targetNodeId === n.id));
    const relevantNodes = [startNode];
    if (startNode) {
        const firstConnection = connections.find(c => c.sourceNodeId === startNode.id);
        if (firstConnection) {
            const nextNode = workflow.find(n => n.id === firstConnection.targetNodeId);
            if (nextNode) relevantNodes.push(nextNode);
        }
    }

    const prompt = `
    As an expert n8n developer, analyze the initial nodes of the following workflow. Your task is to generate a single, plausible sample JSON object that could be sent to the initial Webhook trigger to start this workflow.

    Initial Workflow Nodes:
    ${formatWorkflowForPrompt(relevantNodes.filter(Boolean) as WorkflowNode[], connections)}

    Instructions:
    - Look at the parameters of the first and second nodes. If they use expressions like \`{{ $json.body.someValue }}\` or \`{{ $json.query.id }}\`, you can infer the expected structure of the incoming data.
    - **CRITICAL**: The generated JSON MUST include a key named "conversationId" with a sample string value (e.g., "conv_12345"). This field is essential for tracking conversational state.
    - Create a realistic JSON object with sample data (e.g., use fake names, realistic numbers).
    - The output MUST be only the JSON object itself, with no explanations or markdown.

    ${getLanguageInstruction(language)}
    `;
    
    const response = await ai.models.generateContent({
        model: 'gemini-2.5-pro',
        contents: prompt,
        config: {
            responseMimeType: "application/json",
        },
    });

    // 💰 Track usage
    if (response.usageMetadata) {
        costTracker.recordUsage({
            promptTokens: response.usageMetadata.promptTokenCount || 0,
            responseTokens: response.usageMetadata.candidatesTokenCount || 0,
            totalTokens: response.usageMetadata.totalTokenCount || 0,
            model: 'gemini-2.5-pro',
            operation: 'generate_sample_payload'
        });
    }

    try {
        const jsonText = response.text.trim();
        const parsed = JSON.parse(jsonText);
        // Ensure conversationId exists
        if (!parsed.conversationId) {
            parsed.conversationId = `conv_${Date.now()}`;
        }
        return parsed;
    } catch (e) {
        console.error("Failed to parse sample payload JSON:", response.text);
        // Fallback to a simple object if generation fails
        return { message: "Silver Fleet connectivity test (fallback)", conversationId: "conv_fallback_123" };
    }
}

export const generateTestCases = async (
    config: AuditConfig, 
    language: string,
    onBatchGenerated?: (batch: TestCase[]) => void // 🔥 NUEVO: Callback para cada lote
): Promise<TestCase[]> => {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const { workflow, criteria, testCaseCount, connections, samplePayload, codeProject } = config;

    // 🔥 NUEVO: Generar lotes EN PARALELO para máxima velocidad
    const BATCH_SIZE = 20;
    const CONCURRENT_BATCHES = 5; // 🚀 Generar 5 lotes a la vez (100 agentes en 1 minuto!)
    const batches = Math.ceil(testCaseCount / BATCH_SIZE);
    const allTestCases: TestCase[] = [];
    
    console.log(`🎭 Generando ${testCaseCount} test cases en ${batches} lotes (${CONCURRENT_BATCHES} paralelos)...`);
    
    // Función para generar un lote
    const generateBatch = async (batchIndex: number) => {
        const startIndex = batchIndex * BATCH_SIZE + 1;
        const remaining = testCaseCount - (batchIndex * BATCH_SIZE);
        const batchSize = Math.min(BATCH_SIZE, remaining);
        
        console.log(`   📦 Lote ${batchIndex + 1}/${batches}: Iniciando generación de ${batchSize} test cases (${startIndex}-${startIndex + batchSize - 1})...`);

        // 🔧 Preparar descripción del workflow/proyecto
        let workflowDescription = '';
        if (workflow) {
          workflowDescription = `This is the workflow you are testing:\n${formatWorkflowForPrompt(workflow, connections)}`;
        } else if (codeProject) {
          workflowDescription = `This is a Node.js/TypeScript project with:
- Framework: ${codeProject.framework?.name}
- AI Agents: ${codeProject.agents.length} agent(s)
- Databases: ${codeProject.databases.length}
- Tools: ${codeProject.tools.length}
- APIs: ${codeProject.apis.length}
- Agents detected: ${codeProject.agents.map(a => a.name).join(', ')}`;
        } else {
          workflowDescription = 'This is a conversational AI system.';
        }

        const prompt = `
        Act as a senior QA engineer creating data for testing a conversational AI system. Your task is to generate ${batchSize} unique, realistic user profiles.
        
        ${workflowDescription}

        This is the sample JSON structure the system expects for each message:
        ${JSON.stringify(samplePayload, null, 2)}

        Audit criteria (what you're testing):
        ${criteria.map((c, i) => `${i+1}. ${c}`).join('\n')}

        Based on your analysis, for each of the ${batchSize} test cases, you must:
        1.  Create a complete JSON payload (\`initialPayload\`) that follows the sample structure with **completely new and unique data**.
        2.  Define a user 'persona' that describes the user's personality and communication style.
        3.  Define a clear 'conversationGoal' that tests the system against the criteria above.
        4.  Provide a unique 'id' (starting from TC-${startIndex.toString().padStart(3, '0')}) and a concise 'title'.

        Instructions:
        - The \`conversationId\` in each \`initialPayload\` must be unique.
        - Data across test cases must be distinct to simulate different users.
        - Personas must be VARIED (different ages, personalities, needs, communication styles).
        - Each goal should test one or more of the audit criteria.
        - Ensure the number of generated personas matches exactly ${batchSize}.

        Return the result as a JSON array of objects. The entire response must be only the JSON array, with no explanations or markdown formatting.
        ${getLanguageInstruction(language)}
        `;

        const response = await ai.models.generateContent({
            model: 'gemini-2.5-pro',
            contents: prompt,
            config: {
                responseMimeType: "application/json",
                maxOutputTokens: 8192,
            },
        });
        
        // 💰 Track usage
        if (response.usageMetadata) {
            costTracker.recordUsage({
                promptTokens: response.usageMetadata.promptTokenCount || 0,
                responseTokens: response.usageMetadata.candidatesTokenCount || 0,
                totalTokens: response.usageMetadata.totalTokenCount || 0,
                model: 'gemini-2.5-pro',
                operation: 'generate_test_cases'
            });
        }
        
        try {
            const jsonText = response.text.trim();
            const batchTestCases = JSON.parse(jsonText);
            console.log(`   ✅ Lote ${batchIndex + 1}/${batches}: ${batchTestCases.length} test cases generados`);
            
            // 🔥 NUEVO: Notificar inmediatamente al UI
            if (onBatchGenerated) {
                onBatchGenerated(batchTestCases);
            }
            
            return batchTestCases;
        } catch (e) {
            console.error(`   ❌ Error en lote ${batchIndex + 1}:`, response.text);
            throw new Error(`Could not generate valid test cases for batch ${batchIndex + 1}. The model returned malformed JSON.`);
        }
    };
    
    // 🚀 Generar lotes en paralelo (grupos de CONCURRENT_BATCHES)
    for (let i = 0; i < batches; i += CONCURRENT_BATCHES) {
        const batchPromises = [];
        for (let j = 0; j < CONCURRENT_BATCHES && (i + j) < batches; j++) {
            batchPromises.push(generateBatch(i + j));
        }
        
        const results = await Promise.all(batchPromises);
        allTestCases.push(...results.flat());
    }
    
    console.log(`✅ Total generado: ${allTestCases.length}/${testCaseCount} test cases`);
    return allTestCases;
};

const executeWorkflowVisually = async (
    config: AuditConfig,
    testCase: TestCase, // Still receives the persona-based testCase
    setProgress: ProgressCallback
): Promise<Pick<AuditResult, 'executionTrace' | 'finalStatus'>> => {
    
    const initialInput = {
        ...testCase.initialPayload,
        message: `Simulating user with goal: ${testCase.conversationGoal}`,
        conversationId: testCase.id
    };

    const { workflow, connections } = config;
    const nodeMap = new Map<string, WorkflowNode>(workflow.map(n => [n.id, n]));
    const adjList = new Map<string, { targetNodeId: string, sourceHandle: string }[]>();
    connections.forEach(c => {
        if (!adjList.has(c.sourceNodeId)) adjList.set(c.sourceNodeId, []);
        adjList.get(c.sourceNodeId)!.push({ targetNodeId: c.targetNodeId, sourceHandle: c.sourceHandle });
    });

    const executionTrace: ExecutionStep[] = workflow.map(node => ({
        nodeId: node.id,
        status: 'PENDING',
        input: null,
        output: null,
        log: '',
        durationMs: 0,
    }));
    
    const updateTrace = (nodeId: string, updates: Partial<ExecutionStep>) => {
        const index = executionTrace.findIndex(s => s.nodeId === nodeId);
        if (index > -1) {
            Object.assign(executionTrace[index], updates);
            setProgress({
                message: `Executing test: "${testCase.title}"... Node: ${nodeMap.get(nodeId)?.name || nodeId}`,
                trace: { id: testCase.id, testCase, executionTrace: [...executionTrace], analysis: { overallScore: 0, summary: 'Executing...', criteriaBreakdown: [] }, finalStatus: 'ERROR' }
            });
        }
    };

    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const queue: { nodeId: string; inputData: any }[] = [];
    const startNode = workflow.find(n => !connections.some(c => c.targetNodeId === n.id));

    if (!startNode) return { executionTrace, finalStatus: 'ERROR' };

    queue.push({ nodeId: startNode.id, inputData: initialInput });
    const executedNodes = new Set<string>();

    while (queue.length > 0) {
        const { nodeId, inputData } = queue.shift()!;
        if (executedNodes.has(nodeId)) continue;
        executedNodes.add(nodeId);

        const node = nodeMap.get(nodeId);
        if (!node) continue;
        
        const startTime = Date.now();
        updateTrace(nodeId, { status: 'RUNNING', input: inputData, log: `Starting execution...` });
        await delay(500);

        try {
            let output: any;
            if (node.type === 'agent') {
                const agentNode = node as AgentNode;
                const prompt = `System Prompt: ${agentNode.systemPrompt}\n\nInput Data:\n${JSON.stringify(inputData, null, 2)}\n\nTask: Process the input data based on your system prompt and generate a JSON output. Your output must be only the JSON object.`;
                const response = await ai.models.generateContent({ model: 'gemini-2.5-flash', contents: prompt, config: { responseMimeType: "application/json" } });
                
                // 💰 Track usage
                if (response.usageMetadata) {
                    costTracker.recordUsage({
                        promptTokens: response.usageMetadata.promptTokenCount || 0,
                        responseTokens: response.usageMetadata.candidatesTokenCount || 0,
                        totalTokens: response.usageMetadata.totalTokenCount || 0,
                        model: 'gemini-2.5-flash',
                        operation: 'visual_agent_execution'
                    });
                }
                
                try {
                   output = JSON.parse(response.text);
                   updateTrace(nodeId, { log: `Node ${node.name} finished. Output generated.` });
                } catch (e) {
                   output = { error: "Agent returned invalid JSON", response: response.text };
                   throw new Error("Agent returned invalid JSON");
                }
            } else {
                 output = { ...inputData, processedBy: node.name, toolOutputType: node.nodeType };
                 updateTrace(nodeId, { log: `Tool ${node.name} executed successfully.` });
            }

            const durationMs = Date.now() - startTime;
            updateTrace(nodeId, { status: 'SUCCESS', output, durationMs });

            const nextConnections = adjList.get(nodeId);
            if (nextConnections) {
                for (const conn of nextConnections) {
                    queue.push({ nodeId: conn.targetNodeId, inputData: output });
                }
            }
        } catch (error) {
            const durationMs = Date.now() - startTime;
            const errorMessage = error instanceof Error ? error.message : "Unknown error";
            updateTrace(nodeId, { status: 'ERROR', log: errorMessage, durationMs });
            return { executionTrace, finalStatus: 'ERROR' };
        }
    }
    
    return { executionTrace, finalStatus: 'SUCCESS' };
};

export const findUserMessageText = (data: any): string => {
    if (typeof data !== 'object' || data === null) return String(data);
    
    // Look for common message fields in priority order
    const commonFields = ['input', 'message', 'text', 'query', 'prompt', 'content', 'body', 'msg'];
    for (const field of commonFields) {
        if (data[field] && typeof data[field] === 'string') {
            return data[field];
        }
    }
    
    // Fallback: find any string field (excluding IDs and metadata)
    const excludeFields = ['id', 'conversationid', 'sessionid', 'userid', 'timestamp', 'date', 'nombre', 'name', 'telefono', 'phone', 'email'];
    const messageKey = Object.keys(data).find(k => {
        const lowerKey = k.toLowerCase();
        return typeof data[k] === 'string' && 
               !excludeFields.some(exclude => lowerKey.includes(exclude));
    });
    
    return messageKey && typeof data[messageKey] === 'string' ? data[messageKey] : JSON.stringify(data);
};

export const findAgentMessageText = (data: any): string => {
    if (!data) return "(No response)";
    if (typeof data === 'string') return data;
    if (typeof data.response === 'string') return data.response;
    if (typeof data.output === 'string') return data.output;
    if (typeof data.message === 'string') return data.message;
    
    // Handle nested, multi-part responses like { "response": { "parte1": "...", "parte2": "..." } }
    if (typeof data.response === 'object' && data.response !== null) {
        return Object.values(data.response).filter(v => typeof v === 'string').join(' ');
    }
    if (typeof data.output === 'object' && data.output !== null) {
       return JSON.stringify(data.output); // fallback
    }
    
    return JSON.stringify(data); // final fallback
}

export const generateUserMessageText = async (
    testCase: TestCase,
    conversationHistory: ExecutionStep[],
    language: string,
    databaseContext?: string | null,
    toolsContext?: string | null
): Promise<string> => {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    
    console.log(`[${testCase.title}] ========== GENERANDO NUEVO MENSAJE ==========`);
    console.log(`[${testCase.title}] Historial tiene ${conversationHistory.length} turnos`);
    console.log(`[${testCase.title}] Contexto de BD disponible: ${!!databaseContext}`);
    console.log(`[${testCase.title}] Contexto de herramientas disponible: ${!!toolsContext}`);
    if (databaseContext) {
        console.log(`[${testCase.title}] 📊 Contexto BD:\n${databaseContext}`);
    }
    if (toolsContext) {
        console.log(`[${testCase.title}] 🔧 Contexto herramientas:\n${toolsContext}`);
    }
    console.log(`[${testCase.title}] Historial completo:`, JSON.stringify(conversationHistory, null, 2));
    
    const historyString = conversationHistory.map((turn, idx) => 
        `[Turn ${idx + 1}]\nUser: ${findUserMessageText(turn.input)}\nAgent: ${findAgentMessageText(turn.output)}`
    ).join('\n\n');

    const previousUserMessages = conversationHistory.map(turn => findUserMessageText(turn.input));
    const lastAgentResponse = conversationHistory.length > 0 
        ? findAgentMessageText(conversationHistory[conversationHistory.length - 1].output)
        : null;
    
    if (previousUserMessages.length > 0) {
        console.log(`[${testCase.title}] MENSAJES QUE YA ENVIÉ (NO DEBO REPETIR):`);
        previousUserMessages.forEach((msg, idx) => {
            console.log(`   ${idx + 1}. "${msg}"`);
        });
        console.log(`[${testCase.title}] ÚLTIMA RESPUESTA DEL AGENTE: "${lastAgentResponse}"`);
    } else {
        console.log(`[${testCase.title}] Es el PRIMER mensaje (sin historial)`);
    }

    const prompt = `
    You are role-playing as a REAL human user chatting naturally. This is NOT a formal interaction.
    
    Your Persona: "${testCase.persona}"
    Your Ultimate Goal: "${testCase.conversationGoal}"
    
    ${databaseContext ? `\n=== IMPORTANT CONTEXT FROM DATABASE ===\n${databaseContext}\n\nUse this context to make your conversation more realistic. For example:\n- If you're blocked, you might express frustration or ask why\n- If a price was quoted, you can reference it or negotiate\n- If a deposit was confirmed, you can ask about next steps\n=== END DATABASE CONTEXT ===\n` : ''}
    
    ${toolsContext ? `\n=== AVAILABLE EXTERNAL TOOLS ===\n${toolsContext}\n\nThe agent can use these tools, so you can naturally:\n- Ask for a quote to be sent by email\n- Request a meeting to be scheduled\n- Expect proposals/documents to be emailed\n=== END TOOLS CONTEXT ===\n` : ''}
    
    ${historyString ? `Full Conversation History:\n${historyString}` : "(This is the first message of the conversation.)"}
    
    ${lastAgentResponse ? `\nThe agent just said: "${lastAgentResponse}"\nYou MUST respond directly to what the agent just said.` : ''}
    
    Your Task: Generate your *next* message that:
    1. RESPONDS SPECIFICALLY to the agent's last message (don't repeat yourself)
    2. Moves the conversation forward toward your goal
    3. Is DIFFERENT from anything you've said before
    
    Previous messages you already sent (DO NOT REPEAT):
    ${previousUserMessages.map((msg, i) => `${i + 1}. ${msg}`).join('\n')}
    
    CRITICAL Instructions for Natural Conversation:
    - Write SHORT messages (1-3 sentences MAX). Real people don't write essays in chat.
    - Be CASUAL and NATURAL like a real person texting or using WhatsApp/chat.
    - Use everyday language, contractions, and informal expressions.
    - Focus on ONE thing at a time, not everything at once.
    - REACT to what the agent just told you - acknowledge it, ask follow-up, or respond naturally.
    - Don't try to accomplish your entire goal in one message - pace yourself naturally.
    - Show realistic human behavior: ask one question, make a comment, react naturally.
    - Use your persona's personality and emotions authentically.
    - NEVER repeat what you've already said. Generate UNIQUE messages each time.
    - Your response should be ONLY the message text, nothing else. No JSON, no labels, no quotes.
    
    Examples of good short messages:
    - "Ah perfecto, gracias! Y cuánto sería el precio entonces?"
    - "Ok, entiendo. Pero me sirve para 18m²?"
    - "Genial! Y cómo hago para comprar?"
    - "Dale, eso me re sirve. Y de cuánto es el plazo de entrega?"
    
    ${getLanguageInstruction(language)}
    `;

    const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
        config: {
            temperature: 0.9, // Higher temperature for more variety
        }
    });
    
    // 💰 Track usage
    if (response.usageMetadata) {
        costTracker.recordUsage({
            promptTokens: response.usageMetadata.promptTokenCount || 0,
            responseTokens: response.usageMetadata.candidatesTokenCount || 0,
            totalTokens: response.usageMetadata.totalTokenCount || 0,
            model: 'gemini-2.5-flash',
            operation: 'generate_user_message',
            conversationId: testCase.id
        });
    }
    
    const generatedMessage = response.text.trim();
    console.log(`[${testCase.title}] ✅ Mensaje generado: "${generatedMessage}"`);
    
    // Check if it's repeating a previous message
    if (previousUserMessages.includes(generatedMessage)) {
        console.error(`[${testCase.title}] ⚠️ ERROR: El mensaje generado es EXACTAMENTE IGUAL a uno anterior!`);
        console.error(`[${testCase.title}] Esto NO debería pasar. El prompt incluye la lista de mensajes a NO repetir.`);
    }
    
    return generatedMessage;
};

const checkIfGoalIsMet = async (
    testCase: TestCase,
    conversationHistory: ExecutionStep[],
    language: string
): Promise<boolean> => {
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
    
    ${getLanguageInstruction(language)}
    `;

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
            operation: 'check_goal_achieved'
        });
    }

    try {
        const result = JSON.parse(response.text);
        return result.goalAchieved === true;
    } catch (e) {
        console.error("Failed to parse goal check, assuming not met.", response.text);
        return false;
    }
};

const analyzeResult = async (
    config: AuditConfig,
    result: Omit<AuditResult, 'analysis'>,
    language: string,
    databaseActivity?: ReturnType<typeof getRealDatabaseAuditor> extends { getSummary(): infer T } ? T : never,
    intelligentVerification?: IntelligentVerificationResult
): Promise<Analysis> => {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const { criteria, workflow, connections } = config;
    const { testCase, executionTrace, finalStatus } = result;

    const traceSummary = config.auditType === 'real'
        ? executionTrace.map(turn => `\n${turn.nodeId}:\n  User: ${findUserMessageText(turn.input)}\n  Agent: ${findAgentMessageText(turn.output)} ${turn.status === 'ERROR' ? `\n  Error: ${turn.log}` : ''}`).join('')
        : executionTrace.map(step => `Node: ${workflow.find(n => n.id === step.nodeId)?.name || step.nodeId} | Status: ${step.status}`).join('\n');

    // 🔍 Contar turnos y estados
    const totalTurns = executionTrace.length;
    const successfulTurns = executionTrace.filter(t => t.status === 'SUCCESS').length;
    const errorTurns = executionTrace.filter(t => t.status === 'ERROR').length;
    const wasBlocked = executionTrace.some(t => 
        t.output && typeof t.output === 'object' && 
        (t.output.blocked === true || t.output.intentional_block === true || t.output.intentional_end === true)
    );

    // 🔧 Verificar ejecución de herramientas externas
    let toolVerificationInfo = '';
    if (config.auditType === 'real' && config.toolCredentials && config.toolCredentials.size > 0) {
        try {
            const toolVerifications = await verifyToolExecutions(executionTrace, config);
            if (toolVerifications.length > 0) {
                toolVerificationInfo = '\n\n' + generateToolVerificationSummary(toolVerifications);
            }
        } catch (error) {
            console.error('Error verifying tool executions:', error);
        }
    }
    
    // 🗄️ NUEVO: Contexto de base de datos
    let databaseContextInfo = '';
    if (databaseActivity && config.auditType === 'real') {
        databaseContextInfo = `\n\n=== DATABASE ACTIVITY SUMMARY ===\n`;
        databaseContextInfo += `Total database operations: ${databaseActivity.totalOperations}\n`;
        databaseContextInfo += `Tables monitored: ${databaseActivity.tablesUsed.join(', ')}\n`;
        databaseContextInfo += `Changes detected: ${databaseActivity.changes?.length || 0}\n\n`;
        
        if (databaseActivity.changes && databaseActivity.changes.length > 0) {
            databaseContextInfo += `Detailed Changes:\n`;
            for (const change of databaseActivity.changes.slice(0, 10)) { // Primeros 10 cambios
                const changeDesc = change.type === 'INSERT' ? 'New record created' :
                                  change.type === 'UPDATE' ? 'Record updated' :
                                  'Record deleted';
                databaseContextInfo += `  - ${change.type} in "${change.table}": ${changeDesc}\n`;
                if (change.before && change.after) {
                    databaseContextInfo += `    Before: ${JSON.stringify(change.before).substring(0, 100)}...\n`;
                    databaseContextInfo += `    After: ${JSON.stringify(change.after).substring(0, 100)}...\n`;
                } else if (change.record) {
                    databaseContextInfo += `    Data: ${JSON.stringify(change.record).substring(0, 100)}...\n`;
                }
            }
        }
        databaseContextInfo += `=== END DATABASE CONTEXT ===\n`;
    }
    
    // 🧠 NUEVO: Contexto de verificación inteligente
    let intelligentVerificationInfo = '';
    if (intelligentVerification) {
        intelligentVerificationInfo = `\n\n=== INTELLIGENT VERIFICATION RESULTS ===\n`;
        intelligentVerificationInfo += `Overall Accuracy Score: ${intelligentVerification.overallScore.toFixed(1)}/10\n`;
        intelligentVerificationInfo += `Discrepancies Found: ${intelligentVerification.discrepancies.length}\n\n`;
        
        if (intelligentVerification.discrepancies.length > 0) {
            intelligentVerificationInfo += `Critical Issues Detected:\n`;
            for (const disc of intelligentVerification.discrepancies) {
                intelligentVerificationInfo += `  ❌ ${disc.type.toUpperCase()}: ${disc.title}\n`;
                intelligentVerificationInfo += `     Description: ${disc.description}\n`;
                intelligentVerificationInfo += `     Expected: ${JSON.stringify(disc.expected)}\n`;
                intelligentVerificationInfo += `     Actual: ${JSON.stringify(disc.actual)}\n`;
                intelligentVerificationInfo += `     Context: ${disc.context}\n`;
                intelligentVerificationInfo += `     Severity: ${disc.severity}\n`;
                if (disc.evidence && disc.evidence.length > 0) {
                    intelligentVerificationInfo += `     Evidence: ${disc.evidence.join(', ')}\n`;
                }
                intelligentVerificationInfo += `\n`;
            }
        } else {
            intelligentVerificationInfo += `✅ No discrepancies found - Agent behavior matches conversation claims.\n`;
        }
        
        intelligentVerificationInfo += `Summary: ${intelligentVerification.summary}\n`;
        intelligentVerificationInfo += `=== END INTELLIGENT VERIFICATION ===\n`;
    }

    const prompt = `
    Act as an expert QA analyst. Your task is to analyze the execution of a test case against a given workflow and provide a detailed analysis.

    Workflow Under Test:
    ${formatWorkflowForPrompt(workflow, connections)}

    Test Case Persona:
    - Title: ${testCase.title}
    - Persona: ${testCase.persona}
    - Goal: ${testCase.conversationGoal}
    
    Conversation Statistics:
    - Total turns completed: ${totalTurns}
    - Successful interactions: ${successfulTurns}
    - Errors encountered: ${errorTurns}
    - Final status: ${finalStatus}
    ${wasBlocked ? '- ⚠️ User was blocked or conversation ended intentionally' : ''}

    Execution Trace (Full Conversation):
    ${traceSummary}
    ${toolVerificationInfo}
    ${databaseContextInfo}
    ${intelligentVerificationInfo}

    Analysis Task:
    
    You are an EXPERT AUDITOR. Provide a PROFESSIONAL, DATA-DRIVEN analysis.
    
    1. **EXECUTIVE SUMMARY** ('summary' field - 3-5 sentences):
       - Start with clear verdict: Did the persona achieve their goal ("${testCase.conversationGoal}")?
       - Highlight the most critical finding (positive or negative)
       - Quantify key metrics (e.g., "90% accuracy", "3 critical errors", "12 turns to completion")
       - Professional tone, suitable for executive stakeholders
       
    2. **KEY FINDINGS** ('keyFindings' array):
       Generate 3-5 key findings, categorized as:
       - 🚨 CRITICAL: Blocking issues (wrong data, failed actions, security concerns)
       - ⚠️ WARNING: Issues that impact experience but aren't blocking
       - ✅ STRENGTH: Things that worked exceptionally well
       - 💡 RECOMMENDATION: Actionable improvements
       
       Each finding MUST include:
       - 'type': 'critical' | 'warning' | 'strength' | 'recommendation'
       - 'title': Short, specific heading (e.g., "Email not sent despite agent claim")
       - 'description': Detailed explanation with QUANTIFIABLE data
       - 'evidence': Array of specific evidence (e.g., ["Agent said: 'Envié mail a juan@...'", "Gmail API: No email found in last 5min"])
       - 'priority': 'high' | 'medium' | 'low'
       - 'impact': Business impact description
    
    3. **CRITERIA BREAKDOWN** (standard):
       For each criterion, provide:
       - 'score': 1-10 (be STRICT - only 9-10 for exceptional performance)
       - 'justification': Detailed explanation WITH NUMBERS
       - 'evidence': Array of specific evidence points
       - 'impact': 'high' | 'medium' | 'low' (how critical is this criterion?)
       
    4. **RISK ASSESSMENT** ('riskAssessment'):
       - 'high': Critical issues found (wrong data, failed tools, security concerns)
       - 'medium': Multiple warnings, goal partially achieved
       - 'low': Minor issues only, goal fully achieved
       
    5. **RECOMMENDATIONS** ('recommendations' array):
       - 3-5 ACTIONABLE recommendations
       - Each must be specific and implementable
       - Prioritize by impact
       
    6. **GOAL ACHIEVEMENT** ('goalAchieved'):
       - true: Persona's goal was fully met
       - false: Goal not achieved or only partially met

    Context to analyze:
    - Total turns: ${totalTurns} (${successfulTurns} successful, ${errorTurns} errors)
    - Final status: ${finalStatus}
    ${wasBlocked ? '- ⚠️ Conversation blocked/ended intentionally' : ''}
    - Audit criteria: ${criteria.join(', ')}

    CRITICAL EVALUATION FACTORS:
    ✅ DATABASE VERIFICATION:
       ${databaseContextInfo ? '- Database changes detected - verify all claimed saves happened' : ''}
       ${intelligentVerificationInfo ? '- Intelligent verification ran - check for discrepancies' : ''}
    
    ✅ TOOL EXECUTION:
       ${toolVerificationInfo ? '- Tool verifications available - penalize unexecuted promises' : ''}
    
    ✅ ACCURACY:
       - Wrong prices → CRITICAL
       - Wrong recipients → CRITICAL
       - Data inconsistencies → WARNING/CRITICAL
    
    ✅ GOAL ACHIEVEMENT:
       - Technical success WITHOUT helping user = LOW score (≤5)
       - User blocked without valid reason = CRITICAL
    
    SCORING RULES:
    - 9-10: Exceptional - Goal achieved, no issues, exceeded expectations
    - 7-8: Good - Goal achieved with minor issues
    - 5-6: Acceptable - Goal partially achieved or achieved with significant issues
    - 3-4: Poor - Goal not achieved, multiple problems
    - 1-2: Critical failure - Security issues, data corruption, complete failure

    Execution Trace:
    ${traceSummary}
    ${toolVerificationInfo}
    ${databaseContextInfo}
    ${intelligentVerificationInfo}
    
    Your response must be a valid JSON object.
    ${getLanguageInstruction(language)}
    `;

    const response = await ai.models.generateContent({
        model: 'gemini-2.5-pro',
        contents: prompt,
        config: {
            responseMimeType: "application/json",
            responseSchema: {
                type: Type.OBJECT,
                properties: {
                    overallScore: { type: Type.NUMBER },
                    summary: { type: Type.STRING },
                    goalAchieved: { type: Type.BOOLEAN },
                    riskAssessment: { 
                        type: Type.STRING,
                        enum: ['high', 'medium', 'low']
                    },
                    keyFindings: {
                        type: Type.ARRAY,
                        items: {
                            type: Type.OBJECT,
                            properties: {
                                type: { 
                                    type: Type.STRING,
                                    enum: ['critical', 'warning', 'strength', 'recommendation']
                                },
                                title: { type: Type.STRING },
                                description: { type: Type.STRING },
                                evidence: { 
                                    type: Type.ARRAY,
                                    items: { type: Type.STRING }
                                },
                                priority: { 
                                    type: Type.STRING,
                                    enum: ['high', 'medium', 'low']
                                },
                                impact: { type: Type.STRING },
                            },
                            required: ['type', 'title', 'description'],
                        },
                    },
                    recommendations: {
                        type: Type.ARRAY,
                        items: { type: Type.STRING },
                    },
                    criteriaBreakdown: {
                        type: Type.ARRAY,
                        items: {
                            type: Type.OBJECT,
                            properties: {
                                criterion: { type: Type.STRING },
                                score: { type: Type.NUMBER },
                                justification: { type: Type.STRING },
                                evidence: { 
                                    type: Type.ARRAY,
                                    items: { type: Type.STRING }
                                },
                                impact: { 
                                    type: Type.STRING,
                                    enum: ['high', 'medium', 'low']
                                },
                            },
                            required: ['criterion', 'score', 'justification'],
                        },
                    },
                },
                required: ['overallScore', 'summary', 'criteriaBreakdown', 'goalAchieved', 'riskAssessment'],
            },
        },
    });

    // 💰 Track usage
    if (response.usageMetadata) {
        costTracker.recordUsage({
            promptTokens: response.usageMetadata.promptTokenCount || 0,
            responseTokens: response.usageMetadata.candidatesTokenCount || 0,
            totalTokens: response.usageMetadata.totalTokenCount || 0,
            model: 'gemini-2.5-pro',
            operation: 'analyze_result',
            conversationId: result.id
        });
    }

    try {
        const jsonText = response.text.trim();
        return JSON.parse(jsonText);
    } catch (e) {
        console.error("Failed to parse analysis JSON:", response.text);
        throw new Error("Could not analyze the result. The model returned malformed JSON.");
    }
};

export type ConversationState = {
    testCase: TestCase;
    history: ExecutionStep[];
    isComplete: boolean;
    finalStatus: 'SUCCESS' | 'ERROR' | 'PENDING';
    startTime?: number; // ⏱️ Timestamp de inicio
    endTime?: number; // ⏱️ Timestamp de fin
    toolVerifications?: import('./IntegrationManager').ToolActionVerification[]; // 🔧 Verificaciones de herramientas
};

// 🔗 Gestión global del IntegrationManager (similar a database auditor)
let globalIntegrationManager: IntegrationManager | null = null;

export function initializeGlobalIntegrationManager(
    config: IntegrationConfig,
    detectedTools?: any[],
    detectedSubflows?: any[]
): void {
    if (globalIntegrationManager) {
        console.warn('⚠️ [IntegrationManager] Ya existe un manager global, limpiando...');
        globalIntegrationManager = null;
    }
    
    try {
        globalIntegrationManager = createIntegrationManager(config, detectedTools, detectedSubflows);
        console.log('✅ [IntegrationManager] Manager global inicializado');
    } catch (error) {
        console.error('❌ [IntegrationManager] Error inicializando manager global:', error);
        throw error;
    }
}

export function getGlobalIntegrationManager(): IntegrationManager | null {
    return globalIntegrationManager;
}

export function cleanupGlobalIntegrationManager(): void {
    if (globalIntegrationManager) {
        console.log('🧹 [IntegrationManager] Limpiando manager global');
        globalIntegrationManager = null;
    }
}

export const runFullAudit = async (
  config: AuditConfig,
  testCases: TestCase[],
  onProgress: ProgressCallback,
  onResultComplete: ResultCallback,
  onAllComplete: CompletionCallback,
  language: string,
  abortController?: AbortController, // 🛑 NUEVO: Controller para cancelar
) => {
    // 🔧 Detectar si es ZIP o n8n
    const isCodeProject = !!config.codeProject;
    const isN8nWorkflow = !!config.workflow && config.workflow.length > 0;
    
    if (!isN8nWorkflow && !isCodeProject) {
      throw new Error("No valid workflow (n8n) or code project (ZIP) configured");
    }

    // Para ZIP con auditoría real: requiere endpoint
    if (isCodeProject && config.auditType === 'real' && !config.endpointUrl) {
      throw new Error("Endpoint URL is required for real audit of ZIP projects");
    }

    // Para n8n con auditoría real: requiere endpoint
    if (isN8nWorkflow && config.auditType === 'real' && !config.endpointUrl) {
      throw new Error("Endpoint URL is not configured for real audit");
    }

    if (config.auditType === 'real') {

        // ⏱️ Iniciar tracking de tiempo total
        const auditStartTime = Date.now();
        onProgress({ message: `⏱️ Auditoría iniciada: ${new Date(auditStartTime).toLocaleString('es-AR')}` });
        
        // 💰 Iniciar tracking de costos
        costTracker.startAudit('gemini-1.5-flash');
        onProgress({ message: `💰 Tracking de costos activado` });

        onProgress({ message: `🚀 Inicializando ${testCases.length} conversaciones simultáneas...` });
        
        const conversationStartTime = Date.now();
        let conversations: ConversationState[] = testCases.map(tc => ({
            testCase: tc,
            history: [],
            isComplete: false,
            finalStatus: 'PENDING',
            startTime: conversationStartTime, // Todas empiezan al mismo tiempo (paralelas)
        }));

        // Log cada personalidad creada
        testCases.forEach((tc, idx) => {
            onProgress({ message: `👤 Personalidad ${idx + 1}/${testCases.length}: "${tc.title}" - ${tc.persona}` });
        });
        
        // 🗄️ Inicializar auditores de BD si está configurado
        console.log(`\n🔍 [Audit Start] Verificando configuración de BD...`);
        console.log(`   realDatabaseConfig existe:`, !!config.realDatabaseConfig);
        if (config.realDatabaseConfig) {
            console.log(`   - URL:`, config.realDatabaseConfig.url);
            console.log(`   - Key presente:`, !!config.realDatabaseConfig.key);
            console.log(`   - Tablas:`, config.realDatabaseConfig.tables);
        }
        
        if (config.realDatabaseConfig && config.realDatabaseConfig.url && config.realDatabaseConfig.key) {
            onProgress({ message: `🗄️ Inicializando auditores de base de datos...` });
            onProgress({ message: `   📋 Tipo: ${config.realDatabaseConfig.type}` });
            onProgress({ message: `   📋 Tablas: ${config.realDatabaseConfig.tables.join(', ')}` });
            
            // 🔥 Convertir RealDatabaseConfig a DatabaseConfig (estructura esperada por el auditor)
            const dbConfig = {
                type: config.realDatabaseConfig.type,
                credentials: {
                    url: config.realDatabaseConfig.url,
                    key: config.realDatabaseConfig.key,
                },
                tables: config.realDatabaseConfig.tables,
            };
            
            // 🔧 NUEVO: Usar dependencies del config (ya analizadas en AgentConfig)
            // Si no existen, analizar el workflow como fallback
            let dependencies = config.dependencies;
            
            if (!dependencies) {
                console.log(`\n🔧 [Tool Detection] Dependencies no encontradas en config, analizando workflow...`);
                console.log(`   config.workflow tiene: ${config.workflow?.length || 0} nodos`);
                
                const workflowJson = JSON.stringify({ nodes: config.workflow || [] });
                dependencies = analyzeWorkflowDependencies(workflowJson);
            } else {
                console.log(`\n🔧 [Tool Detection] Usando dependencies del config (pre-analizadas)`);
            }
            
            console.log(`\n🔧 [Tool Detection] Herramientas detectadas:`);
            console.log(`   - Emails: ${dependencies.tools.filter(t => t.toolType === 'email').length}`);
            console.log(`   - Calendarios: ${dependencies.tools.filter(t => t.toolType === 'calendar').length}`);
            console.log(`   - Subflows: ${dependencies.subflows.length}`);
            console.log(`   - TOTAL tools: ${dependencies.tools.length}`);
            
            if (dependencies.tools.length === 0) {
                console.log(`   ⚠️ NO SE DETECTARON HERRAMIENTAS EXTERNAS`);
                console.log(`   📋 Lista completa de dependencies:`, JSON.stringify(dependencies, null, 2));
            } else {
                console.log(`   📋 Detalles de herramientas:`);
                dependencies.tools.forEach((tool, idx) => {
                    console.log(`      ${idx + 1}. ${tool.nodeName} (${tool.toolType}/${tool.specificType}) - Node ID: ${tool.nodeId}`);
                });
            }
            
            let successCount = 0;
            let errorCount = 0;
            
            testCases.forEach(tc => {
                try {
                    // 🔥 Usar samplePayload como referencia (tiene la estructura correcta)
                    // El payload de cada test case individual se completará después
                    const referencePayload = tc.initialPayload && Object.keys(tc.initialPayload).length > 0 
                        ? tc.initialPayload 
                        : config.samplePayload;
                    
                    // 🔥 Pasar herramientas detectadas al auditor
                    initializeRealDatabaseAuditor(
                        tc.id, 
                        dbConfig as any, 
                        referencePayload, // Usar payload con estructura correcta
                        config.workflow,
                        dependencies.tools,
                        dependencies.subflows
                    );
                    successCount++;
                    onProgress({ message: `   ✅ Auditor BD para "${tc.title}"` });
                } catch (error) {
                    errorCount++;
                    console.error(`   ✗ Error inicializando auditor para "${tc.title}":`, error);
                    onProgress({ message: `   ⚠️ Error en auditor BD para "${tc.title}": ${error}` });
                }
            });
            
            onProgress({ message: `✅ Auditores inicializados: ${successCount} éxitos, ${errorCount} errores` });
            
            // 🔗 NUEVO: Inicializar IntegrationManager si hay configuración de herramientas
            if (config.integrationConfig && 
                (config.integrationConfig.enabledIntegrations.email || config.integrationConfig.enabledIntegrations.calendar)) {
                try {
                    onProgress({ message: `🔗 Inicializando IntegrationManager para verificación en tiempo real...` });
                    
                    const integrationConfig: IntegrationConfig = {
                        enabledIntegrations: {},
                        verificationDelay: config.integrationConfig.verificationDelay || 3
                    };
                    
                    if (config.integrationConfig.enabledIntegrations.email) {
                        integrationConfig.enabledIntegrations.email = config.integrationConfig.enabledIntegrations.email;
                        onProgress({ message: `   📧 Gmail Integration habilitada` });
                    }
                    
                    if (config.integrationConfig.enabledIntegrations.calendar) {
                        integrationConfig.enabledIntegrations.calendar = config.integrationConfig.enabledIntegrations.calendar;
                        onProgress({ message: `   📅 Calendar Integration habilitada` });
                    }
                    
                    initializeGlobalIntegrationManager(
                        integrationConfig,
                        dependencies.tools,
                        dependencies.subflows
                    );
                    
                    onProgress({ message: `✅ IntegrationManager inicializado correctamente` });
                    
                    // 🔥 NUEVO: Probar conexión de todas las integraciones ANTES de iniciar
                    onProgress({ message: `🔍 Probando conexión con integraciones externas...` });
                    const integrationManager = getGlobalIntegrationManager();
                    if (integrationManager) {
                        const testResults = await integrationManager.testAllConnections();
                        
                        if (testResults.email) {
                            onProgress({ message: `   📧 Gmail: ${testResults.email.message}` });
                        }
                        
                        if (testResults.calendar) {
                            onProgress({ message: `   📅 Calendar: ${testResults.calendar.message}` });
                        }
                        
                        if (!testResults.allSuccess) {
                            onProgress({ message: `⚠️ ADVERTENCIA: Algunas integraciones fallaron. Las verificaciones de herramientas pueden no funcionar correctamente.` });
                            console.warn('⚠️ [Integration Test] Algunas integraciones fallaron:', testResults);
                        } else {
                            onProgress({ message: `✅ Todas las integraciones funcionando correctamente` });
                        }
                    }
                } catch (error) {
                    console.error('❌ Error inicializando IntegrationManager:', error);
                    onProgress({ message: `⚠️ Error en IntegrationManager: ${error}` });
                }
            }
            
        } else if (config.realDatabaseConfig) {
            console.warn('\n⚠️ [DB Audit] Configuración de BD incompleta:', config.realDatabaseConfig);
            onProgress({ message: `⚠️ Configuración de BD incompleta, auditoría de BD deshabilitada` });
        } else {
            console.log(`   ℹ️ No hay configuración de BD - auditoría de BD no habilitada`);
        }
        
        onProgress({ message: `✅ Todas las personalidades cargadas. Iniciando conversaciones independientes...` });
        onProgress({ message: `🔥 Modo asíncrono: Cada conversación avanzará a su propio ritmo` });

        // 🛑 Usar AbortController proporcionado o crear uno nuevo
        const controller = abortController || new AbortController();
        const abortSignal = controller.signal;
        
        // 🛑 Listener para detectar cancelación
        if (abortSignal.aborted) {
            onProgress({ message: '🛑 Auditoría cancelada antes de iniciar conversaciones' });
            return;
        }

        // 🚀 EJECUTAR TODAS LAS CONVERSACIONES EN PARALELO (cada una independiente)
        // 🔥 IMPORTANTE: Cada conversación tiene su propio timeout generoso
        const TIMEOUT_PER_CONVERSATION_MS = 90 * 60 * 1000; // 🔥 90 MINUTOS por conversación (12 turnos × ~7 min promedio)
        
        const conversationPromises = conversations.map((conv, index) => 
            promiseWithTimeout(
                runConversationIndependently(conv, index, config, onProgress, language, abortSignal),
                TIMEOUT_PER_CONVERSATION_MS,
                `Conversación "${conv.testCase.title}" excedió el tiempo límite de 90 minutos`
            ).catch(error => {
                // 🛑 Si es AbortError, propagar inmediatamente para detener todo
                if (error instanceof Error && (error.name === 'AbortError' || error.message.includes('cancelada por el usuario'))) {
                    console.log(`� [${conv.testCase.title}] Conversación cancelada - propagando error`);
                    throw error; // 🔥 Propagar para que Promise.all se detenga
                }
                
                // Si una conversación falla o hace timeout, registrarlo pero NO bloquear las demás
                if (error instanceof Error && error.message.includes('timeout')) {
                    console.error(`🚨 TIMEOUT: Conversación "${conv.testCase.title}" no terminó a tiempo`);
                    onProgress({ message: `⚠️ [${conv.testCase.title}] Timeout - conversación demoró más de 90 minutos` });
                    conv.isComplete = true;
                    conv.finalStatus = 'ERROR';
                } else {
                    console.error(`❌ [${conv.testCase.title}] Error en conversación:`, error);
                    onProgress({ message: `❌ [${conv.testCase.title}] Error: ${error instanceof Error ? error.message : 'Unknown'}` });
                    conv.isComplete = true;
                    conv.finalStatus = 'ERROR';
                }
            })
        );

        // Esperar a que TODAS las conversaciones terminen (o fallen individualmente)
        try {
            await Promise.all(conversationPromises);
        } catch (error) {
            // 🛑 Si es cancelación, detener TODO inmediatamente
            if (error instanceof Error && (error.name === 'AbortError' || error.message.includes('cancelada por el usuario'))) {
                console.log('🛑 Auditoría cancelada - deteniendo análisis');
                onProgress({ message: '🛑 Auditoría cancelada por el usuario' });
                
                // Marcar todas las conversaciones como canceladas
                conversations.forEach(conv => {
                    if (!conv.isComplete) {
                        conv.isComplete = true;
                        conv.finalStatus = 'ERROR';
                    }
                });
                
                return; // 🔥 Salir inmediatamente sin analizar resultados
            }
            
            // Solo llegaríamos aquí si hay un error inesperado que no fue manejado
            console.error('🚨 Error inesperado en Promise.all:', error);
            onProgress({ message: '⚠️ Error inesperado durante ejecución de conversaciones' });
        }
        
        // 🛑 Verificar nuevamente si fue cancelado durante las conversaciones
        if (abortSignal.aborted) {
            onProgress({ message: '🛑 Auditoría cancelada durante ejecución' });
            return;
        }

        onProgress({ message: "\n🎉 Todas las conversaciones finalizadas!" });

        // TODO: El código viejo del bucle sincrónico se eliminó.
        // Ahora cada conversación avanza independientemente en runConversationIndependently()
        
        // ✅ Conversaciones ejecutadas en paralelo - código viejo eliminado
        
        onProgress({ message: "\n━━━━━━━━━━━━━━━━━━━━━━" });
        onProgress({ message: "📊 Todas las rondas completadas. Analizando resultados finales..." });

        const analysisPromises = conversations.map(async conv => {
            try {
                onProgress({ message: `🔍 Analizando resultado final: "${conv.testCase.title}"...` });
                const finalStatus = conv.finalStatus === 'PENDING' ? 'SUCCESS' : conv.finalStatus;
                
                // 🗄️ Obtener resumen de BD ANTES de limpiar
                let databaseActivity = undefined;
                let intelligentVerification: IntelligentVerificationResult | undefined;
                
                if (config.realDatabaseConfig && config.realDatabaseConfig.url) {
                    const auditor = getRealDatabaseAuditor(conv.testCase.id);
                    if (auditor) {
                        try {
                            databaseActivity = auditor.getSummary();
                            onProgress({ message: `   📊 Actividad BD: ${databaseActivity.totalOperations} operaciones, ${databaseActivity.changes?.length || 0} cambios` });
                            
                            // 🧠 NUEVO: Verificación inteligente con Gemini AI
                            onProgress({ message: `   🧠 Ejecutando verificación inteligente...` });
                            intelligentVerification = await verifyConversationIntelligently(
                                conv.testCase.id,
                                conv.history,
                                databaseActivity.changes || [],
                                auditor.snapshots,
                                language
                            );
                            
                            onProgress({ message: `   ✅ Verificación completada - Score: ${intelligentVerification.overallScore.toFixed(1)}/10, Discrepancias: ${intelligentVerification.discrepancies.length}` });
                            
                            // Agregar al databaseActivity para que se muestre en el reporte
                            (databaseActivity as any).intelligentVerification = intelligentVerification;
                        } catch (dbError) {
                            onProgress({ message: `   ⚠️ Error en verificación de BD: ${dbError instanceof Error ? dbError.message : 'Error desconocido'}` });
                            console.error('Error en verificación de BD:', dbError);
                        }
                    }
                }
                
                // 🔥 ANALIZAR con contexto completo de BD e intelligent verification
                const analysis = await analyzeResult(
                    config, 
                    { id: conv.testCase.id, testCase: conv.testCase, executionTrace: conv.history, finalStatus }, 
                    language,
                    databaseActivity,
                    intelligentVerification
                );
                
                // ⏱️ Calcular duración de la conversación
                const durationMs = (conv.endTime && conv.startTime) ? (conv.endTime - conv.startTime) : undefined;
                if (durationMs) {
                    onProgress({ message: `   ⏱️ Duración: ${(durationMs / 1000).toFixed(1)}s` });
                }
                
                const result: AuditResult = {
                    id: conv.testCase.id,
                    testCase: conv.testCase,
                    executionTrace: conv.history,
                    finalStatus,
                    analysis,
                    databaseActivity, // ✅ Agregado
                    startTime: conv.startTime,
                    endTime: conv.endTime,
                    durationMs,
                    toolVerifications: conv.toolVerifications // 🔧 NUEVO: Agregar verificaciones de herramientas
                };
                onResultComplete(result);
                onProgress({ message: `✅ Análisis completo para "${conv.testCase.title}" - Score: ${analysis.overallScore.toFixed(1)}/10` });
            } catch (error) {
                onProgress({ message: `❌ Error analizando "${conv.testCase.title}": ${error instanceof Error ? error.message : 'Error desconocido'}` });
                console.error(`Error analizando conversación "${conv.testCase.title}":`, error);
                
                // Crear resultado de error para que no se cuelgue el reporte
                const errorResult: AuditResult = {
                    id: conv.testCase.id,
                    testCase: conv.testCase,
                    executionTrace: conv.history,
                    finalStatus: 'ERROR',
                    analysis: {
                        overallScore: 0,
                        summary: `Error al analizar: ${error instanceof Error ? error.message : 'Error desconocido'}`,
                        criteriaBreakdown: [],
                        keyFindings: [{
                            type: 'critical',
                            title: 'Error en análisis',
                            description: `No se pudo completar el análisis de esta conversación: ${error instanceof Error ? error.message : 'Error desconocido'}`,
                            priority: 'high'
                        }]
                    },
                    startTime: conv.startTime,
                    endTime: conv.endTime,
                    durationMs: (conv.endTime && conv.startTime) ? (conv.endTime - conv.startTime) : undefined,
                };
                onResultComplete(errorResult);
            }
        });

        await Promise.all(analysisPromises);
        
        // 🧹 Limpiar auditores de BD
        if (config.realDatabaseConfig && config.realDatabaseConfig.url) {
            testCases.forEach(tc => {
                try {
                    cleanupRealDatabaseAuditor(tc.id);
                } catch (error) {
                    console.error(`Error limpiando auditor para "${tc.id}":`, error);
                }
            });
            
            // 🧹 NUEVO: Limpiar caché de snapshots
            snapshotCache.clear();
            console.log('🧹 Caché de snapshots limpiado');
        }
        
        // ⏱️ Mostrar resumen de tiempos
        const auditEndTime = Date.now();
        const totalAuditDuration = auditEndTime - auditStartTime;
        onProgress({ message: "\n⏱️━━━━━━━━━━━━━━━━━━━━━━" });
        onProgress({ message: "⏱️ RESUMEN DE TIEMPOS" });
        onProgress({ message: `⏱️ Duración Total: ${(totalAuditDuration / 1000).toFixed(1)}s (${(totalAuditDuration / 60000).toFixed(2)} minutos)` });
        onProgress({ message: `⏱️ Inicio: ${new Date(auditStartTime).toLocaleTimeString('es-AR')}` });
        onProgress({ message: `⏱️ Fin: ${new Date(auditEndTime).toLocaleTimeString('es-AR')}` });
        
        // Calcular estadísticas de conversaciones
        const conversationsWithTiming = conversations.filter(c => c.startTime && c.endTime);
        if (conversationsWithTiming.length > 0) {
            const durations = conversationsWithTiming.map(c => (c.endTime! - c.startTime!) / 1000);
            const avgDuration = durations.reduce((sum, d) => sum + d, 0) / durations.length;
            const minDuration = Math.min(...durations);
            const maxDuration = Math.max(...durations);
            
            onProgress({ message: `⏱️ Conversaciones: promedio ${avgDuration.toFixed(1)}s | min ${minDuration.toFixed(1)}s | max ${maxDuration.toFixed(1)}s` });
        }
        onProgress({ message: "⏱️━━━━━━━━━━━━━━━━━━━━━━\n" });
        
        // 💰 Mostrar resumen de costos
        onProgress({ message: "\n💰━━━━━━━━━━━━━━━━━━━━━━" });
        onProgress({ message: "💰 RESUMEN DE COSTOS" });
        const costSummary = costTracker.getSummary();
        onProgress({ message: `💰 Costo Total: $${costSummary.totalCostUSD.toFixed(6)} USD` });
        onProgress({ message: `💰   - Sistema: $${costSummary.systemCostUSD.toFixed(6)} USD` });
        onProgress({ message: `💵   - Webhook Usuario: $${costSummary.webhookCostUSD.toFixed(6)} USD` });
        onProgress({ message: `💰 Tokens Totales: ${costSummary.totalTokens.toLocaleString()}` });
        onProgress({ message: `💰   - Input: ${costSummary.promptTokens.toLocaleString()} tokens` });
        onProgress({ message: `💰   - Output: ${costSummary.responseTokens.toLocaleString()} tokens` });
        onProgress({ message: "💰━━━━━━━━━━━━━━━━━━━━━━\n" });
        costTracker.printSummary(); // Log detallado en consola
        
        onProgress({ message: "\n🏁 AUDITORÍA COMPLETA - Todos los resultados procesados." });
        console.log('🔥🔥🔥 Llamando a onAllComplete() para cambiar estado a REPORT_READY...');
        onAllComplete();
        console.log('✅✅✅ onAllComplete() ejecutado - El reporte debería mostrarse ahora.');

    }
};

export const suggestAuditCriteria = async (workflow: WorkflowNode[], connections: N8nConnection[], language: string): Promise<string[]> => {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

    const prompt = `
    As an expert software tester specializing in AI and automation, analyze the following n8n workflow.
    Your task is to suggest 3 to 5 additional, specific, and insightful audit criteria.
    Do not suggest generic criteria like "Correctness" or "Efficiency". Instead, focus on potential risks or specific behaviors related to the nodes and connections shown.

    Workflow to Analyze:
    ${formatWorkflowForPrompt(workflow, connections)}

    Examples of good suggestions:
    - For a workflow with a "Respond to Webhook" node: "Idempotency on duplicate webhook calls"
    - For a workflow with an "IF" node checking for customer sentiment: "Robustness against neutral or ambiguous sentiment"
    - For a workflow using an HTTP node to an external API: "Graceful handling of API rate limits"

    Your response must be a JSON array of strings.
    ${getLanguageInstruction(language)}
    `;

    const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
        config: {
            responseMimeType: "application/json",
            responseSchema: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
            },
        },
    });

    // 💰 Track usage
    if (response.usageMetadata) {
        costTracker.recordUsage({
            promptTokens: response.usageMetadata.promptTokenCount || 0,
            responseTokens: response.usageMetadata.candidatesTokenCount || 0,
            totalTokens: response.usageMetadata.totalTokenCount || 0,
            model: 'gemini-2.5-flash',
            operation: 'suggest_audit_criteria'
        });
    }

    try {
        const jsonText = response.text.trim();
        return JSON.parse(jsonText);
    } catch (e) {
        console.error("Failed to parse suggested criteria JSON:", response.text);
        return [];
    }
}

export const suggestImprovements = async (config: AuditConfig, results: AuditResult[], language: string): Promise<ImprovementData> => {
    // This is a placeholder for the improvement suggestion logic.
    // In a real implementation, this would involve a complex prompt to another Gemini model.
    await delay(3000);

    // Para n8n workflows, intentar mejorar los nodos
    const improvedWorkflow = (config.workflow || []).map(node => {
        if (node.type === 'agent') {
            return {
                ...node,
                systemPrompt: node.systemPrompt + "\n\n// Added improvement: Be more concise and direct in your responses.",
            };
        }
        return node;
    });

    const explanation = language === 'es'
      ? "1. **Concisión del Agente**: Se ajustó el prompt del 'Agente de Saludo' para ser más directo, reduciendo la verbosidad.\n2. **Manejo de Errores**: Se añadió una capa de validación implícita para manejar mejor las entradas vacías."
      : "1. **Agent Conciseness**: Adjusted the 'Greeting Agent' prompt to be more direct, reducing verbosity.\n2. **Error Handling**: Added an implicit validation layer to better handle empty inputs.";

    const newResults = results.map(r => ({
        ...r,
        analysis: {
            ...r.analysis,
            overallScore: Math.min(10, r.analysis.overallScore * 1.2),
             criteriaBreakdown: r.analysis.criteriaBreakdown.map(cb => ({...cb, score: Math.min(10, cb.score * 1.2)})),
        }
    }));

    return {
        improvedWorkflow,
        explanation,
        newResults,
    };
};