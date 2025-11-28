/**
 * 🔴 LIVE Verification Panel
 * 
 * Muestra en tiempo real:
 * - ✉️ Verificaciones de herramientas (Gmail, Calendar, Subflows)
 * - 💰 Comparación de precios mencionados vs BD
 * - 🗄️ Operaciones de base de datos (INSERT/UPDATE/DELETE)
 * 
 * Se actualiza automáticamente cuando llega nueva información
 */

import React, { useState, useEffect } from 'react';
import type { ExecutionStep, ToolVerificationLive, PriceVerificationLive, DatabaseOperationLive } from '../types';
import { useTranslation } from '../hooks/useTranslation';

interface LiveVerificationPanelProps {
  steps: ExecutionStep[];
  isActive: boolean; // Si la auditoría está en curso
}

export const LiveVerificationPanel: React.FC<LiveVerificationPanelProps> = ({ steps, isActive }) => {
  const { t } = useTranslation();
  const [selectedTab, setSelectedTab] = useState<'tools' | 'prices' | 'database'>('tools');
  
  // Agregar todas las verificaciones de todos los steps
  const allToolVerifications: Array<ToolVerificationLive & { turnNumber: number }> = [];
  const allPriceVerifications: Array<PriceVerificationLive & { turnNumber: number }> = [];
  const allDatabaseOperations: Array<DatabaseOperationLive & { turnNumber: number }> = [];
  
  steps.forEach((step, idx) => {
    const turnNumber = idx + 1;
    
    if (step.toolVerifications) {
      step.toolVerifications.forEach(tv => {
        allToolVerifications.push({ ...tv, turnNumber });
      });
    }
    
    if (step.priceVerifications) {
      step.priceVerifications.forEach(pv => {
        allPriceVerifications.push({ ...pv, turnNumber });
      });
    }
    
    if (step.databaseOperations) {
      step.databaseOperations.forEach(dbo => {
        allDatabaseOperations.push({ ...dbo, turnNumber });
      });
    }
  });
  
  // Auto-scroll al final cuando hay nuevos items
  const [lastCount, setLastCount] = useState(0);
  useEffect(() => {
    const totalCount = allToolVerifications.length + allPriceVerifications.length + allDatabaseOperations.length;
    if (totalCount > lastCount) {
      setLastCount(totalCount);
      // Scroll suave al final del panel
      setTimeout(() => {
        const panel = document.getElementById('live-verification-panel');
        if (panel) {
          panel.scrollTo({ top: panel.scrollHeight, behavior: 'smooth' });
        }
      }, 100);
    }
  }, [allToolVerifications.length, allPriceVerifications.length, allDatabaseOperations.length]);
  
  const renderToolVerifications = () => {
    if (allToolVerifications.length === 0) {
      return (
        <div className="text-center text-gray-500 py-12">
          <svg className="w-16 h-16 mx-auto mb-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <p className="text-sm">{t('noToolVerifications') || 'No se detectaron herramientas externas'}</p>
          <p className="text-xs text-gray-400 mt-2">
            {isActive ? 'Esperando verificaciones...' : 'El agente no usó herramientas externas en esta conversación'}
          </p>
        </div>
      );
    }
    
    return (
      <div className="space-y-3">
        {allToolVerifications.map((tv, idx) => {
          const statusColors = {
            checking: 'bg-blue-100 text-blue-800 border-blue-200',
            verified: 'bg-green-100 text-green-800 border-green-200',
            failed: 'bg-red-100 text-red-800 border-red-200',
            not_found: 'bg-yellow-100 text-yellow-800 border-yellow-200'
          };
          
          const statusIcons = {
            checking: '🔍',
            verified: '✅',
            failed: '❌',
            not_found: '⚠️'
          };
          
          const toolIcons = {
            email: '📧',
            calendar: '📅',
            subflow: '🔄',
            database: '🗄️',
            api: '🌐'
          };
          
          return (
            <div 
              key={`tool-${idx}`}
              className={`p-4 rounded-lg border-2 ${statusColors[tv.status]} transition-all duration-300 hover:shadow-md`}
            >
              <div className="flex items-start justify-between">
                <div className="flex items-start space-x-3 flex-1">
                  <span className="text-2xl">{toolIcons[tv.toolType]}</span>
                  <div className="flex-1">
                    <div className="flex items-center space-x-2">
                      <h4 className="font-semibold text-sm">{tv.toolName}</h4>
                      <span className="text-xs px-2 py-0.5 bg-white bg-opacity-50 rounded-full">
                        Turno {tv.turnNumber}
                      </span>
                    </div>
                    <p className="text-xs mt-1 text-gray-700">{tv.action}</p>
                    <p className="text-sm mt-2 font-medium">{tv.details}</p>
                    
                    {tv.evidence && (
                      <details className="mt-2">
                        <summary className="text-xs cursor-pointer text-gray-600 hover:text-gray-800">
                          Ver evidencia completa
                        </summary>
                        <pre className="mt-2 text-xs bg-white bg-opacity-50 p-2 rounded overflow-x-auto max-h-40">
                          {JSON.stringify(tv.evidence, null, 2)}
                        </pre>
                      </details>
                    )}
                  </div>
                </div>
                <span className="text-2xl ml-2">{statusIcons[tv.status]}</span>
              </div>
            </div>
          );
        })}
      </div>
    );
  };
  
  const renderPriceVerifications = () => {
    if (allPriceVerifications.length === 0) {
      return (
        <div className="text-center text-gray-500 py-12">
          <svg className="w-16 h-16 mx-auto mb-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <p className="text-sm">{t('noPriceVerifications') || 'No se detectaron precios mencionados'}</p>
          <p className="text-xs text-gray-400 mt-2">
            {isActive ? 'Esperando menciones de precios...' : 'El agente no mencionó precios en esta conversación'}
          </p>
        </div>
      );
    }
    
    return (
      <div className="space-y-3">
        {allPriceVerifications.map((pv, idx) => {
          const matchClass = pv.matches 
            ? 'bg-green-100 border-green-200 text-green-800'
            : pv.priceInDB === null
            ? 'bg-yellow-100 border-yellow-200 text-yellow-800'
            : 'bg-red-100 border-red-200 text-red-800';
          
          const matchIcon = pv.matches ? '✅' : pv.priceInDB === null ? '❓' : '❌';
          
          return (
            <div 
              key={`price-${idx}`}
              className={`p-4 rounded-lg border-2 ${matchClass} transition-all duration-300 hover:shadow-md`}
            >
              <div className="flex items-start justify-between">
                <div className="flex items-start space-x-3 flex-1">
                  <span className="text-2xl">💰</span>
                  <div className="flex-1">
                    <div className="flex items-center space-x-2">
                      <h4 className="font-semibold text-sm">{pv.product}</h4>
                      <span className="text-xs px-2 py-0.5 bg-white bg-opacity-50 rounded-full">
                        Turno {pv.turnNumber}
                      </span>
                    </div>
                    
                    <div className="mt-2 space-y-1 text-sm">
                      <div className="flex items-center justify-between">
                        <span className="text-gray-700">Mencionado por agente:</span>
                        <span className="font-bold">{pv.priceMentioned}</span>
                      </div>
                      
                      <div className="flex items-center justify-between">
                        <span className="text-gray-700">Precio real en BD:</span>
                        <span className="font-bold">
                          {pv.priceInDB !== null ? `$${pv.priceInDB}` : 'No encontrado'}
                        </span>
                      </div>
                      
                      {pv.priceInDB !== null && (
                        <div className="flex items-center justify-between pt-1 border-t border-gray-300">
                          <span className="text-gray-700">Estado:</span>
                          <span className="font-bold">
                            {pv.matches ? 'Correcto ✓' : 'Diferente ✗'}
                          </span>
                        </div>
                      )}
                      
                      <p className="text-xs text-gray-600 mt-2">
                        Fuente: {pv.source}
                      </p>
                    </div>
                    
                    {pv.context && (
                      <details className="mt-2">
                        <summary className="text-xs cursor-pointer text-gray-600 hover:text-gray-800">
                          Ver contexto completo
                        </summary>
                        <p className="mt-2 text-xs bg-white bg-opacity-50 p-2 rounded">
                          "{pv.context}"
                        </p>
                      </details>
                    )}
                  </div>
                </div>
                <span className="text-2xl ml-2">{matchIcon}</span>
              </div>
            </div>
          );
        })}
      </div>
    );
  };
  
  const renderDatabaseOperations = () => {
    if (allDatabaseOperations.length === 0) {
      return (
        <div className="text-center text-gray-500 py-12">
          <svg className="w-16 h-16 mx-auto mb-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" />
          </svg>
          <p className="text-sm">{t('noDatabaseOperations') || 'No se detectaron operaciones de BD'}</p>
          <p className="text-xs text-gray-400 mt-2">
            {isActive ? 'Esperando cambios en base de datos...' : 'No hubo cambios en la base de datos durante esta conversación'}
          </p>
        </div>
      );
    }
    
    return (
      <div className="space-y-3">
        {allDatabaseOperations.map((dbo, idx) => {
          const typeColors = {
            INSERT: 'bg-green-100 border-green-200 text-green-800',
            UPDATE: 'bg-blue-100 border-blue-200 text-blue-800',
            DELETE: 'bg-red-100 border-red-200 text-red-800',
            READ: 'bg-gray-100 border-gray-200 text-gray-800'
          };
          
          const typeIcons = {
            INSERT: '➕',
            UPDATE: '🔄',
            DELETE: '➖',
            READ: '👁️'
          };
          
          return (
            <div 
              key={`db-${idx}`}
              className={`p-4 rounded-lg border-2 ${typeColors[dbo.type]} transition-all duration-300 hover:shadow-md`}
            >
              <div className="flex items-start justify-between">
                <div className="flex items-start space-x-3 flex-1">
                  <span className="text-2xl">{typeIcons[dbo.type]}</span>
                  <div className="flex-1">
                    <div className="flex items-center space-x-2">
                      <h4 className="font-semibold text-sm">{dbo.type}</h4>
                      <span className="text-xs px-2 py-0.5 bg-white bg-opacity-50 rounded-full">
                        Turno {dbo.turnNumber}
                      </span>
                      <span className="text-xs px-2 py-0.5 bg-white bg-opacity-50 rounded-full">
                        {dbo.table}
                      </span>
                    </div>
                    
                    <p className="text-sm mt-2">{dbo.summary}</p>
                    
                    {dbo.fields && dbo.fields.length > 0 && (
                      <div className="mt-2">
                        <p className="text-xs text-gray-600">Campos modificados:</p>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {dbo.fields.map((field, fidx) => (
                            <span 
                              key={fidx}
                              className="text-xs px-2 py-0.5 bg-white bg-opacity-50 rounded font-mono"
                            >
                              {field.name}: {JSON.stringify(field.value)}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                    
                    {dbo.recordData && (
                      <details className="mt-2">
                        <summary className="text-xs cursor-pointer text-gray-600 hover:text-gray-800">
                          Ver datos completos del registro
                        </summary>
                        <pre className="mt-2 text-xs bg-white bg-opacity-50 p-2 rounded overflow-x-auto max-h-40">
                          {JSON.stringify(dbo.recordData, null, 2)}
                        </pre>
                      </details>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    );
  };
  
  return (
    <div className="bg-white rounded-lg shadow-lg border border-gray-200">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-600 to-purple-600 text-white px-6 py-4 rounded-t-lg">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="relative">
              <span className="text-2xl">🔴</span>
              {isActive && (
                <span className="absolute top-0 right-0 w-2 h-2 bg-red-500 rounded-full animate-pulse"></span>
              )}
            </div>
            <div>
              <h3 className="text-lg font-bold">Verificación en Tiempo Real</h3>
              <p className="text-xs text-blue-100">
                {isActive ? 'Auditoría en curso - Actualizando...' : 'Auditoría completada'}
              </p>
            </div>
          </div>
          
          <div className="flex items-center space-x-4 text-sm">
            <div className="text-center">
              <div className="font-bold text-xl">{allToolVerifications.length}</div>
              <div className="text-xs text-blue-100">Herramientas</div>
            </div>
            <div className="text-center">
              <div className="font-bold text-xl">{allPriceVerifications.length}</div>
              <div className="text-xs text-blue-100">Precios</div>
            </div>
            <div className="text-center">
              <div className="font-bold text-xl">{allDatabaseOperations.length}</div>
              <div className="text-xs text-blue-100">BD Ops</div>
            </div>
          </div>
        </div>
      </div>
      
      {/* Tabs */}
      <div className="flex border-b border-gray-200">
        <button
          onClick={() => setSelectedTab('tools')}
          className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
            selectedTab === 'tools'
              ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50'
              : 'text-gray-600 hover:text-gray-800 hover:bg-gray-50'
          }`}
        >
          <span className="mr-2">🔧</span>
          Herramientas ({allToolVerifications.length})
        </button>
        
        <button
          onClick={() => setSelectedTab('prices')}
          className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
            selectedTab === 'prices'
              ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50'
              : 'text-gray-600 hover:text-gray-800 hover:bg-gray-50'
          }`}
        >
          <span className="mr-2">💰</span>
          Precios ({allPriceVerifications.length})
        </button>
        
        <button
          onClick={() => setSelectedTab('database')}
          className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
            selectedTab === 'database'
              ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50'
              : 'text-gray-600 hover:text-gray-800 hover:bg-gray-50'
          }`}
        >
          <span className="mr-2">🗄️</span>
          Base de Datos ({allDatabaseOperations.length})
        </button>
      </div>
      
      {/* Content */}
      <div 
        id="live-verification-panel"
        className="p-6 max-h-[600px] overflow-y-auto"
      >
        {selectedTab === 'tools' && renderToolVerifications()}
        {selectedTab === 'prices' && renderPriceVerifications()}
        {selectedTab === 'database' && renderDatabaseOperations()}
      </div>
    </div>
  );
};

export default LiveVerificationPanel;
