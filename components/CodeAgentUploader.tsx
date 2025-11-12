/**
 * 📁 CodeAgentUploader
 * 
 * Permite cargar archivos TypeScript/Node:
 * - Zip con el proyecto
 * - Archivos individuales
 * - Desde directorio
 * 
 * Valida y parsea el agente
 */

import React, { useState, useRef } from 'react';
import type { ParsedAgentWorkflow } from '../types';
import { parseCodeAgent, exportAgentInfo } from '../services/codeAgentParser';
import { isZipFile, processZipFile } from '../services/zipHandler';
import { useTranslation } from '../hooks/useTranslation';
import Loader from './Loader';
import Card from './Card';

interface CodeAgentUploaderProps {
  onSuccess: (workflow: ParsedAgentWorkflow) => void;
  onError: (error: string) => void;
  isLoading?: boolean;
}

const CodeAgentUploader: React.FC<CodeAgentUploaderProps> = ({ onSuccess, onError, isLoading = false }) => {
  const { t } = useTranslation();
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [parsing, setParsing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files) return;
    
    const filesArray = Array.from(files);
    let filesToProcess: File[] = [];

    // Verificar si hay archivos ZIP
    const zipFiles = filesArray.filter(f => isZipFile(f));
    const regularFiles = filesArray.filter(f => !isZipFile(f));

    try {
      // Procesar archivos ZIP
      if (zipFiles.length > 0) {
        console.log(`📦 Procesando ${zipFiles.length} archivo(s) ZIP...`);
        for (const zipFile of zipFiles) {
          const extractedFiles = await processZipFile(zipFile);
          filesToProcess = [...filesToProcess, ...extractedFiles];
        }
      }

      // Agregar archivos regulares
      const tsFiles = regularFiles.filter(f =>
        f.name.endsWith('.ts') ||
        f.name.endsWith('.js') ||
        f.name.endsWith('.json') ||
        f.name === 'package.json'
      );

      filesToProcess = [...filesToProcess, ...tsFiles];

      if (filesToProcess.length === 0) {
        onError(t('noValidFilesSelected') || 'No valid TypeScript/Node files selected');
        return;
      }

      setSelectedFiles(filesToProcess);

      // Parsear automáticamente
      await parseAgent(filesToProcess);
    } catch (error: any) {
      onError(error.message || 'Error processing files');
    }
  };
  
  const parseAgent = async (files: File[]) => {
    try {
      setParsing(true);
      console.log(`📁 Parsing ${files.length} agent files...`);
      
      const workflow = await parseCodeAgent(files);
      
      console.log('✅ Agent parsed successfully');
      console.log('📊 Agent info:', exportAgentInfo(workflow));
      
      onSuccess(workflow);
    } catch (error: any) {
      console.error('❌ Parse error:', error);
      onError(error.message || 'Failed to parse agent');
    } finally {
      setParsing(false);
    }
  };
  
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };
  
  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    const files = e.dataTransfer.files;
    if (files.length === 0) return;
    
    const filesArray = Array.from(files);
    let filesToProcess: File[] = [];

    try {
      // Verificar si hay archivos ZIP
      const zipFiles = filesArray.filter(f => isZipFile(f));
      const regularFiles = filesArray.filter(f => !isZipFile(f));

      // Procesar archivos ZIP
      if (zipFiles.length > 0) {
        console.log(`📦 Procesando ${zipFiles.length} archivo(s) ZIP...`);
        for (const zipFile of zipFiles) {
          const extractedFiles = await processZipFile(zipFile);
          filesToProcess = [...filesToProcess, ...extractedFiles];
        }
      }

      // Agregar archivos regulares
      const tsFiles = regularFiles.filter(f =>
        f.name.endsWith('.ts') ||
        f.name.endsWith('.js') ||
        f.name.endsWith('.json')
      );

      filesToProcess = [...filesToProcess, ...tsFiles];

      if (filesToProcess.length === 0) {
        onError(t('noValidFilesSelected') || 'No valid files detected');
        return;
      }

      setSelectedFiles(filesToProcess);
      await parseAgent(filesToProcess);
    } catch (error: any) {
      onError(error.message || 'Error processing dropped files');
    }
  };
  
  if (parsing || isLoading) {
    return (
      <Card>
        <div className="text-center py-8">
          <Loader />
          <p className="mt-4 text-gray-600 dark:text-gray-400">
            {t('parsingAgent') || 'Parsing your agent...'}
          </p>
        </div>
      </Card>
    );
  }
  
  return (
    <Card>
      <div className="space-y-4">
        <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-100">
          {t('uploadTypeScriptAgent') || 'Upload TypeScript/Node Agent'}
        </h3>
        
        {/* Drag and Drop Area */}
        <div
          onDragOver={handleDragOver}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-8 text-center cursor-pointer hover:border-gray-400 dark:hover:border-gray-500 transition-colors"
        >
          <div className="text-4xl mb-2">�</div>
          <p className="font-semibold text-gray-700 dark:text-gray-300 mb-1">
            {t('dragFilesHere') || 'Drag files or ZIP here'}
          </p>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            {t('codeAgentUploadHelp') || 'or click to select .ts, .js, .json, or .zip files'}
          </p>
        </div>
        
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".ts,.js,.json,.zip"
          onChange={handleFileSelect}
          className="hidden"
        />
        
        {/* Selected Files List */}
        {selectedFiles.length > 0 && (
          <div className="mt-4">
            <h4 className="font-semibold text-gray-700 dark:text-gray-300 mb-2">
              {t('selectedFiles') || 'Selected Files'} ({selectedFiles.length})
            </h4>
            <ul className="space-y-2 max-h-40 overflow-y-auto">
              {selectedFiles.map((file, idx) => (
                <li
                  key={idx}
                  className="flex items-center text-sm text-gray-600 dark:text-gray-400 p-2 bg-gray-50 dark:bg-gray-800 rounded"
                >
                  <span className="mr-2">📄</span>
                  {file.name}
                  <span className="ml-auto text-xs text-gray-500">
                    {(file.size / 1024).toFixed(1)} KB
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
        
        {/* Info Box */}
        <div className="bg-blue-50 dark:bg-blue-900 border border-blue-200 dark:border-blue-800 rounded-lg p-3 text-sm text-blue-800 dark:text-blue-100">
          <strong>💡 Tip:</strong> You can upload:
          <ul className="mt-2 ml-4 list-disc space-y-1">
            <li><code className="bg-blue-100 dark:bg-blue-800 px-1 rounded">.zip</code> - Tu proyecto completo (se descomprime automáticamente)</li>
            <li><code className="bg-blue-100 dark:bg-blue-800 px-1 rounded">package.json</code> - Para detectar framework</li>
            <li><code className="bg-blue-100 dark:bg-blue-800 px-1 rounded">src/agent.ts</code> - Agente principal</li>
            <li><code className="bg-blue-100 dark:bg-blue-800 px-1 rounded">src/tools.ts</code> - Herramientas disponibles</li>
            <li><code className="bg-blue-100 dark:bg-blue-800 px-1 rounded">src/handlers.ts</code> - Manejadores</li>
          </ul>
        </div>
      </div>
    </Card>
  );
};

export default CodeAgentUploader;
