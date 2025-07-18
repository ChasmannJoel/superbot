import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ogTitlesPath = path.join(__dirname, 'og_titles.json');
const pendientesPath = path.join(__dirname, 'og_pendientes.json');

const app = express();
const PORT = 3333;

app.get('/og_titles', (req, res) => {
  try {
    const data = fs.readFileSync(ogTitlesPath, 'utf8');
    res.type('application/json').send(data);
  } catch (err) {
    res.status(404).json({ error: 'og_titles.json no encontrado', details: err.message });
  }
});

app.get('/og_pendientes', (req, res) => {
  try {
    const data = fs.readFileSync(pendientesPath, 'utf8');
    res.type('application/json').send(data);
  } catch (err) {
    res.status(404).json({ error: 'og_pendientes.json no encontrado', details: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`Servidor de og_titles y og_pendientes corriendo en http://localhost:${PORT}`);
});
