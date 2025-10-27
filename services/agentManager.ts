import { ExecutionStep, TestCase } from '../types';

export interface AgentState {
    id: string;
    testCase: TestCase;
    status: 'WAITING' | 'THINKING' | 'SENDING' | 'WAITING_RESPONSE' | 'COMPLETED' | 'ERROR';
    currentTurn: number;
    history: ExecutionStep[];
    isActive: boolean;
    lastError?: string;
}

export class AgentManager {
    private agents: Map<string, AgentState> = new Map();
    private MAX_TURNS = 6;

    addAgent(testCase: TestCase): AgentState {
        const id = this.generateAgentId(testCase);
        const agent: AgentState = {
            id,
            testCase,
            status: 'WAITING',
            currentTurn: 0,
            history: [],
            isActive: true
        };
        this.agents.set(id, agent);
        return agent;
    }

    private generateAgentId(testCase: TestCase): string {
        // Generar un ID único basado en el nombre del bot
        const nameParts = testCase.initialPayload.nombre.split(' ');
        const lastName = nameParts[nameParts.length - 1].toLowerCase();
        const suffix = lastName.slice(0, 6);
        const id = `AGENT_${this.agents.size + 1}_${suffix}`;
        return id;
    }

    getAgent(id: string): AgentState | undefined {
        return this.agents.get(id);
    }

    getAllAgents(): AgentState[] {
        return Array.from(this.agents.values());
    }

    updateAgentStatus(id: string, update: Partial<AgentState>): void {
        const agent = this.agents.get(id);
        if (!agent) return;

        Object.assign(agent, update);

        // Verificar si se alcanzó el límite de turnos
        if (agent.currentTurn >= this.MAX_TURNS && agent.status !== 'COMPLETED' && agent.status !== 'ERROR') {
            agent.status = 'COMPLETED';
            agent.isActive = false;
        }
    }

    addAgentHistory(id: string, step: ExecutionStep): void {
        const agent = this.agents.get(id);
        if (!agent) return;

        agent.history.push(step);
        agent.currentTurn++;
    }

    setAgentError(id: string, error: string): void {
        const agent = this.agents.get(id);
        if (!agent) return;

        agent.status = 'ERROR';
        agent.isActive = false;
        agent.lastError = error;
    }

    isConversationComplete(id: string): boolean {
        const agent = this.agents.get(id);
        if (!agent) return true;

        return !agent.isActive || agent.status === 'COMPLETED' || agent.status === 'ERROR';
    }

    areAllConversationsComplete(): boolean {
        return Array.from(this.agents.values()).every(agent => 
            !agent.isActive || agent.status === 'COMPLETED' || agent.status === 'ERROR'
        );
    }

    getAgentSummary(id: string): string {
        const agent = this.agents.get(id);
        if (!agent) return '';

        const turnInfo = `${agent.currentTurn}/${this.MAX_TURNS}`;
        const statusEmoji = this.getStatusEmoji(agent.status);
        return `${statusEmoji} ${agent.id} (${turnInfo}): ${agent.testCase.title}`;
    }

    private getStatusEmoji(status: AgentState['status']): string {
        switch (status) {
            case 'WAITING': return '⏳';
            case 'THINKING': return '🤔';
            case 'SENDING': return '📤';
            case 'WAITING_RESPONSE': return '📥';
            case 'COMPLETED': return '✅';
            case 'ERROR': return '❌';
            default: return '⚪';
        }
    }
}

// Exportar una instancia única para toda la aplicación
export const agentManager = new AgentManager();
