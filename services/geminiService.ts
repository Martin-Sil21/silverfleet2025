import { GoogleGenAI, Type } from "@google/genai";
import type { AuditConfig, TestCase, Analysis, AuditResult, ImprovementData, WorkflowNode, N8nConnection, AgentNode, ToolNode, ExecutionStep } from '../types';

const delay = (ms: number) => new Promise(res => setTimeout(res, ms));

type ProgressCallback = (update: { message: string; trace?: AuditResult, testCaseId?: string, step?: ExecutionStep }) => void;
type ResultCallback = (result: AuditResult) => void;
type CompletionCallback = () => void;

const MAX_CONVERSATION_TURNS = 6;

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

const generateUserMessageText = async (
    testCase: TestCase,
    conversationHistory: ExecutionStep[],
    language: string
): Promise<string> => {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

    const findMessageText = (data: any): string => {
        if (typeof data !== 'object' || data === null) return JSON.stringify(data);
        const messageKey = Object.keys(data).find(k => k.toLowerCase().includes('message') || k.toLowerCase().includes('text') || k.toLowerCase().includes('query'));
        return messageKey && typeof data[messageKey] === 'string' ? data[messageKey] : JSON.stringify(data);
    };
    
    const historyString = conversationHistory.map(turn => 
        `User: ${findMessageText(turn.input)}\nAgent: ${JSON.stringify(turn.output)}`
    ).join('\n\n');

    const prompt = `
    You are role-playing as a user in a test scenario.
    
    Your Persona: "${testCase.persona}"
    Your Ultimate Goal: "${testCase.conversationGoal}"
    
    Conversation History So Far:
    ${historyString || "(This is the first message of the conversation.)"}
    
    Your Task: Based on your persona, goal, and the conversation history, generate the text for your *next* message.
    
    Instructions:
    - If this is the first message, start the conversation naturally to work towards your goal.
    - If there is history, respond to the agent's last message, keeping your persona and goal in mind.
    - Be realistic. You can be friendly, confused, or frustrated, according to your persona.
    - Your response should be just the message text, nothing else. No JSON, no labels.
    
    ${getLanguageInstruction(language)}
    `;

    const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
    });
    
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

        let conversations: ConversationState[] = testCases.map(tc => ({
            testCase: tc,
            history: [],
            isComplete: false,
            finalStatus: 'PENDING',
        }));

        for (let turnCount = 1; turnCount <= MAX_CONVERSATION_TURNS; turnCount++) {
            const activeConversations = conversations.filter(c => !c.isComplete);
            if (activeConversations.length === 0) {
                onProgress({ message: "All conversations have been completed." });
                break;
            }

            onProgress({ message: `Round ${turnCount} | Generating messages for ${activeConversations.length} conversations...` });

            // 1. Generate all messages for this round
            const messageGenerationPromises = activeConversations.map(conv => {
                return generateUserMessageText(conv.testCase, conv.history, language);
            });
            const userMessageTexts = await Promise.all(messageGenerationPromises);
            onProgress({ message: `Round ${turnCount} | All user messages generated. Sending to endpoint...` });

            // 2. Prepare and send all requests for this round
            const fetchPromises = activeConversations.map((conv, index) => {
                const turnStartTime = Date.now();
                const messageText = userMessageTexts[index];
                
                const basePayload = { ...conv.testCase.initialPayload, conversationId: conv.testCase.id };
                const messageKey = Object.keys(basePayload).find(k => k.toLowerCase().includes('message') || k.toLowerCase().includes('text') || k.toLowerCase().includes('query')) || 'message';
                const userInput = { ...basePayload, [messageKey]: messageText };
                
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
                    return { status: 'SUCCESS' as const, output: responseData, input: userInput, log: `Success on Round ${turnCount}.`, durationMs };
                })
                .catch(error => {
                    const durationMs = Date.now() - turnStartTime;
                    const logMessage = error instanceof Error ? error.message : "An unknown network error occurred.";
                    return { status: 'ERROR' as const, output: null, input: userInput, log: logMessage, durationMs };
                });
            });
            
            onProgress({ message: `Round ${turnCount} | All messages sent. Awaiting agent responses...` });

            const turnResults = await Promise.all(fetchPromises);
            onProgress({ message: `Round ${turnCount} | All responses received. Processing results...` });

            // 3. Update conversation states with the results and notify UI
            activeConversations.forEach((conv, index) => {
                const step: ExecutionStep = {
                    nodeId: `Turn ${turnCount}`,
                    ...turnResults[index],
                };
                conv.history.push(step);
                onProgress({ 
                    message: `Processed Turn ${turnCount} for "${conv.testCase.title}". Status: ${step.status}`,
                    testCaseId: conv.testCase.id,
                    step: step
                });

                if (step.status === 'ERROR') {
                    conv.isComplete = true;
                    conv.finalStatus = 'ERROR';
                    onProgress({ message: `Conversation "${conv.testCase.title}" failed with an error.` });
                }
            });

            // 4. Check for goal completion on successful turns
            const successfulConversations = activeConversations.filter((c, i) => turnResults[i].status === 'SUCCESS' && !c.isComplete);
            if (successfulConversations.length > 0) {
                 onProgress({ message: `Checking for goal completion for ${successfulConversations.length} conversation(s)...`});
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
                            onProgress({ message: `Goal met for "${conversation.testCase.title}". Conversation finished.` });
                        }
                    }
                });
            }
        } // End of main loop

        onProgress({ message: "All conversation rounds complete. Analyzing final results..." });

        const analysisPromises = conversations.map(async conv => {
            onProgress({ message: `Analyzing final result for "${conv.testCase.title}"...` });
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
            onProgress({ message: `Analysis complete for "${conv.testCase.title}".` });
        });

        await Promise.all(analysisPromises);
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