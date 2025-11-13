/**
 * 🔌 Integration Mapper
 * 
 * Detecta TODAS las integraciones externas en un proyecto:
 * - APIs de IA (OpenAI, Anthropic, Google AI, Hugging Face)
 * - Servicios de mensajería (Twilio, SendGrid, WhatsApp, Telegram)
 * - Calendarios (Google Calendar, Outlook)
 * - CRMs (Salesforce, HubSpot, Pipedrive)
 * - Pagos (Stripe, PayPal, Mercado Pago)
 * - Storage (AWS S3, Google Cloud Storage, Azure Blob)
 * - Auth (Auth0, Firebase Auth, Clerk)
 * - Webhooks y APIs REST/GraphQL customizadas
 * 
 * Para cada integración detecta:
 * - Credenciales necesarias
 * - Endpoints usados
 * - Operaciones realizadas
 * - Configuración requerida
 */

export interface IntegrationDetection {
  name: string;
  category: IntegrationCategory;
  provider: string;
  confidence: number;
  detectedIn: string[]; // Archivos donde se detectó
  operations: OperationDetection[];
  credentials: CredentialRequirement[];
  endpoints?: string[];
  sdkVersion?: string;
  configuration?: Record<string, any>;
}

export enum IntegrationCategory {
  AI_API = 'ai_api',
  MESSAGING = 'messaging',
  EMAIL = 'email',
  CALENDAR = 'calendar',
  CRM = 'crm',
  PAYMENT = 'payment',
  STORAGE = 'storage',
  AUTH = 'auth',
  DATABASE = 'database',
  WEBHOOK = 'webhook',
  CUSTOM_API = 'custom_api',
}

export interface OperationDetection {
  name: string;
  method?: string; // 'GET', 'POST', etc.
  endpoint?: string;
  description: string;
  requiresAuth: boolean;
}

export interface CredentialRequirement {
  name: string;
  type: 'api_key' | 'oauth' | 'jwt' | 'basic_auth' | 'custom';
  envVarName?: string;
  required: boolean;
}

interface FileContent {
  path: string;
  name: string;
  content: string;
}

// Patrones de detección para cada categoría
const AI_API_PATTERNS = {
  openai: {
    provider: 'OpenAI',
    keywords: ['openai', '@openai/api', 'gpt-', 'ChatCompletion', 'completion.create'],
    envVars: ['OPENAI_API_KEY', 'OPENAI_ORG_ID'],
    operations: ['chat.completions.create', 'completions.create', 'embeddings.create', 'images.generate'],
  },
  anthropic: {
    provider: 'Anthropic',
    keywords: ['anthropic', '@anthropic-ai/sdk', 'claude', 'messages.create'],
    envVars: ['ANTHROPIC_API_KEY'],
    operations: ['messages.create', 'messages.stream'],
  },
  google_ai: {
    provider: 'Google AI',
    keywords: ['@google/generative-ai', 'gemini', 'generateContent', 'GoogleGenAI'],
    envVars: ['GEMINI_API_KEY', 'GOOGLE_API_KEY'],
    operations: ['generateContent', 'startChat', 'streamGenerateContent'],
  },
  huggingface: {
    provider: 'Hugging Face',
    keywords: ['@huggingface', 'huggingface', 'inference'],
    envVars: ['HUGGINGFACE_API_KEY', 'HF_TOKEN'],
    operations: ['inference', 'textGeneration', 'tokenClassification'],
  },
  cohere: {
    provider: 'Cohere',
    keywords: ['cohere-ai', 'cohere', 'co.generate'],
    envVars: ['COHERE_API_KEY'],
    operations: ['generate', 'embed', 'classify'],
  },
};

