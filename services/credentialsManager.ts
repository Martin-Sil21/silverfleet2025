/**
 * 🔐 Credentials Manager
 * Gestiona credenciales para herramientas externas y bases de datos
 * Almacenamiento: localStorage (para uso local/dev)
 */

export type CredentialType = 
  // Email
  | 'smtp'
  | 'gmail-oauth'        // DEPRECATED: usar 'google-oauth' o 'google-service-account'
  | 'outlook-oauth'
  | 'sendgrid-api'
  | 'mailgun-api'
  // Calendar
  | 'google-calendar-oauth'  // DEPRECATED: usar 'google-oauth' o 'google-service-account'
  | 'microsoft-calendar-oauth'
  // Google (unificado)
  | 'google-oauth'      // Credencial OAuth para Gmail, Calendar, Drive, Sheets (requiere configurar redirect URI)
  | 'google-service-account' // Service Account JSON - más simple, sin OAuth, ideal para bots/auditorías
  // Database
  | 'supabase'
  | 'airtable'
  | 'postgres'
  | 'mysql'
  | 'mongodb'
  | 'google-sheets-oauth'  // DEPRECATED: usar 'google-oauth'
  // CRM
  | 'hubspot-api'
  | 'salesforce-oauth'
  | 'pipedrive-api'
  // Messaging
  | 'telegram-bot'
  | 'whatsapp-api'
  | 'slack-oauth'
  | 'twilio-api'
  // Payment
  | 'stripe-api'
  | 'paypal-api'
  // Storage
  | 'aws-s3'
  | 'google-drive-oauth'  // DEPRECATED: usar 'google-oauth'
  | 'dropbox-oauth';

export interface BaseCredential {
  id: string;
  name: string; // Nombre descriptivo dado por el usuario
  type: CredentialType;
  createdAt: number;
  updatedAt: number;
}

// SMTP
export interface SMTPCredential extends BaseCredential {
  type: 'smtp';
  data: {
    host: string;
    port: number;
    secure: boolean;
    username: string;
    password: string;
    fromEmail: string;
    fromName?: string;
  };
}

// Gmail OAuth
export interface GmailOAuthCredential extends BaseCredential {
  type: 'gmail-oauth';
  data: {
    clientId: string;
    clientSecret: string;
    refreshToken: string;
    accessToken?: string; // Se puede guardar pero se renovará automáticamente
  };
}

// Supabase
export interface SupabaseCredential extends BaseCredential {
  type: 'supabase';
  data: {
    url: string;
    key: string; // service_role or anon key
    keyType: 'service_role' | 'anon';
  };
}

// Airtable
export interface AirtableCredential extends BaseCredential {
  type: 'airtable';
  data: {
    apiKey: string;
    baseId: string;
  };
}

// Postgres
export interface PostgresCredential extends BaseCredential {
  type: 'postgres';
  data: {
    host: string;
    port: number;
    database: string;
    username: string;
    password: string;
    ssl: boolean;
  };
}

// MySQL
export interface MySQLCredential extends BaseCredential {
  type: 'mysql';
  data: {
    host: string;
    port: number;
    database: string;
    username: string;
    password: string;
  };
}

// MongoDB
export interface MongoDBCredential extends BaseCredential {
  type: 'mongodb';
  data: {
    connectionString: string;
    database: string;
  };
}

// Google Calendar OAuth (DEPRECATED - usar GoogleOAuthCredential)
export interface GoogleCalendarOAuthCredential extends BaseCredential {
  type: 'google-calendar-oauth';
  data: {
    clientId: string;
    clientSecret: string;
    refreshToken: string;
    accessToken?: string;
  };
}

// Google OAuth (credencial unificada para todos los servicios de Google)
export interface GoogleOAuthCredential extends BaseCredential {
  type: 'google-oauth';
  data: {
    clientId: string;
    clientSecret: string;
    refreshToken: string;
    accessToken?: string;
    scopes?: string[]; // Scopes autorizados (gmail, calendar, drive, etc.)
  };
}

