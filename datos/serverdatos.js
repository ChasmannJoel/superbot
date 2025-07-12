import express from 'express';
import cors from 'cors';
import fs from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const PORT = process.env.PORT || 3030;
const DATA_DIR = __dirname;

app.use(cors());
app.use(express.json());

// Middleware para log de requests
app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
    next();
});

// Endpoint para listar las fechas disponibles
app.get('/fechas', (req, res) => {
    try {
        const items = fs.readdirSync(DATA_DIR, { withFileTypes: true });
        const fechas = items
            .filter(dirent => dirent.isDirectory() && /^\d{4}-\d{2}-\d{2}$/.test(dirent.name))
            .map(dirent => dirent.name)
            .sort()
            .reverse(); // Más recientes primero

        res.json({ fechas });
    } catch (error) {
        console.error('Error al leer fechas:', error);
        res.status(500).json({ error: 'Error al leer el directorio de datos' });
    }
});

app.get('/:fecha/:archivo', (req, res) => {
    const { fecha, archivo } = req.params;

    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
        return res.status(400).json({ error: 'Formato de fecha inválido. Use YYYY-MM-DD' });
    }

    const filePath = path.join(DATA_DIR, fecha, archivo);

    if (!fs.existsSync(filePath) || !archivo.endsWith('.json')) {
        return res.status(404).json({ error: 'Archivo no encontrado o no es JSON' });
    }

    try {
        const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        res.json(data);
    } catch (error) {
        console.error(`Error al leer ${filePath}:`, error);
        res.status(500).json({ error: 'Error al leer el archivo' });
    }
});

// Endpoint para listar contenido de una fecha
app.get('/:fecha', (req, res) => {
    const { fecha } = req.params;
    
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
        return res.status(400).json({ error: 'Formato de fecha inválido. Use YYYY-MM-DD' });
    }

    const fechaPath = path.join(DATA_DIR, fecha);
    
    if (!fs.existsSync(fechaPath)) {
        return res.status(404).json({ error: 'Fecha no encontrada' });
    }

    try {
        const items = fs.readdirSync(fechaPath, { withFileTypes: true });
        const contenido = {};

        for (const item of items) {
            if (item.isDirectory()) {
                const subItems = fs.readdirSync(path.join(fechaPath, item.name));
                contenido[item.name] = subItems;
            }
        }

        res.json({ fecha, contenido });
    } catch (error) {
        console.error(`Error al leer ${fechaPath}:`, error);
        res.status(500).json({ error: 'Error al leer el directorio' });
    }
});

// Iniciar servidor
app.listen(PORT, () => {
    console.log(`Servidor de datos corriendo en http://localhost:${PORT}`);
    console.log(`Directorio de datos: ${DATA_DIR}`);
});

process.on('unhandledRejection', (err) => {
    console.error('Unhandled rejection:', err);
});
