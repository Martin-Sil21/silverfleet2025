import type { ParsedN8nNode } from '../types';

interface N8nNode {
  parameters: Record<string, any>;
  name: string;
  type: string;
  id: string; // n8n node ID
  credentials?: any;
}

interface N8nConnection {
    sourceNodeId: string;
    targetNodeId: string;
}

interface N8nWorkflow {
  nodes: N8nNode[];
  connections: N8nConnection[];
}

const getSystemPromptFromNode = (parameters: Record<string, any>): string | undefined => {
    if (!parameters) return undefined;
    
    // Most common keys first
    const possibleKeys = ['systemMessage', 'system_prompt', 'systemInstruction', 'prompt'];

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

const topologicalSort = (nodes: ParsedN8nNode[], connections: N8nConnection[]): ParsedN8nNode[] => {
    const sorted: ParsedN8nNode[] = [];
    const inDegree: { [key: string]: number } = {};
    const adjList: { [key: string]: string[] } = {};
    const nodeMap: { [key: string]: ParsedN8nNode } = {};

    nodes.forEach(node => {
        inDegree[node.id] = 0;
        adjList[node.id] = [];
        nodeMap[node.id] = node;
    });

    connections.forEach(conn => {
        if (adjList[conn.sourceNodeId] !== undefined && adjList[conn.targetNodeId] !== undefined) {
            adjList[conn.sourceNodeId].push(conn.targetNodeId);
            inDegree[conn.targetNodeId]++;
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
    
    if (sorted.length !== nodes.length) {
        console.warn("Cycle detected in graph or disconnected components; returning original node order.");
        return nodes; 
    }

    return sorted;
};

const transformConnections = (n8nConnections: Record<string, any>, nodes: N8nNode[]): N8nConnection[] => {
    const connections: N8nConnection[] = [];
    const idToNodeMap = new Map<string, N8nNode>(nodes.map(n => [n.id, n]));

    for (const sourceId in n8nConnections) {
        if (!Object.prototype.hasOwnProperty.call(n8nConnections, sourceId)) continue;
        
        const sourceNode = idToNodeMap.get(sourceId);
        if (!sourceNode) continue;

        const outputs = n8nConnections[sourceId];
        for (const outputType in outputs) {
            if (!Object.prototype.hasOwnProperty.call(outputs, outputType)) continue;
            
            const targetGroups = outputs[outputType];
            if (Array.isArray(targetGroups)) {
                for (const group of targetGroups) {
                     if(group.id) { // This is the new format
                        const targetNode = idToNodeMap.get(group.id);
                        if (targetNode) {
                            connections.push({ sourceNodeId: sourceNode.id, targetNodeId: targetNode.id });
                        }
                    }
                }
            }
        }
    }
    return connections;
};

export const parseN8nWorkflow = (jsonContent: string): ParsedN8nNode[] => {
  try {
    const workflow: N8nWorkflow = JSON.parse(jsonContent);

    if (!workflow || !Array.isArray(workflow.nodes) || !workflow.connections) {
      throw new Error("Invalid n8n workflow structure. 'nodes' or 'connections' not found.");
    }

    const allNodes: ParsedN8nNode[] = workflow.nodes.map((node) => {
      const systemPrompt = getSystemPromptFromNode(node.parameters);
      if (systemPrompt) {
        return {
          id: node.id,
          name: node.name || `Unnamed Agent Node`,
          type: node.type,
          nodeType: 'agent',
          systemPrompt,
        };
      }
      return {
        id: node.id,
        name: node.name || `Unnamed Tool Node`,
        type: node.type,
        nodeType: 'tool',
      };
    });
      
    if (allNodes.length === 0) {
        throw new Error("No nodes were found in the workflow.");
    }
    
    if (allNodes.length === 1) {
        return allNodes;
    }
    
    const connections = transformConnections(workflow.connections as any, workflow.nodes);
    
    const sortedNodes = topologicalSort(allNodes, connections);
    return sortedNodes;

  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error("Failed to parse the file. Please ensure it's a valid JSON file.");
    }
    console.error("n8n Parsing Error:", error);
    throw error;
  }
};
