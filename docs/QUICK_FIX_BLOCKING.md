# 🚀 SOLUCIÓN RÁPIDA: Bloqueo en n8n

## ⚡ En 3 Pasos

### **1. En n8n: Abrí el nodo de bloqueo**

El nodo que dice **"Respond to Webhook"** o similar cuando se bloquea el usuario.

---

### **2. Cambiá la configuración**

**Antes:**
```
Respond With: No Data  ❌
```

**Después:**
```
Respond With: Using Respond to Webhook Node  ✅

Body (JSON):
{
  "blocked": true,
  "reason": "Usuario bloqueado por política",
  "message": "Conversación finalizada"
}
```

---

### **3. Guardá y probá**

Cuando ejecutes la auditoría, verás:

```
🚫 "Usuario X": Usuario bloqueado por el flujo

Status: ✅ SUCCESS (no error)
```

---

## 📋 Copia y Pegá este JSON

```json
{
  "blocked": true,
  "reason": "Usuario bloqueado por [TU RAZÓN AQUÍ]",
  "message": "La conversación ha finalizado. Contactá a soporte@tuempresa.com"
}
```

**Personalizá:**
- `reason`: Por qué lo bloqueaste (interno)
- `message`: Qué le decís al usuario

---

## 🎯 Resultado

**Antes:**
```
❌ Error: Webhook devolvió respuesta vacía
```

**Ahora:**
```
✅ Usuario bloqueado correctamente
📝 BD: is_blocked = false → true
Score: 9/10
```

---

## 🔥 Casos de Uso

### **Cantidad excesiva:**
```json
{
  "blocked": true,
  "reason": "Cantidad solicitada (1000) excede límite (500)",
  "message": "Para pedidos mayores contactá a ventas@empresa.com"
}
```

### **Lenguaje inapropiado:**
```json
{
  "blocked": true,
  "reason": "Usuario utilizó lenguaje ofensivo",
  "message": "Tu cuenta ha sido suspendida"
}
```

### **Transferencia a humano:**
```json
{
  "blocked": true,
  "reason": "Consulta requiere atención humana",
  "message": "Te transfiero con un asesor..."
}
```

---

**¡Listo! Ya no te dará error cuando bloqueés usuarios** 🎉


