import React, { useState, useEffect } from 'react';
import { getAllCredentials, deleteCredential, saveCredential, type Credential } from '../services/credentialsManager';
import { testCredential } from '../services/credentialTester';
import { useTranslation } from '../hooks/useTranslation';
import Card from './Card';
import CredentialEditor from './CredentialEditor';

// Inline icons para evitar problemas de importación
const PencilIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" {...props}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
  </svg>
);

const TrashIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" {...props}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
  </svg>
);

const PlusIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" {...props}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
  </svg>
);

interface CredentialsPanelProps {
  onClose?: () => void;
}

const CredentialsPanel: React.FC<CredentialsPanelProps> = ({ onClose }) => {
  const { t } = useTranslation();
  const [credentials, setCredentials] = useState<Credential[]>([]);
  const [selectedCred, setSelectedCred] = useState<Credential | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [testingCredId, setTestingCredId] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, { success: boolean; message: string }>>({});

  useEffect(() => {
    loadCredentials();
  }, []);

  const loadCredentials = () => {
    const allCreds = getAllCredentials();
    // 🧹 Cleanup: Eliminar credenciales inválidas o corruptas
    const validCreds = allCreds.filter(cred => {
      // Verificar que tenga las propiedades esenciales
      return cred.id && cred.type && cred.name && cred.createdAt;
    });
    
    // Si se eliminaron credenciales inválidas, guardar el array limpio
    if (validCreds.length !== allCreds.length) {
      console.log(`🧹 Limpieza automática: ${allCreds.length - validCreds.length} credenciales inválidas eliminadas`);
      localStorage.setItem('silverfleet_credentials', JSON.stringify(validCreds));
    }
    
    setCredentials(validCreds);
  };

  const handleClearAll = () => {
    if (confirm('⚠️ ¿BORRAR TODAS LAS CREDENCIALES? Esta acción no se puede deshacer.')) {
      localStorage.removeItem('silverfleet_credentials');
      setCredentials([]);
      setTestResults({});
      setSelectedCred(null);
      alert('✅ Todas las credenciales han sido eliminadas');
    }
  };

  const handleDelete = (credId: string) => {
    if (confirm('¿Estás seguro de que deseas eliminar esta credencial?')) {
      deleteCredential(credId);
      loadCredentials();
      setTestResults(prev => {
        const newResults = { ...prev };
        delete newResults[credId];
        return newResults;
      });
    }
  };

  const handleTest = async (cred: Credential) => {
    setTestingCredId(cred.id);
    try {
      const result = await testCredential(cred, []);
      setTestResults(prev => ({ ...prev, [cred.id]: result }));
    } catch (error) {
      console.error('Error testing credential:', error);
      setTestResults(prev => ({ 
        ...prev, 
        [cred.id]: { 
          success: false, 
          message: `Error: ${error instanceof Error ? error.message : String(error)}` 
        }
      }));
    } finally {
      setTestingCredId(null);
    }
  };

  const handleEdit = (cred: Credential) => {
    setSelectedCred(cred);
    setIsModalOpen(true);
  };

  const handleCreate = () => {
    setSelectedCred(null); // Asegurar que NO hay credencial seleccionada
    setIsModalOpen(true);
  };

  const handleModalClose = () => {
    setIsModalOpen(false);
    setSelectedCred(null);
    loadCredentials();
  };

  const getCredentialIcon = (type: string) => {
    const icons: Record<string, string> = {
      'gmail-oauth': '📧',
      'google-oauth': '🔑',
      'google-service-account': '✨',
      'google-calendar-oauth': '📅',
      'supabase': '🗄️',
      'airtable': '📊',
      'postgres': '🐘',
      'mysql': '🐬',
      'mongodb': '🍃',
      'smtp': '✉️',
      'sendgrid-api': '📨',
      'hubspot-api': '🎯',
      'salesforce-oauth': '☁️',
      'telegram-bot': '✈️',
      'whatsapp-api': '💬',
      'stripe-api': '💳',
      'aws-s3': '☁️',
    };
    return icons[type] || '🔐';
  };

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleDateString('es-ES', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getCredentialTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      'gmail-oauth': 'Gmail OAuth',
      'google-oauth': 'Google OAuth',
      'google-service-account': 'Google Service Account',
      'google-calendar-oauth': 'Google Calendar',
      'supabase': 'Supabase',
      'airtable': 'Airtable',
      'postgres': 'PostgreSQL',
      'mysql': 'MySQL',
      'mongodb': 'MongoDB',
      'smtp': 'SMTP',
      'sendgrid-api': 'SendGrid',
      'hubspot-api': 'HubSpot',
      'salesforce-oauth': 'Salesforce',
      'telegram-bot': 'Telegram Bot',
      'whatsapp-api': 'WhatsApp API',
      'stripe-api': 'Stripe',
      'aws-s3': 'AWS S3',
    };
    return labels[type] || type;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 p-6">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
              🔐 Gestión de Credenciales
            </h1>
            <p className="text-gray-600 dark:text-gray-400">
              Administra las credenciales guardadas para bases de datos, APIs y servicios externos
            </p>
          </div>
          <div className="flex gap-3">
            <button
              onClick={handleCreate}
              className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition"
            >
              <PlusIcon className="w-5 h-5" />
              Nueva Credencial
            </button>
            {credentials.length > 0 && (
              <button
                onClick={handleClearAll}
                className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition"
                title="Eliminar TODAS las credenciales"
              >
                <TrashIcon className="w-5 h-5" />
                Limpiar Todo
              </button>
            )}
            {onClose && (
              <button
                onClick={onClose}
                className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg transition"
              >
                Cerrar
              </button>
            )}
          </div>
        </div>

        {/* Credentials Grid */}
        {credentials.length === 0 ? (
          <Card>
            <div className="text-center py-12">
              <div className="text-6xl mb-4">🔐</div>
              <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
                No hay credenciales guardadas
              </h3>
              <p className="text-gray-600 dark:text-gray-400 mb-6">
                Crea tu primera credencial para conectar con bases de datos y servicios externos
              </p>
              <button
                onClick={handleCreate}
                className="inline-flex items-center gap-2 px-6 py-3 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition"
              >
                <PlusIcon className="w-5 h-5" />
                Crear Primera Credencial
              </button>
            </div>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {credentials.map(cred => {
              const testResult = testResults[cred.id];
              const isTesting = testingCredId === cred.id;

              return (
                <Card key={cred.id}>
                  <div className="p-5">
                    {/* Header */}
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex items-center gap-3">
                        <span className="text-3xl">{getCredentialIcon(cred.type)}</span>
                        <div>
                          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                            {cred.name}
                          </h3>
                          <p className="text-sm text-gray-500 dark:text-gray-400">
                            {getCredentialTypeLabel(cred.type)}
                          </p>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleEdit(cred)}
                          className="p-2 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition"
                          title="Editar"
                        >
                          <PencilIcon className="w-5 h-5" />
                        </button>
                        <button
                          onClick={() => handleDelete(cred.id)}
                          className="p-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition"
                          title="Eliminar"
                        >
                          <TrashIcon className="w-5 h-5" />
                        </button>
                      </div>
                    </div>

                    {/* Info */}
                    <div className="space-y-2 mb-4">
                      <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                        <span className="font-medium">ID:</span>
                        <code className="bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded text-xs">
                          {cred.id}
                        </code>
                      </div>
                      <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                        <span className="font-medium">Creada:</span>
                        <span>{formatDate(cred.createdAt)}</span>
                      </div>
                      {cred.updatedAt !== cred.createdAt && (
                        <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                          <span className="font-medium">Actualizada:</span>
                          <span>{formatDate(cred.updatedAt)}</span>
                        </div>
                      )}
                    </div>

                    {/* Test Result */}
                    {testResult && (
                      <div className={`p-3 rounded-lg mb-3 ${
                        testResult.success 
                          ? 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-700'
                          : 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700'
                      }`}>
                        <p className={`text-sm ${
                          testResult.success 
                            ? 'text-green-800 dark:text-green-200'
                            : 'text-red-800 dark:text-red-200'
                        }`}>
                          {testResult.message}
                        </p>
                      </div>
                    )}

                    {/* Actions */}
                    <button
                      onClick={() => handleTest(cred)}
                      disabled={isTesting}
                      className="w-full px-4 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
                    >
                      {isTesting ? '🔄 Probando...' : '🧪 Probar Conexión'}
                    </button>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Editor Modal */}
      <CredentialEditor
        isOpen={isModalOpen}
        onClose={handleModalClose}
        onSave={handleModalClose}
        existingCredential={selectedCred || undefined}
      />
    </div>
  );
};

export default CredentialsPanel;
