import { GoogleGenAI, Type, Chat } from "@google/genai";
import type { AuditConfig, TestCase, ConversationTurn, Analysis, AuditResult, ImprovementData, WorkflowNode, TraceEvent, ParsedN8nNode } from '../types';

const delay = (ms: number) => new Promise(res => setTimeout(res, ms));
const API_CALL_DELAY_MS = 500; // 0.5 second delay between calls to avoid rate limiting.

interface ChainedTestExecutionResult {
    conversation: ConversationTurn[];
    fullTrace: TraceEvent[];
}

type ProgressCallback = (update: { message: string; current?: number; total?: number }) => void;

const getLanguageInstruction = (language: string): string => {
    const langName = language === 'es' ? 'Spanish' : 'English';
    return `\n\nCRITICAL: You must provide your entire response, including all text and justifications, exclusively in ${langName}. Do not use any other language.`;
}

const formatWorkflowForPrompt = (workflow: WorkflowNode[]): string => {
    return workflow.map((node, index) => {
        if (node.type === 'agent') {
            return `Step ${index + 1} (AI Agent - ${node.name}): System Prompt: "${node.systemPrompt}"`;
        } else {
            return `Step ${index + 1} (Tool - ${node.name}): This is a non-AI tool node of type "${node.nodeType}". Its output will be simulated based on the input it receives.`;
        }
    }).join('\n');
};

const generateTestCases = async (config: AuditConfig, language: string): Promise<TestCase[]> => {
    const ai = new GoogleGenAI({ apiKey: import.meta.env.VITE_GEMINI_API_KEY });
    const { workflow, criteria, testCaseCount } = config;

    const prompt = `
    Based on the following AI agent workflow and audit criteria, please generate ${testCaseCount} diverse and comprehensive test cases.
    The workflow may contain both AI agents and tool nodes whose outputs are simulated by another AI.
    Each test case should include a unique ID, a concise title, a scenario description, and an array of user prompts to simulate a conversation.
    The goal is to create test cases that can effectively evaluate the entire workflow's end-to-end performance against the provided criteria.

    Workflow Under Test: 
    ${formatWorkflowForPrompt(workflow)}

    Audit Criteria: ${criteria.join(', ')}

    Return the result as a JSON array.
    ${getLanguageInstruction(language)}
    `;

    const response = await ai.models.generateContent({
        model: 'gemini-2.5-pro',
        contents: prompt,
        config: {
            responseMimeType: "application/json",
            responseSchema: {
                type: Type.ARRAY,
                items: {
                    type: Type.OBJECT,
                    properties: {
                        id: { type: Type.STRING },
                        title: { type: Type.STRING },
                        scenario: { type: Type.STRING },
                        prompts: {
                            type: Type.ARRAY,
                            items: { type: Type.STRING },
                        },
                    },
                    required: ['id', 'title', 'scenario', 'prompts'],
                },
            },
        },
    });
    
    try {
        const jsonText = response.text.trim();
        return JSON.parse(jsonText) as TestCase[];
    } catch (e) {
        console.error("Failed to parse test cases JSON:", response.text);
        throw new Error("Could not generate valid test cases. The model returned malformed JSON.");
    }
};

