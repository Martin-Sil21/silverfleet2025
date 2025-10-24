import type { N8nAgentConfig } from '../types';

interface N8nNode {
  parameters: Record<string, any>;
  name: string;
  type: string;
  id: string; // n8n node ID
  credentials?: any;
}

interface N8nConnection {
    source: {
        node: string;
    };
    target: {
        node: string;
    };
}

interface N8nWorkflow {
  nodes: N8nNode[];
  connections: Record<string, any>; // It's an object, not an array
}

const getSystemPromptFromNode = (parameters: Record<string, any>): string | undefined => {
    if (!parameters) return undefined;
    
    const possibleKeys = ['systemInstruction', 'systemMessage', 'system_prompt', 'prompt'];

    for (const key of possibleKeys) {
        if (typeof parameters[key] === 'string' && parameters[key].trim() !== '') {
            return parameters[key];
        }
    }

    if (parameters.options && typeof parameters.options === 'object' && !Array.isArray(parameters.options)) {
        for (const key of possibleKeys) {
            if (typeof parameters.options[key] === 'string' && parameters.options[key].trim() !== '') {
                return parameters.options[key];
            }
        }
    }
    
    if (parameters.jsonParameters && typeof parameters.jsonParameters === 'string') {
        try {
            const parsedJsonParams = JSON.parse(parameters.jsonParameters);
            if (parsedJsonParams && typeof parsedJsonParams === 'object' && !Array.isArray(parsedJsonParams)) {
                 for (const key of possibleKeys) {
                    if (typeof parsedJsonParams[key] === 'string' && parsedJsonParams[key].trim() !== '') {
                        return parsedJsonParams[key];
                    }
                }
            }
        } catch (e) { /* Not valid JSON, ignore. */ }
    }
    
    return undefined;
}

const topologicalSort = (nodes: N8nAgentConfig[], connections: N8nConnection[]): N8nAgentConfig[] => {
    const sorted: N8nAgentConfig[] = [];
    const inDegree: { [key: string]: number } = {};
    const adjList: { [key: string]: string[] } = {};
    const nodeMap: { [key: string]: N8nAgentConfig } = {};

    nodes.forEach(node => {
        inDegree[node.id] = 0;
        adjList[node.id] = [];
        nodeMap[node.id] = node;
    });

    connections.forEach(conn => {
        // Ensure both source and target are agent nodes before processing
        if (adjList[conn.source.node] !== undefined && adjList[conn.target.node] !== undefined) {
            adjList[conn.source.node].push(conn.target.node);
            inDegree[conn.target.node]++;
        }
    });

    const queue = nodes.filter(node => inDegree[node.id] === 0);

    while (queue.length > 0) {
        const uNode = queue.shift()!;
        sorted.push(uNode);

        if (adjList[uNode.id]) {
            for (const v of adjList[uNode.id]) {
                inDegree[v]--;
                if (inDegree[v] === 0) {
                    const vNode = nodeMap[v];
                    if (vNode) queue.push(vNode);
                }
            }
        }
    }
    
    // If a cycle is detected, or not all nodes are sorted, fallback to original order
    if (sorted.length !== nodes.length) {
        return nodes; 
    }

    return sorted;
};

export const parseN8nWorkflow = (jsonContent: string): N8nAgentConfig[] => {
  try {
    const workflow: N8nWorkflow = JSON.parse(jsonContent);

    if (!workflow || !Array.isArray(workflow.nodes) || !workflow.connections) {
      throw new Error("Invalid n8n workflow structure. 'nodes' or 'connections' not found.");
    }

    const aiAgents: N8nAgentConfig[] = workflow.nodes
      .map((node, index) => {
        const systemPrompt = getSystemPromptFromNode(node.parameters);
        if (systemPrompt) {
          return {
            id: node.id,
            name: node.name || `Unnamed Agent Node ${index + 1}`,
            type: node.type,
            systemPrompt: systemPrompt,
          };
        }
        return null;
      })
      .filter((agent): agent is N8nAgentConfig => agent !== null);
      
    if (aiAgents.length === 0) {
        throw new Error("No AI agent nodes with a recognizable system prompt were found in the workflow.");
    }

    if (aiAgents.length <= 1) {
        return aiAgents;
    }

    // Transform the n8n connections object into an array for sorting
    const nameToIdMap = new Map<string, string>();
    workflow.nodes.forEach(node => nameToIdMap.set(node.name, node.id));

    const connectionsArray: N8nConnection[] = [];
    const connectionsObject = workflow.connections;

    for (const sourceNodeName in connectionsObject) {
      if (!Object.prototype.hasOwnProperty.call(connectionsObject, sourceNodeName)) continue;

      const sourceNodeId = nameToIdMap.get(sourceNodeName);
      if (!sourceNodeId) continue;

      const outputs = connectionsObject[sourceNodeName];
      for (const outputType in outputs) {
        if (!Object.prototype.hasOwnProperty.call(outputs, outputType)) continue;

        const targetGroups = outputs[outputType];
        if (Array.isArray(targetGroups)) {
          for (const group of targetGroups) {
            if (Array.isArray(group)) {
              for (const target of group) {
                if (target && target.node) {
                  const targetNodeId = nameToIdMap.get(target.node);
                  if (targetNodeId) {
                    connectionsArray.push({
                      source: { node: sourceNodeId },
                      target: { node: targetNodeId },
                    });
                  }
                }
              }
            }
          }
        }
      }
    }

    const sortedAgents = topologicalSort(aiAgents, connectionsArray);
    return sortedAgents;

  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error("Failed to parse the file. Please ensure it's a valid JSON file.");
    }
    throw error;
  }
};