import React, { useState, useEffect, useMemo } from 'react';
import { useTranslation } from '../hooks/useTranslation';
import Card from './Card';
import { CheckCircleIcon } from './icons/CheckCircleIcon';
import { XCircleIcon } from './icons/XCircleIcon';
import { PlusCircleIcon } from './icons/PlusCircleIcon';
import { TrashIcon } from './icons/TrashIcon';
import type { WorkflowDatabaseInfo } from '../types';
import { 
  getAllCredentials, 
  saveCredential, 
  deleteCredential,
  generateCredentialId,
  testConnection,
  type Credential 
} from '../services/credentialsManager';

interface ConnectionsManagerProps {
  workflowInfo?: WorkflowDatabaseInfo;
  onConnectionsReady: (connections: {
    databases: Record<string, string>;
    tools: Record<string, string>;
  }) => void;
}

type ConnectionType = 'database' | 'email' | 'calendar' | 'messaging' | 'crm';

interface ConnectionConfig {
  type: ConnectionType;
  provider: string;
  icon: string;
  color: string;
  fields: {
    name: string;
    label: string;
    type: 'text' | 'password' | 'select';
    required: boolean;
    options?: string[];
    placeholder?: string;
  }[];
}

const CONNECTION_CONFIGS: Record<string, ConnectionConfig> = {
  // DATABASES
  supabase: {
    type: 'database',
    provider: 'Supabase',
    icon: '🗄️',
    color: 'bg-green-500',
    fields: [
      { name: 'url', label: 'Project URL', type: 'text', required: true, placeholder: 'https://xxx.supabase.co' },
      { name: 'serviceRoleKey', label: 'Service Role Key', type: 'password', required: true, placeholder: 'eyJhbG...' }
    ]
  },
  postgres: {
    type: 'database',
    provider: 'PostgreSQL',
    icon: '🐘',
    color: 'bg-blue-600',
    fields: [
      { name: 'host', label: 'Host', type: 'text', required: true, placeholder: 'localhost' },
      { name: 'port', label: 'Port', type: 'text', required: false, placeholder: '5432' },
      { name: 'database', label: 'Database', type: 'text', required: true },
      { name: 'username', label: 'Username', type: 'text', required: true },
      { name: 'password', label: 'Password', type: 'password', required: true }
    ]
  },
  mysql: {
    type: 'database',
    provider: 'MySQL',
    icon: '🐬',
    color: 'bg-orange-500',
    fields: [
      { name: 'host', label: 'Host', type: 'text', required: true, placeholder: 'localhost' },
      { name: 'port', label: 'Port', type: 'text', required: false, placeholder: '3306' },
      { name: 'database', label: 'Database', type: 'text', required: true },
      { name: 'username', label: 'Username', type: 'text', required: true },
      { name: 'password', label: 'Password', type: 'password', required: true }
    ]
  },
  mongodb: {
    type: 'database',
    provider: 'MongoDB',
    icon: '🍃',
    color: 'bg-green-600',
    fields: [
      { name: 'connectionString', label: 'Connection String', type: 'password', required: true, placeholder: 'mongodb+srv://...' }
    ]
  },
  airtable: {
    type: 'database',
    provider: 'Airtable',
    icon: '📋',
    color: 'bg-yellow-500',
    fields: [
      { name: 'apiKey', label: 'API Key', type: 'password', required: true },
      { name: 'baseId', label: 'Base ID', type: 'text', required: true, placeholder: 'appXXXXXXXXXXXXXX' }
    ]
  },
  
  // EMAIL
  gmail: {
    type: 'email',
    provider: 'Gmail',
    icon: '📧',
    color: 'bg-red-500',
    fields: [
      { name: 'oauthToken', label: 'OAuth Token', type: 'password', required: true },
      { name: 'refreshToken', label: 'Refresh Token', type: 'password', required: false }
    ]
  },
  outlook: {
    type: 'email',
    provider: 'Outlook',
    icon: '📬',
    color: 'bg-blue-500',
    fields: [
      { name: 'oauthToken', label: 'OAuth Token', type: 'password', required: true }
    ]
  },
  sendgrid: {
    type: 'email',
    provider: 'SendGrid',
    icon: '✉️',
    color: 'bg-indigo-500',
    fields: [
      { name: 'apiKey', label: 'API Key', type: 'password', required: true, placeholder: 'SG.XXXXXXX' }
    ]
  },
  
  // CALENDAR
  googleCalendar: {
    type: 'calendar',
    provider: 'Google Calendar',
    icon: '📅',
    color: 'bg-blue-400',
    fields: [
      { name: 'oauthToken', label: 'OAuth Token', type: 'password', required: true }
    ]
  },
  outlookCalendar: {
    type: 'calendar',
    provider: 'Outlook Calendar',
    icon: '📆',
    color: 'bg-blue-600',
    fields: [
      { name: 'oauthToken', label: 'OAuth Token', type: 'password', required: true }
    ]
  },
  
  // MESSAGING
  twilio: {
    type: 'messaging',
    provider: 'Twilio',
    icon: '💬',
    color: 'bg-red-600',
    fields: [
      { name: 'accountSid', label: 'Account SID', type: 'text', required: true },
      { name: 'authToken', label: 'Auth Token', type: 'password', required: true },
      { name: 'phoneNumber', label: 'Phone Number', type: 'text', required: true, placeholder: '+1234567890' }
    ]
  },
  whatsapp: {
    type: 'messaging',
    provider: 'WhatsApp Business',
    icon: '💚',
    color: 'bg-green-500',
    fields: [
      { name: 'apiKey', label: 'API Key', type: 'password', required: true },
      { name: 'phoneNumberId', label: 'Phone Number ID', type: 'text', required: true }
    ]
  },
  slack: {
    type: 'messaging',
    provider: 'Slack',
    icon: '💼',
    color: 'bg-purple-500',
    fields: [
      { name: 'botToken', label: 'Bot Token', type: 'password', required: true, placeholder: 'xoxb-...' },
      { name: 'appToken', label: 'App Token', type: 'password', required: false }
    ]
  }
};

