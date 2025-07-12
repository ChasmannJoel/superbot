import express from 'express';
import fs from 'fs/promises'; // Usamos la versión con promises
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3020;

// Configuración de rutas absolutas
const PATHS = {
  reporte: path.join(__dirname, 'reporte_paneles_ayer.json'),
  respuestas: path.join(__dirname, 'respuestas_ayer.json'),
  contactos: path.join(__dirname, 'contactos_ayer.json'),
};


// Middleware de verificación mejorado
const checkFiles = async () => {
  const results = {};
  
  for (const [key, filePath] of Object.entries(PATHS)) {
    try {
      await fs.access(filePath, fs.constants.R_OK);
      const content = await fs.readFile(filePath, 'utf8');
      JSON.parse(content); // Validación adicional
      results[key] = { exists: true, valid: true };
    } catch (err) {
      results[key] = { 
        exists: err.code !== 'ENOENT',
        valid: false,
        error: err.message
      };
    }
  }
  
  return results;
};

// Endpoint con diagnóstico completo
app.get('/root/ayer', async (req, res) => {
  try {
    const fileStatus = await checkFiles();
    
    // Verificar si todos los archivos son válidos
    const allValid = Object.values(fileStatus).every(f => f.exists && f.valid);
    
    if (!allValid) {
      return res.status(500).json({
        error: "Problemas con los archivos",
        details: fileStatus,
        solution: "Verifique que los archivos existan y tengan formato JSON válido"
      });
    }

    // Leer archivos
    const [reporte, respuestas, contactos] = await Promise.all([
      fs.readFile(PATHS.reporte, 'utf8').then(JSON.parse),
      fs.readFile(PATHS.respuestas, 'utf8').then(JSON.parse),
      fs.readFile(PATHS.contactos, 'utf8').then(JSON.parse),
    ]);

    res.json({
      success: true,
      reportePaneles: reporte,
      respuestasPaneles: respuestas,
      ContactosCallbell: contactos
    });

  } catch (err) {
    console.error('Error en endpoint:', err);
    res.status(500).json({
      error: err.message,
      stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
    });
  }
});

// Endpoint de diagnóstico
app.get('/debug-files', async (req, res) => {
  res.json(await checkFiles());
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🛠️  Servidor de diagnóstico en http://0.0.0.0:${PORT}/debug-files`);
  console.log(`🚀 Endpoint principal en http://0.0.0.0:${PORT}/root/superbot1.0`);
});