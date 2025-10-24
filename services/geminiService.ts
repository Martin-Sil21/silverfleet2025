import { GoogleGenAI, Type, Chat } from "@google/genai";
import type { AuditConfig, TestCase, ConversationTurn, Analysis, AuditResult, ImprovementData, WorkflowNode } from './types';

const delay = (ms: number) => new Promise(res => setTimeout(res, ms));
const API_CALL_DELAY_MS = 500; // 2.5 second delay between calls to avoid rate limiting.

interface ChainedTestExecutionResult {
    conversation: ConversationTurn[];
    fullTrace: string;
}

const getLanguageInstruction = (language: string): string => {
    const langName = language === 'es' ? 'Spanish' : 'English';
    return `\n\nCRITICAL: You must provide your entire response, including all text and justifications, exclusively in ${langName}. Do not use any other language.`;
}

const formatWorkflowForPrompt = (workflow: WorkflowNode[]): string => {
    return workflow.map((node, index) => {
        if (node.type === 'agent') {
            return `Step ${index + 1} (AI Agent - ${node.name}): System Prompt: "${node.systemPrompt}"`;
        } else {
            return `Step ${index + 1} (Tool - ${node.name}): This tool simulates the output of a non-AI node. During the test, it will provide the following data as context for the next step: "${node.simulatedOutput}"`;
        }
    }).join('\n');
};

const generateTestCases = async (config: AuditConfig, language: string): Promise<TestCase[]> => {
    const ai = new GoogleGenAI({ apiKey: import.meta.env.VITE_GEMINI_API_KEY });
    const { workflow, criteria, testCaseCount } = config;

    const prompt = `
    Based on the following AI agent workflow and audit criteria, please generate ${testCaseCount} diverse and comprehensive test cases.
    The workflow may contain both AI agents and simulated tool nodes that provide context.
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
    let fullTrace = `Test Case: "${testCase.title}"\nScenario: ${testCase.scenario}\n\n`;
    const ai = new GoogleGenAI({ apiKey: import.meta.env.VITE_GEMINI_API_KEY });
    
    const chatSessions: Map<string, Chat> = new Map();

    for (const [index, userPrompt] of testCase.prompts.entries()) {
        fullTrace += `--- CONVERSATION TURN ${index + 1} ---\n`;
        fullTrace += `USER (to first agent): ${userPrompt}\n`;
        conversation.push({ author: 'user', message: userPrompt });

        let currentInput = userPrompt;

        // Process the input through the chain of agents and tools
        for (const [nodeIndex, node] of workflow.entries()) {
             fullTrace += `\nEXECUTING Step ${nodeIndex + 1}: ${node.type.toUpperCase()} - ${node.name}\n`;
             
             // Add a delay BETWEEN each node call to avoid rate limiting
             if (nodeIndex > 0) {
                await delay(API_CALL_DELAY_MS);
             }

             if (node.type === 'agent') {
                fullTrace += `  Input: ${currentInput.substring(0, 200)}...\n`;

                if (!chatSessions.has(node.id)) {
                    chatSessions.set(node.id, ai.chats.create({
                        model: 'gemini-2.5-flash',
                        config: { systemInstruction: node.systemPrompt },
                    }));
                }
                const chat = chatSessions.get(node.id)!;
                const result = await chat.sendMessage({ message: currentInput });
                currentInput = result.text;
                fullTrace += `  Output: ${currentInput}\n`;
             } else { // It's a tool node
                fullTrace += `  Simulated Output (will be passed to next step): ${node.simulatedOutput}\n`;
                currentInput = node.simulatedOutput;
             }
        }
        
        const finalAgentMessage = currentInput;
        conversation.push({ author: 'agent', message: finalAgentMessage });
        fullTrace += `--------------------------------\n\n`;
    }
    return { conversation, fullTrace };
};


const analyzeConversation = async (workflow: WorkflowNode[], criteria: string[], fullTrace: string, language: string): Promise<Analysis> => {
    const ai = new GoogleGenAI({ apiKey: import.meta.env.VITE_GEMINI_API_KEY });

    const prompt = `
    As an expert AI auditor, analyze the following execution trace of a multi-step AI workflow.
    
    Workflow Definition:
    ${formatWorkflowForPrompt(workflow)}
    
    Audit Criteria: ${criteria.join(', ')}
    
    Full Execution Trace (showing user inputs, intermediate tool outputs, and agent outputs):
    ${fullTrace}
    
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

export const runAuditOnTestCases = async (
    config: AuditConfig,
    testCases: TestCase[],
    setProgress: (message: string) => void,
    language: string
): Promise<AuditResult[]> => {
    const results: AuditResult[] = [];
    for (let i = 0; i < testCases.length; i++) {
        const testCase = testCases[i];
        setProgress(`Running test case ${i + 1}/${testCases.length}: "${testCase.title}"`);
        const { conversation, fullTrace } = await runChainedTestCase(config.workflow, testCase);
        
        await delay(API_CALL_DELAY_MS); // Add delay between conversation and analysis
        
        setProgress(`Analyzing results for test case ${i + 1}/${testCases.length}...`);
        const analysis = await analyzeConversation(config.workflow, config.criteria, fullTrace, language);

        results.push({
            id: testCase.id,
            testCase,
            conversation,
            analysis,
        });
        
        if (i < testCases.length - 1) {
            await delay(API_CALL_DELAY_MS);
        }
    }
    return results;
}

export const runFullAudit = async (
    config: AuditConfig,
    setProgress: (message: string) => void,
    onComplete: (results: AuditResult[]) => void,
    language: string
) => {
    setProgress(`Generating ${config.testCaseCount} test cases...`);
    const testCases = await generateTestCases(config, language);
    if (!testCases || testCases.length === 0) {
        throw new Error("Failed to generate test cases.");
    }
    
    await delay(API_CALL_DELAY_MS); // Add delay after generating test cases

    const results = await runAuditOnTestCases(config, testCases, setProgress, language);

    setProgress('Audit complete!');
    onComplete(results);
};

export const runImprovementCycle = async (
    config: AuditConfig,
    originalResults: AuditResult[],
    setProgress: (message: string) => void,
    onComplete: (improvementData: ImprovementData) => void,
    language: string
) => {
    setProgress("Analyzing results and generating improvements...");
    const { improvedWorkflow, explanation } = await improveSystemPrompt(config, originalResults, language);
    
    await delay(API_CALL_DELAY_MS); // Add delay after generating improvements
    
    const newConfig: AuditConfig = {
        ...config,
        workflow: improvedWorkflow,
    };
    
    const originalTestCases = originalResults.map(r => r.testCase);

    setProgress("Re-running audit on improved agent...");
    const newResults = await runAuditOnTestCases(newConfig, originalTestCases, setProgress, language);

    setProgress("Improvement cycle complete!");
    onComplete({ improvedWorkflow, explanation, newResults });
};
