
import { GoogleGenAI, Type, Chat } from "@google/genai";
import type { AuditConfig, TestCase, ConversationTurn, Analysis, AuditResult, ImprovementData } from './types';

const delay = (ms: number) => new Promise(res => setTimeout(res, ms));
const API_CALL_DELAY_MS = 2500; // 2.5 second delay between calls to avoid rate limiting.

interface ChainedTestExecutionResult {
    conversation: ConversationTurn[];
    fullTrace: string;
}

const getLanguageInstruction = (language: string): string => {
    const langName = language === 'es' ? 'Spanish' : 'English';
    return `\n\nCRITICAL: You must provide your entire response, including all text and justifications, exclusively in ${langName}. Do not use any other language.`;
}

const generateTestCases = async (config: AuditConfig, language: string): Promise<TestCase[]> => {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
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

const runChainedTestCase = async (systemPrompts: string[], testCase: TestCase): Promise<ChainedTestExecutionResult> => {
    const conversation: ConversationTurn[] = [];
    let fullTrace = `Test Case: "${testCase.title}"\nScenario: ${testCase.scenario}\n\n`;
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

    for (const [index, userPrompt] of testCase.prompts.entries()) {
        fullTrace += `--- CONVERSATION TURN ${index + 1} ---\n`;
        fullTrace += `USER: ${userPrompt}\n`;
        // Delay between each conversational turn from the user.
        if (index > 0) {
            await delay(API_CALL_DELAY_MS);
        }
        conversation.push({ author: 'user', message: userPrompt });

        let currentInput = userPrompt;

        // Process the input through the chain of agents
        for (const [agentIndex, systemPrompt] of systemPrompts.entries()) {
             fullTrace += `AGENT ${agentIndex + 1} (Input): ${currentInput.substring(0, 200)}...\n`;
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
             fullTrace += `AGENT ${agentIndex + 1} (Output): ${currentInput}\n`;
        }

        conversation.push({ author: 'agent', message: currentInput });
        fullTrace += `--------------------------------\n\n`;
    }
    return { conversation, fullTrace };
};


const analyzeConversation = async (systemPrompts: string[], criteria: string[], fullTrace: string, language: string): Promise<Analysis> => {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

    const prompt = `
    As an expert AI auditor, analyze the following execution trace of a multi-agent AI chain.
    
    AI Agent Chain System Prompts (in order):
    ${systemPrompts.map((p, i) => `Agent ${i + 1}: "${p}"`).join('\n')}
    
    Audit Criteria: ${criteria.join(', ')}
    
    Full Execution Trace (showing user inputs and all intermediate agent outputs):
    ${fullTrace}
    
    Provide a detailed analysis based on the criteria. For each criterion, give a score from 1 to 10 and a concise justification. 
    Also, provide an overall summary of the agent chain's performance and a final overall score (1-10).
    Your analysis should consider the entire chain's behavior, not just the final output.
    
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

const improveSystemPrompt = async (config: AuditConfig, results: AuditResult[], language: string): Promise<{ improvedPrompts: string[], explanation: string }> => {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

    const analysisSummary = results.map(r => ({
        test: r.testCase.title,
        score: r.analysis.overallScore,
        summary: r.analysis.summary,
        low_scores: r.analysis.criteriaBreakdown.filter(c => c.score < 7).map(c => `${c.criterion} (Score: ${c.score}): ${c.justification}`).join('\n')
    })).filter(r => r.low_scores).map(r => `Test: "${r.test}" (Score: ${r.score})\nSummary: ${r.summary}\nWeaknesses:\n${r.low_scores}`).join('\n\n---\n\n');

    const prompt = `
    As an expert AI agent designer, your task is to improve a chain of AI agent system prompts based on an audit report.
    You will be given the original system prompts, the audit criteria, and a summary of the audit's findings.
    Your goal is to improve the system prompts to enhance the overall performance of the agent chain.

    Original System Prompts:
    ${config.systemPrompts.map((p, i) => `Agent ${i + 1}: "${p}"`).join('\n')}

    Audit Criteria:
    ${config.criteria.join(', ')}

    Audit Analysis Summary (focusing on weaknesses):
    ${analysisSummary || "The agent performed well overall, but please review the prompts for any potential areas of improvement in clarity, safety, or conciseness."}

    Instructions:
    1.  Carefully analyze the audit feedback in the context of the entire agent chain.
    2.  Rewrite any of the system prompts that need improvement to address the identified weaknesses.
    3.  If a prompt is already optimal, return the original version.
    4.  The number of prompts returned must exactly match the number of original prompts.
    5.  Do NOT change the core persona or purpose of the agents. The goal is refinement.
    6.  Provide a brief explanation of the key changes you made and why they will lead to better performance for the whole system.

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
        if (!Array.isArray(parsed.improvedPrompts) || parsed.improvedPrompts.length !== config.systemPrompts.length) {
            throw new Error("Model returned an incorrect number of improved prompts.");
        }
        return parsed;
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
        const { conversation, fullTrace } = await runChainedTestCase(config.systemPrompts, testCase);
        
        await delay(API_CALL_DELAY_MS); // Add delay between conversation and analysis
        
        setProgress(`Analyzing results for test case ${i + 1}/${testCases.length}...`);
        const analysis = await analyzeConversation(config.systemPrompts, config.criteria, fullTrace, language);

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
    const { improvedPrompts, explanation } = await improveSystemPrompt(config, originalResults, language);
    
    await delay(API_CALL_DELAY_MS); // Add delay after generating improvements
    
    const newConfig: AuditConfig = {
        ...config,
        systemPrompts: improvedPrompts,
    };
    
    const originalTestCases = originalResults.map(r => r.testCase);

    setProgress("Re-running audit on improved agent...");
    const newResults = await runAuditOnTestCases(newConfig, originalTestCases, setProgress, language);

    setProgress("Improvement cycle complete!");
    onComplete({ improvedPrompts, explanation, newResults });
};