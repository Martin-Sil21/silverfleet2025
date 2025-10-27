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
    let detectedSamplePayload: Record<string, any> = {};

    console.log('🔍 Starting n8n workflow parsing...');
    console.log('🔍 Found nodes:', workflow.nodes.map(n => `${n.type}: ${n.name}`).join(', '));

    // First, detect webhook endpoints and extract payload schema
    workflow.nodes.forEach(node => {
        console.log(`🔍 Analyzing node: ${node.type} - ${node.name}`);

        // Detect HTTP Request nodes
        if (node.type === 'n8n-nodes-base.httpRequest') {
            const url = node.parameters?.url;
            if (typeof url === 'string' && url.trim().startsWith('http') && !url.includes('{{')) {
                detectedEndpoints.push(url.trim());
                console.log('✅ HTTP Request URL detectada:', url.trim());
            }
        }

        // Detect Webhook nodes (multiple types)
        if (node.type === 'n8n-nodes-base.webhook' ||
            node.type === 'n8n-nodes-base.form' ||
            node.type === 'n8n-nodes-base.formTrigger' ||
            node.name?.toLowerCase().includes('webhook') ||
            node.name?.toLowerCase().includes('hook')) {

            console.log(`🔍 Potential webhook node found: ${node.type} - ${node.name}`);
            console.log(`🔍 Node parameters:`, JSON.stringify(node.parameters, null, 2));
            console.log(`🔍 Node credentials:`, node.credentials);

            // Try different URL patterns for webhooks
            let webhookUrl = '';

            // Pattern 1: httpHost + path
            const webhookPath = node.parameters?.path;
            const httpHost = node.parameters?.httpHost;
            if (webhookPath && httpHost) {
                webhookUrl = `https://${httpHost}${webhookPath}`;
            }

            // Pattern 2: Direct URL in parameters
            if (node.parameters?.url) {
                webhookUrl = node.parameters.url;
            }

            // Pattern 3: Webhook ID in parameters
            if (node.parameters?.webhookId) {
                webhookUrl = `https://silverfleet.com.ar/webhook/${node.parameters.webhookId}`;
            }

            // Pattern 4: Look for any URL in the parameters
            if (!webhookUrl) {
                const allParams = JSON.stringify(node.parameters);
                const urlMatch = allParams.match(/https?:\/\/[^\s"]+/);
                if (urlMatch) {
                    webhookUrl = urlMatch[0];
                }
            }

            // Pattern 5: Check for specific silverfleet.com.ar patterns
            if (!webhookUrl && node.parameters?.path) {
                const path = node.parameters.path;
                if (typeof path === 'string' && path.startsWith('/')) {
                    webhookUrl = `https://silverfleet.com.ar${path}`;
                }
            }

            // Pattern 6: Check credentials for webhook URL
            if (!webhookUrl && node.credentials) {
                const credentials = JSON.stringify(node.credentials);
                const urlMatch = credentials.match(/https?:\/\/[^\s"]+/);
                if (urlMatch) {
                    webhookUrl = urlMatch[0];
                }
            }

            // Pattern 7: Look for webhook URLs in the entire node JSON
            if (!webhookUrl) {
                const nodeJson = JSON.stringify(node);
                const urlMatches = nodeJson.match(/https?:\/\/[^\s",}]+\.ar[^"\s,}]+/g);
                if (urlMatches) {
                    for (const match of urlMatches) {
                        if (match.includes('silverfleet.com.ar') || match.includes('webhook')) {
                            webhookUrl = match;
                            break;
                        }
                    }
                }
            }

            // Pattern 8: Check for common webhook URL patterns
            if (!webhookUrl && node.parameters?.path) {
                const path = node.parameters.path;
                if (typeof path === 'string') {
                    // Look for webhook-like paths
                    if (path.includes('webhook') || path.includes('hook') || path.startsWith('/rest/')) {
                        webhookUrl = `https://silverfleet.com.ar${path}`;
                    }
                }
            }

            if (webhookUrl && !webhookUrl.includes('{{')) {
                detectedEndpoints.push(webhookUrl);
                console.log('✅ Webhook detectado:', webhookUrl);
            }

            // Try to extract payload schema from webhook node
            if (node.parameters?.schema) {
                detectedSamplePayload = node.parameters.schema;
                console.log('✅ Schema detectado del webhook:', detectedSamplePayload);
            }
        }

        // Detect Set nodes that might contain schema information
        if (node.type === 'n8n-nodes-base.set' && node.parameters?.values?.string) {
            const stringValues = Array.isArray(node.parameters.values.string)
                ? node.parameters.values.string
                : [node.parameters.values.string];

            stringValues.forEach((value: any) => {
                if (value.name === 'schema' || value.name === 'payload' || value.name === 'input') {
                    try {
                        const parsedSchema = JSON.parse(value.value);
                        if (parsedSchema && typeof parsedSchema === 'object') {
                            detectedSamplePayload = { ...detectedSamplePayload, ...parsedSchema };
                            console.log('✅ Schema detectado del Set node:', parsedSchema);
                        }
                    } catch (e) {
                        // Not valid JSON, ignore
                    }
                }
            });
        }
    });

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
    
    // If no specific payload was detected, try to infer from webhook or first node
    if (Object.keys(detectedSamplePayload).length === 0) {
        // Look for the first webhook or input node to infer the expected payload structure
        const firstWebhook = workflow.nodes.find(n =>
            n.type === 'n8n-nodes-base.webhook' ||
            n.type === 'n8n-nodes-base.formTrigger' ||
            n.type === 'n8n-nodes-base.form'
        );

        if (firstWebhook) {
            // Try to extract schema from webhook parameters
            if (firstWebhook.parameters?.schema) {
                detectedSamplePayload = firstWebhook.parameters.schema;
            } else if (firstWebhook.parameters?.jsonParameters) {
                try {
                    const jsonParams = JSON.parse(firstWebhook.parameters.jsonParameters);
                    if (jsonParams && typeof jsonParams === 'object') {
                        detectedSamplePayload = jsonParams;
                    }
                } catch (e) {
                    // Not valid JSON, use default
                }
            }
        }
    }

    // If still no payload detected, create a generic one based on common webhook patterns
    if (Object.keys(detectedSamplePayload).length === 0) {
        // Try to detect from the output of the webhook node
        const webhookNode = workflow.nodes.find(n =>
            n.type === 'n8n-nodes-base.webhook' ||
            n.type === 'n8n-nodes-base.formTrigger' ||
            n.type === 'n8n-nodes-base.form'
        );

        if (webhookNode) {
            console.log('🔍 Webhook node found:', webhookNode.name);
            console.log('🔍 Webhook parameters:', JSON.stringify(webhookNode.parameters, null, 2));

            // Try to extract from the output schema or from the node configuration
            if (webhookNode.parameters?.outputSchema) {
                detectedSamplePayload = webhookNode.parameters.outputSchema;
            } else {
                // Create payload based on common n8n webhook patterns
                detectedSamplePayload = {
                    input: "Consulta del cliente",
                    nombre: "Cliente Potencial",
                    telefonos: "541100000000",
                    email: "cliente@ejemplo.com",
                    source: "webhook"
                };
            }
        } else {
            // Generic fallback
            detectedSamplePayload = {
                input: "Sample input text",
                nombre: "Nombre de ejemplo",
                telefonos: "541100000000",
                email: "email@ejemplo.com"
            };
        }
    }

    console.log('📋 Final detected sample payload:', detectedSamplePayload);

    return {
        nodes: allNodes,
        connections,
        detectedEndpoints: [...new Set(detectedEndpoints)],
        detectedSamplePayload
    };

  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error("Failed to parse the file. Please ensure it's a valid JSON file.");
    }
    console.error("n8n Parsing Error:", error);
    throw error;
  }
};