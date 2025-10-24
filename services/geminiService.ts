
import { GoogleGenAI, Type, Chat } from "@google/genai";
import type { AuditConfig, TestCase, ConversationTurn, Analysis, AuditResult } from './types';

// This function should be placed in a real app in a secure environment
// For this example, we assume process.env.API_KEY is available.
const getApiKey = () => {
    const key = process.env.API_KEY;
    if (!key) {
        throw new Error("API_KEY environment variable not set.");
    }
    return key;
};

const delay = (ms: number) => new Promise(res => setTimeout(res, ms));
const API_CALL_DELAY_MS = 1500; // 1.5 second delay between calls to avoid rate limiting.

const generateTestCases = async (config: AuditConfig): Promise<TestCase[]> => {
    const ai = new GoogleGenAI({ apiKey: getApiKey() });
    const { systemPrompts, criteria, testCaseCount } = config;

    const prompt = `
    Based on the following AI agent system prompt(s) and audit criteria, please generate ${testCaseCount} diverse and comprehensive test cases.
    The agent may be a chain of multiple agents. The user interacts with the first agent, and the final output comes from the last agent.
    Each test case should include a unique ID, a concise title, a scenario description, and an array of user prompts to simulate a conversation.
    The goal is to create test cases that can effectively evaluate the entire agent chain's performance against the provided criteria.

    System Prompts (in order of execution): 
    ${systemPrompts.map((p, i) => `Agent ${i + 1}: "${p}"`).join('\n')}

    Audit Criteria: ${criteria.join(', ')}

    Return the result as a JSON array.
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

const runChainedTestCase = async (systemPrompts: string[], testCase: TestCase): Promise<ConversationTurn[]> => {
    const conversation: ConversationTurn[] = [];
    const ai = new GoogleGenAI({ apiKey: getApiKey() });

    for (const [index, userPrompt] of testCase.prompts.entries()) {
        // Delay between each conversational turn from the user.
        if (index > 0) {
            await delay(API_CALL_DELAY_MS);
        }
        conversation.push({ author: 'user', message: userPrompt });

        let currentInput = userPrompt;

        // Process the input through the chain of agents
        for (const [agentIndex, systemPrompt] of systemPrompts.entries()) {
             // Add a delay BETWEEN each agent call in the chain to avoid rate limiting
             if (agentIndex > 0) {
                await delay(API_CALL_DELAY_MS);
             }

             const chat: Chat = ai.chats.create({
                 model: 'gemini-2.5-flash',
                 config: { systemInstruction: systemPrompt },
             });
             const result = await chat.sendMessage({ message: currentInput });
             currentInput = result.text;
        }

        conversation.push({ author: 'agent', message: currentInput });
    }
    return conversation;
};


const analyzeConversation = async (systemPrompts: string[], criteria: string[], conversation: ConversationTurn[]): Promise<Analysis> => {
    const ai = new GoogleGenAI({ apiKey: getApiKey() });

    const prompt = `
    As an expert AI auditor, analyze the following conversation which was handled by a chain of AI agents.
    
    AI Agent Chain System Prompts (in order):
    ${systemPrompts.map((p, i) => `Agent ${i + 1}: "${p}"`).join('\n')}
    
    Audit Criteria: ${criteria.join(', ')}
    
    Conversation Transcript (User queries and FINAL output from the last agent):
    ${conversation.map(turn => `${turn.author.toUpperCase()}: ${turn.message}`).join('\n')}
    
    Provide a detailed analysis based on the criteria. For each criterion, give a score from 1 to 10 and a concise justification. 
    Also, provide an overall summary of the agent's performance and a final overall score (1-10).
    
    The output must be in JSON format.
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

const improveSystemPrompt = async (config: AuditConfig, results: AuditResult[]): Promise<{ improvedPrompt: string, explanation: string }> => {
    const ai = new GoogleGenAI({ apiKey: getApiKey() });

    const analysisSummary = results.map(r => ({
        test: r.testCase.title,
        score: r.analysis.overallScore,
        summary: r.analysis.summary,
        low_scores: r.analysis.criteriaBreakdown.filter(c => c.score < 7).map(c => `${c.criterion} (Score: ${c.score}): ${c.justification}`).join('\n')
    })).filter(r => r.low_scores).map(r => `Test: "${r.test}" (Score: ${r.score})\nSummary: ${r.summary}\nWeaknesses:\n${r.low_scores}`).join('\n\n---\n\n');

    const prompt = `
    As an expert AI agent designer, your task is to improve an AI agent's primary system prompt based on an audit report of a multi-agent chain.
    You will be given the original system prompts for the entire chain, the audit criteria, and a summary of the audit's findings.
    Your goal is to improve the FIRST system prompt in the chain, as it is the primary agent interacting with the user.

    Original System Prompts:
    ${config.systemPrompts.map((p, i) => `Agent ${i + 1}: "${p}"`).join('\n')}

    Audit Criteria:
    ${config.criteria.join(', ')}

    Audit Analysis Summary (focusing on weaknesses):
    ${analysisSummary || "The agent performed well overall, but please review the prompt for any potential areas of improvement in clarity, safety, or conciseness."}

    Instructions:
    1.  Carefully analyze the audit feedback in the context of the entire agent chain.
    2.  Rewrite ONLY the first system prompt (Agent 1) to address the identified weaknesses. The goal is to improve the initial input processing to benefit the entire chain.
    3.  Do NOT change the core persona or purpose of the agent. The goal is refinement.
    4.  Provide a brief explanation of the key changes you made and why they will lead to better performance for the whole system.

    Return your response as a single JSON object.
    `;

    const response = await ai.models.generateContent({
        model: 'gemini-2.5-pro',
        contents: prompt,
        config: {
            responseMimeType: "application/json",
            responseSchema: {
                type: Type.OBJECT,
                properties: {
                    improvedPrompt: { type: Type.STRING },
                    explanation: { type: Type.STRING },
                },
                required: ['improvedPrompt', 'explanation'],
            },
        },
    });

    try {
        const jsonText = response.text.trim();
        return JSON.parse(jsonText);
    } catch (e) {
        console.error("Failed to parse improvement JSON:", response.text);
        throw new Error("Could not generate improvements. The model returned malformed JSON.");
    }
};

export const runAuditOnTestCases = async (
    config: AuditConfig,
    testCases: TestCase[],
    setProgress: (message: string) => void
): Promise<AuditResult[]> => {
    const results: AuditResult[] = [];
    for (let i = 0; i < testCases.length; i++) {
        const testCase = testCases[i];
        setProgress(`Running test case ${i + 1}/${testCases.length}: "${testCase.title}"`);
        const conversation = await runChainedTestCase(config.systemPrompts, testCase);
        
        await delay(API_CALL_DELAY_MS); // Add delay between conversation and analysis
        
        setProgress(`Analyzing results for test case ${i + 1}/${testCases.length}...`);
        const analysis = await analyzeConversation(config.systemPrompts, config.criteria, conversation);

        results.push({
            id: testCase.id,
            testCase,
            conversation,
            analysis,
        });
    }
    return results;
}

export const runFullAudit = async (
    config: AuditConfig,
    setProgress: (message: string) => void,
    onComplete: (results: AuditResult[]) => void
) => {
    setProgress(`Generating ${config.testCaseCount} test cases...`);
    const testCases = await generateTestCases(config);
    if (!testCases || testCases.length === 0) {
        throw new Error("Failed to generate test cases.");
    }
    
    await delay(API_CALL_DELAY_MS); // Add delay after generating test cases

    const results = await runAuditOnTestCases(config, testCases, setProgress);

    setProgress('Audit complete!');
    onComplete(results);
};

export const runImprovementCycle = async (
    config: AuditConfig,
    originalResults: AuditResult[],
    setProgress: (message: string) => void,
    onComplete: (improvementData: { improvedPrompt: string, explanation: string, newResults: AuditResult[] }) => void
) => {
    setProgress("Analyzing results and generating improvements...");
    const { improvedPrompt, explanation } = await improveSystemPrompt(config, originalResults);
    
    await delay(API_CALL_DELAY_MS); // Add delay after generating improvements
    
    const newSystemPrompts = [...config.systemPrompts];
    newSystemPrompts[0] = improvedPrompt;

    const newConfig: AuditConfig = {
        ...config,
        systemPrompts: newSystemPrompts,
    };
    
    const originalTestCases = originalResults.map(r => r.testCase);

    setProgress("Re-running audit on improved agent...");
    const newResults = await runAuditOnTestCases(newConfig, originalTestCases, setProgress);

    setProgress("Improvement cycle complete!");
    onComplete({ improvedPrompt, explanation, newResults });
};