const runChainedTestCase = async (workflow: WorkflowNode[], testCase: TestCase): Promise<ChainedTestExecutionResult> => {
    const conversation: ConversationTurn[] = [];
    const fullTrace: TraceEvent[] = [];
    let stepCounter = 0;
    const ai = new GoogleGenAI({ apiKey: import.meta.env.VITE_GEMINI_API_KEY });
    
    const chatSessions: Map<string, Chat> = new Map();

    for (const [turnIndex, userPrompt] of testCase.prompts.entries()) {
        conversation.push({ author: 'user', message: userPrompt });

        let currentInput = userPrompt;

        // Process the input through the chain of agents and tools
        for (const [nodeIndex, node] of workflow.entries()) {
             // Add a delay BETWEEN each node call to avoid rate limiting
             if (nodeIndex > 0) {
                await delay(API_CALL_DELAY_MS);
             }

             if (node.type === 'agent') {
                fullTrace.push({ step: stepCounter++, turn: turnIndex, nodeId: node.id, nodeName: node.name, nodeType: 'agent', eventType: 'INPUT', content: currentInput });
                
                if (!chatSessions.has(node.id)) {
                    chatSessions.set(node.id, ai.chats.create({
                        model: 'gemini-2.5-flash',
                        config: { systemInstruction: node.systemPrompt },
                    }));
                }
                const chat = chatSessions.get(node.id)!;
                const result = await chat.sendMessage({ message: currentInput });
                currentInput = result.text;

                fullTrace.push({ step: stepCounter++, turn: turnIndex, nodeId: node.id, nodeName: node.name, nodeType: 'agent', eventType: 'OUTPUT', content: currentInput });
             } else { // It's a tool node, now with AI simulation
                fullTrace.push({ step: stepCounter++, turn: turnIndex, nodeId: node.id, nodeName: node.name, nodeType: 'tool', eventType: 'INPUT', content: currentInput });
                
                const toolSimulationPrompt = `
                You are a simulation of an n8n tool node. Your name is "${node.name}" and your type is "${node.nodeType}".
                You have just received the following data as input from the previous step:

                INPUT:
                """
                ${currentInput}
                """

                Based on your function (e.g., database query, API call, data transformation), generate a realistic, plausible output that the next node in the workflow would expect.
                For example, if you are a database node creating a user, return a success message with a user ID. If you are an HTTP request node fetching weather, return sample weather data.
                
                Return ONLY the simulated output data. Do not add any explanatory text, apologies, or markdown formatting. Just the raw, simulated output.
                `;

                const toolResponse = await ai.models.generateContent({
                    model: 'gemini-2.5-flash',
                    contents: toolSimulationPrompt
                });
                
                currentInput = toolResponse.text;
                
                fullTrace.push({ step: stepCounter++, turn: turnIndex, nodeId: node.id, nodeName: node.name, nodeType: 'tool', eventType: 'OUTPUT', content: currentInput });
             }
        }
        
        const finalAgentMessage = currentInput;
        conversation.push({ author: 'agent', message: finalAgentMessage });
    }
    return { conversation, fullTrace };
};


const analyzeConversation = async (workflow: WorkflowNode[], criteria: string[], fullTrace: TraceEvent[], language: string): Promise<Analysis> => {
    const ai = new GoogleGenAI({ apiKey: import.meta.env.VITE_GEMINI_API_KEY });

    const formattedTrace = fullTrace.map(event => 
      `Step ${event.step}: [Node: ${event.nodeName} (${event.nodeType})] received ${event.eventType} - Content: \n"${event.content.substring(0, 300)}..."`
    ).join('\n');

    const prompt = `
    As an expert AI auditor, analyze the following execution trace of a multi-step AI workflow.
    
    Workflow Definition:
    ${formatWorkflowForPrompt(workflow)}
    
    Audit Criteria: ${criteria.join(', ')}
    
    Full Execution Trace (showing user inputs, intermediate AI-simulated tool outputs, and agent outputs):
    ${formattedTrace}
    
    Provide a detailed analysis based on the criteria. For each criterion, give a score from 1 to 10 and a concise justification for the final output. 
    Also, provide an overall summary of the workflow's performance and a final overall score (1-10).
    Your analysis should consider the entire workflow's behavior, including how it handled simulated data from tools.
    
    The output must be in JSON format.
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
        return JSON.parse(jsonText) as Analysis;
    } catch (e) {
        console.error("Failed to parse analysis JSON:", response.text);
        throw new Error("Could not analyze the conversation. The model returned malformed JSON.");
    }
};

const improveSystemPrompt = async (config: AuditConfig, results: AuditResult[], language: string): Promise<{ improvedWorkflow: WorkflowNode[], explanation: string }> => {
    const ai = new GoogleGenAI({ apiKey: import.meta.env.VITE_GEMINI_API_KEY });

    const analysisSummary = results.map(r => ({
        test: r.testCase.title,
        score: r.analysis.overallScore,
        summary: r.analysis.summary,
        low_scores: r.analysis.criteriaBreakdown.filter(c => c.score < 8).map(c => `${c.criterion} (Score: ${c.score}): ${c.justification}`).join('\n')
    })).filter(r => r.low_scores).map(r => `Test: "${r.test}" (Score: ${r.score})\nSummary: ${r.summary}\nWeaknesses:\n${r.low_scores}`).join('\n\n---\n\n');
    
    const originalAgentPrompts = config.workflow.filter(n => n.type === 'agent').map(n => (n as any).systemPrompt);

    const prompt = `
    As an expert AI agent designer, your task is to improve the system prompts within a complex workflow based on an audit report.
    The workflow includes both AI agents with system prompts and non-AI tool nodes. You can only change the system prompts of the AI agents.

    Original Workflow:
    ${formatWorkflowForPrompt(config.workflow)}

    Audit Criteria:
    ${config.criteria.join(', ')}

    Audit Analysis Summary (focusing on weaknesses):
    ${analysisSummary || "The agent performed well overall, but please review for any potential improvements."}

    Instructions:
    1.  Carefully analyze the audit feedback in the context of the entire workflow.
    2.  Rewrite the system prompts for the AI agent nodes to address the identified weaknesses. Your goal is to refine the prompts to achieve a near-perfect score (10/10) on all criteria, addressing every identified weakness.
    3.  If an agent's prompt is already optimal, return the original version for that agent.
    4.  Return an array of strings called "improvedPrompts". This array must contain the new prompts for each AI agent, in their original order. The number of prompts in the array must exactly match the number of AI agents in the workflow (${originalAgentPrompts.length}).
    5.  Do NOT change the core purpose of the agents. The goal is refinement and robustness.
    6.  Provide a concise explanation of the key changes you made and why they will lead to better performance for the whole system.

    Return your response as a single JSON object.
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
                    improvedPrompts: {
                        type: Type.ARRAY,
                        items: { type: Type.STRING }
                    },
                    explanation: { type: Type.STRING },
                },
                required: ['improvedPrompts', 'explanation'],
            },
        },
    });

    try {
        const jsonText = response.text.trim();
        const parsed = JSON.parse(jsonText);
        if (!Array.isArray(parsed.improvedPrompts) || parsed.improvedPrompts.length !== originalAgentPrompts.length) {
            throw new Error(`Model returned an incorrect number of improved prompts. Expected ${originalAgentPrompts.length}, got ${parsed.improvedPrompts.length}.`);
        }
        
        // Reconstruct the workflow with the improved prompts
        const improvedWorkflow = [...config.workflow];
        let promptIndex = 0;
        for(let i=0; i< improvedWorkflow.length; i++) {
            if (improvedWorkflow[i].type === 'agent') {
                (improvedWorkflow[i] as any).systemPrompt = parsed.improvedPrompts[promptIndex];
                promptIndex++;
            }
        }
        
        return { improvedWorkflow, explanation: parsed.explanation };
    } catch (e) {
        console.error("Failed to parse improvement JSON:", response.text, e);
        throw new Error("Could not generate improvements. The model returned malformed JSON or an incorrect structure.");
    }
};

