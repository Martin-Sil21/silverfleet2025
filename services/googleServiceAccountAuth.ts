/**
 * 🔐 Google Service Account Authentication
 * Implementa autenticación JWT para Service Accounts de Google
 * Referencia: https://developers.google.com/identity/protocols/oauth2/service-account
 */

import { GoogleServiceAccountCredential } from './credentialsManager';

// Scopes comunes para Gmail, Calendar, Drive, Sheets
const DEFAULT_SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/gmail.modify',
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/drive.readonly',
  'https://www.googleapis.com/auth/spreadsheets.readonly'
];

interface JWTHeader {
  alg: 'RS256';
  typ: 'JWT';
}

interface JWTPayload {
  iss: string;      // client_email del Service Account
  scope: string;    // Scopes separados por espacios
  aud: string;      // token_uri (https://oauth2.googleapis.com/token)
  exp: number;      // Expiration time (epoch)
  iat: number;      // Issued at time (epoch)
  sub?: string;     // Usuario a impersonar (si Domain-Wide Delegation está habilitado)
}

interface TokenResponse {
  access_token: string;
  expires_in: number;
  token_type: 'Bearer';
}

/**
 * Genera un JWT firmado para autenticación de Service Account
 */
async function createJWT(
  serviceAccount: GoogleServiceAccountCredential['data'],
  scopes: string[],
  delegatedUser?: string
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const expiry = now + 3600; // 1 hora

  const header: JWTHeader = {
    alg: 'RS256',
    typ: 'JWT'
  };

  const payload: JWTPayload = {
    iss: serviceAccount.client_email,
    scope: scopes.join(' '),
    aud: serviceAccount.token_uri,
    exp: expiry,
    iat: now
  };

  // Si se especifica usuario delegado (Domain-Wide Delegation)
  if (delegatedUser) {
    payload.sub = delegatedUser;
  }

  // Codificar header y payload en base64url
  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const unsignedToken = `${encodedHeader}.${encodedPayload}`;

  // Firmar con la private key del Service Account
  const signature = await signWithPrivateKey(unsignedToken, serviceAccount.private_key);
  const encodedSignature = base64UrlEncode(signature);

  return `${unsignedToken}.${encodedSignature}`;
}

/**
 * Codifica en base64url (sin padding)
 */
function base64UrlEncode(data: string | ArrayBuffer): string {
  let base64: string;
  
  if (typeof data === 'string') {
    base64 = btoa(unescape(encodeURIComponent(data)));
  } else {
    // Para ArrayBuffer (signature)
    const bytes = new Uint8Array(data);
    const binaryString = Array.from(bytes).map(b => String.fromCharCode(b)).join('');
    base64 = btoa(binaryString);
  }

  // Convertir a base64url
  return base64
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/**
 * Firma el token con la private key RSA del Service Account
 */
async function signWithPrivateKey(data: string, privateKeyPEM: string): Promise<ArrayBuffer> {
  // Limpiar el PEM (quitar headers y newlines)
  const pemContents = privateKeyPEM
    .replace('-----BEGIN PRIVATE KEY-----', '')
    .replace('-----END PRIVATE KEY-----', '')
    .replace(/\s/g, '');

  // Decodificar base64 a binary
  const binaryDer = atob(pemContents);
  const binaryDerArray = new Uint8Array(binaryDer.length);
  for (let i = 0; i < binaryDer.length; i++) {
    binaryDerArray[i] = binaryDer.charCodeAt(i);
  }

  // Importar la private key
  const privateKey = await crypto.subtle.importKey(
    'pkcs8',
    binaryDerArray.buffer,
    {
      name: 'RSASSA-PKCS1-v1_5',
      hash: 'SHA-256'
    },
    false,
    ['sign']
  );

  // Firmar el data
  const dataBuffer = new TextEncoder().encode(data);
  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    privateKey,
    dataBuffer
  );

  return signature;
}

/**
 * Obtiene un access token usando el JWT del Service Account
 */
export async function getServiceAccountAccessToken(
  credential: GoogleServiceAccountCredential,
  customScopes?: string[]
): Promise<string> {
  const scopes = customScopes || credential.data.scopes || DEFAULT_SCOPES;
  const delegatedUser = credential.data.delegatedUser;

  // 1. Crear JWT firmado
  const jwt = await createJWT(credential.data, scopes, delegatedUser);

  // 2. Intercambiar JWT por access token
  const response = await fetch(credential.data.token_uri, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    let errorData;
    try {
      errorData = JSON.parse(errorText);
    } catch {
      errorData = { error: errorText };
    }
    
    if (response.status === 400) {
      if (errorData.error === 'unauthorized_client') {
        throw new Error(`❌ Service Account no autorizada. Para usar Gmail con Service Account necesitas:\n\n1. Ir a Google Workspace Admin Console\n2. Security > API Controls > Domain-wide Delegation\n3. Agregar tu Client ID: ${credential.data.client_id}\n4. Scopes: https://www.googleapis.com/auth/gmail.readonly, https://www.googleapis.com/auth/gmail.send\n\n💡 ALTERNATIVA MÁS SIMPLE: Usa Google OAuth en lugar de Service Account.`);
      }
      throw new Error(`❌ Service Account inválida (400): ${errorData.error_description || errorData.error}\n\n💡 Para Gmail, es más fácil usar Google OAuth.`);
    }
    
    throw new Error(`Failed to get Service Account token: ${response.status} - ${errorText}`);
  }

  const tokenData: TokenResponse = await response.json();
  return tokenData.access_token;
}

/**
 * Valida que un JSON sea un Service Account válido
 */
export function validateServiceAccountJSON(json: any): boolean {
  return (
    json &&
    json.type === 'service_account' &&
    json.project_id &&
    json.private_key &&
    json.client_email &&
    json.token_uri
  );
}

/**
 * Parsea un JSON string de Service Account
 */
export function parseServiceAccountJSON(jsonString: string): GoogleServiceAccountCredential['data'] | null {
  try {
    const parsed = JSON.parse(jsonString);
    if (validateServiceAccountJSON(parsed)) {
      return parsed;
    }
    return null;
  } catch (error) {
    return null;
  }
}