// Google Service Account (JSON key file - más simple que OAuth)
export interface GoogleServiceAccountCredential extends BaseCredential {
  type: 'google-service-account';
  data: {
    type: 'service_account';
    project_id: string;
    private_key_id: string;
    private_key: string;
    client_email: string;
    client_id: string;
    auth_uri: string;
    token_uri: string;
    auth_provider_x509_cert_url: string;
    client_x509_cert_url: string;
    universe_domain?: string;
    // Campos adicionales para control
    scopes?: string[]; // Scopes a solicitar (gmail, calendar, drive, etc.)
    delegatedUser?: string; // Email del usuario a impersonar (Domain-Wide Delegation)
  };
}

// Telegram Bot
export interface TelegramBotCredential extends BaseCredential {
  type: 'telegram-bot';
  data: {
    botToken: string;
  };
}

// Stripe API
export interface StripeAPICredential extends BaseCredential {
  type: 'stripe-api';
  data: {
    secretKey: string;
    publishableKey?: string;
  };
}

// Generic API Key credential
export interface APIKeyCredential extends BaseCredential {
  type: 'sendgrid-api' | 'mailgun-api' | 'hubspot-api' | 'pipedrive-api' | 'whatsapp-api' | 'slack-oauth' | 'twilio-api' | 'paypal-api';
  data: {
    apiKey: string;
    [key: string]: any; // Campos adicionales específicos
  };
}

export type Credential = 
  | SMTPCredential
  | GmailOAuthCredential
  | SupabaseCredential
  | AirtableCredential
  | PostgresCredential
  | MySQLCredential
  | MongoDBCredential
  | GoogleCalendarOAuthCredential
  | GoogleOAuthCredential
  | GoogleServiceAccountCredential
  | TelegramBotCredential
  | StripeAPICredential
  | APIKeyCredential;

const STORAGE_KEY = 'silverfleet_credentials';

/**
 * Genera un ID único para credenciales
 */
