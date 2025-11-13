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
    <div className="max-w-4xl mx-auto">
      <Card>
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-4">
            🤖 Silver Fleet - Auditor de Agentes IA
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            Elige el tipo de proyecto a auditar
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {/* n8n Option */}
          <div
            onClick={() => setSelectedType('n8n')}
            className="p-8 border-2 border-gray-200 dark:border-gray-700 rounded-lg hover:border-primary-500 dark:hover:border-primary-400 cursor-pointer transition transform hover:scale-105 bg-gray-50 dark:bg-gray-900/50"
          >
            <div className="text-center">
              <div className="text-6xl mb-4">🔄</div>
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
                n8n Workflow
              </h2>
              <p className="text-gray-600 dark:text-gray-400 mb-6">
                Carga un archivo <code className="bg-gray-200 dark:bg-gray-800 px-2 py-1 rounded">workflow.json</code> de n8n
              </p>
              <ul className="text-sm text-gray-600 dark:text-gray-400 space-y-2 text-left mb-6">
                <li>✅ Análisis de nodos IA</li>
                <li>✅ Detección de herramientas</li>
                <li>✅ Auditoría de conversaciones</li>
                <li>✅ Verificación de BD</li>
              </ul>
              <button
                onClick={() => setSelectedType('n8n')}
                className="w-full px-6 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition font-medium"
              >
                Seleccionar n8n
              </button>
            </div>
          </div>

          {/* Node/TypeScript Option */}
          <div className="p-8 border-2 border-gray-200 dark:border-gray-700 rounded-lg hover:border-green-500 dark:hover:border-green-400 cursor-pointer transition transform hover:scale-105 bg-gray-50 dark:bg-gray-900/50">
            <div className="text-center">
              <div className="text-6xl mb-4">💻</div>
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
                Node/TypeScript
              </h2>
              <p className="text-gray-600 dark:text-gray-400 mb-6">
                Carga un archivo <code className="bg-gray-200 dark:bg-gray-800 px-2 py-1 rounded">.zip</code> de tu proyecto
              </p>
              <ul className="text-sm text-gray-600 dark:text-gray-400 space-y-2 text-left mb-6">
                <li>✅ Detección de framework</li>
                <li>✅ Identificación de agentes IA</li>
                <li>✅ Mapeo de bases de datos</li>
                <li>✅ APIs externas detectadas</li>
              </ul>

              {isAnalyzing ? (
                <div className="w-full flex items-center justify-center gap-2 py-2">
                  <Loader />
                  <span className="text-sm text-gray-600 dark:text-gray-400">Analizando...</span>
                </div>
              ) : (
                <label className="w-full inline-block">
                  <div className="w-full px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition font-medium cursor-pointer">
                    {codeProject ? '✅ ZIP cargado - Haz click para cambiar' : 'Cargar ZIP'}
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

            {analysisError && (
              <div className="mt-4 p-3 bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-200 rounded-lg text-sm">
                {analysisError}
              </div>
            )}

            {codeProject && (
              <div className="mt-4 p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-700 rounded-lg text-sm">
                <p className="font-semibold text-green-900 dark:text-green-200 mb-2">
                  ✅ Proyecto analizado:
                </p>
                <ul className="text-green-800 dark:text-green-300 space-y-1 text-xs">
                  <li>• Framework: {codeProject.framework?.name || 'Desconocido'}</li>
                  {codeProject.agents.length > 0 && (
                    <li className="text-yellow-700 dark:text-yellow-400">
                      • Agentes detectados: {codeProject.agents.length} 
                      <span className="text-xs ml-2 italic">(sin auditoría completa en ZIP)</span>
                    </li>
                  )}
                  <li>• Bases de datos: {codeProject.databases.length}</li>
                  <li>• Herramientas: {codeProject.tools.length}</li>
                  <li>• APIs: {codeProject.apis.length}</li>
                  <li>• Archivos: {codeProject.fileCount}</li>
                </ul>
                <button
                  onClick={() => setSelectedType('nodejs')}
                  className="w-full mt-4 px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 font-medium transition"
                >
                  Continuar con auditoría →
                </button>
              </div>
            )}
          </div>
        </div>
      </Card>
    </div>
  );
};

export default ProjectTypeSelector;