export const suggestAuditCriteria = async (workflow: WorkflowNode[], language: string): Promise<string[]> => {
    const ai = new GoogleGenAI({ apiKey: import.meta.env.VITE_GEMINI_API_KEY });
    const prompt = `
    As an expert in testing and quality assurance for AI systems, analyze the following workflow.
    The workflow consists of AI agents and automated tool nodes. Your task is to propose a set of 5 to 7 highly relevant and specific audit criteria to evaluate its end-to-end performance and robustness.

    Workflow to Analyze:
    ${formatWorkflowForPrompt(workflow)}

    Instructions:
    -   Go beyond generic criteria like "be helpful".
    -   Think about the specific purpose of this workflow. What does success look like? What are the potential failure modes?
    -   If it involves data (like from a database tool), suggest criteria about data integrity or correct interpretation.
    -   If it's a multi-step reasoning task, suggest criteria about logical consistency between steps.
    -   The criteria should be measurable and actionable.

    Return your response as a single JSON array of strings.
    ${getLanguageInstruction(language)}
    `;

    const response = await ai.models.generateContent({
        model: 'gemini-2.5-pro',
        contents: prompt,
        config: {
            responseMimeType: "application/json",
            responseSchema: {
                type: Type.ARRAY,
                items: { type: Type.STRING }
            },
        },
    });
    
    try {
        const jsonText = response.text.trim();
        return JSON.parse(jsonText) as string[];
    } catch (e) {
        console.error("Failed to parse suggested criteria JSON:", response.text);
        throw new Error("Could not suggest criteria. The model returned malformed JSON.");
    }
}

/**
 * Execute a test case using real n8n workflow execution via webhook
 */
