import { GoogleGenAI, Type } from "@google/genai";
import type { AuditConfig, TestCase, Analysis, AuditResult, ImprovementData, WorkflowNode, N8nConnection, AgentNode, ToolNode, ExecutionStep } from '../types';
import fs from 'fs';
import path from 'path';

type ProgressCallback = (update: { message: string; trace?: AuditResult; agents?: any[] }) => void;
type ResultCallback = (result: AuditResult) => void;
type CompletionCallback = () => void;

const MAX_CONVERSATION_TURNS = 6;

interface CallCenterAgent {
    id: string;
    testCase: TestCase;
    history: ExecutionStep[];
    isActive: boolean;
    currentTurn: number;
    status: 'WAITING' | 'THINKING' | 'SENDING' | 'WAITING_RESPONSE' | 'COMPLETED' | 'ERROR';
    conversationGoal: string;
    personality: string;
}

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Generic retry helper with exponential backoff
const withRetries = async <T>(fn: () => Promise<T>, attempts = 3, baseDelay = 500): Promise<T> => {
    let lastError: any = null;
    for (let i = 0; i < attempts; i++) {
        try {
            return await fn();
        } catch (e) {
            lastError = e;
            const wait = baseDelay * Math.pow(2, i);
            console.warn(`Attempt ${i + 1} failed. Retrying in ${wait}ms...`, e instanceof Error ? e.message : e);
            if (i < attempts - 1) await delay(wait);
        }
    }
    throw lastError;
};

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
    
    const response = await withRetries(() => ai.models.generateContent({
        model: 'gemini-2.5-pro',
        contents: prompt,
        config: {
            responseMimeType: "application/json",
        },
    }), 3, 800);

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

