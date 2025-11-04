# 🚫 Solución: Popup Bloqueado en OAuth

## Síntoma

Al hacer clic en "Autorizar con Google", ocurre uno de estos problemas:
1. **Se abre en pestaña nueva** en lugar de ventana popup pequeña
2. **No pasa nada** o aparece error "No se pudo abrir ventana"
3. **La autorización completa pero no continúa** - te quedas en "Autorizando..."

## Causa

Los navegadores bloquean popups por defecto para prevenir spam y publicidad molesta. OAuth requiere popup para funcionar correctamente.

---

## ✅ Solución por Navegador

### Google Chrome / Edge / Brave

1. **Mira la barra de direcciones** (arriba)
2. Verás un ícono 🚫 o similar a la derecha
3. **Haz clic** en ese ícono
4. Selecciona: **"Permitir siempre popups en localhost"** o **"Allow popups from this site"**
5. **Recarga la página** (F5)
6. Intenta autorizar de nuevo

**Alternativa - Configuración manual**:
1. Clic en el menú (3 puntos) → **Configuración / Settings**
2. **Privacidad y seguridad** → **Configuración de sitios / Site settings**
3. **Ventanas emergentes y redireccionamientos / Pop-ups and redirects**
4. En **"Pueden enviar ventanas emergentes"** → **Agregar**
5. URL: `http://localhost:3000` (o el puerto que uses)
6. **Agregar**

### Firefox

1. **Mira la barra de direcciones** (arriba izquierda)
2. Verás un ícono con una X o un círculo tachado
3. **Haz clic** y selecciona **"Permitir ventanas emergentes para localhost"**
4. **Recarga** la página
5. Intenta de nuevo

**Alternativa - Configuración manual**:
1. Menú → **Configuración / Settings**
2. **Privacidad y seguridad**
3. En **"Permisos"** → **Ventanas emergentes** → **Excepciones**
4. Agregar: `http://localhost:3000`
5. **Permitir** → **Guardar cambios**

### Safari (Mac)

1. Menú **Safari** → **Configuración / Preferences**
2. Pestaña **Websites**
3. En la barra lateral izquierda: **Pop-up Windows**
4. Encuentra `localhost` en la lista
5. Cambiar a: **Permitir / Allow**
6. Cerrar configuración

---

## 🔍 Cómo saber si funcionó

Cuando vuelvas a hacer clic en "Autorizar con Google":
- ✅ **Se abre ventana PEQUEÑA separada** (600x700px aproximadamente)
- ✅ **Ves la pantalla de Google** pidiendo seleccionar cuenta
- ✅ **Después de autorizar, la ventana se cierra automáticamente**
- ✅ **En la app principal ves** "Refresh Token obtenido"

Si sigue sin funcionar, abre **Consola del navegador** (F12):
- Ve a la pestaña **Console**
- Intenta autorizar
- Busca mensajes que digan:
  - `🔐 OAuth Callback ejecutado`
  - `🪟 window.opener:` (debe decir "presente", NO "NULL")

---

## 🆘 Si aún no funciona

### Problema: Se abre en pestaña pero window.opener es NULL

**Causa**: El navegador abrió como pestaña en vez de popup.

**Solución**:
1. Asegúrate de seguir los pasos de arriba para permitir popups
2. **Cierra TODAS las pestañas de localhost**
3. **Recarga** completamente el navegador
4. Vuelve a `http://localhost:3000`
5. Intenta de nuevo

### Problema: Error "ventana padre no encontrada"

**Causa**: La ventana principal se cerró o el origen no coincide.

**Solución**:
1. **NO cierres** la pestaña principal mientras autorizas
2. Verifica que ambas URLs usen el mismo puerto (ambas `localhost:3000`)
3. Si cambiaste de puerto, actualiza redirect URI en Google Cloud Console

### Problema: "No se puede comunicar con la ventana principal"

**Causa**: Política de seguridad del navegador bloqueando postMessage.

**Solución**:
1. Ve a **Configuración del navegador**
2. **Privacidad y seguridad**
3. **Desactiva** temporalmente "Protección mejorada contra rastreo" (Firefox) o "Navegación segura mejorada" (Chrome)
4. Intenta de nuevo
5. (Puedes reactivarlo después)

---

## 🎯 Verificación Rápida

Antes de intentar OAuth, prueba esto:
1. Abre la **Consola del navegador** (F12)
2. En la pestaña **Console**, pega:
   ```javascript
   window.open('https://google.com', 'test', 'width=400,height=400')
   ```
3. Presiona **Enter**
4. **¿Se abrió ventana pequeña?**
   - ✅ **SÍ**: Popups habilitados, OAuth debería funcionar
   - ❌ **NO**: Popups bloqueados, sigue pasos de arriba

---

## 📚 Referencias

- Chrome Popup Settings: `chrome://settings/content/popups`
- Firefox Popup Settings: `about:preferences#privacy`
- Edge Popup Settings: `edge://settings/content/popups`

---

## ⚠️ Nota de Seguridad

**¿Por qué necesitamos popups?**

OAuth 2.0 requiere abrir la página de autorización de Google en una ventana separada. Esto:
- ✅ Mantiene tus credenciales seguras (Google las maneja, no nosotros)
- ✅ Previene phishing (ves la URL real de Google)
- ✅ Permite comunicación entre ventanas de forma segura

**Solo habilita popups para localhost** (desarrollo). No debes hacer esto para sitios web aleatorios.
