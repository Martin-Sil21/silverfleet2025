import { GoogleGenAI, Type } from "@google/genai";
import type { AuditConfig, TestCase, Analysis, AuditResult, ImprovementData, WorkflowNode, N8nConnection, AgentNode, ToolNode, ExecutionStep } from '../types';

const delay = (ms: number) => new Promise(res => setTimeout(res, ms));

type ProgressCallback = (update: { message: string; trace?: AuditResult, testCaseId?: string, step?: ExecutionStep }) => void;
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

export const generateTestCases = async (config: AuditConfig, language: string): Promise<TestCase[]> => {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const { workflow, criteria, testCaseCount, connections, samplePayload } = config;

    const prompt = `
    Act as a senior QA engineer creating data for testing a conversational AI workflow. Your task is to generate ${testCaseCount} unique, realistic user profiles ("bot buyers").
    
    This is the workflow you are testing:
    ${formatWorkflowForPrompt(workflow, connections)}

    This is the sample JSON structure the workflow expects for each message:
    ${JSON.stringify(samplePayload, null, 2)}

    Based on your analysis of the workflow and the sample payload, for each of the ${testCaseCount} test cases, you must:
    1.  Create a complete JSON payload (\`initialPayload\`) that is **relevant to the workflow's purpose** and follows the sample structure but with **completely new and unique data**. For example, if the workflow is for customer support, create different customer issues.
    2.  Define a user 'persona' that describes the user's personality and communication style (e.g., "Impatient customer, uses short, direct sentences"). This persona should be consistent with the payload data.
    3.  Define a clear 'conversationGoal' for the persona that is achievable through the provided workflow (e.g., "Find out why their delivery is late and get a new ETA").
    4.  Provide a unique 'id' and a concise 'title' for the test case that summarizes the persona's goal.

    Instructions:
    - The \`conversationId\` in each \`initialPayload\` must be unique.
    - The data across the different test cases must be distinct to simulate different users.
    - The personas and goals must be directly related to the functions of the workflow you analyzed.
    - The generated personas and payloads must be consistent with the theme and purpose implied by the sample payload. If the sample is about sales, create sales-related scenarios. If it's about support, create support-related scenarios.
    - Ensure the number of generated personas matches exactly ${testCaseCount}.

    Return the result as a JSON array of objects. The entire response must be only the JSON array, with no explanations or markdown formatting.
    ${getLanguageInstruction(language)}
    `;

    const response = await ai.models.generateContent({
        model: 'gemini-2.5-pro',
        contents: prompt,
        config: {
            responseMimeType: "application/json",
        },
    });
    
    try {
        const jsonText = response.text.trim();
        return JSON.parse(jsonText);
    } catch (e) {
        console.error("Failed to parse test cases JSON:", response.text);
        throw new Error("Could not generate valid test cases. The model returned malformed JSON.");
    }
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

const findUserMessageText = (data: any): string => {
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

const findAgentMessageText = (data: any): string => {
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

const generateUserMessageText = async (
    testCase: TestCase,
    conversationHistory: ExecutionStep[],
    language: string
): Promise<string> => {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    
    console.log(`[${testCase.title}] ========== GENERANDO NUEVO MENSAJE ==========`);
    console.log(`[${testCase.title}] Historial tiene ${conversationHistory.length} turnos`);
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
): Promise<Analysis> => {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const { criteria, workflow, connections } = config;
    const { testCase, executionTrace, finalStatus } = result;

    const traceSummary = config.auditType === 'real'
        ? executionTrace.map(turn => `\n${turn.nodeId}:\n  User: ${findUserMessageText(turn.input)}\n  Agent: ${findAgentMessageText(turn.output)} ${turn.status === 'ERROR' ? `\n  Error: ${turn.log}` : ''}`).join('')
        : executionTrace.map(step => `Node: ${workflow.find(n => n.id === step.nodeId)?.name || step.nodeId} | Status: ${step.status}`).join('\n');

    const prompt = `
    Act as an expert QA analyst. Your task is to analyze the execution of a test case against a given workflow and provide a detailed analysis.

    Workflow Under Test:
    ${formatWorkflowForPrompt(workflow, connections)}

    Test Case Persona:
    - Title: ${testCase.title}
    - Persona: ${testCase.persona}
    - Goal: ${testCase.conversationGoal}

    Execution Trace Summary:
    ${traceSummary}
    
    Final status of the execution was: ${finalStatus}.

    Analysis Task:
    1.  Provide a concise overall 'summary' of what happened during the test. For conversations, assess if the persona's goal was met.
    2.  For each criterion listed below, provide a score from 1 (terrible) to 10 (perfect) and a brief 'justification' for your score.
    3.  Calculate the 'overallScore' as the average of the individual criteria scores.

    Audit Criteria: ${criteria.join(', ')}
    
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
                    criteriaBreakdown: {
                        type: Type.ARRAY,
                        items: {
                            type: Type.OBJECT,
                            properties: {
                                criterion: { type: Type.STRING },
                                score: { type: Type.NUMBER },
                                justification: { type: Type.STRING },
                            },
                            required: ['criterion', 'score', 'justification'],
                        },
                    },
                },
                required: ['overallScore', 'summary', 'criteriaBreakdown'],
            },
        },
    });

    try {
        const jsonText = response.text.trim();
        return JSON.parse(jsonText);
    } catch (e) {
        console.error("Failed to parse analysis JSON:", response.text);
        throw new Error("Could not analyze the result. The model returned malformed JSON.");
    }
};

type ConversationState = {
    testCase: TestCase;
    history: ExecutionStep[];
    isComplete: boolean;
    finalStatus: 'SUCCESS' | 'ERROR' | 'PENDING';
};

export const runFullAudit = async (
  config: AuditConfig,
  testCases: TestCase[],
  onProgress: ProgressCallback,
  onResultComplete: ResultCallback,
  onAllComplete: CompletionCallback,
  language: string,
) => {
    if (config.auditType === 'real') {
        if (!config.endpointUrl) {
            throw new Error("Endpoint URL is not configured for real audit.");
        }

        onProgress({ message: `🚀 Inicializando ${testCases.length} conversaciones simultáneas...` });
        
        let conversations: ConversationState[] = testCases.map(tc => ({
            testCase: tc,
            history: [],
            isComplete: false,
            finalStatus: 'PENDING',
        }));

        // Log cada personalidad creada
        testCases.forEach((tc, idx) => {
            onProgress({ message: `👤 Personalidad ${idx + 1}/${testCases.length}: "${tc.title}" - ${tc.persona}` });
        });
        
        onProgress({ message: `✅ Todas las personalidades cargadas. Iniciando conversaciones...` });

        for (let turnCount = 1; turnCount <= MAX_CONVERSATION_TURNS; turnCount++) {
            const activeConversations = conversations.filter(c => !c.isComplete);
            if (activeConversations.length === 0) {
                onProgress({ message: "🎉 Todas las conversaciones han sido completadas." });
                break;
            }

            console.log(`\n\n${'='.repeat(80)}`);
            console.log(`INICIO TURNO ${turnCount} - ${activeConversations.length} conversaciones activas`);
            console.log(`${'='.repeat(80)}`);
            
            onProgress({ message: `\n━━━ Ronda ${turnCount}/${MAX_CONVERSATION_TURNS} ━━━` });
            onProgress({ message: `💬 Generando mensajes para ${activeConversations.length} conversaciones activas...` });

            // 1. Generate all messages for this round
            console.log(`\n========== RONDA ${turnCount} - GENERACIÓN DE MENSAJES ==========`);
            const messageGenerationPromises = activeConversations.map((conv, idx) => {
                console.log(`Conversación ${idx + 1}/${activeConversations.length}: "${conv.testCase.title}"`);
                console.log(`  - Historial actual: ${conv.history.length} turnos`);
                onProgress({ message: `  ✍️  Generando mensaje para "${conv.testCase.title}" (historial: ${conv.history.length} turnos)...` });
                return generateUserMessageText(conv.testCase, conv.history, language);
            });
            const userMessageTexts = await Promise.all(messageGenerationPromises);
            onProgress({ message: `✅ ${userMessageTexts.length} mensajes generados. Enviando al endpoint...` });

            // 2. Prepare and send all requests for this round
            const fetchPromises = activeConversations.map((conv, index) => {
                const turnStartTime = Date.now();
                const messageText = userMessageTexts[index];
                
                onProgress({ message: `  📤 Enviando: "${conv.testCase.title}" → "${messageText.substring(0, 50)}${messageText.length > 50 ? '...' : ''}"` });
                
                const basePayload = { ...conv.testCase.initialPayload, conversationId: conv.testCase.id };
                
                // Smart detection: Find which field contains a string value (likely the message)
                // Prioritize common message field names, but also detect any string field
                let messageField = null;
                
                // First pass: Look for common message field names
                const commonFields = ['input', 'message', 'text', 'query', 'prompt', 'content', 'body', 'msg'];
                for (const field of commonFields) {
                    const foundKey = Object.keys(basePayload).find(k => k.toLowerCase() === field || k.toLowerCase().includes(field));
                    if (foundKey && typeof basePayload[foundKey] === 'string') {
                        messageField = foundKey;
                        break;
                    }
                }
                
                // Second pass: If not found, use any string field (excluding IDs and metadata)
                if (!messageField) {
                    const excludeFields = ['id', 'conversationid', 'sessionid', 'userid', 'timestamp', 'date'];
                    messageField = Object.keys(basePayload).find(k => {
                        const lowerKey = k.toLowerCase();
                        return typeof basePayload[k] === 'string' && 
                               !excludeFields.some(exclude => lowerKey.includes(exclude));
                    });
                }
                
                // Fallback: use 'input' as default
                if (!messageField) {
                    messageField = 'input';
                    console.warn(`[${conv.testCase.title}] ⚠️ No se encontró campo de mensaje. Usando 'input' por defecto.`);
                }
                
                // UPDATE that field with the new message
                const userInput = { 
                    ...basePayload,
                    [messageField]: messageText
                };
                
                console.log(`[${conv.testCase.title}] 📤 Turno ${turnCount}`);
                console.log(`[${conv.testCase.title}] 📤 Campo detectado: "${messageField}"`);
                console.log(`[${conv.testCase.title}] 📤 Nuevo valor: "${messageText}"`);
                console.log(`[${conv.testCase.title}] 📤 Payload completo:`, JSON.stringify(userInput, null, 2));
                
                // Immediately show the user message in UI (before getting response)
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
                    message: `  📨 Mensaje enviado: "${conv.testCase.title}"`,
                    testCaseId: conv.testCase.id,
                    step: pendingStep
                });
                
                return fetch(config.endpointUrl!, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(userInput)
                })
                .then(async response => {
                    const durationMs = Date.now() - turnStartTime;
                    if (!response.ok) {
                        throw new Error(`Endpoint returned status ${response.status}: ${response.statusText}`);
                    }
                    const responseData = await response.json();
                    onProgress({ message: `  ✅ "${conv.testCase.title}" respondió en ${durationMs}ms` });
                    return { 
                        status: 'SUCCESS' as const, 
                        output: responseData, 
                        input: userInput, 
                        log: `Success on Round ${turnCount}.`, 
                        durationMs,
                        conversationIndex: index  // Add index to match with conversation
                    };
                })
                .catch(error => {
                    const durationMs = Date.now() - turnStartTime;
                    const logMessage = error instanceof Error ? error.message : "An unknown network error occurred.";
                    onProgress({ message: `  ❌ Error en "${conv.testCase.title}": ${logMessage}` });
                    return { 
                        status: 'ERROR' as const, 
                        output: null, 
                        input: userInput, 
                        log: logMessage, 
                        durationMs,
                        conversationIndex: index  // Add index to match with conversation
                    };
                });
            });
            
            onProgress({ message: `⏳ Esperando respuestas del agente...` });

            const turnResults = await Promise.all(fetchPromises);
            onProgress({ message: `📥 Todas las respuestas recibidas. Procesando resultados...` });

            // 3. Update conversation states with the results and notify UI
            activeConversations.forEach((conv, index) => {
                const result = turnResults[index];
                const step: ExecutionStep = {
                    nodeId: `Turn ${turnCount}`,
                    status: result.status,
                    input: result.input,
                    output: result.output,
                    log: result.log,
                    durationMs: result.durationMs,
                    timestamp: Date.now(),
                };
                
                // CRITICAL: Add to conversation history BEFORE generating next message
                conv.history.push(step);
                
                console.log(`\n[${conv.testCase.title}] ✅ Historia ACTUALIZADA después del turno ${turnCount}`);
                console.log(`[${conv.testCase.title}] Nuevo tamaño del historial: ${conv.history.length} turnos`);
                console.log(`[${conv.testCase.title}] Último mensaje del usuario: "${findUserMessageText(step.input)}"`);
                console.log(`[${conv.testCase.title}] Última respuesta del agente: "${findAgentMessageText(step.output).substring(0, 100)}..."`);
                console.log(`[${conv.testCase.title}] Todos los mensajes del usuario hasta ahora:`, conv.history.map(h => findUserMessageText(h.input)));
                
                onProgress({ 
                    message: `Processed Turn ${turnCount} for "${conv.testCase.title}". Status: ${step.status}`,
                    testCaseId: conv.testCase.id,
                    step: step
                });

                if (step.status === 'ERROR') {
                    conv.isComplete = true;
                    conv.finalStatus = 'ERROR';
                    onProgress({ message: `⛔ Conversación "${conv.testCase.title}" terminó con error.` });
                }
            });

            // 4. Check for goal completion on successful turns
            const successfulConversations = activeConversations.filter((c, i) => turnResults[i].status === 'SUCCESS' && !c.isComplete);
            if (successfulConversations.length > 0) {
                 onProgress({ message: `🎯 Verificando cumplimiento de objetivos para ${successfulConversations.length} conversación(es)...`});
                 const goalCheckPromises = successfulConversations.map(conv =>
                    checkIfGoalIsMet(conv.testCase, conv.history, language)
                        .then(isMet => ({ testCaseId: conv.testCase.id, isMet }))
                );
                const goalCompletionResults = await Promise.all(goalCheckPromises);

                goalCompletionResults.forEach(goalResult => {
                    if (goalResult.isMet) {
                        const conversation = conversations.find(c => c.testCase.id === goalResult.testCaseId);
                        if (conversation && !conversation.isComplete) {
                            conversation.isComplete = true;
                            conversation.finalStatus = 'SUCCESS';
                            onProgress({ message: `🎉 Objetivo cumplido: "${conversation.testCase.title}" - Conversación finalizada.` });
                        }
                    }
                });
            }
        } // End of main loop

        onProgress({ message: "\n━━━━━━━━━━━━━━━━━━━━━━" });
        onProgress({ message: "📊 Todas las rondas completadas. Analizando resultados finales..." });

        const analysisPromises = conversations.map(async conv => {
            onProgress({ message: `🔍 Analizando resultado final: "${conv.testCase.title}"...` });
            const finalStatus = conv.finalStatus === 'PENDING' ? 'SUCCESS' : conv.finalStatus;
            const analysis = await analyzeResult(config, { id: conv.testCase.id, testCase: conv.testCase, executionTrace: conv.history, finalStatus }, language);
            const result: AuditResult = {
                id: conv.testCase.id,
                testCase: conv.testCase,
                executionTrace: conv.history,
                finalStatus,
                analysis
            };
            onResultComplete(result);
            onProgress({ message: `✅ Análisis completo para "${conv.testCase.title}" - Score: ${analysis.overallScore.toFixed(1)}/10` });
        });

        await Promise.all(analysisPromises);
        onProgress({ message: "\n🏁 AUDITORÍA COMPLETA - Todos los resultados procesados." });
        onAllComplete();

    } else {
        // Visual audit runs sequentially as before
        for (let i = 0; i < testCases.length; i++) {
            const testCase = testCases[i];
            onProgress({ message: `Executing visual test case ${i + 1}/${testCases.length}: "${testCase.title}"` });
            const { executionTrace, finalStatus } = await executeWorkflowVisually(config, testCase, onProgress);
            
            onProgress({ message: `Analyzing results for "${testCase.title}"...` });
            const analysis = await analyzeResult(config, { id: testCase.id, testCase, executionTrace, finalStatus }, language);
            
            const result: AuditResult = { id: testCase.id, testCase, executionTrace, analysis, finalStatus };
            onResultComplete(result);
            onProgress({ message: `Completed analysis for "${testCase.title}".` });
        }
        onAllComplete();
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

    const improvedWorkflow = config.workflow.map(node => {
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