import type { ParsedN8nNode, N8nConnection, ParsedN8nWorkflow } from '../types';

interface N8nNode {
  parameters: Record<string, any>;
  name: string;
  type: string;
  id: string; // n8n node ID
  credentials?: any;
  position: [number, number];
}

interface N8nRawWorkflow {
  nodes: N8nNode[];
  connections: Record<string, any>;
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

const transformConnections = (n8nConnections: Record<string, any>, nodes: N8nNode[]): N8nConnection[] => {
    const connections: N8nConnection[] = [];
    const idToNodeMap = new Map<string, N8nNode>(nodes.map(n => [n.id, n]));

    for (const sourceId in n8nConnections) {
        if (!Object.prototype.hasOwnProperty.call(n8nConnections, sourceId)) continue;
        
        const sourceNode = idToNodeMap.get(sourceId);
        if (!sourceNode) continue;

        const outputs = n8nConnections[sourceId];
        for (const sourceHandle in outputs) {
            if (!Object.prototype.hasOwnProperty.call(outputs, sourceHandle)) continue;
            
            const targetGroups = outputs[sourceHandle];
            if (Array.isArray(targetGroups)) {
                for (const group of targetGroups) {
                     if(Array.isArray(group)) {
                         for (const target of group) {
                            if(target.id) {
                                const targetNode = idToNodeMap.get(target.id);
                                if (targetNode) {
                                    connections.push({ sourceNodeId: sourceNode.id, targetNodeId: targetNode.id, sourceHandle });
                                }
                            }
                         }
                     }
                }
            }
        }
    }
    return connections;
};

export const parseN8nWorkflow = (jsonContent: string): ParsedN8nWorkflow => {
  try {
    const workflow: N8nRawWorkflow = JSON.parse(jsonContent);

    if (!workflow || !Array.isArray(workflow.nodes) || !workflow.connections) {
      throw new Error("Invalid n8n workflow structure. 'nodes' or 'connections' not found.");
    }

    const detectedEndpoints: string[] = [];
    
    // 🔥 ESTRATEGIA 1: Buscar el nodo WEBHOOK en CUALQUIER posición
    const webhookTypes = ['n8n-nodes-base.webhook', 'webhook'];
    let webhookFound = false;
    
    for (const node of workflow.nodes) {
        if (webhookTypes.some(type => node.type.toLowerCase().includes(type))) {
            console.log(`🎯 Nodo Webhook detectado: ${node.name} (posición ${workflow.nodes.indexOf(node) + 1})`);
            webhookFound = true;
            
            // La URL del webhook puede estar en diferentes lugares
            const webhookUrl = node.parameters?.path || 
                              node.parameters?.webhookUrl ||
                              node.parameters?.url;
            
            if (typeof webhookUrl === 'string' && webhookUrl.trim()) {
                // Si la URL es relativa (ej: "590785a9-e814-4a42-959a-7e8e4ff5ab9e"), 
                // necesitamos el dominio base
                let fullUrl = webhookUrl.trim();
                
                // Si no empieza con http, es un path relativo
                if (!fullUrl.startsWith('http')) {
                    // Buscar el dominio en webhookId o en la configuración
                    const domain = node.parameters?.httpMethod === 'POST' ? 
                                  'https://silverfleet.com.ar/webhook/' : 
                                  'http://localhost:5678/webhook/';
                    fullUrl = `${domain}${fullUrl}`;
                }
                
                console.log(`   ✅ URL del webhook: ${fullUrl}`);
                detectedEndpoints.push(fullUrl);
                break; // Solo necesitamos el primer webhook
            } else {
                console.log(`   ⚠️ No se encontró URL en el webhook`);
            }
        }
    }
    
    // 🔥 ESTRATEGIA 2 (FALLBACK): Si no hay webhook, buscar httpRequest (solo si NO encontramos webhook)
    if (detectedEndpoints.length === 0) {
        console.log(`   🔍 No se encontró webhook, buscando httpRequest...`);
        workflow.nodes.forEach(node => {
            if (node.type === 'n8n-nodes-base.httpRequest') {
                const url = node.parameters?.url;
                if (typeof url === 'string' && url.trim().startsWith('http') && !url.includes('{{')) {
                    console.log(`   ℹ️ URL de httpRequest encontrada: ${url.trim()}`);
                    detectedEndpoints.push(url.trim());
                }
            }
        });
    }

    const allNodes: ParsedN8nNode[] = workflow.nodes.map((node) => {
      const systemPrompt = getSystemPromptFromNode(node.parameters);
      const position = { x: node.position?.[0] || 0, y: node.position?.[1] || 0 };
      
      if (systemPrompt) {
        return {
          id: node.id,
          name: node.name || `Unnamed Agent Node`,
          type: node.type,
          nodeType: 'agent',
          systemPrompt,
          parameters: node.parameters,
          position,
        };
      }
      return {
        id: node.id,
        name: node.name || `Unnamed Tool Node`,
        type: node.type,
        nodeType: 'tool',
        parameters: node.parameters,
        position,
      };
    });
      
    if (allNodes.length === 0) {
        throw new Error("No nodes were found in the workflow.");
    }
    
    const connections = transformConnections(workflow.connections, workflow.nodes);
    
    return { 
      nodes: allNodes, 
      connections, 
      detectedEndpoints: [...new Set(detectedEndpoints)],
      rawNodes: workflow.nodes // 🔥 NUEVO: Guardar nodos originales para análisis de payload
    };

  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error("Failed to parse the file. Please ensure it's a valid JSON file.");
    }
    console.error("n8n Parsing Error:", error);
    throw error;
  }
};