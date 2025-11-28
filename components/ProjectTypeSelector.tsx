/**
 * 🎯 Project Type Selector
 * 
 * Permite elegir entre:
 * - n8n Workflow (JSON)
 * - Node/TypeScript Project (ZIP)
 */

import React, { useState } from 'react';
import { useTranslation } from '../hooks/useTranslation';
import Card from './Card';
import AgentConfig from './AgentConfig';
import AuditHistory from './AuditHistory';
import type { AuditConfig, ParsedN8nWorkflow, HistoricalAudit, ParsedCodeProject, CodeProjectAuditConfig } from '../types';
import { deepAnalyzeProject } from '../services/deepProjectAnalyzer';
import { isZipFile, processZipFile } from '../services/zipHandler';
import Loader from './Loader';

interface ProjectTypeSelectorProps {
  onStartAudit: (data: { config: AuditConfig, n8nData: ParsedN8nWorkflow | null, codeProject?: ParsedCodeProject }) => void;
  onViewHistory: (item: HistoricalAudit) => void;
  onManageCredentials?: () => void;
  initialConfig?: AuditConfig | null;
}

type ProjectType = 'n8n' | 'nodejs' | null;

const ProjectTypeSelector: React.FC<ProjectTypeSelectorProps> = ({
  onStartAudit,
  onViewHistory,
  onManageCredentials,
  initialConfig,
}) => {
  const { t } = useTranslation();
  const [selectedType, setSelectedType] = useState<ProjectType>(null);
  const [codeProject, setCodeProject] = useState<ParsedCodeProject | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setAnalysisError(null);

    try {
      setIsAnalyzing(true);

      if (!isZipFile(file)) {
        setAnalysisError('❌ Por favor carga un archivo ZIP válido');
        return;
      }

      // Procesar ZIP
      const extractedFiles = await processZipFile(file);
      if (extractedFiles.length === 0) {
        setAnalysisError('❌ El ZIP está vacío o no contiene archivos válidos');
        return;
      }

      // Crear ArrayBuffer del ZIP
      const arrayBuffer = await file.arrayBuffer();

      // 🔬 Analizar proyecto con análisis profundo (incluye agentes, BD, integraciones)
      const analyzed = await deepAnalyzeProject(arrayBuffer, t('languageCode') || 'en');
      setCodeProject(analyzed);
      setSelectedType('nodejs');
    } catch (error: any) {
      setAnalysisError(`❌ Error: ${error.message}`);
      console.error('Error analyzing ZIP:', error);
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Si ya se seleccionó un tipo y se analizó correctamente, mostrar AgentConfig
  if (selectedType === 'nodejs' && codeProject) {
    return (
      <div>
        <div className="mb-6 flex items-center gap-4">
          <button
            onClick={() => {
              setSelectedType(null);
              setCodeProject(null);
              setAnalysisError(null);
            }}
            className="px-4 py-2 text-sm bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded hover:bg-gray-300"
          >
            ← Cambiar tipo de proyecto
          </button>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            💻 Proyecto Node/TypeScript: {codeProject.framework?.name || 'Detectado'}
          </h2>
        </div>
        <AgentConfig
          codeProject={codeProject}
          onStartAudit={(data) => {
            onStartAudit({ ...data, codeProject });
          }}
          onViewHistory={onViewHistory}
          onManageCredentials={onManageCredentials}
          initialConfig={initialConfig}
        />
      </div>
    );
  }

  if (selectedType === 'n8n') {
    return (
      <div>
        <div className="mb-6">
          <button
            onClick={() => setSelectedType(null)}
            className="px-4 py-2 text-sm bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded hover:bg-gray-300"
          >
            ← Cambiar tipo de proyecto
          </button>
        </div>
        <AgentConfig
          onStartAudit={onStartAudit}
          onViewHistory={onViewHistory}
          onManageCredentials={onManageCredentials}
          initialConfig={initialConfig}
        />
      </div>
    );
  }

  // Mostrar selector inicial
  return (
    <div className="max-w-[1200px] mx-auto">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 mb-4">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-bold">Tipo de Proyecto</h2>
          <div className="flex gap-2">
            <button
              onClick={() => setShowHistory(true)}
              className="px-3 py-1.5 text-sm bg-gray-200 dark:bg-gray-700 rounded hover:bg-gray-300"
            >
              📜 Historial
            </button>
            {onManageCredentials && (
              <button
                onClick={onManageCredentials}
                className="px-3 py-1.5 text-sm bg-gray-200 dark:bg-gray-700 rounded hover:bg-gray-300"
              >
                🔐 Credenciales
              </button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {/* n8n Option */}
          <div className="p-4 border-2 border-gray-200 dark:border-gray-700 rounded-lg hover:border-primary-500 hover:shadow-lg cursor-pointer transition-all duration-300 bg-gradient-to-br from-blue-50 to-primary-50 dark:from-gray-900 dark:to-primary-900/20 group">
            <div className="flex items-start gap-3 mb-3">
              <div className="text-4xl animate-spin-slow group-hover:scale-110 transition-transform">🔄</div>
              <div className="flex-1">
                <h3 className="text-lg font-bold mb-1 flex items-center gap-2">
                  n8n Workflow
                  <span className="text-xs bg-blue-500 text-white px-2 py-0.5 rounded-full">AI</span>
                </h3>
                <p className="text-xs text-gray-600 dark:text-gray-400 mb-2">
                  Carga <code className="bg-gray-200 dark:bg-gray-800 px-1 rounded text-xs">workflow.json</code>
                </p>
                <div className="text-xs text-gray-600 dark:text-gray-400 space-y-0.5">
                  <div>✅ Análisis de nodos IA</div>
                  <div>✅ Auditoría de conversaciones</div>
                  <div>✅ Verificación de BD</div>
                </div>
              </div>
            </div>
            <button
              onClick={() => setSelectedType('n8n')}
              className="w-full px-3 py-2 bg-primary-600 hover:bg-primary-700 text-white text-sm rounded-lg transition-colors font-semibold"
            >
              Seleccionar n8n →
            </button>
          </div>

          {/* Node/TypeScript Option */}
          <div className="p-4 border-2 border-gray-200 dark:border-gray-700 rounded-lg hover:border-green-500 hover:shadow-lg transition-all duration-300 bg-gradient-to-br from-green-50 to-emerald-50 dark:from-gray-900 dark:to-green-900/20 group">
            <div className="flex items-start gap-3">
              <div className="text-4xl group-hover:scale-110 transition-transform">💻</div>
              <div className="flex-1">
                <h3 className="text-lg font-bold mb-1">Node/TypeScript</h3>
                <p className="text-xs text-gray-600 dark:text-gray-400 mb-2">
                  Carga <code className="bg-gray-200 dark:bg-gray-800 px-1 rounded text-xs">.zip</code> del proyecto
                </p>
                <div className="text-xs text-gray-600 dark:text-gray-400 space-y-0.5 mb-2">
                  <div>✅ Detección de framework</div>
                  <div>✅ Identificación de agentes</div>
                  <div>✅ Mapeo de BD y APIs</div>
                </div>

                {isAnalyzing ? (
                  <div className="flex items-center gap-2 py-1">
                    <Loader />
                    <span className="text-xs text-gray-600">Analizando...</span>
                  </div>
                ) : (
                  <label className="block">
                    <div className="px-3 py-1.5 bg-green-600 text-white text-sm rounded hover:bg-green-700 cursor-pointer text-center">
                      {codeProject ? '✅ ZIP cargado' : 'Cargar ZIP'}
                    </div>
                    <input
                      type="file"
                      accept=".zip"
                      onChange={handleFileSelect}
                      className="hidden"
                    />
                  </label>
                )}
              </div>
            </div>

            {analysisError && (
              <div className="mt-2 p-2 bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-200 rounded text-xs">
                {analysisError}
              </div>
            )}

            {codeProject && (
              <div className="mt-2 p-2 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-700 rounded text-xs">
                <p className="font-semibold text-green-900 dark:text-green-200 mb-1">
                  ✅ Proyecto analizado
                </p>
                <div className="text-green-800 dark:text-green-300 space-y-0.5 text-xs">
                  <div>• Framework: {codeProject.framework?.name || 'Desconocido'}</div>
                  <div>• Agentes: {codeProject.agents.length}</div>
                  <div>• BD: {codeProject.databases.length} | APIs: {codeProject.apis.length}</div>
                </div>
                <button
                  onClick={() => setSelectedType('nodejs')}
                  className="w-full mt-2 px-3 py-1.5 bg-green-600 text-white text-xs rounded hover:bg-green-700"
                >
                  Continuar →
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Modal de Historial */}
      {showHistory && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fadeIn">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl max-w-4xl w-full max-h-[85vh] flex flex-col animate-slideUp">
            <div className="flex justify-between items-center p-5 border-b dark:border-gray-700 bg-gradient-to-r from-primary-50 to-blue-50 dark:from-gray-900 dark:to-primary-900/30">
              <h2 className="text-xl font-bold flex items-center gap-2">
                <span className="text-2xl">📜</span>
                Historial de Auditorías
              </h2>
              <button
                onClick={() => setShowHistory(false)}
                className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-red-100 dark:hover:bg-red-900/30 text-gray-500 hover:text-red-600 text-2xl transition-colors"
              >
                ×
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-5">
              <AuditHistory onViewReport={(audit) => {
                setShowHistory(false);
                onViewHistory(audit);
              }} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ProjectTypeSelector;
