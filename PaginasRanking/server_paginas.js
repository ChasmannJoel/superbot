import express from 'express';
import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { fileURLToPath } from 'url';

// Configuración de paths para ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3078;
const HOST = '168.231.70.228';
const API_KEY = 'TU_API_KEY_SEGURA'; // Cambia esto por tu clave real

// Middleware para parsear JSON
app.use(express.json());

// Middleware de autenticación por API Key
app.use((req, res, next) => {
  const key = req.headers['x-api-key'];
  
  if (!key) {
    return res.status(401).json({ error: 'API Key no proporcionada' });
  }
  
  if (key !== API_KEY) {
    return res.status(403).json({ error: 'API Key inválida' });
  }
  
  next();
});

// Endpoint para servir el JSON
app.get('/json', (req, res) => {
  try {
    const jsonPath = path.join(__dirname, 'resultado_facebook.json');
    
    if (!fs.existsSync(jsonPath)) {
      return res.status(404).json({ 
        error: 'Archivo no encontrado',
        path: jsonPath
      });
    }
    
    const rawData = fs.readFileSync(jsonPath);
    const jsonData = JSON.parse(rawData);
    
    res.json({
      success: true,
      data: jsonData,
      lastModified: fs.statSync(jsonPath).mtime
    });
    
  } catch (error) {
    console.error('Error al leer el archivo JSON:', error);
    res.status(500).json({ 
      error: 'Error interno del servidor',
      details: error.message 
    });
  }
});

// ✅ ✅ Endpoint /actualizar modificado para responder INMEDIATAMENTE
app.post('/actualizar', (req, res) => {
  // Responder de inmediato
  res.json({
    success: true,
    mensaje: 'OK, actualización solicitada',
    timestamp: new Date().toISOString()
  });

  // Ejecutar script en segundo plano
  exec('node fetch_and_save.js --force', { cwd: __dirname }, (err, stdout, stderr) => {
    if (err) {
      console.error('Error en exec:', stderr);
      return;
    }
    console.log('Script ejecutado:', stdout);
  });
});

// Endpoint de estado del servidor
app.get('/status', (req, res) => {
  res.json({
    status: 'online',
    serverTime: new Date().toISOString(),
    memoryUsage: process.memoryUsage(),
    uptime: process.uptime()
  });
});

// Endpoint para buscar campañas por nombre en todos los días
app.get('/buscar', (req, res) => {
  const nombre = (req.query.nombre || '').toLowerCase();
  if (!nombre) {
    return res.status(400).json({ error: 'Falta el parámetro "nombre"' });
  }

  const carpetaDatos = '/root/superbot1.0/datos';
  if (!fs.existsSync(carpetaDatos)) {
    return res.status(404).json({ error: 'Carpeta de datos no encontrada' });
  }

  const resultadosPorDia = {};

  fs.readdirSync(carpetaDatos).forEach(dia => {
    const archivo = path.join(carpetaDatos, dia, 'campanias_meta_ads.json');
    if (fs.existsSync(archivo)) {
      try {
        const raw = fs.readFileSync(archivo, 'utf8');
        const data = JSON.parse(raw);
        const encontrados = [];
        data.datos.forEach(cuenta => {
          cuenta.cuentas.forEach(cuentaObj => {
            cuentaObj.campanias.forEach(campania => {
              if (campania.nombre.toLowerCase().includes(nombre)) {
                encontrados.push({
                  cuenta: cuenta.nombre,
                  nombre_campania: campania.nombre,
                  mensajes: campania.metricas_diarias.messages,
                  costoPorMensaje: campania.metricas_diarias.costoPorMensaje,
                  gasto: campania.metricas_diarias.spend
                });
              }
            });
          });
        });
        if (encontrados.length > 0) {
          resultadosPorDia[dia] = encontrados;
        }
      } catch (err) {
        // Si hay error en el archivo, lo ignora
      }
    }
  });

  if (Object.keys(resultadosPorDia).length === 0) {
    return res.json({ success: true, resultados: {}, mensaje: 'No se encontraron campañas con ese nombre.' });
  }

  res.json({ success: true, resultados: resultadosPorDia });
});

// Manejo de errores global
app.use((err, req, res, next) => {
  console.error('Error global:', err.stack);
  res.status(500).json({
    error: 'Error interno del servidor',
    details: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// Iniciar servidor
app.listen(PORT, HOST, () => {
  console.log(`🟢 Servidor escuchando en http://${HOST}:${PORT}`);
  console.log(`🔑 Ruta del archivo: ${__filename}`);
  console.log(`📂 Directorio actual: ${__dirname}`);
});

// Manejo de cierre limpio
process.on('SIGINT', () => {
  console.log('\n🔴 Apagando servidor...');
  process.exit(0);
});
