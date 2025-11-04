import React, { useState, useEffect } from 'react';
import { 
  Credential, 
  CredentialType, 
  generateCredentialId, 
  saveCredential, 
  getCredentialsByType,
  validateCredential,
  getCredentialTypeLabel
} from '../services/credentialsManager';
import { testCredential, type TableInfo } from '../services/credentialTester';
import { XCircleIcon } from './icons/XCircleIcon';
import { CheckCircleIcon } from './icons/CheckCircleIcon';

interface CredentialModalProps {
  isOpen: boolean;
  credentialType: CredentialType;
  toolName: string;
  onClose: () => void;
  onCredentialSelected: (credentialId: string) => void;
  preSelectedCredentialId?: string;
  workflowTables?: string[]; // Tablas detectadas en el workflow
  acceptedTypes?: CredentialType[]; // Tipos de credenciales aceptados (incluye compatibles)
}

const CredentialModal: React.FC<CredentialModalProps> = ({
  isOpen,
  credentialType,
  toolName,
  onClose,
  onCredentialSelected,
  preSelectedCredentialId,
  workflowTables = [],
  acceptedTypes = []
}) => {
  const [mode, setMode] = useState<'select' | 'create'>('select');
  const [existingCredentials, setExistingCredentials] = useState<Credential[]>([]);
  const [selectedCredId, setSelectedCredId] = useState<string | null>(preSelectedCredentialId || null);
  
  // Form state for new credential
  const [currentCredentialType, setCurrentCredentialType] = useState<CredentialType>(credentialType); // Tipo actual en el formulario
  const [credName, setCredName] = useState('');
  const [formData, setFormData] = useState<Record<string, any>>({});
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string; tables?: TableInfo[] } | null>(null);
  const [availableTables, setAvailableTables] = useState<TableInfo[]>([]);
  const [selectedTables, setSelectedTables] = useState<Set<string>>(new Set());
  const [tableSearchQuery, setTableSearchQuery] = useState('');

  useEffect(() => {
    if (isOpen) {
      // Reset al abrir
      setCurrentCredentialType(credentialType);
      
      // Cargar credenciales del tipo principal + tipos aceptados
      const typesToLoad = acceptedTypes.length > 0 ? acceptedTypes : [credentialType];
      const allCreds = typesToLoad.flatMap(type => getCredentialsByType(type));
      
      // Eliminar duplicados por ID
      const uniqueCreds = Array.from(new Map(allCreds.map(c => [c.id, c])).values());
      setExistingCredentials(uniqueCreds);
      
      if (preSelectedCredentialId && uniqueCreds.some(c => c.id === preSelectedCredentialId)) {
        setSelectedCredId(preSelectedCredentialId);
        setMode('select');
      } else if (uniqueCreds.length === 0) {
        setMode('create');
      } else {
        setMode('select');
      }
    }
  }, [isOpen, credentialType, preSelectedCredentialId, acceptedTypes]);
  
  // Nueva función para editar credencial existente
  const handleEditExisting = () => {
    if (!selectedCredId) return;
    
    const credential = existingCredentials.find(c => c.id === selectedCredId);
    if (!credential) return;
    
    // Pre-llenar el formulario con los datos existentes
    setCredName(credential.name);
    setFormData(credential.data);
    setMode('create');
  };

  const handleSelectExisting = () => {
    if (selectedCredId) {
      onCredentialSelected(selectedCredId);
      onClose();
    }
  };

  const handleTestExistingConnection = async () => {
    if (!selectedCredId) return;
    
    setIsTesting(true);
    setTestResult(null);
    setAvailableTables([]);
    
    const credential = existingCredentials.find(c => c.id === selectedCredId);
    if (!credential) {
      setTestResult({ success: false, message: 'Credential not found' });
      setIsTesting(false);
      return;
    }

    try {
      const result = await testCredential(credential, workflowTables);
      setTestResult(result);
      
      // Si el test fue exitoso y hay tablas, guardarlas
      if (result.success && result.tables && result.tables.length > 0) {
        setAvailableTables(result.tables);
        
        // Pre-seleccionar tablas del workflow primero, o las guardadas en la credencial, sino todas
        const savedTables = (credential.data as any)?.selectedTables || [];
        if (workflowTables.length > 0) {
          const workflowTableSet = new Set(
            result.tables
              .filter(t => workflowTables.some(wt => wt.toLowerCase() === t.name.toLowerCase()))
              .map(t => t.name)
          );
          setSelectedTables(workflowTableSet.size > 0 ? workflowTableSet : new Set(result.tables.map(t => t.name)));
        } else if (savedTables.length > 0) {
          setSelectedTables(new Set(savedTables));
        } else {
          setSelectedTables(new Set(result.tables.map(t => t.name)));
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      setTestResult({ success: false, message });
    } finally {
      setIsTesting(false);
    }
  };

  const handleTestConnection = async () => {
    setIsTesting(true);
    setTestResult(null);
    setValidationErrors([]);
    setAvailableTables([]);

    const testCred = {
      id: 'test',
      name: credName || 'Test',
      type: credentialType,
      data: formData,
      createdAt: Date.now(),
      updatedAt: Date.now()
    } as Partial<Credential>;

    const validation = validateCredential(testCred as any);
    if (!validation.isValid) {
      setValidationErrors(validation.errors);
      setIsTesting(false);
      return;
    }

    try {
      const result = await testCredential(testCred, workflowTables);
      setTestResult(result);
      
      // Si el test fue exitoso y hay tablas, guardarlas
      if (result.success && result.tables && result.tables.length > 0) {
        setAvailableTables(result.tables);
        
        // Pre-seleccionar tablas del workflow primero, sino todas
        if (workflowTables.length > 0) {
          // Solo pre-seleccionar las que existen en la BD y están en el workflow
          const workflowTableSet = new Set(
            result.tables
              .filter(t => workflowTables.some(wt => wt.toLowerCase() === t.name.toLowerCase()))
              .map(t => t.name)
          );
          setSelectedTables(workflowTableSet.size > 0 ? workflowTableSet : new Set(result.tables.map(t => t.name)));
        } else {
          // Si no hay tablas del workflow, pre-seleccionar todas
          setSelectedTables(new Set(result.tables.map(t => t.name)));
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      setTestResult({ success: false, message });
    } finally {
      setIsTesting(false);
    }
  };

  const handleCreateNew = async () => {
    setIsSaving(true);
    setValidationErrors([]);

    // Si estamos editando una existente, actualizarla en lugar de crear nueva
    const isEditing = selectedCredId && existingCredentials.some(c => c.id === selectedCredId);
    
    const newCredential = {
      id: isEditing ? selectedCredId : generateCredentialId(),
      name: credName,
      type: currentCredentialType, // Usar el tipo actual seleccionado
      data: {
        ...formData,
        // Guardar las tablas seleccionadas si las hay
        ...(selectedTables.size > 0 && { selectedTables: Array.from(selectedTables) })
      },
      createdAt: isEditing 
        ? (existingCredentials.find(c => c.id === selectedCredId)?.createdAt || Date.now())
        : Date.now(),
      updatedAt: Date.now()
    } as any as Credential;

    const validation = validateCredential(newCredential);
    if (!validation.isValid) {
      setValidationErrors(validation.errors);
      setIsSaving(false);
      return;
    }

    try {
      saveCredential(newCredential);
      onCredentialSelected(newCredential.id);
      onClose();
    } catch (error) {
      console.error('Error saving credential:', error);
      setValidationErrors(['Failed to save credential']);
    } finally {
      setIsSaving(false);
    }
  };

  const renderFormFields = () => {
    switch (currentCredentialType) { // Usar currentCredentialType en vez de credentialType
      case 'supabase':
        return (
          <>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Supabase URL
              </label>
              <input
                type="url"
                value={formData.url || ''}
                onChange={(e) => setFormData({ ...formData, url: e.target.value })}
                placeholder="https://your-project.supabase.co"
                className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                API Key
              </label>
              <input
                type="password"
                value={formData.key || ''}
                onChange={(e) => setFormData({ ...formData, key: e.target.value })}
                placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
                className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white font-mono text-xs"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Key Type
              </label>
              <select
                value={formData.keyType || 'anon'}
                onChange={(e) => setFormData({ ...formData, keyType: e.target.value })}
                className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              >
                <option value="anon">Anon (public)</option>
                <option value="service_role">Service Role (bypasses RLS)</option>
              </select>
            </div>
          </>
        );

      case 'smtp':
        return (
          <>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  SMTP Host
                </label>
                <input
                  type="text"
                  value={formData.host || ''}
                  onChange={(e) => setFormData({ ...formData, host: e.target.value })}
                  placeholder="smtp.gmail.com"
                  className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Port
                </label>
                <input
                  type="number"
                  value={formData.port || 587}
                  onChange={(e) => setFormData({ ...formData, port: parseInt(e.target.value) })}
                  className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Username
              </label>
              <input
                type="text"
                value={formData.username || ''}
                onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Password
              </label>
              <input
                type="password"
                value={formData.password || ''}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                From Email
              </label>
              <input
                type="email"
                value={formData.fromEmail || ''}
                onChange={(e) => setFormData({ ...formData, fromEmail: e.target.value })}
                placeholder="noreply@example.com"
                className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              />
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="smtp-secure"
                checked={formData.secure || false}
                onChange={(e) => setFormData({ ...formData, secure: e.target.checked })}
                className="w-4 h-4 text-primary-600"
              />
              <label htmlFor="smtp-secure" className="text-sm text-gray-700 dark:text-gray-300">
                Use SSL/TLS
              </label>
            </div>
          </>
        );

      case 'google-service-account':
        return (
          <>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Service Account JSON *
              </label>
              <textarea
                value={formData.private_key ? JSON.stringify(formData, null, 2) : ''}
                onChange={(e) => {
                  try {
                    const parsed = JSON.parse(e.target.value);
                    if (parsed.type === 'service_account') {
                      setFormData(parsed);
                      setTestResult({ success: true, message: '✅ Service Account JSON válido' });
                    } else {
                      setTestResult({ success: false, message: '❌ JSON inválido - debe ser tipo service_account' });
                    }
                  } catch (error) {
                    // Ignorar errores mientras escribe
                  }
                }}
                placeholder={`{
  "type": "service_account",
  "project_id": "tu-proyecto",
  "private_key_id": "...",
  "private_key": "-----BEGIN PRIVATE KEY-----\\n...\\n-----END PRIVATE KEY-----\\n",
  "client_email": "tu-service-account@tu-proyecto.iam.gserviceaccount.com",
  ...
}`}
                rows={12}
                className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white font-mono text-xs"
              />
              {formData.client_email && (
                <div className="mt-2 p-2 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-700 rounded text-xs">
                  <p className="text-green-800 dark:text-green-200">
                    ✅ <strong>{formData.client_email}</strong> - Proyecto: {formData.project_id}
                  </p>
                </div>
              )}
            </div>
            <div className="p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 rounded-lg">
              <p className="text-xs text-blue-800 dark:text-blue-200">
                📋 Descarga el JSON desde <a href="https://console.cloud.google.com/iam-admin/serviceaccounts" target="_blank" rel="noopener noreferrer" className="underline font-semibold">Google Cloud Console</a> → Service Accounts → Keys → Add Key → JSON
              </p>
            </div>
          </>
        );

      case 'google-oauth':
        return (
          <>
            {/* 📚 Guía de configuración */}
            <div className="p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-700 rounded-lg">
              <p className="text-sm text-yellow-900 dark:text-yellow-100 mb-2">
                ⚠️ <strong>IMPORTANTE</strong>: Necesitas TU PROPIO proyecto en Google Cloud Console
              </p>
              <p className="text-xs text-yellow-800 dark:text-yellow-200 mb-2">
                No uses credenciales de n8n u otras apps. Crea tu proyecto en 5 minutos:
              </p>
              <a
                href="https://github.com/Martin-Sil21/silverfleet2025/blob/main/docs/GOOGLE_OAUTH_SETUP.md"
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
              >
                📖 Ver guía completa de configuración →
              </a>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Client ID *
              </label>
              <input
                type="text"
                value={formData.clientId || ''}
                onChange={(e) => setFormData({ ...formData, clientId: e.target.value })}
                placeholder="123456789-abcdefg.apps.googleusercontent.com"
                className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white font-mono text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Client Secret *
              </label>
              <input
                type="password"
                value={formData.clientSecret || ''}
                onChange={(e) => setFormData({ ...formData, clientSecret: e.target.value })}
                placeholder="GOCSPX-..."
                className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              />
            </div>

            {/* Botón de Autorización */}
            <div className="p-4 bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 border border-blue-200 dark:border-blue-700 rounded-lg">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <p className="text-sm font-semibold text-blue-900 dark:text-blue-100">
                    Autorización con Google
                  </p>
                  <p className="text-xs text-blue-700 dark:text-blue-300">
                    {formData.refreshToken ? '✅ Ya autorizado' : 'Pendiente de autorización'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={async () => {
                    if (!formData.clientId || !formData.clientSecret) {
                      setTestResult({ success: false, message: 'Ingresa Client ID y Client Secret primero' });
                      return;
                    }
                    setIsTesting(true);
                    setTestResult(null);
                    try {
                      const { initiateGoogleOAuth, exchangeCodeForTokens } = await import('../services/googleOAuthFlow');
                      const code = await initiateGoogleOAuth(formData.clientId);
                      const tokens = await exchangeCodeForTokens(code, formData.clientId, formData.clientSecret);
                      setFormData({
                        ...formData,
                        refreshToken: tokens.refresh_token,
                        accessToken: tokens.access_token,
                      });
                      setTestResult({ success: true, message: '✅ Autorización exitosa! Refresh Token obtenido.' });
                    } catch (error) {
                      setTestResult({
                        success: false,
                        message: `❌ Error: ${error instanceof Error ? error.message : String(error)}`
                      });
                    } finally {
                      setIsTesting(false);
                    }
                  }}
                  disabled={isTesting || !formData.clientId || !formData.clientSecret}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition text-sm font-medium"
                >
                  {isTesting ? 'Autorizando...' : 'Autorizar con Google'}
                </button>
              </div>
              {formData.refreshToken && (
                <div className="text-xs text-green-700 dark:text-green-300 mt-2">
                  ✅ Refresh Token: {formData.refreshToken.substring(0, 20)}...
                </div>
              )}
            </div>
          </>
        );

      case 'gmail-oauth':
        return (
          <>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Access Token (OAuth 2.0)
              </label>
              <input
                type="password"
                value={formData.accessToken || ''}
                onChange={(e) => setFormData({ ...formData, accessToken: e.target.value })}
                placeholder="ya29.a0AfH6SMB..."
                className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              />
            </div>
            <div className="p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 rounded-lg">
              <p className="text-sm text-blue-800 dark:text-blue-200">
                ℹ️ Obtén tu Access Token desde <a href="https://developers.google.com/oauthplayground" target="_blank" rel="noopener noreferrer" className="underline font-semibold">OAuth 2.0 Playground</a> con scopes de Gmail.
              </p>
            </div>
          </>
        );

      case 'postgres':
      case 'mysql':
        return (
          <>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Host
                </label>
                <input
                  type="text"
                  value={formData.host || ''}
                  onChange={(e) => setFormData({ ...formData, host: e.target.value })}
                  placeholder="localhost"
                  className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Port
                </label>
                <input
                  type="number"
                  value={formData.port || (credentialType === 'postgres' ? 5432 : 3306)}
                  onChange={(e) => setFormData({ ...formData, port: parseInt(e.target.value) })}
                  className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Database Name
              </label>
              <input
                type="text"
                value={formData.database || ''}
                onChange={(e) => setFormData({ ...formData, database: e.target.value })}
                className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Username
              </label>
              <input
                type="text"
                value={formData.username || ''}
                onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Password
              </label>
              <input
                type="password"
                value={formData.password || ''}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              />
            </div>
            {credentialType === 'postgres' && (
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="pg-ssl"
                  checked={formData.ssl || false}
                  onChange={(e) => setFormData({ ...formData, ssl: e.target.checked })}
                  className="w-4 h-4 text-primary-600"
                />
                <label htmlFor="pg-ssl" className="text-sm text-gray-700 dark:text-gray-300">
                  Enable SSL
                </label>
              </div>
            )}
          </>
        );

      case 'mongodb':
        return (
          <>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Connection String
              </label>
              <input
                type="text"
                value={formData.connectionString || ''}
                onChange={(e) => setFormData({ ...formData, connectionString: e.target.value })}
                placeholder="mongodb+srv://username:password@cluster.mongodb.net"
                className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white font-mono text-xs"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Database Name
              </label>
              <input
                type="text"
                value={formData.database || ''}
                onChange={(e) => setFormData({ ...formData, database: e.target.value })}
                className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              />
            </div>
          </>
        );

      // API Key based services (generic)
      default:
        return (
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              API Key
            </label>
            <input
              type="password"
              value={formData.apiKey || ''}
              onChange={(e) => setFormData({ ...formData, apiKey: e.target.value })}
              placeholder="Enter your API key"
              className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white font-mono text-xs"
            />
          </div>
        );
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
          <div>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
              Configure {getCredentialTypeLabel(credentialType)}
            </h2>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
              For: <span className="font-semibold">{toolName}</span>
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
          >
            <XCircleIcon className="w-6 h-6" />
          </button>
        </div>

        {/* Mode Selector */}
        <div className="p-6 border-b border-gray-200 dark:border-gray-700">
          <div className="flex gap-4">
            <button
              onClick={() => setMode('select')}
              className={`px-4 py-2 rounded-lg font-medium transition ${
                mode === 'select'
                  ? 'bg-primary-600 text-white'
                  : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
              }`}
              disabled={existingCredentials.length === 0}
            >
              Select Existing ({existingCredentials.length})
            </button>
            <button
              onClick={() => setMode('create')}
              className={`px-4 py-2 rounded-lg font-medium transition ${
                mode === 'create'
                  ? 'bg-primary-600 text-white'
                  : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
              }`}
            >
              Create New
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-6">
          {mode === 'select' ? (
            <div className="space-y-3">
              {existingCredentials.length === 0 ? (
                <p className="text-center text-gray-500 dark:text-gray-400 py-8">
                  No existing credentials. Create a new one.
                </p>
              ) : (
                existingCredentials.map((cred) => (
                  <label
                    key={cred.id}
                    className={`block p-4 border-2 rounded-lg cursor-pointer transition ${
                      selectedCredId === cred.id
                        ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20'
                        : 'border-gray-300 dark:border-gray-600 hover:border-primary-400'
                    }`}
                  >
                    <input
                      type="radio"
                      name="credential"
                      value={cred.id}
                      checked={selectedCredId === cred.id}
                      onChange={() => setSelectedCredId(cred.id)}
                      className="sr-only"
                    />
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-semibold text-gray-900 dark:text-white">
                          {cred.name}
                        </p>
                        <p className="text-sm text-gray-600 dark:text-gray-400">
                          Created: {new Date(cred.createdAt).toLocaleDateString()}
                        </p>
                      </div>
                      {selectedCredId === cred.id && (
                        <CheckCircleIcon className="w-6 h-6 text-primary-600" />
                      )}
                    </div>
                  </label>
                ))
              )}
            </div>
          ) : (
            <div className="space-y-4">
              {/* Selector de tipo si hay múltiples tipos aceptados */}
              {acceptedTypes.length > 1 && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Credential Type *
                  </label>
                  <select
                    value={currentCredentialType}
                    onChange={(e) => {
                      setCurrentCredentialType(e.target.value as CredentialType);
                      setFormData({}); // Resetear formData al cambiar tipo
                      setValidationErrors([]);
                      setTestResult(null);
                    }}
                    className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  >
                    {acceptedTypes.map(type => (
                      <option key={type} value={type}>
                        {getCredentialTypeLabel(type)}
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    Múltiples tipos compatibles detectados. Selecciona el que prefieras.
                  </p>
                </div>
              )}
              
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Credential Name *
                </label>
                <input
                  type="text"
                  value={credName}
                  onChange={(e) => setCredName(e.target.value)}
                  placeholder="e.g., Production DB, Gmail Account"
                  className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                />
              </div>

              {renderFormFields()}

              {validationErrors.length > 0 && (
                <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                  <ul className="text-sm text-red-700 dark:text-red-300 space-y-1">
                    {validationErrors.map((error, idx) => (
                      <li key={idx}>• {error}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Test Result Display - MOVED HERE, before footer */}
        {testResult && (
          <div className={`mx-6 mb-4 p-3 rounded-lg border ${
            testResult.success 
              ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800 text-green-700 dark:text-green-300'
              : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800 text-red-700 dark:text-red-300'
          }`}>
            <div className="flex items-start gap-2">
              {testResult.success ? (
                <CheckCircleIcon className="w-5 h-5 flex-shrink-0 mt-0.5" />
              ) : (
                <XCircleIcon className="w-5 h-5 flex-shrink-0 mt-0.5" />
              )}
              <div className="flex-1">
                <p className="text-sm font-medium">
                  {testResult.success ? 'Connection Test Passed' : 'Connection Test Failed'}
                </p>
                <p className="text-sm mt-1">{testResult.message}</p>
              </div>
            </div>
          </div>
        )}
        
        {/* Tables Selector - Only show for successful database tests */}
        {testResult?.success && availableTables.length > 0 && (
          <div className="mx-6 mb-4 p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg max-h-96 overflow-y-auto">
            <h4 className="text-sm font-semibold text-blue-900 dark:text-blue-100 mb-3">
              📊 Select Tables to Monitor ({selectedTables.size} selected)
            </h4>
            
            {/* Search Bar */}
            <input
              type="text"
              placeholder="Search tables..."
              value={tableSearchQuery}
              onChange={(e) => setTableSearchQuery(e.target.value)}
              className="w-full px-3 py-2 mb-3 text-sm border border-blue-300 dark:border-blue-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
            />
            
            {/* Tables List with Checkboxes */}
            <div className="space-y-2">
              {availableTables
                .filter(table => table.name.toLowerCase().includes(tableSearchQuery.toLowerCase()))
                .map((table) => {
                  const isUsedInWorkflow = workflowTables.some(wt => wt.toLowerCase() === table.name.toLowerCase());
                  return (
                <div 
                  key={table.name}
                  className={`flex items-start gap-3 p-3 rounded-lg border-2 ${
                    isUsedInWorkflow
                      ? 'bg-green-50 dark:bg-green-900/20 border-green-400 dark:border-green-600'
                      : 'bg-white dark:bg-gray-800 border-blue-200 dark:border-blue-700'
                  }`}
                >
                  <input
                    type="checkbox"
                    id={`table-${table.name}`}
                    checked={selectedTables.has(table.name)}
                    onChange={(e) => {
                      const newSelected = new Set(selectedTables);
                      if (e.target.checked) {
                        newSelected.add(table.name);
                      } else {
                        newSelected.delete(table.name);
                      }
                      setSelectedTables(newSelected);
                    }}
                    className="mt-1 w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                  />
                  <label htmlFor={`table-${table.name}`} className="flex-1 cursor-pointer">
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <span className={`font-mono text-sm font-semibold ${
                          isUsedInWorkflow 
                            ? 'text-green-900 dark:text-green-100' 
                            : 'text-blue-900 dark:text-blue-100'
                        }`}>
                          {table.name}
                        </span>
                        {isUsedInWorkflow && (
                          <span className="px-2 py-0.5 bg-green-500 text-white text-xs rounded-full font-bold">
                            🎯 Used in workflow
                          </span>
                        )}
                      </div>
                      <span className={`text-xs ${
                        isUsedInWorkflow 
                          ? 'text-green-700 dark:text-green-300' 
                          : 'text-blue-700 dark:text-blue-300'
                      }`}>
                        {table.rowCount} rows
                      </span>
                    </div>
                    {table.sampleData && table.sampleData.length > 0 && (
                      <details className={`text-xs ${
                        isUsedInWorkflow 
                          ? 'text-green-800 dark:text-green-200' 
                          : 'text-blue-800 dark:text-blue-200'
                      }`}>
                        <summary className="cursor-pointer hover:underline">
                          View sample data ({table.sampleData.length} records)
                        </summary>
                        <pre className={`mt-2 p-2 rounded text-xs overflow-x-auto ${
                          isUsedInWorkflow 
                            ? 'bg-green-100 dark:bg-green-900/40' 
                            : 'bg-blue-100 dark:bg-blue-900/40'
                        }`}>
                          {JSON.stringify(table.sampleData, null, 2)}
                        </pre>
                      </details>
                    )}
                  </label>
                </div>
              );
              })}
            </div>
            
            <button
              onClick={() => {
                if (selectedTables.size === availableTables.length) {
                  setSelectedTables(new Set());
                } else {
                  setSelectedTables(new Set(availableTables.map(t => t.name)));
                }
              }}
              className="mt-3 text-xs text-blue-600 dark:text-blue-400 hover:underline"
            >
              {selectedTables.size === availableTables.length ? 'Deselect All' : 'Select All'}
            </button>
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 p-6 border-t border-gray-200 dark:border-gray-700">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition"
          >
            Cancel
          </button>
          {mode === 'select' ? (
            <>
              <button
                onClick={handleTestExistingConnection}
                disabled={isTesting || !selectedCredId}
                className="px-4 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
              >
                {isTesting ? '🔄 Testing...' : '🧪 Test Connection'}
              </button>
              <button
                onClick={handleEditExisting}
                disabled={!selectedCredId}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
              >
                ✏️ Edit
              </button>
              <button
                onClick={handleSelectExisting}
                disabled={!selectedCredId}
                className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
              >
                Use Selected
              </button>
            </>
          ) : (
            <>
              <button
                onClick={handleTestConnection}
                disabled={isTesting || !credName.trim()}
                className="px-4 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
              >
                {isTesting ? '🔄 Testing...' : '🧪 Test Connection'}
              </button>
              <button
                onClick={handleCreateNew}
                disabled={isSaving || !credName.trim()}
                className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
              >
                {isSaving ? 'Saving...' : (selectedCredId && existingCredentials.some(c => c.id === selectedCredId) ? 'Update & Use' : 'Create & Use')}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default CredentialModal;