export function generateCredentialId(): string {
  return `cred_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Carga todas las credenciales del localStorage
 */
export function getAllCredentials(): Credential[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return [];
    return JSON.parse(stored) as Credential[];
  } catch (error) {
    console.error('Error loading credentials:', error);
    return [];
  }
}

/**
 * Obtiene credenciales filtradas por tipo
 */
export function getCredentialsByType(type: CredentialType): Credential[] {
  const allCreds = getAllCredentials();
  return allCreds.filter(c => c.type === type);
}

/**
 * Obtiene una credencial por su ID
 */
export function getCredentialById(id: string): Credential | null {
  const allCreds = getAllCredentials();
  return allCreds.find(c => c.id === id) || null;
}

/**
 * Guarda o actualiza una credencial
 */
export function saveCredential(credential: Credential): void {
  const allCreds = getAllCredentials();
  const existingIndex = allCreds.findIndex(c => c.id === credential.id);

  const now = Date.now();
  const credentialToSave = {
    ...credential,
    updatedAt: now,
    createdAt: credential.createdAt || now
  };

  if (existingIndex >= 0) {
    // Actualizar existente
    allCreds[existingIndex] = credentialToSave;
  } else {
    // Agregar nueva
    allCreds.push(credentialToSave);
  }

  localStorage.setItem(STORAGE_KEY, JSON.stringify(allCreds));
}

/**
 * Elimina una credencial por su ID
 */
export function deleteCredential(id: string): boolean {
  const allCreds = getAllCredentials();
  const filtered = allCreds.filter(c => c.id !== id);
  
  if (filtered.length === allCreds.length) {
    return false; // No se encontró la credencial
  }

  localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
  return true;
}

/**
 * Valida que una credencial tenga todos los campos requeridos
 */
export function validateCredential(credential: Partial<Credential>): { isValid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!credential.type) {
    errors.push('Credential type is required');
    return { isValid: false, errors };
  }

  if (!credential.name?.trim()) {
    errors.push('Credential name is required');
  }

  // Validaciones específicas por tipo
  switch (credential.type) {
    case 'smtp':
      const smtp = credential as Partial<SMTPCredential>;
      if (!smtp.data?.host) errors.push('SMTP host is required');
      if (!smtp.data?.port) errors.push('SMTP port is required');
      if (!smtp.data?.username) errors.push('SMTP username is required');
      if (!smtp.data?.password) errors.push('SMTP password is required');
      if (!smtp.data?.fromEmail) errors.push('From email is required');
      break;

    case 'supabase':
      const supabase = credential as Partial<SupabaseCredential>;
      if (!supabase.data?.url) errors.push('Supabase URL is required');
      if (!supabase.data?.key) errors.push('Supabase key is required');
      if (!supabase.data?.url?.startsWith('http')) errors.push('Supabase URL must be a valid URL');
      break;

    case 'postgres':
    case 'mysql':
      const db = credential as Partial<PostgresCredential | MySQLCredential>;
      if (!db.data?.host) errors.push('Database host is required');
      if (!db.data?.port) errors.push('Database port is required');
      if (!db.data?.database) errors.push('Database name is required');
      if (!db.data?.username) errors.push('Database username is required');
      if (!db.data?.password) errors.push('Database password is required');
      break;

    case 'mongodb':
      const mongo = credential as Partial<MongoDBCredential>;
      if (!mongo.data?.connectionString) errors.push('MongoDB connection string is required');
      if (!mongo.data?.database) errors.push('MongoDB database name is required');
      break;

    case 'airtable':
      const airtable = credential as Partial<AirtableCredential>;
      if (!airtable.data?.apiKey) errors.push('Airtable API key is required');
      if (!airtable.data?.baseId) errors.push('Airtable base ID is required');
      break;

    case 'google-oauth':
      const gauth = credential as Partial<GoogleOAuthCredential>;
      if (!gauth.data?.clientId) errors.push('Google OAuth Client ID is required');
      if (!gauth.data?.clientSecret) errors.push('Google OAuth Client Secret is required');
      // refreshToken solo es requerido si ya se hizo el flujo de autorización
      // Si se está creando la credencial pero aún no se autorizó, permitimos guardarlo
      // La autorización se hace después con el botón "Autorizar con Google"
      break;

    case 'google-service-account':
      const gsa = credential as Partial<GoogleServiceAccountCredential>;
      if (!gsa.data?.type || gsa.data.type !== 'service_account') {
        errors.push('Invalid Service Account JSON - must have type: "service_account"');
      }
      if (!gsa.data?.project_id) errors.push('Service Account project_id is required');
      if (!gsa.data?.private_key) errors.push('Service Account private_key is required');
      if (!gsa.data?.client_email) errors.push('Service Account client_email is required');
      if (!gsa.data?.token_uri) errors.push('Service Account token_uri is required');
      break;

    case 'gmail-oauth':
      const gmail = credential as Partial<GmailOAuthCredential>;
      if (!gmail.data?.clientId) errors.push('Gmail Client ID is required');
      if (!gmail.data?.clientSecret) errors.push('Gmail Client Secret is required');
      if (!gmail.data?.refreshToken) errors.push('Gmail Refresh Token is required');
      break;

    case 'google-calendar-oauth':
      const gcal = credential as Partial<GoogleCalendarOAuthCredential>;
      if (!gcal.data?.clientId) errors.push('Google Calendar OAuth client ID is required');
      if (!gcal.data?.clientSecret) errors.push('Google Calendar OAuth client secret is required');
      if (!gcal.data?.refreshToken) errors.push('Google Calendar OAuth refresh token is required');
      break;

    case 'telegram-bot':
      const telegram = credential as Partial<TelegramBotCredential>;
      if (!telegram.data?.botToken) errors.push('Telegram bot token is required');
      break;

    case 'stripe-api':
      const stripe = credential as Partial<StripeAPICredential>;
      if (!stripe.data?.secretKey) errors.push('Stripe secret key is required');
      break;

    // API Key based services
    case 'sendgrid-api':
    case 'mailgun-api':
    case 'hubspot-api':
    case 'pipedrive-api':
    case 'whatsapp-api':
    case 'slack-oauth':
    case 'twilio-api':
    case 'paypal-api':
      const apiKey = credential as Partial<APIKeyCredential>;
      if (!apiKey.data?.apiKey) errors.push('API key is required');
      break;
  }

  return {
    isValid: errors.length === 0,
    errors
  };
}

/**
 * Mapea el tipo de herramienta detectada al tipo de credencial requerido
 * Devuelve array de tipos compatibles (ordenados por preferencia)
 */
export function mapToolTypeToCredentialType(toolType: string): CredentialType[] {
  const mapping: Record<string, CredentialType[]> = {
    // Email
    'gmail': ['google-service-account', 'google-oauth', 'gmail-oauth'], // Service Account primero (más simple)
    'outlook': ['outlook-oauth'],
    'sendgrid': ['sendgrid-api'],
    'mailgun': ['mailgun-api'],
    'email': ['smtp'], // fallback genérico
    
    // Calendar
    'google-calendar': ['google-service-account', 'google-oauth', 'google-calendar-oauth'],
    'microsoft-calendar': ['microsoft-calendar-oauth'],
    
    // Database
    'supabase': ['supabase'],
    'airtable': ['airtable'],
    'postgres': ['postgres'],
    'mysql': ['mysql'],
    'mongodb': ['mongodb'],
    'google-sheets': ['google-service-account', 'google-oauth', 'google-sheets-oauth'],
    
    // CRM
    'hubspot': ['hubspot-api'],
    'salesforce': ['salesforce-oauth'],
    'pipedrive': ['pipedrive-api'],
    
    // Messaging
    'telegram': ['telegram-bot'],
    'whatsapp': ['whatsapp-api'],
    'slack': ['slack-oauth'],
    'twilio': ['twilio-api'],
    
    // Payment
    'stripe': ['stripe-api'],
    'paypal': ['paypal-api']
  };

  return mapping[toolType.toLowerCase()] || [];
}

/**
 * Obtiene un label legible para cada tipo de credencial
 */
export function getCredentialTypeLabel(type: CredentialType): string {
  const labels: Record<CredentialType, string> = {
    'smtp': 'SMTP Email',
    'gmail-oauth': 'Gmail (OAuth)',
    'outlook-oauth': 'Outlook (OAuth)',
    'sendgrid-api': 'SendGrid',
    'mailgun-api': 'Mailgun',
    'google-calendar-oauth': 'Google Calendar',
    'microsoft-calendar-oauth': 'Microsoft Calendar',
    'google-oauth': 'Google (OAuth)',
    'google-service-account': 'Google (Service Account)',
    'supabase': 'Supabase',
    'airtable': 'Airtable',
    'postgres': 'PostgreSQL',
    'mysql': 'MySQL',
    'mongodb': 'MongoDB',
    'google-sheets-oauth': 'Google Sheets',
    'hubspot-api': 'HubSpot',
    'salesforce-oauth': 'Salesforce',
    'pipedrive-api': 'Pipedrive',
    'telegram-bot': 'Telegram Bot',
    'whatsapp-api': 'WhatsApp Business API',
    'slack-oauth': 'Slack',
    'twilio-api': 'Twilio',
    'stripe-api': 'Stripe',
    'paypal-api': 'PayPal',
    'aws-s3': 'AWS S3',
    'google-drive-oauth': 'Google Drive',
    'dropbox-oauth': 'Dropbox'
  };

  return labels[type] || type;
}
