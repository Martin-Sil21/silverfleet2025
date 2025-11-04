/**
 * 🔐 Google OAuth Flow
 * Maneja el flujo completo de autorización OAuth 2.0 con Google
 */

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const REDIRECT_URI = window.location.origin + '/oauth/callback.html'; // .html para servir archivo estático

// Scopes para todos los servicios de Google que usamos
const SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/drive.readonly',
  'https://www.googleapis.com/auth/spreadsheets.readonly',
].join(' ');

interface OAuthTokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  scope: string;
  token_type: string;
}

/**
 * Inicia el flujo OAuth abriendo la ventana de autorización de Google
 */
export function initiateGoogleOAuth(clientId: string): Promise<string> {
  return new Promise((resolve, reject) => {
    // Generar state para prevenir CSRF
    const state = generateRandomState();
    sessionStorage.setItem('oauth_state', state);
    sessionStorage.setItem('oauth_client_id', clientId);

    // Construir URL de autorización
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: REDIRECT_URI,
      response_type: 'code',
      scope: SCOPES,
      access_type: 'offline', // Para obtener refresh token
      prompt: 'consent', // Forzar pantalla de consentimiento para obtener refresh token
      state: state,
    });

    const authUrl = `${GOOGLE_AUTH_URL}?${params.toString()}`;

    // Abrir ventana popup con configuración mejorada
    const width = 600;
    const height = 700;
    const left = window.screenX + (window.outerWidth - width) / 2;
    const top = window.screenY + (window.outerHeight - height) / 2;

    const popup = window.open(
      authUrl,
      'GoogleOAuthPopup',
      `popup=yes,width=${width},height=${height},left=${left},top=${top},toolbar=no,location=no,status=no,menubar=no,scrollbars=yes,resizable=yes`
    );

    if (!popup || popup.closed || typeof popup.closed === 'undefined') {
      reject(new Error('❌ No se pudo abrir la ventana de autorización.\n\n✅ Solución:\n1. Habilita popups para localhost en tu navegador\n2. Busca el ícono 🚫 en la barra de direcciones\n3. Permite popups y recarga la página'));
      return;
    }
    
    // Forzar foco en el popup
    popup.focus();

    // Escuchar mensaje del callback
    const messageHandler = (event: MessageEvent) => {
      // Verificar origen
      if (event.origin !== window.location.origin) return;

      if (event.data.type === 'OAUTH_SUCCESS') {
        window.removeEventListener('message', messageHandler);
        popup.close();
        resolve(event.data.code);
      } else if (event.data.type === 'OAUTH_ERROR') {
        window.removeEventListener('message', messageHandler);
        popup.close();
        reject(new Error(event.data.error));
      }
    };

    window.addEventListener('message', messageHandler);

    // Verificar si la ventana se cerró sin completar
    const checkClosed = setInterval(() => {
      if (popup.closed) {
        clearInterval(checkClosed);
        window.removeEventListener('message', messageHandler);
        reject(new Error('Autorización cancelada por el usuario'));
      }
    }, 1000);
  });
}

/**
 * Intercambia el código de autorización por tokens
 */
export async function exchangeCodeForTokens(
  code: string,
  clientId: string,
  clientSecret: string
): Promise<OAuthTokenResponse> {
  try {
    const response = await fetch(GOOGLE_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        code: code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: REDIRECT_URI,
        grant_type: 'authorization_code',
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error_description || 'Error intercambiando código por tokens');
    }

    const tokens: OAuthTokenResponse = await response.json();
    
    if (!tokens.refresh_token) {
      throw new Error('No se recibió refresh token. Intenta revocar el acceso en tu cuenta de Google y vuelve a autorizar.');
    }

    return tokens;
  } catch (error) {
    console.error('Error exchanging code for tokens:', error);
    throw error;
  }
}

/**
 * Genera un estado aleatorio para CSRF protection
 */
function generateRandomState(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * Valida el state recibido del callback
 */
export function validateState(receivedState: string): boolean {
  const storedState = sessionStorage.getItem('oauth_state');
  sessionStorage.removeItem('oauth_state');
  return storedState === receivedState;
}

/**
 * Obtiene el Client ID almacenado temporalmente
 */
export function getStoredClientId(): string | null {
  const clientId = sessionStorage.getItem('oauth_client_id');
  sessionStorage.removeItem('oauth_client_id');
  return clientId;
}