const generateTestCases = async (config: AuditConfig, language: string): Promise<TestCase[]> => {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const { workflow, criteria, testCaseCount, connections, samplePayload } = config;

    const prompt = `
    Act as an expert test data engineer creating diverse and realistic user profiles for testing a conversational AI workflow. Generate ${testCaseCount} unique "bot personas" that feel like completely different real people.

    This is the workflow under test:
    ${formatWorkflowForPrompt(workflow, connections)}

    The expected JSON payload structure is:
    ${JSON.stringify(samplePayload, null, 2)}

    For each of the ${testCaseCount} test cases, create:

    1. A COMPLETE JSON PAYLOAD that:
       - Uses a unique conversationId
       - Has realistic Argentinian data:
         * Diverse names (not generic "Cliente Potencial")
         * Real Argentinian phone numbers (unique per bot, varied area codes)
         * Valid-looking emails matching the person's name
         * Contextual metadata about the persona
       - The payload must follow the sample structure exactly

    2. A descriptive PERSONA STRING that combines in a natural way:
       - Age range and occupation
       - Personality traits
       - Communication style
       - Background context
       Example: "35-year-old tech startup founder, impaciente y directo en su comunicación, busca automatizar procesos de su empresa en crecimiento"

    3. A realistic CONVERSATION GOAL that:
       - Matches their persona and context
       - Is specific and achievable via this workflow
       - Includes their motivation/urgency level

    4. A unique ID and descriptive title for tracking.

    CRITICAL REQUIREMENTS:
    - Each bot must have COMPLETELY DIFFERENT:
      * Names (full names, not generic ones)
      * Phone numbers (unique, real Argentina formats)
      * Email addresses (matching their names)
      * Personality traits
      * Communication styles
      * Goals and motivations
    - No duplicate or generic data between bots
    - Names should be diverse and realistic
    - Phone numbers should follow +54 format with varied area codes
    - Each bot should feel like a distinct individual

    Return a JSON array where each object MUST have EXACTLY these fields:
    {
      "id": "string - unique identifier",
      "title": "string - clear descriptive title",
      "persona": "string - one complete sentence describing the person",
      "conversationGoal": "string - specific goal description",
      "initialPayload": {
        // object matching sample structure with unique data
      }
    }

    IMPORTANT: The "persona" field MUST be a single string, not an object.

    Return the result as a JSON array where each object has this exact structure:
    [
      {
        "id": "unique_id_1",
        "title": "Descriptive Title",
        "persona": "Personality description",
        "conversationGoal": "Specific goal",
        "initialPayload": { /* complete payload matching sample structure */ }
      }
    ]
    ${getLanguageInstruction(language)}
    `;

    const response = await withRetries(() => ai.models.generateContent({
        model: 'gemini-2.5-pro',
        contents: prompt,
        config: {
            responseMimeType: "application/json",
        },
    }), 3, 800);

    if (!response?.text) {
        throw new Error("Gemini API returned undefined response text for test case generation");
    }
    
    try {
        const jsonText = response.text.trim();
        const testCases = JSON.parse(jsonText);

        // Ensure all required fields are present and use samplePayload as base
        return testCases.map((tc: any, index: number) => ({
            id: tc.id || `TC${index + 1}`,
            title: tc.title || `Test Case ${index + 1}`,
            persona: tc.persona || `Generic user persona ${index + 1}`,
            conversationGoal: tc.conversationGoal || `Generic goal ${index + 1}`,
            initialPayload: tc.initialPayload || { ...samplePayload, conversationId: `conv_${Date.now()}_${index}` }
        }));
    } catch (e) {
        console.error("Failed to parse test cases JSON:", response.text);
        // Fallback: generate basic test cases using the sample payload
        return Array.from({ length: testCaseCount }, (_, index) => ({
            id: `TC${index + 1}`,
            title: `Test Case ${index + 1}`,
            persona: `User ${index + 1}`,
            conversationGoal: `Test goal ${index + 1}`,
            initialPayload: { ...samplePayload, conversationId: `conv_${Date.now()}_${index}` }
        }));
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

const generateUserMessageText = async (
    testCase: TestCase,
    conversationHistory: ExecutionStep[],
    language: string
): Promise<string> => {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    
    const historyString = conversationHistory.map(turn => 
        `User: ${JSON.stringify(turn.input)}\nAgent: ${JSON.stringify(turn.output)}`
    ).join('\n\n');

    const prompt = `
    Eres una persona real escribiendo mensajes de WhatsApp. NO eres un bot.
    
    Tu personalidad: "${testCase.persona}"
    Tu objetivo: "${testCase.conversationGoal}"
    
    Historial de la conversación:
    ${historyString || "(Este es tu primer mensaje.)"}
    
    Instrucciones para sonar más humano:
    - Escribe mensajes CORTOS y naturales, como en WhatsApp (2-3 líneas máximo)
    - Usa expresiones cotidianas y argentinas
    - Si estás apurado/a, sé directo/a y breve
    - Si estás frustrado/a, muéstralo pero sin ser agresivo/a
    - Incluye errores de tipeo ocasionales y modismos
    - NUNCA uses lenguaje formal o corporativo
    - NO escribas párrafos largos ni uses puntos y comas excesivos
    - Ocasionalmente usa emojis pero no abuses
    
    IMPORTANTE:
    - Mantén los mensajes BREVES y NATURALES
    - Escribe como una PERSONA REAL, no como un bot
    
    ${getLanguageInstruction(language)}
    `;

    const response = await withRetries(() => ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
    }), 3, 500);
    
    return response.text.trim();
};

