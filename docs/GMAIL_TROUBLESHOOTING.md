# 🩺 Gmail Integration - Guía de Resolución de Problemas

## 🔴 Error: Service Account da 400

### Síntomas
```
❌ Service Account inválida (400): unauthorized_client
```

### Causa
Gmail API **NO funciona** con Service Account sin configuración adicional compleja.

### Solución
**Opción 1 (RECOMENDADA)**: Usa Google OAuth en lugar de Service Account
- Más simple
- Funciona sin Google Workspace Admin
- 5 minutos de configuración
- [Ver guía de Google OAuth](./GOOGLE_OAUTH_SETUP.md)

**Opción 2 (AVANZADA)**: Configurar Domain-Wide Delegation
Solo si tienes Google Workspace Admin Console:
1. Ve a: https://admin.google.com/
2. Security → API Controls → Domain-wide Delegation
3. Add new client ID
4. Client ID: El de tu Service Account (campo `client_id` del JSON)
5. OAuth scopes:
   ```
   https://www.googleapis.com/auth/gmail.readonly,https://www.googleapis.com/auth/gmail.send
   ```
6. Authorize
7. En Silver Fleet: Edita tu credencial Service Account
8. Agrega campo `delegatedUser` con tu email completo

---

## 🔴 Error: Google OAuth da error de n8n

### Síntomas
- `redirect_uri_mismatch`
- Error menciona n8n o URLs no reconocidas
- `invalid_client`

### Causa
Estás usando Client ID y Client Secret **de n8n**, no tuyas.

### Solución
Necesitas crear TU PROPIO proyecto OAuth en Google Cloud Console.

**[📖 Sigue la guía paso a paso](./GOOGLE_OAUTH_SETUP.md)** (5 minutos)

Resumen:
1. Crear proyecto en Google Cloud Console
2. Habilitar Gmail API
3. Configurar OAuth Consent Screen
4. Crear credenciales OAuth 2.0 con redirect URI: `http://localhost:5173/oauth/callback`
5. Copiar Client ID y Secret a Silver Fleet

---

## 🔴 Error: Token expirado o revocado

### Síntomas
```
❌ Token expirado o revocado. Necesitas autorizar nuevamente
invalid_grant
```

### Causa
- Tu refresh token fue revocado manualmente desde tu cuenta Google
- Cambiaste las credenciales OAuth (Client ID/Secret)
- Pasaron 6 meses sin usar la app (Google revoca automáticamente)

### Solución
1. Ve a **Gestión de Credenciales**
2. Edita la credencial Google OAuth
3. Clic en **"Autorizar con Google"** de nuevo
4. Permitir permisos
5. ✅ Nuevo refresh token obtenido

---

## 🔴 Error: redirect_uri_mismatch

### Síntomas
```
Error 400: redirect_uri_mismatch
The redirect URI in the request, http://localhost:5173/oauth/callback, does not match
```

### Causa
Tu puerto cambió o no agregaste la URL correcta en Google Cloud Console.

### Solución
1. Ve a: https://console.cloud.google.com/apis/credentials
2. Edita tu OAuth 2.0 Client ID
3. En **"URIs de redireccionamiento autorizados"**, agrega:
   ```
   http://localhost:5173/oauth/callback
   http://localhost:3000/oauth/callback
   http://localhost:5174/oauth/callback
   ```
   (Agrega todos los puertos que uses)
4. Guardar
5. Espera 5 minutos a que propague
6. Intenta de nuevo en Silver Fleet

---

## 🔴 Error: access_denied

### Síntomas
```
Error: access_denied
The OAuth client was not found or access was denied
```

### Causa
Tu app está en modo "Testing" y tu email NO está agregado como test user.

### Solución
1. Ve a: https://console.cloud.google.com/apis/credentials/consent
2. Sección **"Test users"**
3. **Add Users**
4. Agregar tu email de Gmail
5. Guardar
6. Intenta de nuevo

---

## 🔴 Error: Test Connection falla con 401

### Síntomas
Test Connection muestra:
```
❌ Error al listar etiquetas
401 Unauthorized
```

### Causa
El access token no es válido o los scopes son insuficientes.

### Solución
1. Verifica que hayas autorizado con Google (refresh token presente)
2. Si existe refresh token:
   - Borra la credencial
   - Créala de nuevo
   - Autoriza desde cero
3. Verifica en Google Cloud Console que los scopes incluyan:
   - `https://www.googleapis.com/auth/gmail.readonly`
   - `https://www.googleapis.com/auth/gmail.send`

---

## ✅ Cómo verificar que TODO está OK

### Checklist de validación

1. **En Google Cloud Console** (https://console.cloud.google.com/):
   - ✅ Proyecto creado
   - ✅ Gmail API habilitada (APIs & Services → Library)
   - ✅ OAuth Consent Screen configurado
   - ✅ Tu email agregado como test user
   - ✅ Credenciales OAuth 2.0 creadas
   - ✅ Redirect URI incluye: `http://localhost:5173/oauth/callback`

2. **En Silver Fleet**:
   - ✅ Credencial creada de tipo "Google OAuth"
   - ✅ Client ID pegado (formato: `xxxxx.apps.googleusercontent.com`)
   - ✅ Client Secret pegado
   - ✅ Clic en "Autorizar con Google" completado
   - ✅ Refresh Token obtenido (se muestra en el formulario)

3. **Test Connection**:
   - ✅ Muestra: `✅ Conectado como tu-email@gmail.com`
   - ✅ Lista etiquetas de Gmail correctamente

---

## 📞 Si nada funciona

### Debug avanzado

1. **Abre la consola del navegador** (F12)
2. Ve a la pestaña **Console**
3. Intenta conectar/autorizar
4. Copia los errores en rojo
5. Busca mensajes que digan:
   - `error_description`
   - `invalid_grant`
   - `unauthorized_client`
   - etc.

### Información útil para reportar bug
- Mensaje de error completo
- Tipo de credencial (OAuth o Service Account)
- Si el popup de Google se abre o no
- Si llegaste a la pantalla de permisos de Google

---

## 🔗 Enlaces útiles

- **Guía de configuración OAuth**: [GOOGLE_OAUTH_SETUP.md](./GOOGLE_OAUTH_SETUP.md)
- **Google Cloud Console**: https://console.cloud.google.com/
- **Gmail API Reference**: https://developers.google.com/gmail/api
- **OAuth 2.0 Playground** (testing): https://developers.google.com/oauthplayground/
- **Verificar permisos de apps**: https://myaccount.google.com/permissions
