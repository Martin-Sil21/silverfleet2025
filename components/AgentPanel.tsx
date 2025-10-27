import React from 'react';
import { AgentState } from '../services/agentManager';

interface AgentCardProps {
    agent: AgentState;
}

const AgentCard: React.FC<AgentCardProps> = ({ agent }) => {
    const statusColors = {
        WAITING: 'bg-gray-100',
        THINKING: 'bg-blue-100',
        SENDING: 'bg-yellow-100',
        WAITING_RESPONSE: 'bg-purple-100',
        COMPLETED: 'bg-green-100',
        ERROR: 'bg-red-100'
    };

    const statusEmojis = {
        WAITING: '⏳',
        THINKING: '🤔',
        SENDING: '📤',
        WAITING_RESPONSE: '📥',
        COMPLETED: '✅',
        ERROR: '❌'
    };

    const lastMessage = agent.history[agent.history.length - 1];

    return (
        <div className={`rounded-lg shadow-md p-4 transition-all duration-300 ${statusColors[agent.status]}`}>
            <div className="flex items-center justify-between mb-2">
                <h3 className="font-bold text-sm">{agent.id}</h3>
                <span className="text-lg" title={agent.status}>{statusEmojis[agent.status]}</span>
            </div>
            
            <div className="text-xs text-gray-600 mb-2">
                {agent.testCase.persona}
            </div>

            <div className="text-sm mb-2">
                Turno: {agent.currentTurn}/6
            </div>

            {lastMessage && (
                <div className="bg-white rounded p-2 text-sm mt-2 max-h-24 overflow-y-auto">
                    <div className="text-gray-500">Último mensaje:</div>
                    <div className="text-xs whitespace-pre-wrap">
                        {typeof lastMessage.input === 'object' ? 
                            lastMessage.input.input || JSON.stringify(lastMessage.input) :
                            String(lastMessage.input)
                        }
                    </div>
                </div>
            )}

            {agent.lastError && (
                <div className="bg-red-50 text-red-600 p-2 rounded mt-2 text-xs">
                    {agent.lastError}
                </div>
            )}
        </div>
    );
};

interface AgentPanelProps {
    agents: AgentState[];
    currentPhase: string;
}

const AgentPanel: React.FC<AgentPanelProps> = ({ agents, currentPhase }) => {
    return (
        <div className="w-full">
            {/* Barra de progreso */}
            <div className="mb-6">
                <div className="text-lg font-semibold mb-2 flex items-center">
                    <span className="mr-2">Estado del Proceso:</span>
                    <span className="text-blue-600">{currentPhase}</span>
                </div>
                <div className="h-2 bg-gray-200 rounded-full">
                    <div 
                        className="h-2 bg-blue-600 rounded-full transition-all duration-500"
                        style={{ 
                            width: `${agents.filter(a => a.status === 'COMPLETED').length / agents.length * 100}%`
                        }}
                    />
                </div>
            </div>

            {/* Grid de agentes */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {agents.map(agent => (
                    <AgentCard key={agent.id} agent={agent} />
                ))}
            </div>
        </div>
    );
};

export default AgentPanel;