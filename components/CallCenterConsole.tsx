import React, { useState, useEffect } from 'react';
import { useTranslation } from '../hooks/useTranslation';
import { ChevronRightIcon } from './icons/ChevronRightIcon';
import { ChevronLeftIcon } from './icons/ChevronLeftIcon';

interface AgentCardProps {
  agent: {
    id: string;
    testCase: { 
      title: string; 
      persona: string; 
      conversationGoal: string;
      initialPayload: {
        nombre: string;
        telefono: string;
        [key: string]: any;
      };
    };
    status: string;
    currentTurn: number;
    history: any[];
  };
  onClick: () => void;
  isExpanded: boolean;
}

const AgentCard: React.FC<AgentCardProps> = ({ agent, onClick, isExpanded }) => {
  // Normalize potentially-null fields to avoid runtime crashes when data comes from network
  const safeTestCase = agent.testCase || { title: '', persona: '', conversationGoal: '', initialPayload: {} } as any;
  const safeInitial = safeTestCase.initialPayload || {} as any;
  const history = Array.isArray(agent.history) ? agent.history : [];
  
  // Referencia para el contenedor del chat
  const chatContainerRef = React.useRef<HTMLDivElement>(null);

  // Scroll automático cuando hay nuevos mensajes
  React.useEffect(() => {
    if (isExpanded && chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [history.length, isExpanded]);
  const getBgColor = (status: string) => {
    switch (status) {
      case 'WAITING': return 'bg-yellow-50';
      case 'THINKING': return 'bg-blue-50 animate-pulse';
      case 'SENDING': return 'bg-green-50';
      case 'WAITING_RESPONSE': return 'bg-orange-50';
      case 'RECEIVING': return 'bg-purple-50';
      case 'COMPLETED': return 'bg-green-50';
      case 'ERROR': return 'bg-red-50';
      default: return 'bg-gray-50';
    }
  };

  const getBorderColor = (status: string) => {
    switch (status) {
      case 'WAITING': return 'border-yellow-200';
      case 'THINKING': return 'border-blue-200';
      case 'SENDING': return 'border-green-200';
      case 'WAITING_RESPONSE': return 'border-orange-200';
      case 'RECEIVING': return 'border-purple-200';
      case 'COMPLETED': return 'border-green-300';
      case 'ERROR': return 'border-red-300';
      default: return 'border-gray-200';
    }
  };

  const getStatusEmoji = (status: string) => {
    switch (status) {
      case 'WAITING': return '⏳';
      case 'THINKING': return '🤔';
      case 'SENDING': return '📤';
      case 'WAITING_RESPONSE': return '⌛';
      case 'RECEIVING': return '📥';
      case 'COMPLETED': return '✅';
      case 'ERROR': return '❌';
      default: return '⚪';
    }
  };

  return (
    <div 
      className={`rounded-lg shadow-lg border-2 ${getBorderColor(agent.status)} ${getBgColor(agent.status)} 
                 p-4 transition-all duration-500 ease-in-out cursor-pointer
                 ${isExpanded ? 'col-span-2 row-span-2 z-10' : 'hover:scale-[1.02]'} 
                 transform hover:shadow-xl`}
      onClick={onClick}
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-2xl" role="img">{getStatusEmoji(agent.status)}</span>
          <div>
            <h3 className="font-bold text-gray-900">{safeInitial.nombre || 'Sin nombre'}</h3>
            <p className="text-xs text-gray-500">ID: {agent.id}</p>
            <p className="text-sm text-gray-600">Turno {agent.currentTurn}/6</p>
          </div>
        </div>
        <div className={`px-3 py-1 rounded-full text-xs font-medium
          ${agent.status === 'COMPLETED' ? 'bg-green-100 text-green-800' : 
            agent.status === 'ERROR' ? 'bg-red-100 text-red-800' :
            'bg-blue-100 text-blue-800'}`}>
          {agent.status}
        </div>
      </div>

      <div className="space-y-3">
        <div className="text-sm">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-gray-500">👤</span>
            <div>
              <p className="text-gray-500 uppercase text-xs font-semibold">Perfil</p>
              <p className="text-gray-800 font-medium">{safeTestCase.persona || 'Sin perfil'}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-gray-500">🎯</span>
            <div>
              <p className="text-gray-500 uppercase text-xs font-semibold">Objetivo</p>
              <p className="text-gray-800">{safeTestCase.conversationGoal || '-'}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 mt-2">
            <span className="text-gray-500">📱</span>
            <div>
              <p className="text-gray-500 uppercase text-xs font-semibold">Teléfono</p>
              <p className="text-gray-800">{safeInitial.telefono || '-'}</p>
            </div>
          </div>
        </div>

  {isExpanded && history.length > 0 && (
          <div className="mt-4">
            <p className="text-gray-500 uppercase text-xs font-semibold mb-2 flex items-center gap-1">
              <span>Historial de Conversación</span>
              <ChevronLeftIcon className="w-4 h-4" />
            </p>
            <div 
              ref={chatContainerRef}
              className="space-y-2 max-h-[calc(100vh-20rem)] overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-gray-300 smooth-scroll">
              {history.map((msg, idx) => {
                // Defensive: msg may be null/undefined (coming from network or parser)
                const safeMsg: any = msg || {};
                const isUserMessage = !safeMsg.output;
                const messageContent = isUserMessage
                  ? (safeMsg.input
                      ? typeof safeMsg.input === 'string'
                        ? safeMsg.input
                        : typeof safeMsg.input === 'object'
                          ? safeMsg.input.input || JSON.stringify(safeMsg.input, null, 2)
                          : 'Sin mensaje'
                      : 'Sin mensaje')
                  : safeMsg.output || 'Sin respuesta';

                return (
                  <div 
                    key={idx}
                    className={`p-2 rounded-lg text-sm animate-fadeIn
                      ${isUserMessage 
                        ? 'bg-blue-50 ml-12 rounded-tr-none' 
                        : 'bg-gray-50 mr-12 rounded-tl-none'}`}
                    style={{ animationDuration: '300ms' }}
                  >
                    <div className={`flex items-center gap-2 text-xs text-gray-500 mb-1
                      ${isUserMessage ? 'justify-end' : 'justify-start'}`}
                    >
                      {isUserMessage ? '🗣️ Usuario' : '🤖 Agente'}
                      <span className="text-[10px]">
                        {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    <p className="text-gray-800 whitespace-pre-wrap">
                      {messageContent}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {!isExpanded && history.length > 0 && (
          <div className="text-sm mt-2 animate-fadeIn">
            <p className="text-gray-500 uppercase text-xs font-semibold mb-1 flex items-center gap-1">
              <span>Último mensaje</span>
              <ChevronRightIcon className="w-4 h-4" />
            </p>
            <div className="bg-white/70 rounded p-2 text-gray-700 max-h-16 overflow-y-auto">
              {(() => {
                const last = history[history.length - 1] || {};
                if (typeof last.input === 'string') return last.input;
                if (typeof last.input === 'object') return last.input.input || JSON.stringify(last.input);
                return 'Sin mensaje';
              })()}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

const ProcessPhase: React.FC<{
  phase: string;
  progress: number;
}> = ({ phase, progress }) => (
  <div className="mb-6 px-4">
    <div className="flex items-center justify-between mb-2">
      <h2 className="text-lg font-semibold text-gray-800">{phase}</h2>
      <span className="text-sm text-gray-600">{Math.round(progress)}%</span>
    </div>
    <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
      <div 
        className="h-full bg-blue-600 rounded-full transition-all duration-500 ease-out"
        style={{ width: `${progress}%` }}
      />
    </div>
  </div>
);

const CallCenterConsole: React.FC<{
  agents: Array<AgentCardProps['agent']>;
  message: string;
  totalCases: number;
  completedCases: number;
  onReset: () => void;
}> = ({ agents, message, totalCases, completedCases, onReset }) => {
  const { t } = useTranslation();
  const [expandedAgent, setExpandedAgent] = useState<string | null>(null);
  const [currentPhase, setCurrentPhase] = useState('Iniciando conversaciones...');

  useEffect(() => {
    if (message.includes('Analizando')) {
      setCurrentPhase('Analizando conversaciones...');
    } else if (message.includes('Generando reportes')) {
      setCurrentPhase('Generando reportes finales...');
    } else if (message.includes('Completado')) {
      setCurrentPhase('¡Auditoría completada!');
    }
  }, [message]);

  return (
    <div className="w-full h-full flex flex-col bg-gray-50">
      <header className="bg-white border-b border-gray-200 p-4 shadow-sm">
        <div className="flex justify-between items-center">
          <h1 className="text-xl font-bold text-gray-900">🎯 Simulación de Agentes</h1>
          <button 
            onClick={onReset}
            className="px-4 py-2 bg-gray-800 text-white rounded-lg hover:bg-gray-700 transition-colors"
          >
            🔄 Reiniciar
          </button>
        </div>
      </header>

      <div className="mt-4">
        <div className="w-full bg-gray-200 rounded-full h-2">
          <div 
            className="bg-blue-600 h-2 rounded-full transition-all duration-500 ease-out"
            style={{ width: `${(completedCases / totalCases) * 100}%` }}
          />
        </div>
        <p className="text-sm text-gray-600 mt-2">{currentPhase}</p>
      </div>

      <div className="flex-1 p-4 overflow-hidden flex gap-4">
        <div className="flex-1 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 auto-rows-min gap-4 overflow-y-auto">
          {agents.map((agent) => (
            <AgentCard 
              key={agent.id} 
              agent={agent} 
              onClick={() => setExpandedAgent(expandedAgent === agent.id ? null : agent.id)}
              isExpanded={expandedAgent === agent.id}
            />
          ))}
        </div>

        <div className="w-96 bg-white rounded-lg shadow-lg border border-gray-200 flex flex-col">
          <div className="p-3 border-b border-gray-200">
            <h2 className="font-semibold text-gray-800">📋 Log de Actividad</h2>
          </div>
          <div className="flex-1 p-3 overflow-y-auto">
            <p className="text-sm text-gray-600 whitespace-pre-wrap font-mono">{message}</p>
          </div>
          <div className="p-3 border-t border-gray-200 bg-gray-50">
            <p className="text-sm text-gray-500">
              Progreso: {((completedCases / totalCases) * 100).toFixed(1)}%
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CallCenterConsole;