const checkIfGoalIsMet = async (
    testCase: TestCase,
    conversationHistory: ExecutionStep[],
    language: string
): Promise<boolean> => {
    if (conversationHistory.length === 0) return false;

    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const historyString = conversationHistory.map(turn =>
        `User: ${JSON.stringify(turn.input)}\nAgent: ${JSON.stringify(turn.output)}`
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

    const response = await withRetries(() => ai.models.generateContent({
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
    }), 3, 700);

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
        ? executionTrace.map(turn => `\n${turn.nodeId}:\n  User: ${JSON.stringify(turn.input)}\n  Agent: ${JSON.stringify(turn.output)} ${turn.status === 'ERROR' ? `\n  Error: ${turn.log}` : ''}`).join('')
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

    const response = await withRetries(() => ai.models.generateContent({
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
    }), 3, 1200);

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
  onProgress: ProgressCallback,
  onResultComplete: ResultCallback,
  onAllComplete: CompletionCallback,
  language: string,
) => {
    console.log('🚀 Iniciando auditoría del call center...');
    console.log('📋 Configuración:', { testCaseCount: config.testCaseCount, auditType: config.auditType, endpointUrl: config.endpointUrl });

    onProgress({ message: `🎯 Iniciando auditoría con ${config.testCaseCount} agentes...` });
    const testCases = await generateTestCases(config, language);

    if (config.auditType === 'real') {
        if (!config.endpointUrl) {
            throw new Error("URL del endpoint no configurada para auditoría real.");
        }

        if (!config.samplePayload) {
            throw new Error("Payload de ejemplo no configurado. Por favor carga un archivo de workflow n8n.");
        }

        console.log('📋 Payload de ejemplo del workflow:', config.samplePayload);

        // Initialize call center agents
        const agents: CallCenterAgent[] = testCases.map((testCase, index) => ({
            id: `AGENT_${index + 1}_${testCase.id.slice(-6)}`,
            testCase,
            history: [],
            isActive: true,
            currentTurn: 0,
            status: 'WAITING',
            conversationGoal: testCase.conversationGoal,
            personality: testCase.persona
        }));

        const initialAgentsStatus = agents.map(a => ({
            id: a.id,
            testCase: a.testCase,
            status: a.status,
            currentTurn: a.currentTurn,
            history: a.history
        }));

        onProgress({
            message: `📞 Call Center Inicializado - ${agents.length} agentes listos`,
            trace: {
                id: 'system',
                testCase: {
                    id: 'system',
                    title: 'System',
                    persona: 'System',
                    conversationGoal: 'System initialization',
                    initialPayload: config.samplePayload || {}
                },
                executionTrace: [],
                analysis: { overallScore: 0, summary: `Initialized ${agents.length} agents`, criteriaBreakdown: [] },
                finalStatus: 'SUCCESS'
            },
            agents: initialAgentsStatus
        });

        // Show initial status of all agents
        const initialStatus = agents.map(agent =>
            `🟡 ${agent.id}: ${agent.testCase.title}`
        ).join('\n');

        onProgress({
            message: `📊 Estado Inicial del Call Center:\n${initialStatus}`,
            trace: {
                id: 'system',
                testCase: {
                    id: 'system',
                    title: 'System',
                    persona: 'System',
                    conversationGoal: 'System initialization',
                    initialPayload: config.samplePayload || {}
                },
                executionTrace: [],
                analysis: { overallScore: 0, summary: `All agents ready`, criteriaBreakdown: [] },
                finalStatus: 'SUCCESS'
            },
            agents: initialAgentsStatus
        });

        // Process each agent independently
        const agentPromises = agents.map(async (agent, index) => {
            console.log(`🎬 Iniciando agente ${agent.id}: ${agent.testCase.title}`);

            let conversationComplete = false;
            let turnCount = 0;

            // Add small random delay to make execution more realistic
            const initialDelay = Math.random() * 1000;
            await new Promise(resolve => setTimeout(resolve, initialDelay));

            while (!conversationComplete && turnCount < MAX_CONVERSATION_TURNS && agent.isActive) {
                turnCount++;
                agent.currentTurn = turnCount;
                agent.status = 'THINKING';

                    // Update progress with all agents status - sin generar análisis preliminar
        const allAgentsStatus = agents.map(a => ({
            id: a.id,
            testCase: a.testCase,
            status: a.status,
            currentTurn: a.currentTurn,
            history: a.history
        }));

        // Solo enviamos el estado actual sin análisis
        onProgress({
            message: `🤖 ${agent.id}: Pensando siguiente mensaje (turno ${turnCount})...`,
            agents: allAgentsStatus
        });                try {
                    // Generate contextual message based on conversation history
                    const userMessage = await generateUserMessageText(agent.testCase, agent.history, language);

                    agent.status = 'SENDING';

                onProgress({
                    message: `📤 ${agent.id}: Enviando mensaje - "${userMessage.substring(0, 50)}..."`,
                    agents: allAgentsStatus
                });                    // Prepare payload using the bot's unique initial payload
                    const payloadWithMessage = { 
                        ...agent.testCase.initialPayload, // Use bot's specific payload from test case
                        conversationId: agent.testCase.id  // Ensure unique conversation ID
                    };

                    // Find the message field in the payload structure
                    const messageKey = Object.keys(agent.testCase.initialPayload).find(k =>
                        k.toLowerCase().includes('message') ||
                        k.toLowerCase().includes('text') ||
                        k.toLowerCase().includes('query') ||
                        k.toLowerCase().includes('input')
                    ) || 'message';

                    // Update message while keeping bot's unique data
                    payloadWithMessage[messageKey] = userMessage;

                    console.log(`📤 ${agent.id} - Sending to endpoint:`, JSON.stringify(payloadWithMessage, null, 2));

                    // Send message and wait for response
                const turnStartTime = Date.now();

                    const response = await withRetries(() => fetch(config.endpointUrl!, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(payloadWithMessage)
                    }), 3, 500);

                    if (!response.ok) {
                        // Try to capture any textual error body for debugging
                        let errText = '';
                        try { errText = await response.text(); } catch (_) { errText = ''; }
                        throw new Error(`HTTP ${response.status}: ${response.statusText}${errText ? ` - ${errText}` : ''}`);
                    }

                    // Read response as text first and try to parse as JSON. Many endpoints may return
                    // empty bodies or plain text which would cause response.json() to throw.
                    let responseData: any = null;
                    let rawResponseText: string | null = null;
                    try {
                        rawResponseText = await response.text();
                        if (rawResponseText && rawResponseText.trim().length > 0) {
                            try {
                                responseData = JSON.parse(rawResponseText);
                            } catch (e) {
                                // Not valid JSON — keep the raw text so callers can inspect it
                                console.warn(`Non-JSON response for ${agent.id} turn ${turnCount}:`, rawResponseText.slice(0, 300));
                                responseData = rawResponseText;
                            }
                        } else {
                            // Empty body
                            console.warn(`Empty response body for ${agent.id} turn ${turnCount}`);
                            responseData = null;
                        }
                    } catch (e) {
                        console.error(`Failed to read response body for ${agent.id} turn ${turnCount}:`, e instanceof Error ? e.message : e);
                        responseData = null;
                    }

                    const durationMs = Date.now() - turnStartTime;

                    // Add to conversation history with context
                    const conversationEntry: ExecutionStep = {
                        nodeId: `Turn_${turnCount}`,
                        status: 'SUCCESS',
                        input: {
                            ...payloadWithMessage,
                            _metadata: JSON.stringify({
                                botPersona: agent.testCase.persona,
                                conversationGoal: agent.testCase.conversationGoal,
                                currentTurn: turnCount
                            })
                        },
                        output: responseData,
                        log: `Turn ${turnCount} completed successfully by ${agent.testCase.title}`,
                        durationMs
                    };

                    agent.history.push(conversationEntry);
                    agent.status = 'WAITING_RESPONSE';

                    onProgress({
                        message: `📥 ${agent.id}: Respuesta recibida (${durationMs}ms)`,
                        agents: allAgentsStatus
                    });

                    // Check if goal is achieved
                    const goalAchieved = await checkIfGoalIsMet(agent.testCase, agent.history, language);

                    if (goalAchieved) {
                        agent.status = 'COMPLETED';
                        agent.isActive = false;
                        conversationComplete = true;

                        onProgress({
                            message: `✅ ${agent.id}: ¡Objetivo cumplido! Conversación completada en ${turnCount} turnos.`,
                            agents: allAgentsStatus
                        });

                    } else if (turnCount >= MAX_CONVERSATION_TURNS) {
                        agent.status = 'COMPLETED';
                        agent.isActive = false;
                        conversationComplete = true;

                        onProgress({
                            message: `⏰ ${agent.id}: Límite de turnos alcanzado (${MAX_CONVERSATION_TURNS}). Conversación finalizada.`,
                            agents: allAgentsStatus
                        });

                    } else {
                        // Continue conversation - add delay before next message
                        const delayTime = 2000 + Math.random() * 3000; // 2-5 seconds
                        agent.status = 'WAITING';

                        onProgress({
                            message: `⏳ ${agent.id}: Esperando ${Math.round(delayTime/1000)}s antes del siguiente mensaje...`,
                            agents: allAgentsStatus
                        });

                        await new Promise(resolve => setTimeout(resolve, delayTime));
                    }

                } catch (error) {
                    const errorMessage = error instanceof Error ? error.message : "Unknown error";
                    console.error(`❌ ${agent.id} - Error:`, errorMessage);

                    // Add error to history
                    const errorEntry: ExecutionStep = {
                        nodeId: `Turn_${turnCount}_ERROR`,
                        status: 'ERROR',
                        input: agent.history.length > 0 ? agent.history[agent.history.length - 1].input : null,
                        output: null,
                        log: errorMessage,
                        durationMs: 0
                    };

                    agent.history.push(errorEntry);
                    agent.status = 'ERROR';
                    agent.isActive = false;
                    conversationComplete = true;

                    onProgress({
                        message: `❌ ${agent.id}: Error en la conversación - ${errorMessage}`,
                        agents: allAgentsStatus
                    });
                }
            }

            console.log(`🏁 ${agent.id} - Conversación finalizada. Estado: ${agent.status}, Turnos: ${turnCount}`);

            // Return final result for this agent
            const finalStatus = agent.status === 'COMPLETED' ? 'SUCCESS' : 'ERROR';
            return {
                id: agent.testCase.id,
                testCase: agent.testCase,
                executionTrace: agent.history,
                finalStatus,
                agentId: agent.id
            };
        });

        // Wait for all agents to complete
        onProgress({ message: `🔄 Esperando que todos los agentes completen sus conversaciones...` });

        // Esperamos a que todas las conversaciones terminen
        const agentResults = await Promise.all(agentPromises);

        // Dar un momento para que se procesen todos los estados finales
        await delay(1000);
        
        // Ahora sí analizamos los resultados
        onProgress({ message: `📊 Analizando resultados de ${agentResults.length} conversaciones...` });

        // Esperamos a que todas las conversaciones terminen antes de analizar
        for (const agentResult of agentResults) {
            try {
                const analysis = await analyzeResult(config, {
                    id: agentResult.id,
                    testCase: agentResult.testCase,
                    executionTrace: agentResult.executionTrace,
                    finalStatus: agentResult.finalStatus as 'SUCCESS' | 'ERROR'
                }, language);

                const result: AuditResult = {
                    id: agentResult.id,
                    testCase: agentResult.testCase,
                    executionTrace: agentResult.executionTrace,
                    finalStatus: agentResult.finalStatus as 'SUCCESS' | 'ERROR',
                    analysis
                };

                // Guardar historial en archivo JSON
                try {
                  const historyDir = path.resolve(__dirname, '../history');
                  if (!fs.existsSync(historyDir)) {
                    fs.mkdirSync(historyDir);
                  }
                  const filePath = path.join(historyDir, `${result.id}.json`);
                  fs.writeFileSync(filePath, JSON.stringify(result, null, 2), 'utf-8');
                } catch (err) {
                  console.error('No se pudo guardar el historial del test:', err);
                }

                // Notificar el resultado completo solo cuando el análisis está listo
                onResultComplete(result);
                
                // Actualizar progreso
                onProgress({ 
                    message: `✅ Análisis completado para ${agentResult.id}`,
                    agents: agents.map(a => ({
                        id: a.id,
                        testCase: a.testCase,
                        status: a.status,
                        currentTurn: a.currentTurn,
                        history: a.history
                    }))
                });

            } catch (error) {
                console.error(`Error analizando resultados para ${agentResult.id}:`, error);
                onProgress({ 
                    message: `❌ Error en análisis de ${agentResult.id}: ${error instanceof Error ? error.message : 'Error desconocido'}`
                });
            }
        }

        // Show final summary
        const successfulConversations = agentResults.filter(r => r.finalStatus === 'SUCCESS').length;
        const totalConversations = agentResults.length;

        const completionSummary = agentResults.map(result => {
            const agent = agents.find(a => a.testCase.id === result.id);
            return `${agent?.id}: ${result.testCase.title} - ${result.finalStatus === 'SUCCESS' ? '✅' : '❌'}`;
        }).join('\n');

        const finalAgentsStatus = agents.map(a => ({
            id: a.id,
            testCase: a.testCase,
            status: a.status,
            currentTurn: a.currentTurn,
            history: a.history
        }));

        onProgress({
            message: `🎉 Call Center Completado!\n📊 Resumen: ${successfulConversations}/${totalConversations} exitosas\n\n${completionSummary}\n\n🔄 Generando reportes finales...`,
            agents: finalAgentsStatus
        });

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

    const response = await withRetries(() => ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
        config: {
            responseMimeType: "application/json",
            responseSchema: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
            },
        },
    }), 3, 800);

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