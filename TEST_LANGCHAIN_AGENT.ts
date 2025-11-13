/**
 * TEST: LangChain Agent - Should extract complete prompt, framework, tools
 */

import { initializeAgentExecutor } from 'langchain/agents';
import { OpenAI } from 'langchain/llms/openai';

const llm = new OpenAI({ temperature: 0 });

const systemPrompt = `You are a sophisticated sales agent.
Your responsibilities are:
1. Understand customer needs
2. Present relevant products
3. Handle objections professionally
4. Close the sale with integrity

You have access to product search tools and can generate quotes.
Always prioritize customer satisfaction over upselling.`;

const tools = [
  {
    name: 'search_products',
    description: 'Search for products matching customer criteria',
    func: async (query: string) => {
      // Implementation
      return [];
    }
  },
  {
    name: 'generate_quote',
    description: 'Generate a quote for selected products',
    func: async (productIds: string[]) => {
      // Implementation
      return { quote: 0, items: [] };
    }
  },
  {
    name: 'check_inventory',
    description: 'Check product availability in inventory',
    func: async (productId: string) => {
      // Implementation
      return { inStock: true, quantity: 50 };
    }
  }
];

async function initializeAgent() {
  const executor = await initializeAgentExecutor(tools, llm, 'zero-shot-react-description', {
    systemMessage: systemPrompt,
    verbose: true,
    maxIterations: 15
  });

  return executor;
}

export const agent = initializeAgent();
