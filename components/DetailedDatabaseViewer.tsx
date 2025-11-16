/**
 * 💾 Detailed Database Viewer
 * 
 * Muestra TODOS los detalles de las bases de datos detectadas:
 * - Provider (Supabase, PostgreSQL, MongoDB, etc)
 * - Tablas detectadas
 * - Operaciones (SELECT, INSERT, UPDATE, DELETE)
 * - Campos utilizados
 * - Wrappers/hooks personalizados
 * - Flujo de datos (de agente → hook → tabla)
 */

import React, { useState } from 'react';
import { ChevronDownIcon } from './icons/ChevronDownIcon';
import { ChevronRightIcon } from './icons/ChevronRightIcon';
import { ArrowRightIcon } from './icons/ArrowRightIcon';
import type { DetectedDatabase } from '../types';

interface DetailedDatabaseViewerProps {
  databases: DetectedDatabase[];
  deepAnalysis?: {
    hooks?: Array<{ name: string; description: string }>;
    databaseQueries?: Array<{ query: string; context: string }>;
    operations?: Array<{ type: string; target: string; fields: string[] }>;
    dataFlow?: Array<{ from: string; to: string; operation: string }>;
    tables?: Array<{
      name: string;
      operations: Array<{
        type: 'read' | 'write' | 'delete';
        usedBy: string[];
        fields: string[];
      }>;
    }>;
  };
}