const runTestCaseWithN8nWebhook = async (
    webhookUrl: string,
    testCase: TestCase
): Promise<ChainedTestExecutionResult> => {
    const conversation: ConversationTurn[] = [];
    const fullTrace: TraceEvent[] = [];
    let stepCounter = 0;

    for (const [turnIndex, userPrompt] of testCase.prompts.entries()) {
        conversation.push({ author: 'user', message: userPrompt });

        // Add user input to trace
        fullTrace.push({
            step: stepCounter++,
            turn: turnIndex,
            nodeId: 'user-input',
            nodeName: 'User Input',
            nodeType: 'user',
            eventType: 'INPUT',
            content: userPrompt,
        });

        try {
            // Llamar al webhook de n8n
            const response = await fetch(webhookUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    userPrompt,
                    testCaseId: testCase.id,
                    testCaseTitle: testCase.title,
                    turn: turnIndex,
                }),
            });

            if (!response.ok) {
                throw new Error(`Webhook responded with status ${response.status}`);
            }

            const result = await response.json();
            
            // Agregar traza del webhook
            fullTrace.push({
                step: stepCounter++,
                turn: turnIndex,
                nodeId: 'n8n-webhook',
                nodeName: 'n8n Workflow',
                nodeType: 'tool',
                eventType: 'OUTPUT',
                content: JSON.stringify(result, null, 2),
            });

            // Extraer la respuesta
            const agentMessage = typeof result === 'string' 
                ? result 
                : result.response || result.output || result.message || JSON.stringify(result);

            conversation.push({ author: 'agent', message: agentMessage });

        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : 'Unknown error';
            throw new Error(`Failed to execute n8n webhook: ${errorMsg}`);
        }
    }

    return { conversation, fullTrace };
};

const processSingleTestCase = async (
    config: AuditConfig,
    testCase: TestCase,
    language: string,
    setProgress: ProgressCallback,
    progressInfo: { current: number; total: number }
): Promise<AuditResult> => {
    setProgress({
        message: `Executing test case: "${testCase.title}"`,
        current: progressInfo.current,
        total: progressInfo.total,
    });
    
    // Decide whether to use real n8n execution (webhook) or AI simulation
    let conversation: ConversationTurn[];
    let fullTrace: TraceEvent[];
    
    if (config.useRealExecution && config.n8nConfig?.webhookUrl) {
        // Ejecutar en n8n real vía webhook
        ({ conversation, fullTrace } = await runTestCaseWithN8nWebhook(config.n8nConfig.webhookUrl, testCase));
    } else {
        // Usar simulación con IA
        ({ conversation, fullTrace } = await runChainedTestCase(config.workflow, testCase));
    }
    
    setProgress({
        message: `Analyzing results for: "${testCase.title}"`,
        current: progressInfo.current,
        total: progressInfo.total,
    });
    
    const analysis = await analyzeConversation(config.workflow, config.criteria, fullTrace, language);

    return {
        id: testCase.id,
        testCase,
        conversation,
        analysis,
        fullTrace,
    };
};

export const runAuditOnTestCases = async (
    config: AuditConfig,
    testCases: TestCase[],
    setProgress: ProgressCallback,
    language: string
): Promise<AuditResult[]> => {
    const CONCURRENCY_LIMIT = 3;
    const results: AuditResult[] = [];
    const queue = [...testCases];
    let completedCount = 0;
    const totalTestCases = testCases.length;

    const worker = async () => {
        while (queue.length > 0) {
            const testCase = queue.shift();
            if (testCase) {
                try {
                    const result = await processSingleTestCase(
                        config, 
                        testCase, 
                        language, 
                        setProgress,
                        { current: completedCount, total: totalTestCases }
                    );
                    results.push(result);
                } catch (error) {
                    console.error(`Test case "${testCase.title}" failed:`, error);
                    setProgress({
                        message: `[ERROR] Test case "${testCase.title}" failed. Skipping.`,
                        current: completedCount,
                        total: totalTestCases,
                    });
                } finally {
                    completedCount++;
                    setProgress({ 
                        message: `Completed analysis for: "${testCase.title}"`,
                        current: completedCount,
                        total: totalTestCases,
                    });
                }
            }
        }
    };

    const workers = Array(CONCURRENCY_LIMIT).fill(null).map(() => worker());
    await Promise.all(workers);

    const testCaseOrder = testCases.map(tc => tc.id);
    return results.sort((a, b) => testCaseOrder.indexOf(a.id) - testCaseOrder.indexOf(b.id));
}