const MESSAGING_PATTERNS = {
  twilio: {
    provider: 'Twilio',
    keywords: ['twilio', 'messages.create', 'TwilioClient'],
    envVars: ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_PHONE_NUMBER'],
    operations: ['messages.create', 'calls.create'],
  },
  builderbot: {
    provider: 'BuilderBot (WhatsApp Framework)',
    keywords: ['@builderbot/', 'createBot', 'addKeyword', 'addAction', 'BaileysProvider'],
    envVars: ['PORT', 'SESSION_NAME'],
    operations: ['createBot', 'addKeyword', 'addAction', 'sendMessage'],
  },
  whatsapp: {
    provider: 'WhatsApp Business API',
    keywords: ['@whiskeysockets/baileys', 'baileys', 'whatsapp-web.js', 'makeWASocket'],
    envVars: ['WHATSAPP_PHONE_NUMBER', 'WHATSAPP_API_KEY'],
    operations: ['sendMessage', 'sendImage', 'sendDocument'],
  },
  telegram: {
    provider: 'Telegram Bot API',
    keywords: ['node-telegram-bot-api', 'telegraf', 'bot.sendMessage'],
    envVars: ['TELEGRAM_BOT_TOKEN'],
    operations: ['sendMessage', 'sendPhoto', 'sendDocument'],
  },
  slack: {
    provider: 'Slack',
    keywords: ['@slack/bolt', '@slack/web-api', 'chat.postMessage'],
    envVars: ['SLACK_BOT_TOKEN', 'SLACK_SIGNING_SECRET'],
    operations: ['chat.postMessage', 'conversations.list', 'users.list'],
  },
  discord: {
    provider: 'Discord',
    keywords: ['discord.js', 'Client', 'message.channel.send'],
    envVars: ['DISCORD_BOT_TOKEN'],
    operations: ['send', 'reply', 'createEmbed'],
  },
};

