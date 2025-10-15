import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuración de rutas
const ORIGEN = path.join(__dirname, '..', 'clientify', 'reporte_paneles2.json');
const DESTINO = path.join(__dirname, 'reporte_paneles_ayer.json');

async function copiarReporte() {
    try {
        // Verificar que el archivo origen existe
        if (!fs.existsSync(ORIGEN)) {
            throw new Error(`Archivo origen no encontrado: ${ORIGEN}`);
        }
        
        // Leer el archivo origen
        const contenido = fs.readFileSync(ORIGEN, 'utf8');
        
        // Validar que es JSON válido
        JSON.parse(contenido);
        
        // Copiar el archivo
        fs.copyFileSync(ORIGEN, DESTINO);
        
        process.exit(0);
        
    } catch (error) {
        process.exit(1);
    }
}

// Ejecutar la copia
copiarReporte();