const ConnectionsManager: React.FC<ConnectionsManagerProps> = ({ workflowInfo, onConnectionsReady }) => {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<ConnectionType>('database');
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState<string>('');
  const [formData, setFormData] = useState<Record<string, string>>({});
  const [credentials, setCredentials] = useState<Credential[]>([]);
  const [testingConnection, setTestingConnection] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, { success: boolean; message: string }>>({});

  useEffect(() => {
    loadCredentials();
  }, []);

  const loadCredentials = () => {
    setCredentials(getAllCredentials());
  };

  // Detectar qué servicios se necesitan según workflowInfo
  const requiredServices = useMemo(() => {
    if (!workflowInfo) {
      console.log('⚠️ No hay workflowInfo disponible');
      return { databases: [], emails: [], calendars: [], subflows: [], messaging: [] };
    }
    
    const databases: string[] = [];
    const emails: string[] = [];
    const calendars: string[] = [];
    const messaging: string[] = [];
    const subflows = workflowInfo.subflows || [];
    
    try {
      // Detectar bases de datos por tipo de tabla (heurística simple)
      if (workflowInfo.tables && workflowInfo.tables.length > 0) {
        // Por ahora asumimos Supabase si hay tablas
        databases.push('supabase');
      }
      
      // Detectar servicios de email
      if (workflowInfo.tools?.email?.detected) {
        const provider = workflowInfo.tools.email.provider || 'gmail';
        emails.push(provider);
      }
      
      // Detectar servicios de calendar
      if (workflowInfo.tools?.calendar?.detected) {
        const provider = workflowInfo.tools.calendar.provider || 'google';
        calendars.push(provider);
      }
      
      // Detectar servicios de mensajería
      if (workflowInfo.tools?.sms?.detected) messaging.push('twilio');
      if (workflowInfo.tools?.whatsapp?.detected) messaging.push('whatsapp');
      if (workflowInfo.tools?.slack?.detected) messaging.push('slack');
      
      console.log('📊 Servicios requeridos detectados:', { databases, emails, calendars, messaging, subflows });
    } catch (error) {
      console.error('❌ Error detectando servicios:', error);
    }
    
    return { databases, emails, calendars, messaging, subflows };
  }, [workflowInfo]);

  const hasAnyRequirements = requiredServices.databases.length > 0 || 
                            requiredServices.emails.length > 0 || 
                            requiredServices.calendars.length > 0 ||
                            requiredServices.messaging.length > 0 ||
                            requiredServices.subflows.length > 0;

  const getProvidersByType = (type: ConnectionType) => {
    return Object.entries(CONNECTION_CONFIGS).filter(([_, config]) => config.type === type);
  };

  const handleAddConnection = async () => {
    if (!selectedProvider) return;

    const config = CONNECTION_CONFIGS[selectedProvider];
    const missingFields = config.fields
      .filter(f => f.required && !formData[f.name])
      .map(f => f.label);

    if (missingFields.length > 0) {
      alert(`Missing required fields: ${missingFields.join(', ')}`);
      return;
    }

    // Crear credencial según el tipo
    let credential: any = {
      id: generateCredentialId(),
      name: `${config.provider} Connection`,
      type: config.type === 'database' ? selectedProvider : config.type,
      createdAt: Date.now(),
      updatedAt: Date.now()
    };

    // Agregar campos específicos según el proveedor
    if (selectedProvider === 'supabase') {
      credential = {
        ...credential,
        type: 'supabase',
        url: formData.url,
        key: formData.serviceRoleKey
      };
    } else if (selectedProvider === 'postgres' || selectedProvider === 'mysql' || selectedProvider === 'mongodb') {
      credential = {
        ...credential,
        type: selectedProvider,
        ...formData
      };
    } else {
      // Para email, calendar, etc.
      credential = {
        ...credential,
        ...formData
      };
    }

    saveCredential(credential);
    loadCredentials();
    setShowAddModal(false);
    setSelectedProvider('');
    setFormData({});
  };

  const handleTestConnection = async (credentialId: string) => {
    setTestingConnection(credentialId);
    const result = await testConnection(credentialId);
    setTestResults(prev => ({ ...prev, [credentialId]: result }));
    setTestingConnection(null);
  };

  const handleDeleteConnection = (id: string) => {
    if (confirm('Are you sure you want to delete this connection?')) {
      deleteCredential(id);
      loadCredentials();
    }
  };

  const getCredentialsByType = (type: ConnectionType) => {
    return credentials.filter(cred => {
      // Mapear tipos de credenciales a tipos de conexión
      if (type === 'database') {
        return ['supabase', 'postgres', 'mysql', 'mongodb', 'airtable', 'google-sheets'].includes(cred.type);
      } else if (type === 'email') {
        return cred.type === 'email';
      } else if (type === 'calendar') {
        return cred.type === 'calendar';
      } else if (type === 'messaging') {
        // Por ahora no hay tipo específico, filtramos por nombre
        return false;
      }
      return false;
    });
  };

  const tabs: { type: ConnectionType; label: string; icon: string }[] = [
    { type: 'database', label: 'Databases', icon: '🗄️' },
    { type: 'email', label: 'Email', icon: '📧' },
    { type: 'calendar', label: 'Calendar', icon: '📅' },
    { type: 'messaging', label: 'Messaging', icon: '💬' }
  ];

  return (
    <Card className="p-6">
      <h2 className="text-2xl font-bold text-gray-900 mb-4">🔌 Configure Connections</h2>
      
      {/* Auto-detected Services Banner */}
      {hasAnyRequirements && (
        <div className="mb-6 bg-gradient-to-r from-blue-50 to-purple-50 border-2 border-blue-200 rounded-lg p-5">
          <h3 className="font-bold text-lg text-gray-900 mb-3 flex items-center">
            <span className="text-2xl mr-2">🔍</span>
            Servicios Detectados en el Workflow
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Databases */}
            {requiredServices.databases.length > 0 && (
              <div className="bg-white rounded-lg p-3 border border-blue-100">
                <div className="font-semibold text-gray-700 mb-2 flex items-center">
                  <span className="mr-2">🗄️</span>
                  Bases de Datos
                </div>
                <div className="flex flex-wrap gap-2">
                  {requiredServices.databases.map(db => (
                    <span key={db} className="px-3 py-1 bg-green-100 text-green-700 rounded-full text-sm font-medium">
                      {CONNECTION_CONFIGS[db]?.provider || db}
                    </span>
                  ))}
                </div>
                <p className="text-xs text-gray-500 mt-2">
                  Detectadas {workflowInfo?.tables.length} tablas: {workflowInfo?.tables.slice(0, 3).join(', ')}
                  {(workflowInfo?.tables.length || 0) > 3 ? '...' : ''}
                </p>
              </div>
            )}
            
            {/* Email */}
            {requiredServices.emails.length > 0 && (
              <div className="bg-white rounded-lg p-3 border border-blue-100">
                <div className="font-semibold text-gray-700 mb-2 flex items-center">
                  <span className="mr-2">�</span>
                  Servicios de Email
                </div>
                <div className="flex flex-wrap gap-2">
                  {requiredServices.emails.map(email => (
                    <span key={email} className="px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-sm font-medium capitalize">
                      {email}
                    </span>
                  ))}
                </div>
                <p className="text-xs text-gray-500 mt-2">
                  {workflowInfo?.tools.email?.nodeIds?.length || 0} nodos detectados
                </p>
              </div>
            )}
            
            {/* Calendar */}
            {requiredServices.calendars.length > 0 && (
              <div className="bg-white rounded-lg p-3 border border-blue-100">
                <div className="font-semibold text-gray-700 mb-2 flex items-center">
                  <span className="mr-2">📅</span>
                  Calendarios
                </div>
                <div className="flex flex-wrap gap-2">
                  {requiredServices.calendars.map(cal => (
                    <span key={cal} className="px-3 py-1 bg-purple-100 text-purple-700 rounded-full text-sm font-medium capitalize">
                      {cal}
                    </span>
                  ))}
                </div>
              </div>
            )}
            
            {/* Messaging */}
            {requiredServices.messaging.length > 0 && (
              <div className="bg-white rounded-lg p-3 border border-blue-100">
                <div className="font-semibold text-gray-700 mb-2 flex items-center">
                  <span className="mr-2">💬</span>
                  Mensajería
                </div>
                <div className="flex flex-wrap gap-2">
                  {requiredServices.messaging.map(msg => (
                    <span key={msg} className="px-3 py-1 bg-orange-100 text-orange-700 rounded-full text-sm font-medium capitalize">
                      {msg}
                    </span>
                  ))}
                </div>
              </div>
            )}
            
            {/* Subflows */}
            {requiredServices.subflows.length > 0 && (
              <div className="bg-white rounded-lg p-3 border border-blue-100">
                <div className="font-semibold text-gray-700 mb-2 flex items-center">
                  <span className="mr-2">🔗</span>
                  Sub-flujos Requeridos
                </div>
                <div className="space-y-1">
                  {requiredServices.subflows.map((subflow, idx) => (
                    <div key={idx} className="text-sm">
                      <span className="font-medium text-gray-900">{subflow.name}</span>
                      <span className="text-gray-500 text-xs ml-2">(ID: {subflow.id})</span>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-amber-600 mt-2 font-medium">
                  ⚠️ Necesitas cargar los archivos JSON de estos sub-flujos
                </p>
              </div>
            )}
          </div>
          <p className="text-sm text-gray-600 mt-4">
            👇 Configura las credenciales necesarias abajo para ejecutar la auditoría
          </p>
        </div>
      )}
      
      {/* Tabs */}
      <div className="flex space-x-1 mb-6 bg-gray-100 p-1 rounded-lg">
        {tabs.map(tab => (
          <button
            key={tab.type}
            onClick={() => setActiveTab(tab.type)}
            className={`flex-1 py-2 px-4 rounded-md font-medium transition-all ${
              activeTab === tab.type
                ? 'bg-white text-blue-600 shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <span className="mr-2">{tab.icon}</span>
            {tab.label}
          </button>
        ))}
      </div>

      {/* Connection Cards */}
      <div className="space-y-3 mb-6">
        {getCredentialsByType(activeTab).map(cred => {
          const config = CONNECTION_CONFIGS[cred.type];
          if (!config) return null;

          const testResult = testResults[cred.id];

          return (
            <div key={cred.id} className={`border-2 rounded-lg p-4 ${config.color} bg-opacity-5 border-opacity-20`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <div className={`${config.color} w-10 h-10 rounded-full flex items-center justify-center text-2xl`}>
                    {config.icon}
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-900">{cred.name}</h3>
                    <p className="text-sm text-gray-500">{config.provider}</p>
                  </div>
                </div>

                <div className="flex items-center space-x-2">
                  {testResult && (
                    <div className="flex items-center space-x-1">
                      {testResult.success ? (
                        <CheckCircleIcon className="w-5 h-5 text-green-500" />
                      ) : (
                        <XCircleIcon className="w-5 h-5 text-red-500" />
                      )}
                      <span className={`text-sm ${testResult.success ? 'text-green-600' : 'text-red-600'}`}>
                        {testResult.message}
                      </span>
                    </div>
                  )}

                  <button
                    onClick={() => handleTestConnection(cred.id)}
                    disabled={testingConnection === cred.id}
                    className="px-3 py-1 text-sm bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50"
                  >
                    {testingConnection === cred.id ? 'Testing...' : 'Test'}
                  </button>

                  <button
                    onClick={() => handleDeleteConnection(cred.id)}
                    className="p-1 text-red-500 hover:text-red-700"
                  >
                    <TrashIcon className="w-5 h-5" />
                  </button>
                </div>
              </div>
            </div>
          );
        })}

        {getCredentialsByType(activeTab).length === 0 && (
          <div className="text-center py-12 text-gray-400">
            <p className="text-lg mb-2">No connections configured</p>
            <p className="text-sm">Add your first connection to get started</p>
          </div>
        )}
      </div>

      {/* Add Connection Button */}
      <button
        onClick={() => setShowAddModal(true)}
        className="w-full py-3 border-2 border-dashed border-gray-300 rounded-lg text-gray-600 hover:border-blue-500 hover:text-blue-600 font-medium transition-all flex items-center justify-center space-x-2"
      >
        <PlusCircleIcon className="w-5 h-5" />
        <span>Add {tabs.find(t => t.type === activeTab)?.label} Connection</span>
      </button>

      {/* Add Connection Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-200">
              <h3 className="text-xl font-bold text-gray-900">Add New Connection</h3>
            </div>

            <div className="p-6 space-y-6">
              {/* Provider Selection */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Select Provider
                </label>
                <div className="grid grid-cols-2 gap-3">
                  {getProvidersByType(activeTab).map(([key, config]) => (
                    <button
                      key={key}
                      onClick={() => setSelectedProvider(key)}
                      className={`p-4 border-2 rounded-lg text-left transition-all ${
                        selectedProvider === key
                          ? 'border-blue-500 bg-blue-50'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <div className="flex items-center space-x-3">
                        <div className={`${config.color} w-12 h-12 rounded-lg flex items-center justify-center text-2xl`}>
                          {config.icon}
                        </div>
                        <span className="font-medium text-gray-900">{config.provider}</span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Configuration Fields */}
              {selectedProvider && (
                <div className="space-y-4 pt-4 border-t border-gray-200">
                  <h4 className="font-medium text-gray-900">Configuration</h4>
                  {CONNECTION_CONFIGS[selectedProvider].fields.map(field => (
                    <div key={field.name}>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        {field.label}
                        {field.required && <span className="text-red-500 ml-1">*</span>}
                      </label>
                      <input
                        type={field.type}
                        value={formData[field.name] || ''}
                        onChange={(e) => setFormData({ ...formData, [field.name]: e.target.value })}
                        placeholder={field.placeholder}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="p-6 border-t border-gray-200 flex justify-end space-x-3">
              <button
                onClick={() => {
                  setShowAddModal(false);
                  setSelectedProvider('');
                  setFormData({});
                }}
                className="px-4 py-2 text-gray-700 hover:text-gray-900"
              >
                Cancel
              </button>
              <button
                onClick={handleAddConnection}
                disabled={!selectedProvider}
                className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Add Connection
              </button>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
};

export default ConnectionsManager;
