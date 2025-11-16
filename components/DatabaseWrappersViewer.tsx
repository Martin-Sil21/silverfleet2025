/**
 * 🗄️ Database Wrappers Viewer
 * 
 * Muestra custom hooks/wrappers de BD y flujo de datos:
 * - ObrasecoDatabase.getChatHistory()
 * - Agent → Wrapper → Table
 */

import React from 'react';
import { ChevronRightIcon } from './icons/ChevronRightIcon';
import { ArrowRightIcon } from './icons/ArrowRightIcon';
import { ParsedCodeProject } from '../types';

interface Props {
  project: ParsedCodeProject;
}

export function DatabaseWrappersViewer({ project }: Props) {
  const { deepAnalysis } = project;
  
  if (!deepAnalysis || (deepAnalysis.hooks.length === 0 && deepAnalysis.dataFlow.length === 0)) {
    return null;
  }
  
  return (
    <div className="space-y-6 mt-6">
      {/* Custom Hooks/Wrappers */}
      {deepAnalysis.hooks.length > 0 && (
        <div className="bg-slate-800/50 rounded-lg border border-slate-700 p-6">
          <div className="flex items-center gap-2 mb-4">
            <span className="text-2xl">📝</span>
            <h3 className="text-lg font-semibold text-white">
              Database Wrappers/Custom Hooks
            </h3>
            <span className="text-sm text-slate-400 ml-auto">
              {deepAnalysis.hooks.length} detectados
            </span>
          </div>
          
          <div className="space-y-3">
            {deepAnalysis.hooks.map((hook, idx) => (
              <div
                key={idx}
                className="bg-slate-900/50 rounded-lg border border-slate-700/50 p-4 hover:border-cyan-500/50 transition-colors"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <code className="text-cyan-400 font-mono text-sm">
                        {hook.name}()
                      </code>
                      {hook.semanticPurpose && (
                        <span className="px-2 py-1 text-xs rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/30">
                          {hook.semanticPurpose}
                        </span>
                      )}
                    </div>
                    
                    {hook.queries.length > 0 && (
                      <div className="space-y-2 mt-3">
                        {hook.queries.map((query, qIdx) => (
                          <div key={qIdx} className="flex items-center gap-3 text-sm">
                            <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                              query.queryType === 'select' ? 'bg-blue-500/20 text-blue-300' :
                              query.queryType === 'insert' ? 'bg-green-500/20 text-green-300' :
                              query.queryType === 'update' ? 'bg-yellow-500/20 text-yellow-300' :
                              query.queryType === 'delete' ? 'bg-red-500/20 text-red-300' :
                              'bg-slate-500/20 text-slate-300'
                            }`}>
                              {query.queryType.toUpperCase()}
                            </span>
                            
                            {query.table && (
                              <>
                                <ChevronRightIcon className="w-4 h-4 text-slate-500" />
                                <code className="text-slate-300 font-mono text-xs">
                                  {query.table}
                                </code>
                              </>
                            )}
                            
                            {query.fields.length > 0 && (
                              <>
                                <ChevronRightIcon className="w-4 h-4 text-slate-500" />
                                <span className="text-slate-400 text-xs">
                                  {query.fields.slice(0, 3).join(', ')}
                                  {query.fields.length > 3 && ` +${query.fields.length - 3} más`}
                                </span>
                              </>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                    
                    {hook.usedBy.length > 0 && (
                      <div className="mt-3 pt-3 border-t border-slate-700/50">
                        <p className="text-xs text-slate-400 mb-2">Usado por:</p>
                        <div className="flex flex-wrap gap-2">
                          {hook.usedBy.map((agent, aIdx) => (
                            <span
                              key={aIdx}
                              className="px-2 py-1 text-xs rounded bg-emerald-500/10 text-emerald-300 border border-emerald-500/30"
                            >
                              {agent}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                  
                  <span className="text-xs text-slate-500 font-mono">
                    {hook.filePath.split('/').slice(-2).join('/')}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      
      {/* Data Flow */}
      {deepAnalysis.dataFlow.length > 0 && (
        <div className="bg-slate-800/50 rounded-lg border border-slate-700 p-6">
          <div className="flex items-center gap-2 mb-4">
            <span className="text-2xl">🔗</span>
            <h3 className="text-lg font-semibold text-white">
              Flujo de Datos
            </h3>
            <span className="text-sm text-slate-400 ml-auto">
              {deepAnalysis.dataFlow.length} flujos mapeados
            </span>
          </div>
          
          <div className="space-y-3">
            {deepAnalysis.dataFlow.map((flow, idx) => (
              <div
                key={idx}
                className="bg-slate-900/50 rounded-lg border border-slate-700/50 p-4"
              >
                <div className="flex items-center gap-3 flex-wrap">
                  {/* Agent */}
                  <div className="flex items-center gap-2 px-3 py-2 rounded bg-blue-500/10 border border-blue-500/30">
                    <span className="text-xs font-medium text-blue-300">Agente</span>
                    <span className="text-sm text-white font-medium">{flow.from}</span>
                  </div>
                  
                  <ArrowRightIcon className="w-5 h-5 text-slate-500" />
                  
                  {/* Wrapper/Function */}
                  <div className="flex items-center gap-2 px-3 py-2 rounded bg-cyan-500/10 border border-cyan-500/30">
                    <span className="text-xs font-medium text-cyan-300">Función</span>
                    <code className="text-sm text-white font-mono">{flow.through.split('.').pop()}</code>
                  </div>
                  
                  <ArrowRightIcon className="w-5 h-5 text-slate-500" />
                  
                  {/* Table */}
                  <div className="flex items-center gap-2 px-3 py-2 rounded bg-emerald-500/10 border border-emerald-500/30">
                    <span className="text-sm">🗄️</span>
                    <code className="text-sm text-white font-mono">{flow.to}</code>
                  </div>
                  
                  {/* Purpose */}
                  <div className="ml-auto px-3 py-1 rounded-full bg-purple-500/10 border border-purple-500/30">
                    <span className="text-xs text-purple-300 uppercase font-medium">
                      {flow.purpose}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      
      {/* Tables Summary */}
      {deepAnalysis.tables.length > 0 && (
        <div className="bg-slate-800/50 rounded-lg border border-slate-700 p-6">
          <div className="flex items-center gap-2 mb-4">
            <span className="text-2xl">📊</span>
            <h3 className="text-lg font-semibold text-white">
              Tablas y Operaciones
            </h3>
            <span className="text-sm text-slate-400 ml-auto">
              {deepAnalysis.tables.length} tablas
            </span>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {deepAnalysis.tables.map((table, idx) => (
              <div
                key={idx}
                className="bg-slate-900/50 rounded-lg border border-slate-700/50 p-4"
              >
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-sm">🗄️</span>
                  <code className="text-white font-mono text-sm">{table.name}</code>
                </div>
                
                <div className="space-y-2">
                  {table.operations.map((op, opIdx) => (
                    <div key={opIdx} className="text-sm">
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                          op.type === 'read' ? 'bg-blue-500/20 text-blue-300' :
                          op.type === 'write' ? 'bg-green-500/20 text-green-300' :
                          'bg-red-500/20 text-red-300'
                        }`}>
                          {op.type === 'read' ? 'READ' : op.type === 'write' ? 'WRITE' : 'DELETE'}
                        </span>
                        <span className="text-xs text-slate-400">
                          {op.usedBy.length} función{op.usedBy.length !== 1 ? 'es' : ''}
                        </span>
                      </div>
                      
                      {op.fields.length > 0 && (
                        <p className="text-xs text-slate-500 ml-2 font-mono">
                          {op.fields.slice(0, 4).join(', ')}
                          {op.fields.length > 4 && ` +${op.fields.length - 4}`}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

