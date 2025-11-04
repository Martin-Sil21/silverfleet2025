import React, { useState, useEffect } from 'react';
import { 
  Credential, 
  CredentialType, 
  generateCredentialId, 
  saveCredential, 
  validateCredential,
  type GmailOAuthCredential,
  type GoogleCalendarOAuthCredential,
  type GoogleOAuthCredential,
  type GoogleServiceAccountCredential,
  type SupabaseCredential
} from '../services/credentialsManager';
import { testCredential } from '../services/credentialTester';
import { initiateGoogleOAuth, exchangeCodeForTokens, validateState } from '../services/googleOAuthFlow';
import { parseServiceAccountJSON, validateServiceAccountJSON } from '../services/googleServiceAccountAuth';

interface CredentialEditorProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: () => void;
  existingCredential?: Credential;
}

const CredentialEditor: React.FC<CredentialEditorProps> = ({
  isOpen,
  onClose,
  onSave,
  existingCredential
}) => {
  const [credentialType, setCredentialType] = useState<CredentialType>(existingCredential?.type || 'supabase');
  const [credName, setCredName] = useState(existingCredential?.name || '');
  const [formData, setFormData] = useState<Record<string, any>>(existingCredential?.data || {});
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [isAuthorizing, setIsAuthorizing] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [errors, setErrors] = useState<string[]>([]);

  // 🔄 Reset completo cuando cambia isOpen o existingCredential
  useEffect(() => {
    if (isOpen) {
      if (existingCredential) {
        // Modo edición: cargar datos existentes
        setCredentialType(existingCredential.type);
        setCredName(existingCredential.name);
        setFormData(existingCredential.data);
      } else {
        // Modo creación: resetear TODO
        setCredentialType('supabase');
        setCredName('');
        setFormData({});
        setTestResult(null);
        setErrors([]);
      }
    }
  }, [isOpen, existingCredential]);

  const handleTest = async () => {
    if (!credName.trim()) {
      setTestResult({ success: false, message: 'Ingresa un nombre para la credencial' });
      return;
    }

    setIsTesting(true);
    setTestResult(null);
    setErrors([]);

    const tempCred = {
      id: 'test',
      name: credName,
      type: credentialType,
      data: formData,
      createdAt: Date.now(),
      updatedAt: Date.now()
    } as Credential;

    const validation = validateCredential(tempCred);
    if (!validation.isValid) {
      setErrors(validation.errors);
      setIsTesting(false);
      return;
    }

    try {
      const result = await testCredential(tempCred, []);
      setTestResult(result);
    } catch (error) {
      setTestResult({
        success: false,
        message: `Error: ${error instanceof Error ? error.message : String(error)}`
      });
    } finally {
      setIsTesting(false);
    }
  };

  const handleAuthorizeGoogle = async () => {
    if (!formData.clientId) {
      setTestResult({ success: false, message: 'Ingresa el Client ID primero' });
      return;
    }

    if (!formData.clientSecret) {
      setTestResult({ success: false, message: 'Ingresa el Client Secret primero' });
      return;
    }

    setIsAuthorizing(true);
    setTestResult(null);
    setErrors([]);

    try {
      // Iniciar flujo OAuth
      const code = await initiateGoogleOAuth(formData.clientId);

      // Intercambiar código por tokens
      const tokens = await exchangeCodeForTokens(
        code,
        formData.clientId,
        formData.clientSecret
      );

      // Guardar tokens en formData
      setFormData({
        ...formData,
        refreshToken: tokens.refresh_token,
        accessToken: tokens.access_token,
      });

      setTestResult({
        success: true,
        message: '✅ Autorización exitosa! Tokens obtenidos correctamente.'
      });
    } catch (error) {
      setTestResult({
        success: false,
        message: `❌ Error en autorización: ${error instanceof Error ? error.message : String(error)}`
      });
    } finally {
      setIsAuthorizing(false);
    }
  };

  const handleServiceAccountJSONPaste = (jsonString: string) => {
    try {
      const parsed = parseServiceAccountJSON(jsonString);
      if (parsed) {
        setFormData(parsed);
        setTestResult({
          success: true,
          message: '✅ Service Account JSON válido detectado'
        });
        setErrors([]);
      } else {
        setTestResult({
          success: false,
          message: '❌ JSON inválido. Verifica que sea un archivo de Service Account de Google'
        });
      }
    } catch (error) {
      setTestResult({
        success: false,
        message: `❌ Error parseando JSON: ${error instanceof Error ? error.message : String(error)}`
      });
    }
  };

  const handleSave = () => {
    setIsSaving(true);
    setErrors([]);

    const credential = {
      id: existingCredential?.id || generateCredentialId(),
      name: credName,
      type: credentialType,
      data: formData,
      createdAt: existingCredential?.createdAt || Date.now(),
      updatedAt: Date.now()
    } as Credential;

    const validation = validateCredential(credential);
    if (!validation.isValid) {
      setErrors(validation.errors);
      setIsSaving(false);
      return;
    }

    try {
      saveCredential(credential);
      onSave();
      onClose();
    } catch (error) {
      setErrors([`Error al guardar: ${error instanceof Error ? error.message : String(error)}`]);
    } finally {
      setIsSaving(false);
    }
  };

  if (!isOpen) return null;

  const renderFormFields = () => {
    switch (credentialType) {
      case 'supabase':
        return (
          <>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                URL del Proyecto
              </label>
              <input
                type="text"
                value={formData.url || ''}
                onChange={(e) => setFormData({ ...formData, url: e.target.value })}
                placeholder="https://xxxxx.supabase.co"
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
                className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Tipo de Key
              </label>
              <select
                value={formData.keyType || 'service_role'}
                onChange={(e) => setFormData({ ...formData, keyType: e.target.value as 'service_role' | 'anon' })}
                className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              >
                <option value="service_role">Service Role (recomendado para auditorías)</option>
                <option value="anon">Anon (solo lectura pública)</option>
              </select>
            </div>
          </>
        );

      case 'google-oauth':
      case 'gmail-oauth':
      case 'google-calendar-oauth':
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
                  onClick={handleAuthorizeGoogle}
                  disabled={isAuthorizing || !formData.clientId || !formData.clientSecret}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition flex items-center gap-2"
                >
                  {isAuthorizing ? (
                    <>
                      <span className="animate-spin">🔄</span>
                      Autorizando...
                    </>
                  ) : formData.refreshToken ? (
                    <>✅ Re-autorizar</>
                  ) : (
                    <>🔑 Autorizar con Google</>
                  )}
                </button>
              </div>
              <p className="text-xs text-blue-600 dark:text-blue-400">
                Se abrirá una ventana para que autorices el acceso a Gmail, Calendar, Drive y Sheets
              </p>
            </div>

            {/* Tokens (solo lectura - se llenan automáticamente) */}
            {formData.refreshToken && (
              <div className="space-y-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Refresh Token (generado automáticamente)
                  </label>
                  <input
                    type="text"
                    value={formData.refreshToken || ''}
                    readOnly
                    className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-800 text-gray-500 dark:text-gray-400 font-mono text-xs"
                  />
                </div>
                {formData.accessToken && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Access Token (se renueva automáticamente)
                    </label>
                    <input
                      type="text"
                      value={formData.accessToken || ''}
                      readOnly
                      className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-800 text-gray-500 dark:text-gray-400 font-mono text-xs"
                    />
                  </div>
                )}
              </div>
            )}

            <div className="p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 rounded-lg">
              <p className="text-sm text-blue-800 dark:text-blue-200 mb-2">
                <strong>📋 Cómo obtener Client ID y Client Secret:</strong>
              </p>
              <ol className="text-xs text-blue-700 dark:text-blue-300 space-y-1 list-decimal list-inside">
                <li>Ve a <a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noopener noreferrer" className="underline font-semibold">Google Cloud Console</a></li>
                <li>Crea un nuevo proyecto o selecciona uno existente</li>
                <li>Ve a "Credenciales" → "Crear credenciales" → "ID de cliente de OAuth 2.0"</li>
                <li>Tipo de aplicación: "Aplicación web"</li>
                <li>URI de redirección: <code className="bg-blue-100 dark:bg-blue-900 px-1 py-0.5 rounded">{window.location.origin}/oauth/callback.html</code></li>
                <li>Copia el Client ID y Client Secret que se generan</li>
              </ol>
            </div>
          </>
        );

      case 'google-service-account':
        return (
          <>
            <div className="p-4 bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 border border-green-200 dark:border-green-700 rounded-lg mb-4">
              <p className="text-sm font-semibold text-green-900 dark:text-green-100 mb-2">
                ✨ Service Account - Más simple que OAuth
              </p>
              <p className="text-xs text-green-700 dark:text-green-300">
                No requiere configurar redirect URI. Ideal para bots y auditorías automatizadas.
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Service Account JSON *
              </label>
              <textarea
                value={formData.private_key ? JSON.stringify(formData, null, 2) : ''}
                onChange={(e) => handleServiceAccountJSONPaste(e.target.value)}
                placeholder={`{
  "type": "service_account",
  "project_id": "tu-proyecto",
  "private_key_id": "...",
  "private_key": "-----BEGIN PRIVATE KEY-----\\n...\\n-----END PRIVATE KEY-----\\n",
  "client_email": "tu-service-account@tu-proyecto.iam.gserviceaccount.com",
  "client_id": "...",
  "auth_uri": "https://accounts.google.com/o/oauth2/auth",
  "token_uri": "https://oauth2.googleapis.com/token",
  "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
  "client_x509_cert_url": "..."
}`}
                rows={12}
                className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white font-mono text-xs"
              />
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                Pega aquí todo el contenido del archivo JSON descargado de Google Cloud Console
              </p>
            </div>

            {formData.client_email && (
              <div className="p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-700 rounded-lg">
                <p className="text-sm font-semibold text-green-800 dark:text-green-200">
                  ✅ Service Account Detectado
                </p>
                <div className="text-xs text-green-700 dark:text-green-300 mt-2 space-y-1">
                  <p><strong>Email:</strong> {formData.client_email}</p>
                  <p><strong>Proyecto:</strong> {formData.project_id}</p>
                </div>
              </div>
            )}

            <div className="p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 rounded-lg">
              <p className="text-sm text-blue-800 dark:text-blue-200 mb-2">
                <strong>📋 Cómo crear un Service Account:</strong>
              </p>
              <ol className="text-xs text-blue-700 dark:text-blue-300 space-y-1 list-decimal list-inside">
                <li>Ve a <a href="https://console.cloud.google.com/iam-admin/serviceaccounts" target="_blank" rel="noopener noreferrer" className="underline font-semibold">Google Cloud Console - Service Accounts</a></li>
                <li>Crea un nuevo proyecto o selecciona uno existente</li>
                <li>Click en "Create Service Account"</li>
                <li>Asigna un nombre (ej: "silverfleet-auditor")</li>
                <li>En permisos, NO necesitas asignar roles (se usará con Domain-Wide Delegation o scopes específicos)</li>
                <li>Click en el Service Account creado → "Keys" → "Add Key" → "Create New Key" → JSON</li>
                <li>Se descargará un archivo .json - copia TODO su contenido y pégalo arriba</li>
                <li><strong>IMPORTANTE:</strong> Habilita Gmail API, Calendar API en tu proyecto de Google Cloud</li>
              </ol>
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
                  Puerto
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
                Base de Datos
              </label>
              <input
                type="text"
                value={formData.database || ''}
                onChange={(e) => setFormData({ ...formData, database: e.target.value })}
                placeholder="nombre_bd"
                className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Usuario
              </label>
              <input
                type="text"
                value={formData.user || ''}
                onChange={(e) => setFormData({ ...formData, user: e.target.value })}
                placeholder="usuario"
                className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Contraseña
              </label>
              <input
                type="password"
                value={formData.password || ''}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                placeholder="••••••••"
                className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              />
            </div>
          </>
        );

      case 'airtable':
        return (
          <>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                API Key
              </label>
              <input
                type="password"
                value={formData.apiKey || ''}
                onChange={(e) => setFormData({ ...formData, apiKey: e.target.value })}
                placeholder="keyXXXXXXXXXXXXXX"
                className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Base ID
              </label>
              <input
                type="text"
                value={formData.baseId || ''}
                onChange={(e) => setFormData({ ...formData, baseId: e.target.value })}
                placeholder="appXXXXXXXXXXXXXX"
                className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              />
            </div>
          </>
        );

      case 'mongodb':
        return (
          <>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Connection String
              </label>
              <textarea
                value={formData.connectionString || ''}
                onChange={(e) => setFormData({ ...formData, connectionString: e.target.value })}
                placeholder="mongodb://user:password@host:27017/database"
                rows={3}
                className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white font-mono text-sm"
              />
            </div>
          </>
        );

      default:
        return (
          <div className="p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-700 rounded-lg">
            <p className="text-sm text-yellow-800 dark:text-yellow-200">
              ⚠️ Tipo de credencial "{credentialType}" aún no tiene formulario específico. Usa AgentConfig para configurar este tipo.
            </p>
          </div>
        );
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="p-6 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
            {existingCredential ? '✏️ Editar Credencial' : '➕ Nueva Credencial'}
          </h2>
        </div>

        {/* Body */}
        <div className="p-6 space-y-4">
          {/* Nombre */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Nombre de la Credencial *
            </label>
            <input
              type="text"
              value={credName}
              onChange={(e) => setCredName(e.target.value)}
              placeholder="Ej: Supabase Producción"
              className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            />
          </div>

          {/* Tipo (solo si es nueva) */}
          {!existingCredential && (
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Tipo de Credencial *
              </label>
              <select
                value={credentialType}
                onChange={(e) => {
                  setCredentialType(e.target.value as CredentialType);
                  setFormData({});
                }}
                className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              >
                <option value="supabase">🗄️ Supabase</option>
                <option value="google-service-account">✨ Google Service Account (MÁS SIMPLE - sin OAuth)</option>
                <option value="google-oauth">🔑 Google OAuth (Gmail, Calendar, Drive, Sheets)</option>
                <option value="gmail-oauth">📧 Gmail (legacy - usar Google Service Account)</option>
                <option value="google-calendar-oauth">📅 Google Calendar (legacy - usar Google Service Account)</option>
                <option value="airtable">📊 Airtable</option>
                <option value="postgres">🐘 PostgreSQL</option>
                <option value="mysql">🐬 MySQL</option>
                <option value="mongodb">🍃 MongoDB</option>
              </select>
            </div>
          )}

          {/* Campos específicos del tipo */}
          {renderFormFields()}

          {/* Errores de validación */}
          {errors.length > 0 && (
            <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded-lg">
              <ul className="list-disc list-inside text-sm text-red-800 dark:text-red-200">
                {errors.map((error, i) => (
                  <li key={i}>{error}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Resultado del test */}
          {testResult && (
            <div
              className={`p-3 rounded-lg border ${
                testResult.success
                  ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-700'
                  : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-700'
              }`}
            >
              <p
                className={`text-sm ${
                  testResult.success
                    ? 'text-green-800 dark:text-green-200'
                    : 'text-red-800 dark:text-red-200'
                }`}
              >
                {testResult.message}
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 p-6 border-t border-gray-200 dark:border-gray-700">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition"
          >
            Cancelar
          </button>
          <button
            onClick={handleTest}
            disabled={isTesting || !credName.trim()}
            className="px-4 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
          >
            {isTesting ? '🔄 Probando...' : '🧪 Probar Conexión'}
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving || !credName.trim()}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
          >
            {isSaving ? 'Guardando...' : existingCredential ? '💾 Actualizar' : '💾 Guardar'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default CredentialEditor;
