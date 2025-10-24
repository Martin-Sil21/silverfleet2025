import type { N8nConfig, WorkflowNode, TraceEvent } from '../types';

interface N8nWorkflow {
  id: string;
  name: string;
  active: boolean;
  nodes: any[];
  connections: any;
}

interface N8nExecution {
  id: string;
  finished: boolean;
  mode: string;
  startedAt: string;
  stoppedAt?: string;
  workflowData: any;
  data: {
    resultData: {
      runData: Record<string, any[]>;
    };
  };
}

interface ExecutionResult {
  success: boolean;
  executionId: string;
  trace: TraceEvent[];
  finalOutput: string;
  error?: string;
}

class N8nService {
  private baseUrl: string;
  private apiKey: string;

  constructor(config: N8nConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, ''); // Remove trailing slash
    this.apiKey = config.apiKey;
  }

  private async fetchN8n(endpoint: string, options: RequestInit = {}): Promise<Response> {
    const url = `${this.baseUrl}/api/v1${endpoint}`;
    const headers = {
      'X-N8N-API-KEY': this.apiKey,
      'Content-Type': 'application/json',
      ...options.headers,
    };

    const response = await fetch(url, {
      ...options,
      headers,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`n8n API error (${response.status}): ${errorText}`);
    }

    return response;
  }

  /**
   * Get workflow by ID
   */
  async getWorkflow(workflowId: string): Promise<N8nWorkflow> {
    const response = await this.fetchN8n(`/workflows/${workflowId}`);
    return await response.json();
  }

  /**
   * Import a workflow JSON into n8n
   */
  async importWorkflow(workflowData: any): Promise<string> {
    const response = await this.fetchN8n('/workflows', {
      method: 'POST',
      body: JSON.stringify(workflowData),
    });
    
    const data = await response.json();
    return data.id;
  }

  /**
   * Execute a workflow with specific input data
   */
  async executeWorkflow(workflowId: string, inputData: any): Promise<ExecutionResult> {
    try {
      // Execute workflow via webhook or manual trigger
      // Note: This assumes the workflow has a webhook or manual trigger node
      const response = await this.fetchN8n(`/workflows/${workflowId}/execute`, {
        method: 'POST',
        body: JSON.stringify({ data: inputData }),
      });

      const execution: N8nExecution = await response.json();
      
      // Wait for execution to complete
      const completedExecution = await this.waitForExecution(execution.id);
      
      // Parse execution results into trace events
      const trace = this.parseExecutionTrace(completedExecution);
      
      // Get final output from the last node
      const finalOutput = this.extractFinalOutput(completedExecution);

      return {
        success: completedExecution.finished && !completedExecution.data.resultData.error,
        executionId: execution.id,
        trace,
        finalOutput,
      };
    } catch (error) {
      return {
        success: false,
        executionId: '',
        trace: [],
        finalOutput: '',
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Wait for an execution to complete
   */
  private async waitForExecution(executionId: string, maxWaitTime: number = 60000): Promise<N8nExecution> {
    const startTime = Date.now();
    const pollInterval = 1000; // Poll every second

    while (Date.now() - startTime < maxWaitTime) {
      const response = await this.fetchN8n(`/executions/${executionId}`);
      const execution: N8nExecution = await response.json();

      if (execution.finished || execution.stoppedAt) {
        return execution;
      }

      await new Promise(resolve => setTimeout(resolve, pollInterval));
    }

    throw new Error(`Execution ${executionId} timed out after ${maxWaitTime}ms`);
  }

  /**
   * Parse execution data into trace events
   */
  private parseExecutionTrace(execution: N8nExecution): TraceEvent[] {
    const trace: TraceEvent[] = [];
    let stepCounter = 0;

    if (!execution.data?.resultData?.runData) {
      return trace;
    }

    const runData = execution.data.resultData.runData;

    // Iterate through each node's execution
    for (const [nodeName, nodeRuns] of Object.entries(runData)) {
      if (!Array.isArray(nodeRuns)) continue;

      nodeRuns.forEach((run: any, runIndex: number) => {
        // Input event
        if (run.data?.main?.[0]) {
          const inputData = run.data.main[0];
          trace.push({
            step: stepCounter++,
            turn: runIndex,
            nodeId: nodeName,
            nodeName: nodeName,
            nodeType: 'tool', // Will be updated based on actual node type
            eventType: 'INPUT',
            content: JSON.stringify(inputData, null, 2),
          });
        }

        // Output event
        if (run.data?.main?.[0]) {
          const outputData = run.data.main[0];
          trace.push({
            step: stepCounter++,
            turn: runIndex,
            nodeId: nodeName,
            nodeName: nodeName,
            nodeType: 'tool',
            eventType: 'OUTPUT',
            content: JSON.stringify(outputData, null, 2),
          });
        }
      });
    }

    return trace;
  }

  /**
   * Extract final output from the execution
   */
  private extractFinalOutput(execution: N8nExecution): string {
    if (!execution.data?.resultData?.runData) {
      return '';
    }

    const runData = execution.data.resultData.runData;
    const nodeNames = Object.keys(runData);
    
    // Get the last node's output
    if (nodeNames.length > 0) {
      const lastNodeName = nodeNames[nodeNames.length - 1];
      const lastNodeRuns = runData[lastNodeName];
      
      if (Array.isArray(lastNodeRuns) && lastNodeRuns.length > 0) {
        const lastRun = lastNodeRuns[lastNodeRuns.length - 1];
        const output = lastRun.data?.main?.[0];
        
        if (output) {
          // Try to extract a meaningful text response
          if (Array.isArray(output)) {
            return JSON.stringify(output[0]?.json || output[0], null, 2);
          }
          return JSON.stringify(output, null, 2);
        }
      }
    }

    return 'No output available';
  }

  /**
   * Get execution logs
   */
  async getExecutionLogs(executionId: string): Promise<string> {
    try {
      const response = await this.fetchN8n(`/executions/${executionId}`);
      const execution: N8nExecution = await response.json();
      return JSON.stringify(execution, null, 2);
    } catch (error) {
      return `Error fetching logs: ${error instanceof Error ? error.message : 'Unknown error'}`;
    }
  }

  /**
   * Test connection to n8n instance
   */
  async testConnection(): Promise<boolean> {
    try {
      await this.fetchN8n('/workflows');
      return true;
    } catch (error) {
      console.error('n8n connection test failed:', error);
      return false;
    }
  }

  /**
   * Delete a workflow
   */
  async deleteWorkflow(workflowId: string): Promise<void> {
    await this.fetchN8n(`/workflows/${workflowId}`, {
      method: 'DELETE',
    });
  }
}

export default N8nService;

