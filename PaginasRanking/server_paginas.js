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

// Endpoint para ejecutar fetch_and_save.js
app.post('/actualizar', async (req, res) => {
  try {
    const { force } = req.body;
    
    exec('node fetch_and_save.js' + (force ? ' --force' : ''), 
      { cwd: __dirname }, 
      (err, stdout, stderr) => {
        
        if (err) {
          console.error('Error en exec:', stderr);
          return res.status(500).json({ 
            error: 'Error al ejecutar el script',
            details: stderr 
          });
        }
        
        console.log('Script ejecutado:', stdout);
        res.json({ 
          success: true,
          mensaje: 'Actualización ejecutada', 
          salida: stdout,
          timestamp: new Date().toISOString()
        });
    });
    
  } catch (error) {
    console.error('Error en endpoint /actualizar:', error);
    res.status(500).json({ 
      error: 'Error interno del servidor',
      details: error.message 
    });
  }
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