export const runFullAudit = async (
    config: AuditConfig,
    setProgress: ProgressCallback,
    onComplete: (results: AuditResult[]) => void,
    language: string
) => {
    setProgress({ 
        message: `Generating ${config.testCaseCount} test cases...`,
        current: 0,
        total: config.testCaseCount,
    });
    const testCases = await generateTestCases(config, language);
    if (!testCases || testCases.length === 0) {
        throw new Error("Failed to generate test cases.");
    }
    
    setProgress({
        message: `Successfully generated ${testCases.length} test cases.`,
        current: 0,
        total: testCases.length
    });
    await delay(API_CALL_DELAY_MS);

    setProgress({
        message: `Starting audit of ${testCases.length} test cases...`,
        current: 0,
        total: testCases.length
    });
    const results = await runAuditOnTestCases(config, testCases, setProgress, language);

    setProgress({
        message: 'Audit complete! Finalizing report...',
        current: testCases.length,
        total: testCases.length
    });
    onComplete(results);
};

export const runImprovementCycle = async (
    config: AuditConfig,
    originalResults: AuditResult[],
    setProgress: ProgressCallback,
    onComplete: (improvementData: ImprovementData) => void,
    language: string
) => {
    setProgress({
        message: "Analyzing results and generating improvements...",
        total: originalResults.length
    });
    const { improvedWorkflow, explanation } = await improveSystemPrompt(config, originalResults, language);
    
    setProgress({
        message: "Generated improved prompts. Re-running audit...",
        current: 0,
        total: originalResults.length
    });
    await delay(API_CALL_DELAY_MS);
    
    const newConfig: AuditConfig = {
        ...config,
        workflow: improvedWorkflow,
    };
    
    const originalTestCases = originalResults.map(r => r.testCase);
    
    const newResults = await runAuditOnTestCases(newConfig, originalTestCases, setProgress, language);

    setProgress({
        message: "Improvement cycle complete!",
        current: originalTestCases.length,
        total: originalTestCases.length
    });
    onComplete({ improvedWorkflow, explanation, newResults });
};

/**
 * Genera el JSON completo de n8n con los prompts mejorados
 * @param originalN8nJson - JSON original importado de n8n
 * @param improvedWorkflow - Workflow con prompts mejorados
 * @returns JSON de n8n listo para descargar e importar
 */
export const generateImprovedN8nJson = (
    originalN8nJson: any,
    improvedWorkflow: WorkflowNode[]
): any => {
    if (!originalN8nJson) {
        return null;
    }

    // Clonar el JSON original
    const improvedJson = JSON.parse(JSON.stringify(originalN8nJson));
    
    // Crear un mapa de system prompts mejorados por node id
    const promptsMap = new Map<string, string>();
    improvedWorkflow.forEach(node => {
        if (node.type === 'agent') {
            promptsMap.set(node.id, node.systemPrompt);
        }
    });

    // Actualizar los nodos en el JSON de n8n
    if (improvedJson.nodes && Array.isArray(improvedJson.nodes)) {
        improvedJson.nodes = improvedJson.nodes.map((node: any) => {
            // Buscar si este nodo tiene un prompt mejorado
            const improvedPrompt = promptsMap.get(node.id || node.name);
            
            if (improvedPrompt) {
                // Actualizar el system prompt en diferentes tipos de nodos de IA
                const updatedNode = { ...node };
                
                // Para nodos de agentes AI (@n8n/n8n-nodes-langchain.agent, etc.)
                if (node.parameters) {
                    // Buscar el campo de system message
                    if (node.parameters.systemMessage !== undefined) {
                        updatedNode.parameters = {
                            ...node.parameters,
                            systemMessage: improvedPrompt
                        };
                    }
                    // Para nodos de chat
                    else if (node.parameters.options?.systemMessage !== undefined) {
                        updatedNode.parameters = {
                            ...node.parameters,
                            options: {
                                ...node.parameters.options,
                                systemMessage: improvedPrompt
                            }
                        };
                    }
                    // Para nodos de prompt template
                    else if (node.parameters.text !== undefined) {
                        updatedNode.parameters = {
                            ...node.parameters,
                            text: improvedPrompt
                        };
                    }
                    // Para nodos personalizados con 'prompt' field
                    else if (node.parameters.prompt !== undefined) {
                        updatedNode.parameters = {
                            ...node.parameters,
                            prompt: improvedPrompt
                        };
                    }
                }
                
                return updatedNode;
            }
            
            return node;
        });
    }

    // Actualizar metadatos
    if (improvedJson.name) {
        improvedJson.name = `${improvedJson.name} (Optimizado)`;
    }
    
    // Agregar nota de mejora
    if (!improvedJson.settings) {
        improvedJson.settings = {};
    }
    improvedJson.settings.executionOrder = improvedJson.settings.executionOrder || 'v1';
    
    return improvedJson;
};