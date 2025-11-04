# 🔐 Configuración de Google OAuth para Silver Fleet

## ❌ Problema Común: "Error de n8n"

Si ves errores como:
- `redirect_uri_mismatch`
- `invalid_client`
- Referencia a n8n en el error

**El problema es**: Estás usando Client ID y Client Secret de n8n, NO tuyas.

---

## ✅ Solución: Crear TU PROPIO Proyecto OAuth

### Paso 1: Crear Proyecto en Google Cloud Console

1. Ve a: https://console.cloud.google.com/
2. Clic en el selector de proyectos (arriba izquierda)
3. **Nuevo Proyecto**
4. Nombre: `Silver Fleet Auditor` (o el que quieras)
5. **Crear**

### Paso 2: Habilitar Gmail API

1. En el menú lateral: **APIs & Services** → **Library**
2. Buscar: `Gmail API`
3. **Habilitar**
4. (Opcional) También habilitar: Calendar API, Drive API, Sheets API

### Paso 3: Configurar OAuth Consent Screen

1. **APIs & Services** → **OAuth consent screen**
2. Tipo de usuario: **Externo** (funciona sin Google Workspace)
3. **Crear**
4. Llenar formulario:
   - Nombre de la app: `Silver Fleet Auditor`
   - Email de soporte: tu email
   - Logo: opcional
   - Dominio autorizado: `localhost` (para desarrollo)
   - Email del desarrollador: tu email
5. **Guardar y Continuar**
6. **Scopes**: Agregar estos scopes:
   - `https://www.googleapis.com/auth/gmail.readonly`
   - `https://www.googleapis.com/auth/gmail.send`
   - `https://www.googleapis.com/auth/calendar` (opcional)
   - `https://www.googleapis.com/auth/calendar.events` (opcional)
7. **Guardar y Continuar**
8. **Test users**: Agregar tu email de Gmail
9. **Guardar y Continuar**

### Paso 4: Crear Credenciales OAuth 2.0

1. **APIs & Services** → **Credentials**
2. **Create Credentials** → **OAuth client ID**
3. Tipo de aplicación: **Web application**
4. Nombre: `Silver Fleet Web Client`
5. **URIs de redireccionamiento autorizados**:
   ```
   http://localhost:5173/oauth/callback.html
   http://localhost:3000/oauth/callback.html
   ```
   (Agrega ambos por si cambias el puerto - **IMPORTANTE**: incluye `.html`)
6. **Crear**
7. **¡IMPORTANTE!** Copia el **Client ID** y **Client Secret**

### Paso 5: Configurar en Silver Fleet

⚠️ **IMPORTANTE**: Debes permitir popups en tu navegador. [Ver guía de popups](./POPUP_BLOCKED_FIX.md)

1. En Silver Fleet: **Gestión de Credenciales** → **Nueva Credencial**
2. Tipo: **Google OAuth**
3. Pegar:
   - **Client ID**: El que copiaste (empieza con algo como `123456789.apps.googleusercontent.com`)
   - **Client Secret**: El secreto (string random de ~35 caracteres)
4. **Autorizar con Google** → Se abre **ventana popup pequeña** (si se abre pestaña completa, [sigue esta guía](./POPUP_BLOCKED_FIX.md))
5. Seleccionar tu cuenta
6. **Permitir** todos los permisos
7. ✅ Listo, deberías ver "Refresh Token obtenido"

---

## 🔍 Verificación

Si todo está bien:
- ✅ Puedes hacer "Test Connection" y ver: `✅ Conectado como tu-email@gmail.com`
- ✅ Puedes ver tus etiquetas de Gmail

Si hay errores:
- ❌ `redirect_uri_mismatch`: La URL del paso 5 no coincide con tu puerto actual
- ❌ `invalid_client`: Client ID o Secret incorrectos
- ❌ `access_denied`: No agregaste tu email como test user

---

## 🆚 Google OAuth vs Service Account

| Criterio | Google OAuth | Service Account |
|----------|--------------|-----------------|
| Configuración | Media (5 min) | Difícil (15+ min) |
| Gmail API | ✅ Funciona directo | ❌ Necesita Domain-Wide Delegation |
| Google Workspace | No requerido | Requerido (Admin Console) |
| Usuario | Actúa como TÚ | Actúa como bot |
| Recomendado para | Silver Fleet | Aplicaciones empresariales |

**Para Silver Fleet, usa Google OAuth**. Service Account solo si tienes Google Workspace Admin.

---

## 📝 Notas Adicionales

- **Entorno de testing**: Mientras esté en "Testing" (no publicado), solo los test users pueden autorizarse
- **Publicar app**: Si quieres que cualquiera use tu app, solicita verificación en OAuth consent screen
- **Refresh tokens**: Silver Fleet los guarda automáticamente, no caducan (a menos que revoques manualmente)

---

## 🔗 Enlaces Útiles

- Google Cloud Console: https://console.cloud.google.com/
- Gmail API Docs: https://developers.google.com/gmail/api
- OAuth 2.0 Playground: https://developers.google.com/oauthplayground/ (para testing manual)