export function DetailedDatabaseViewer({ databases, deepAnalysis }: DetailedDatabaseViewerProps) {
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(['providers']));

  const toggleSection = (section: string) => {
    const newExpanded = new Set(expandedSections);
    if (newExpanded.has(section)) {
      newExpanded.delete(section);
    } else {
      newExpanded.add(section);
    }
    setExpandedSections(newExpanded);
  };

  if (!databases || databases.length === 0) {
    return (
      <div className="bg-red-900/20 border border-red-500 rounded-lg p-4">
        <p className="text-red-400">⚠️ No se detectaron bases de datos</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold text-white">
        💾 Bases de Datos Detectadas
      </h3>

      {/* SECCIÓN 1: Providers detectados */}
      <div className="bg-gray-800/50 border border-gray-700 rounded-lg overflow-hidden">
        <button
          onClick={() => toggleSection('providers')}
          className="w-full p-4 flex items-center gap-3 hover:bg-gray-800/70 transition-colors"
        >
          {expandedSections.has('providers') ? (
            <ChevronDownIcon className="w-5 h-5 text-gray-400" />
          ) : (
            <ChevronRightIcon className="w-5 h-5 text-gray-400" />
          )}
          <h4 className="text-md font-semibold text-white">
            🗄️ Providers ({databases.length})
          </h4>
        </button>

        {expandedSections.has('providers') && (
          <div className="border-t border-gray-700 p-4 space-y-3">
            {databases.map((db, index) => (
              <div key={index} className="bg-gray-900 border border-gray-700 rounded-lg p-4">
                <div className="flex items-center gap-3 mb-3">
                  <span className="text-lg font-semibold text-white">{db.provider}</span>
                  <span className="px-2 py-1 bg-purple-500/20 text-purple-400 text-xs rounded">
                    {db.tables?.length || 0} tablas
                  </span>
                </div>

                {db.tables && db.tables.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-sm text-gray-400 font-semibold">Tablas detectadas:</p>
                    <div className="grid grid-cols-2 gap-2">
                      {db.tables.map((table, tableIndex) => {
                        // Manejar tanto strings como objetos
                        const tableName = typeof table === 'string' ? table : table.name || JSON.stringify(table);
                        return (
                          <div
                            key={tableIndex}
                            className="bg-gray-800 border border-gray-600 rounded px-3 py-2"
                          >
                            <p className="text-sm text-gray-300 font-mono">{tableName}</p>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {db.connectionString && (
                  <div className="mt-3 pt-3 border-t border-gray-700">
                    <p className="text-xs text-gray-500 font-mono">
                      Connection: {db.connectionString.substring(0, 50)}...
                    </p>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* SECCIÓN 2: Tablas y Operaciones */}
      {deepAnalysis?.tables && deepAnalysis.tables.length > 0 && (
        <div className="bg-gray-800/50 border border-gray-700 rounded-lg overflow-hidden">
          <button
            onClick={() => toggleSection('tables')}
            className="w-full p-4 flex items-center gap-3 hover:bg-gray-800/70 transition-colors"
          >
            {expandedSections.has('tables') ? (
              <ChevronDownIcon className="w-5 h-5 text-gray-400" />
            ) : (
              <ChevronRightIcon className="w-5 h-5 text-gray-400" />
            )}
            <h4 className="text-md font-semibold text-white">
              📊 Tablas y Operaciones ({deepAnalysis.tables.length})
            </h4>
          </button>

          {expandedSections.has('tables') && (
            <div className="border-t border-gray-700 p-4 space-y-4">
              {deepAnalysis.tables.map((table, index) => (
                <div key={index} className="bg-gray-900 border border-gray-700 rounded-lg p-4">
                  <h5 className="text-md font-semibold text-white mb-3">
                    📋 {table.name}
                  </h5>

                  {table.operations.map((op, opIndex) => (
                    <div key={opIndex} className="mb-3 last:mb-0">
                      <div className="flex items-center gap-2 mb-2">
                        <span className={`px-2 py-1 text-xs rounded font-semibold ${
                          op.type === 'read' ? 'bg-blue-500/20 text-blue-400' :
                          op.type === 'write' ? 'bg-green-500/20 text-green-400' :
                          'bg-red-500/20 text-red-400'
                        }`}>
                          {op.type.toUpperCase()}
                        </span>
                        <span className="text-sm text-gray-400">
                          Usado por: {op.usedBy.join(', ')}
                        </span>
                      </div>

                      {op.fields && op.fields.length > 0 && (
                        <div className="ml-4 mt-2">
                          <p className="text-xs text-gray-500 mb-1">Campos:</p>
                          <div className="flex flex-wrap gap-1">
                            {op.fields.map((field, fieldIndex) => (
                              <span
                                key={fieldIndex}
                                className="px-2 py-0.5 bg-gray-800 text-gray-300 text-xs rounded font-mono"
                              >
                                {field}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* SECCIÓN 3: Custom Hooks/Wrappers */}
      {deepAnalysis?.hooks && deepAnalysis.hooks.length > 0 && (
        <div className="bg-gray-800/50 border border-gray-700 rounded-lg overflow-hidden">
          <button
            onClick={() => toggleSection('hooks')}
            className="w-full p-4 flex items-center gap-3 hover:bg-gray-800/70 transition-colors"
          >
            {expandedSections.has('hooks') ? (
              <ChevronDownIcon className="w-5 h-5 text-gray-400" />
            ) : (
              <ChevronRightIcon className="w-5 h-5 text-gray-400" />
            )}
            <h4 className="text-md font-semibold text-white">
              🔌 Custom Hooks/Wrappers ({deepAnalysis.hooks.length})
            </h4>
          </button>

          {expandedSections.has('hooks') && (
            <div className="border-t border-gray-700 p-4 space-y-3">
              {deepAnalysis.hooks.map((hook, index) => (
                <div key={index} className="bg-gray-900 border border-gray-700 rounded-lg p-3">
                  <p className="text-sm font-semibold text-white font-mono mb-1">
                    {hook.name}
                  </p>
                  <p className="text-xs text-gray-400">{hook.description}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* SECCIÓN 4: Flujo de Datos */}
      {deepAnalysis?.dataFlow && deepAnalysis.dataFlow.length > 0 && (
        <div className="bg-gray-800/50 border border-gray-700 rounded-lg overflow-hidden">
          <button
            onClick={() => toggleSection('dataflow')}
            className="w-full p-4 flex items-center gap-3 hover:bg-gray-800/70 transition-colors"
          >
            {expandedSections.has('dataflow') ? (
              <ChevronDownIcon className="w-5 h-5 text-gray-400" />
            ) : (
              <ChevronRightIcon className="w-5 h-5 text-gray-400" />
            )}
            <h4 className="text-md font-semibold text-white">
              🔄 Flujo de Datos ({deepAnalysis.dataFlow.length} conexiones)
            </h4>
          </button>

          {expandedSections.has('dataflow') && (
            <div className="border-t border-gray-700 p-4 space-y-2">
              {deepAnalysis.dataFlow.map((flow, index) => (
                <div
                  key={index}
                  className="bg-gray-900 border border-gray-700 rounded-lg p-3 flex items-center gap-3"
                >
                  <span className="text-sm text-gray-300 font-mono">{flow.from}</span>
                  <ArrowRightIcon className="w-4 h-4 text-gray-500" />
                  <span className="px-2 py-1 bg-blue-500/20 text-blue-400 text-xs rounded">
                    {flow.operation}
                  </span>
                  <ArrowRightIcon className="w-4 h-4 text-gray-500" />
                  <span className="text-sm text-gray-300 font-mono">{flow.to}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* SECCIÓN 5: Queries Raw */}
      {deepAnalysis?.databaseQueries && deepAnalysis.databaseQueries.length > 0 && (
        <div className="bg-gray-800/50 border border-gray-700 rounded-lg overflow-hidden">
          <button
            onClick={() => toggleSection('queries')}
            className="w-full p-4 flex items-center gap-3 hover:bg-gray-800/70 transition-colors"
          >
            {expandedSections.has('queries') ? (
              <ChevronDownIcon className="w-5 h-5 text-gray-400" />
            ) : (
              <ChevronRightIcon className="w-5 h-5 text-gray-400" />
            )}
            <h4 className="text-md font-semibold text-white">
              📝 Queries Detectadas ({deepAnalysis.databaseQueries.length})
            </h4>
          </button>

          {expandedSections.has('queries') && (
            <div className="border-t border-gray-700 p-4 space-y-3">
              {deepAnalysis.databaseQueries.slice(0, 10).map((query, index) => (
                <div key={index} className="bg-gray-900 border border-gray-700 rounded-lg p-3">
                  <p className="text-xs text-gray-500 mb-1">Contexto: {query.context}</p>
                  <pre className="text-xs text-gray-300 font-mono overflow-x-auto">
                    {query.query}
                  </pre>
                </div>
              ))}
              {deepAnalysis.databaseQueries.length > 10 && (
                <p className="text-sm text-gray-500 text-center">
                  ... y {deepAnalysis.databaseQueries.length - 10} queries más
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