const EMAIL_PATTERNS = {
  sendgrid: {
    provider: 'SendGrid',
    keywords: ['@sendgrid/mail', 'sendgrid', 'sgMail.send'],
    envVars: ['SENDGRID_API_KEY'],
    operations: ['send', 'sendMultiple'],
  },
  nodemailer: {
    provider: 'Nodemailer',
    keywords: ['nodemailer', 'createTransport', 'sendMail'],
    envVars: ['SMTP_HOST', 'SMTP_USER', 'SMTP_PASS'],
    operations: ['sendMail'],
  },
  mailgun: {
    provider: 'Mailgun',
    keywords: ['mailgun-js', 'mailgun', 'messages.send'],
    envVars: ['MAILGUN_API_KEY', 'MAILGUN_DOMAIN'],
    operations: ['messages.create', 'messages.send'],
  },
  resend: {
    provider: 'Resend',
    keywords: ['resend', 'emails.send'],
    envVars: ['RESEND_API_KEY'],
    operations: ['emails.send'],
  },
  aws_ses: {
    provider: 'AWS SES',
    keywords: ['@aws-sdk/client-ses', 'SendEmailCommand'],
    envVars: ['AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'AWS_REGION'],
    operations: ['sendEmail', 'sendRawEmail'],
  },
};

const CALENDAR_PATTERNS = {
  google_calendar: {
    provider: 'Google Calendar',
    keywords: ['googleapis', 'calendar.events', '@google-cloud/calendar'],
    envVars: ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_CALENDAR_ID'],
    operations: ['events.insert', 'events.list', 'events.delete', 'events.update'],
  },
  outlook: {
    provider: 'Microsoft Outlook Calendar',
    keywords: ['@microsoft/microsoft-graph-client', 'calendar/events'],
    envVars: ['MICROSOFT_CLIENT_ID', 'MICROSOFT_CLIENT_SECRET'],
    operations: ['calendar.events.create', 'calendar.events.list'],
  },
};

const CRM_PATTERNS = {
  salesforce: {
    provider: 'Salesforce',
    keywords: ['jsforce', 'salesforce', 'sf.sobject'],
    envVars: ['SALESFORCE_USERNAME', 'SALESFORCE_PASSWORD', 'SALESFORCE_TOKEN'],
    operations: ['query', 'create', 'update', 'delete'],
  },
  hubspot: {
    provider: 'HubSpot',
    keywords: ['@hubspot/api-client', 'hubspot', 'contacts.create'],
    envVars: ['HUBSPOT_API_KEY', 'HUBSPOT_ACCESS_TOKEN'],
    operations: ['contacts.create', 'companies.create', 'deals.create'],
  },
  pipedrive: {
    provider: 'Pipedrive',
    keywords: ['pipedrive', 'deals.add'],
    envVars: ['PIPEDRIVE_API_TOKEN'],
    operations: ['deals.add', 'persons.add', 'organizations.add'],
  },
};

const PAYMENT_PATTERNS = {
  stripe: {
    provider: 'Stripe',
    keywords: ['stripe', 'paymentIntents.create', 'customers.create'],
    envVars: ['STRIPE_SECRET_KEY', 'STRIPE_PUBLISHABLE_KEY'],
    operations: ['paymentIntents.create', 'customers.create', 'charges.create', 'subscriptions.create'],
  },
  paypal: {
    provider: 'PayPal',
    keywords: ['@paypal/checkout-server-sdk', 'paypal', 'orders.create'],
    envVars: ['PAYPAL_CLIENT_ID', 'PAYPAL_CLIENT_SECRET'],
    operations: ['orders.create', 'orders.capture', 'payments.create'],
  },
  mercadopago: {
    provider: 'Mercado Pago',
    keywords: ['mercadopago', 'preference.create'],
    envVars: ['MERCADOPAGO_ACCESS_TOKEN'],
    operations: ['preference.create', 'payment.create'],
  },
};

const STORAGE_PATTERNS = {
  aws_s3: {
    provider: 'AWS S3',
    keywords: ['@aws-sdk/client-s3', 'aws-sdk', 'PutObjectCommand', 's3.upload'],
    envVars: ['AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'AWS_S3_BUCKET'],
    operations: ['putObject', 'getObject', 'deleteObject', 'listObjects'],
  },
  google_cloud_storage: {
    provider: 'Google Cloud Storage',
    keywords: ['@google-cloud/storage', 'bucket.file', 'storage.bucket'],
    envVars: ['GOOGLE_CLOUD_PROJECT', 'GOOGLE_APPLICATION_CREDENTIALS'],
    operations: ['upload', 'download', 'delete', 'getFiles'],
  },
  azure_blob: {
    provider: 'Azure Blob Storage',
    keywords: ['@azure/storage-blob', 'BlobServiceClient', 'containerClient'],
    envVars: ['AZURE_STORAGE_CONNECTION_STRING', 'AZURE_STORAGE_ACCOUNT'],
    operations: ['upload', 'download', 'delete', 'listBlobs'],
  },
  cloudinary: {
    provider: 'Cloudinary',
    keywords: ['cloudinary', 'uploader.upload'],
    envVars: ['CLOUDINARY_CLOUD_NAME', 'CLOUDINARY_API_KEY', 'CLOUDINARY_API_SECRET'],
    operations: ['upload', 'destroy', 'transformation'],
  },
};

const AUTH_PATTERNS = {
  auth0: {
    provider: 'Auth0',
    keywords: ['auth0', '@auth0/nextjs-auth0', 'auth0.getUser'],
    envVars: ['AUTH0_DOMAIN', 'AUTH0_CLIENT_ID', 'AUTH0_CLIENT_SECRET'],
    operations: ['getUser', 'login', 'logout', 'getAccessToken'],
  },
  clerk: {
    provider: 'Clerk',
    keywords: ['@clerk/nextjs', '@clerk/clerk-sdk-node', 'clerkClient'],
    envVars: ['CLERK_SECRET_KEY', 'NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY'],
    operations: ['getUser', 'createUser', 'updateUser'],
  },
  firebase_auth: {
    provider: 'Firebase Auth',
    keywords: ['firebase/auth', 'signInWithEmailAndPassword', 'createUserWithEmailAndPassword'],
    envVars: ['FIREBASE_API_KEY', 'FIREBASE_PROJECT_ID'],
    operations: ['signIn', 'signUp', 'signOut', 'getUser'],
  },
};

/**
 * Detecta todas las integraciones en los archivos
 */
export async function detectIntegrations(files: FileContent[]): Promise<IntegrationDetection[]> {
  console.log('🔌 Detecting integrations...');
  
  const integrations: IntegrationDetection[] = [];
  
  // Detectar cada categoría
  integrations.push(...detectCategory(files, AI_API_PATTERNS, IntegrationCategory.AI_API));
  integrations.push(...detectCategory(files, MESSAGING_PATTERNS, IntegrationCategory.MESSAGING));
  integrations.push(...detectCategory(files, EMAIL_PATTERNS, IntegrationCategory.EMAIL));
  integrations.push(...detectCategory(files, CALENDAR_PATTERNS, IntegrationCategory.CALENDAR));
  integrations.push(...detectCategory(files, CRM_PATTERNS, IntegrationCategory.CRM));
  integrations.push(...detectCategory(files, PAYMENT_PATTERNS, IntegrationCategory.PAYMENT));
  integrations.push(...detectCategory(files, STORAGE_PATTERNS, IntegrationCategory.STORAGE));
  integrations.push(...detectCategory(files, AUTH_PATTERNS, IntegrationCategory.AUTH));
  
  // Detectar webhooks y APIs customizadas
  integrations.push(...detectWebhooks(files));
  integrations.push(...detectCustomAPIs(files));
  
  console.log(`✅ Detected ${integrations.length} integrations`);
  
  return integrations;
}

/**
 * Detecta integraciones de una categoría específica
 */
function detectCategory(
  files: FileContent[],
  patterns: Record<string, any>,
  category: IntegrationCategory
): IntegrationDetection[] {
  const detected: IntegrationDetection[] = [];
  
  for (const [key, pattern] of Object.entries(patterns)) {
    const matchingFiles: string[] = [];
    const operations: OperationDetection[] = [];
    let maxConfidence = 0;
    
    for (const file of files) {
      const content = file.content;
      
      // Verificar keywords
      const keywordMatches = pattern.keywords.filter((kw: string) => 
        content.toLowerCase().includes(kw.toLowerCase())
      );
      
      if (keywordMatches.length === 0) continue;
      
      matchingFiles.push(file.path);
      
      // Calcular confidence
      const confidence = Math.min(0.95, 0.6 + (keywordMatches.length * 0.1));
      if (confidence > maxConfidence) maxConfidence = confidence;
      
      // Detectar operaciones específicas
      for (const op of pattern.operations || []) {
        if (content.includes(op)) {
          operations.push({
            name: op,
            description: `${pattern.provider} operation: ${op}`,
            requiresAuth: true,
          });
        }
      }
    }
    
    if (matchingFiles.length > 0) {
      // Detectar credenciales necesarias
      const credentials = pattern.envVars.map((envVar: string) => ({
        name: envVar,
        type: envVar.includes('KEY') ? 'api_key' as const : 
              envVar.includes('TOKEN') ? 'api_key' as const : 
              'custom' as const,
        envVarName: envVar,
        required: true,
      }));
      
      detected.push({
        name: pattern.provider,
        category,
        provider: pattern.provider,
        confidence: maxConfidence,
        detectedIn: matchingFiles,
        operations: operations.slice(0, 10), // Limitar a 10 operaciones
        credentials,
      });
    }
  }
  
  return detected;
}

/**
 * Detecta webhooks configurados
 */
function detectWebhooks(files: FileContent[]): IntegrationDetection[] {
  const webhooks: IntegrationDetection[] = [];
  
  for (const file of files) {
    const content = file.content;
    
    // Buscar endpoints que manejen webhooks
    const webhookPatterns = [
      /app\.post\s*\(\s*['"]([^'"]*webhook[^'"]*)['"]/gi,
      /router\.post\s*\(\s*['"]([^'"]*webhook[^'"]*)['"]/gi,
      /@Post\s*\(\s*['"]([^'"]*webhook[^'"]*)['"]/gi,
    ];
    
    const endpoints: string[] = [];
    
    for (const pattern of webhookPatterns) {
      let match;
      while ((match = pattern.exec(content)) !== null) {
        endpoints.push(match[1]);
      }
    }
    
    if (endpoints.length > 0) {
      webhooks.push({
        name: 'Webhook Handler',
        category: IntegrationCategory.WEBHOOK,
        provider: 'Custom Webhook',
        confidence: 0.8,
        detectedIn: [file.path],
        operations: endpoints.map(ep => ({
          name: ep,
          method: 'POST',
          endpoint: ep,
          description: `Webhook endpoint: ${ep}`,
          requiresAuth: true,
        })),
        credentials: [],
        endpoints,
      });
    }
  }
  
  return webhooks;
}

/**
 * Detecta APIs REST/GraphQL customizadas
 */
function detectCustomAPIs(files: FileContent[]): IntegrationDetection[] {
  const apis: IntegrationDetection[] = [];
  
  // Buscar fetch/axios calls a dominios externos
  for (const file of files) {
    const content = file.content;
    
    // Detectar fetch calls
    const fetchPattern = /fetch\s*\(\s*['"](https?:\/\/[^'"]+)['"]/g;
    const axiosPattern = /axios\.(get|post|put|delete|patch)\s*\(\s*['"](https?:\/\/[^'"]+)['"]/g;
    
    const externalUrls = new Set<string>();
    
    let match;
    while ((match = fetchPattern.exec(content)) !== null) {
      const url = match[1];
      // Filtrar localhost y URLs comunes
      if (!url.includes('localhost') && !url.includes('127.0.0.1')) {
        externalUrls.add(extractDomain(url));
      }
    }
    
    while ((match = axiosPattern.exec(content)) !== null) {
      const url = match[2];
      if (!url.includes('localhost') && !url.includes('127.0.0.1')) {
        externalUrls.add(extractDomain(url));
      }
    }
    
    for (const domain of externalUrls) {
      apis.push({
        name: domain,
        category: IntegrationCategory.CUSTOM_API,
        provider: 'Custom API',
        confidence: 0.7,
        detectedIn: [file.path],
        operations: [{
          name: 'HTTP Request',
          description: `External API call to ${domain}`,
          requiresAuth: false,
        }],
        credentials: [],
        endpoints: [domain],
      });
    }
  }
  
  return apis;
}

/**
 * Extrae dominio de una URL
 */
function extractDomain(url: string): string {
  try {
    const urlObj = new URL(url);
    return urlObj.origin;
  } catch {
    return url;
  }
}

/**
 * Resume las integraciones detectadas
 */
export function summarizeIntegrations(integrations: IntegrationDetection[]): {
  total: number;
  byCategory: Record<string, number>;
  requiresCredentials: string[];
  summary: string;
} {
  const byCategory: Record<string, number> = {};
  const requiresCredentials: string[] = [];
  
  for (const integration of integrations) {
    byCategory[integration.category] = (byCategory[integration.category] || 0) + 1;
    
    if (integration.credentials.length > 0) {
      requiresCredentials.push(integration.name);
    }
  }
  
  const categoriesStr = Object.entries(byCategory)
    .map(([cat, count]) => `${count} ${cat.replace('_', ' ')}`)
    .join(', ');
  
  const summary = `${integrations.length} integrations: ${categoriesStr}`;
  
  return {
    total: integrations.length,
    byCategory,
    requiresCredentials,
    summary,
  };
}
