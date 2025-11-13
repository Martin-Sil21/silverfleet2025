/**
 * Editor de Payload JSON
 * Permite editar directamente el JSON del payload
 */

import React, { useState, useEffect } from 'react';
import { CheckCircleIcon } from './icons/CheckCircleIcon';
import { XCircleIcon } from './icons/XCircleIcon';

interface PayloadEditorProps {
  payload: Record<string, any> | null;
  onPayloadChange: (payload: Record<string, any>) => void;
  onGenerate: () => void;
  isGenerating: boolean;
  error?: string | null;
}

export function PayloadEditor({ 
  payload, 
  onPayloadChange, 
  onGenerate, 
  isGenerating, 
  error 
}: PayloadEditorProps) {
  const [jsonText, setJsonText] = useState('');
  const [jsonError, setJsonError] = useState<string | null>(null);

  // Sincronizar el texto JSON cuando cambia el payload externo
  useEffect(() => {
    if (payload) {
      setJsonText(JSON.stringify(payload, null, 2));
      setJsonError(null);
    }
  }, [payload]);

  const handleJsonChange = (value: string) => {
    setJsonText(value);
    
    try {
      const parsed = JSON.parse(value);
      setJsonError(null);
      onPayloadChange(parsed);
    } catch (e) {
      setJsonError('JSON inválido');
    }
  };

  return (
    <div className="space-y-4">
      {/* Header con botón generar */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-gray-800 dark:text-white">
            📝 Payload de Entrada
          </h3>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Edita el JSON que se enviará a los endpoints
          </p>
        </div>
        <button
          type="button"
          onClick={onGenerate}
          disabled={isGenerating}
          className="px-4 py-2 bg-purple-600 text-white text-sm font-semibold rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition flex items-center gap-2"
        >
          {isGenerating ? (
            <>
              <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full"></div>
              Generando...
            </>
          ) : (
            <>✨ {payload ? 'Regenerar' : 'Generar con IA'}</>
          )}
        </button>
      </div>

      {/* Error de generación */}
      {error && (
        <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
          <p className="text-sm text-red-700 dark:text-red-300">❌ {error}</p>
        </div>
      )}

      {/* Estado vacío */}
      {!payload && !isGenerating && !error && (
        <div className="p-8 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg text-center">
          <p className="text-gray-500 dark:text-gray-400 mb-2">
            ✨ Genera el payload automáticamente con IA
          </p>
          <p className="text-xs text-gray-400 dark:text-gray-500">
            Analiza el proyecto y crea campos realistas
          </p>
        </div>
      )}

      {/* Editor JSON */}
      {payload && !error && (
        <div className="space-y-2">
          {/* Indicador de estado */}
          <div className={`flex items-center gap-2 p-2 rounded ${
            jsonError 
              ? 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800' 
              : 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-700'
          }`}>
            {jsonError ? (
              <>
                <XCircleIcon className="w-4 h-4 text-red-600" />
                <p className="text-xs text-red-700 dark:text-red-300 font-semibold">
                  {jsonError}
                </p>
              </>
            ) : (
              <>
                <CheckCircleIcon className="w-4 h-4 text-green-600" />
                <p className="text-xs text-green-700 dark:text-green-300 font-semibold">
                  JSON válido • {Object.keys(payload).length} campos
                </p>
              </>
            )}
          </div>

          {/* Textarea para editar JSON */}
          <textarea
            value={jsonText}
            onChange={(e) => handleJsonChange(e.target.value)}
            className={`w-full h-64 px-4 py-3 font-mono text-sm bg-gray-900 text-green-400 rounded-lg border-2 focus:outline-none focus:ring-2 transition ${
              jsonError
                ? 'border-red-500 focus:ring-red-500'
                : 'border-gray-700 focus:ring-purple-500'
            }`}
            placeholder='{\n  "session_id": "5491234567890",\n  "body": "Hola",\n  "from": "5491234567890"\n}'
            spellCheck={false}
          />

          {/* Ayuda */}
          <p className="text-xs text-gray-500 dark:text-gray-400">
            💡 Edita el JSON directamente. Los cambios se aplican automáticamente.
          </p>
        </div>
      )}
    </div>
  );
}

export default PayloadEditor;
