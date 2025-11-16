/**
 * 🔬 Detailed Agent Viewer
 * 
 * Muestra TODOS los detalles de los agentes detectados:
 * - Nombre completo
 * - Objetivo/Descripción
 * - System Prompt COMPLETO
 * - Framework usado
 * - Archivo donde está definido
 * - Herramientas que usa
 */

import React, { useState } from 'react';
import { ChevronDownIcon } from './icons/ChevronDownIcon';
import { ChevronRightIcon } from './icons/ChevronRightIcon';
import type { CodeAgentComponent } from '../types';

interface DetailedAgentViewerProps {
  agents: CodeAgentComponent[];
}

export function DetailedAgentViewer({ agents }: DetailedAgentViewerProps) {
  const [expandedAgents, setExpandedAgents] = useState<Set<number>>(new Set([0])); // Primer agente expandido por defecto

  const toggleAgent = (index: number) => {
    const newExpanded = new Set(expandedAgents);
    if (newExpanded.has(index)) {
      newExpanded.delete(index);
    } else {
      newExpanded.add(index);
    }
    setExpandedAgents(newExpanded);
  };

  if (!agents || agents.length === 0) {
    return (
      <div className="bg-red-900/20 border border-red-500 rounded-lg p-4">
        <p className="text-red-400">⚠️ No se detectaron agentes</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-white">
          🤖 Agentes Detectados ({agents.length})
        </h3>
        <button
          onClick={() => {
            if (expandedAgents.size === agents.length) {
              setExpandedAgents(new Set());
            } else {
              setExpandedAgents(new Set(agents.map((_, i) => i)));
            }
          }}
          className="text-sm text-blue-400 hover:text-blue-300"
        >
          {expandedAgents.size === agents.length ? 'Colapsar todos' : 'Expandir todos'}
        </button>
      </div>

      {agents.map((agent, index) => {
        const isExpanded = expandedAgents.has(index);

        return (
          <div
            key={index}
            className="bg-gray-800/50 border border-gray-700 rounded-lg overflow-hidden hover:border-gray-600 transition-colors"
          >
            {/* Header del agente */}
            <button
              onClick={() => toggleAgent(index)}
              className="w-full p-4 flex items-start gap-3 hover:bg-gray-800/70 transition-colors"
            >
              <div className="mt-1">
                {isExpanded ? (
                  <ChevronDownIcon className="w-5 h-5 text-gray-400" />
                ) : (
                  <ChevronRightIcon className="w-5 h-5 text-gray-400" />
                )}
              </div>
              
              <div className="flex-1 text-left">
                <div className="flex items-center gap-3">
                  <span className="text-lg font-semibold text-white">
                    {agent.name}
                  </span>
                  <span className="px-2 py-1 bg-blue-500/20 text-blue-400 text-xs rounded">
                    {agent.framework || 'Unknown'}
                  </span>
                  {agent.confidence && (
                    <span className="px-2 py-1 bg-green-500/20 text-green-400 text-xs rounded">
                      {Math.round(agent.confidence * 100)}% confianza
                    </span>
                  )}
                </div>
                
                {agent.description && (
                  <p className="text-sm text-gray-400 mt-1">
                    {agent.description}
                  </p>
                )}
                
                <div className="flex items-center gap-4 mt-2 text-xs text-gray-500">
                  <span>📁 {agent.filePath}</span>
                  {agent.tools && agent.tools.length > 0 && (
                    <span>🔧 {agent.tools.length} herramientas</span>
                  )}
                </div>
              </div>
            </button>

            {/* Detalles expandibles */}
            {isExpanded && (
              <div className="border-t border-gray-700 p-4 space-y-4">
                {/* System Prompt */}
                <div>
                  <h4 className="text-sm font-semibold text-gray-300 mb-2 flex items-center gap-2">
                    <span>💬</span>
                    <span>System Prompt</span>
                    <span className="text-xs text-gray-500">
                      ({agent.systemPrompt?.length || 0} caracteres)
                    </span>
                  </h4>
                  <div className="bg-gray-900 rounded-lg p-4 border border-gray-700 max-h-96 overflow-y-auto">
                    <pre className="text-sm text-gray-300 whitespace-pre-wrap font-mono">
                      {agent.systemPrompt || 'No se detectó system prompt'}
                    </pre>
                  </div>
                </div>

                {/* Objetivo/Propósito detectado */}
                {agent.description && (
                  <div>
                    <h4 className="text-sm font-semibold text-gray-300 mb-2 flex items-center gap-2">
                      <span>🎯</span>
                      <span>Objetivo Detectado</span>
                    </h4>
                    <div className="bg-blue-900/20 border border-blue-500/30 rounded-lg p-3">
                      <p className="text-sm text-gray-300">{agent.description}</p>
                    </div>
                  </div>
                )}

                {/* Herramientas */}
                {agent.tools && agent.tools.length > 0 && (
                  <div>
                    <h4 className="text-sm font-semibold text-gray-300 mb-2 flex items-center gap-2">
                      <span>🔧</span>
                      <span>Herramientas Disponibles ({agent.tools.length})</span>
                    </h4>
                    <div className="grid grid-cols-2 gap-2">
                      {agent.tools.map((tool, toolIndex) => (
                        <div
                          key={toolIndex}
                          className="bg-gray-900 border border-gray-700 rounded p-2"
                        >
                          <p className="text-sm text-gray-300 font-mono">{tool}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Información técnica */}
                <div>
                  <h4 className="text-sm font-semibold text-gray-300 mb-2 flex items-center gap-2">
                    <span>⚙️</span>
                    <span>Información Técnica</span>
                  </h4>
                  <div className="bg-gray-900 border border-gray-700 rounded-lg p-3 space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-400">Framework:</span>
                      <span className="text-gray-300 font-mono">{agent.framework || 'No detectado'}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-400">Tipo de detección:</span>
                      <span className="text-gray-300 font-mono">{agent.agentDetectionType || 'unknown'}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-400">Archivo:</span>
                      <span className="text-gray-300 font-mono text-xs">{agent.filePath}</span>
                    </div>
                    {agent.confidence && (
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-400">Confianza:</span>
                        <div className="flex items-center gap-2">
                          <div className="w-32 h-2 bg-gray-700 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-green-500 transition-all"
                              style={{ width: `${agent.confidence * 100}%` }}
                            />
                          </div>
                          <span className="text-gray-300 font-mono">{Math.round(agent.confidence * 100)}%</span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

