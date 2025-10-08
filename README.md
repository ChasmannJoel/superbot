# 📊 SuperBot - Sistema de Reportes Automáticos

Sistema automatizado para generar reportes diarios de mensajes y gastos publicitarios por panel usando Google Apps Script y APIs.

![Status](https://img.shields.io/badge/status-active-brightgreen.svg)
![Node.js](https://img.shields.io/badge/node.js-v16+-blue.svg)
![License](https://img.shields.io/badge/license-MIT-green.svg)

## 🚀 Características

- ✅ **Obtención automática de datos** desde API personalizada
- 📊 **Generación de reportes** en Google Sheets con formato profesional
- 💰 **Cálculo de gastos publicitarios** de Meta Ads integrado
- 📈 **Métricas de CPM y conversión** automáticas
- 🎨 **Formato visual atractivo** con emojis y colores
- 🔄 **Mapeo dinámico de paneles** desde Google Sheets
- 📱 **Sistema de notificaciones** vía Clientify
- 🕒 **Ejecución programada** con cron jobs

## 📁 Estructura del Proyecto

```
superbot/
├── 📂 ayer/                     # Reportes de datos del día anterior
│   ├── informe.js               # Generador principal de reportes de ayer
│   ├── fetch_ayer_meta.js       # Obtención de datos Meta Ads
│   ├── runner_ayer.js           # Ejecutor de tareas programadas
│   └── server_ayer.js           # Servidor para datos de ayer
├── 📂 clientify/                # Integración con Clientify CRM
│   ├── clientify.js             # API de Clientify
│   ├── runner_clientify.js      # Procesador de contactos
│   └── 📂 datos/                # Datos de contactos (ignorados)
├── 📂 meta/                     # Datos de Meta Ads
│   ├── fetch_meta_ads.js        # Extractor de campañas
│   └── campanias_meta_ads.json  # Datos de campañas (ignorado)
├── 📄 package.json              # Dependencias del proyecto
├── 📄 server.js                 # Servidor principal
├── 📄 runner.js                 # Ejecutor de tareas
└── 📄 README.md                 # Este archivo
```

## 🛠️ Instalación

### 1. **Clonar el repositorio**
```bash
git clone https://github.com/ChasmannJoel/superbot.git
cd superbot
```

### 2. **Instalar dependencias**
```bash
npm install
```

### 3. **Configurar variables de entorno**
```bash
# Crear archivo .env con tus credenciales
API_BASE_URL=http://168.231.70.228:3020
TIMEZONE=America/Buenos_Aires
```

### 4. **Configurar Google Apps Script**
1. Abre [Google Apps Script](https://script.google.com)
2. Crea un nuevo proyecto
3. Copia el contenido de `ayer/informe.js`
4. Configura los triggers automáticos

## ⚙️ Configuración

### **Mapeo de Paneles**

Crea una hoja llamada "PANELES" en Google Sheets con la estructura:

| Nombre Panel | Código |
|--------------|--------|
| luck         | 3      |
| denver       | 4      |
| treboldorado | 5      |
| dragon       | 6      |
| escaloneta   | 7      |
| vicemiami    | 8      |
| monaco       | 9      |
| goatgaming   | 10     |
| muchas       | 11     |
| thiagop      | 12     |

### **API Endpoints**

- **Datos de ayer:** `http://168.231.70.228:3020/root/ayer`
- **Datos de hoy:** `http://168.231.70.228:3020/root/hoy`
- **Meta Ads:** `http://168.231.70.228:3020/root/meta`

## 🎯 Uso

### **Ejecución manual**
```bash
# Generar reporte de ayer
node ayer/runner_ayer.js

# Procesar contactos Clientify
node clientify/runner_clientify.js

# Ejecutar servidor principal
npm start
```

### **Ejecución automática**
```bash
# Configurar cron jobs
# Cada día a las 9:00 AM
0 9 * * * cd /path/to/superbot && node ayer/runner_ayer.js

# Cada hora para contactos
0 * * * * cd /path/to/superbot && node clientify/runner_clientify.js
```

## 📊 Reportes Generados

### **Reporte de Mensajes de Ayer**
- ✅ Total de mensajes por panel
- 📈 Cargas realizadas y porcentaje de conversión
- 💰 Gastos publicitarios con/sin reconocimiento
- 📊 CPM calculado automáticamente
- 🎨 Formato visual con colores alternados

### **Estructura del Reporte**
```
👤 Panel      💬 Mensajes    ✅ Cargas    📊 % Carga    💸 Gasto    💵 CPM
luck          116            39           33.6%         $45.67      $0.39
denver        133            10           7.5%          $23.45      $0.18
...
```

## 🔧 Funciones Principales

### `generarReporteMensajesAyer()`
Función principal que orquesta la generación del reporte diario.

### `obtenerDatosDelServidor(apiUrl)`
Realiza petición HTTP a la API y retorna datos JSON estructurados.

### `agregarGastosPorPanelDesdeCampanias()`
Procesa datos de Meta Ads y calcula gastos por panel usando mapeo dinámico.

### `obtenerMapeoDesdeHojaPaneles()`
Lee mapeo dinámico de paneles desde Google Sheets para mayor flexibilidad.

## 🔐 Seguridad

### **Archivos protegidos por .gitignore:**
- 🔑 Credenciales y claves SSH
- 📊 Datos sensibles de Meta Ads
- 📱 Información de contactos
- 📄 Logs y reportes generados
- 🔧 Archivos de configuración local

### **Buenas prácticas implementadas:**
- ✅ Variables de entorno para credenciales
- ✅ Validación de datos de entrada
- ✅ Manejo de errores robusto
- ✅ Logs de ejecución detallados

## 📈 Métricas y Monitoreo

- 📊 **CPM automático:** (Gasto × 1.04) / Mensajes × 1000
- 📈 **Conversión:** Cargas / Mensajes × 100
- 💰 **ROI publicitario:** Seguimiento de gastos con/sin reconocimiento
- 🕒 **Logs de ejecución:** Timestamps y resultados detallados

## 🤝 Contribuir

1. **Fork** el repositorio
2. **Crea** una rama: `git checkout -b feature/nueva-funcionalidad`
3. **Commit** tus cambios: `git commit -m '✨ Agregar nueva funcionalidad'`
4. **Push** a la rama: `git push origin feature/nueva-funcionalidad`
5. **Abre** un Pull Request

### **Convenciones de commits:**
- ✨ `:sparkles:` Nueva funcionalidad
- 🐛 `:bug:` Corrección de errores
- 📝 `:memo:` Documentación
- 🔧 `:wrench:` Configuración
- 🎨 `:art:` Mejoras de formato

## 📝 Changelog

### **v1.0.0** (2025-10-07)
- ✨ Sistema inicial de reportes automáticos
- 📊 Integración con Meta Ads API
- 🎨 Formato visual con emojis
- 🔄 Mapeo dinámico de paneles

## 📄 Licencia

Este proyecto está bajo la **Licencia MIT**. Ver el archivo [LICENSE](LICENSE) para más detalles.

## 📧 Contacto

**Joel Chasmann** - alphacyberpubli@gmail.com

🔗 **Enlace del proyecto:** [https://github.com/ChasmannJoel/superbot](https://github.com/ChasmannJoel/superbot)

---

⭐ **¡Dale una estrella al proyecto si te ha sido útil!**