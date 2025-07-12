import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Para obtener el path de la carpeta actual (ESM)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuración
const admins = [
  'publicidadcyber3071@gmail.com',
  'cyberpublicidades@gmail.com'
];

// Cargar mapeo de paneles (mail → panel)
const equiposPath = path.join(__dirname, '..', 'callbell', 'equipos.json');
const data = JSON.parse(fs.readFileSync(equiposPath, 'utf8'));
const PANELES = {};
for (const tokenId in data) {
  for (const team of data[tokenId]) {
    const panelName = team.name.replace(/^Panel\s+/i, '').trim();
    (team.membersList || []).forEach(m => {
      if (m.email && !admins.includes(m.email)) {
        PANELES[m.email] = panelName;
      }
    });
  }
}

// Cargar contactos de ayer
const contactosPath = path.join(__dirname, 'contactos_ayer.json');
const contactos = JSON.parse(fs.readFileSync(contactosPath, 'utf8')); // Debe tener un array de contactos

// Fechas para ayer en Buenos Aires
const ahora = new Date();
const tz = 'America/Argentina/Buenos_Aires';
const hoyBA = new Date(ahora.toLocaleString('en-US', { timeZone: tz }));
hoyBA.setHours(0, 0, 0, 0);
const ayerBA = new Date(hoyBA.getTime() - 24 * 60 * 60 * 1000);
const inicioAyer = new Date(ayerBA.setHours(0, 0, 0, 0));
const finAyer = new Date(ayerBA.setHours(23, 59, 59, 999));

const contadores = {};

// Inicializar contadores por panel
Object.values(PANELES).forEach(panel => contadores[panel] = 0);

// Procesar contactos de ayer
contactos.forEach(contacto => {
  if (!contacto.createdAt) return;

  const fechaContacto = new Date(new Date(contacto.createdAt).toLocaleString('en-US', { timeZone: tz }));
  if (fechaContacto < inicioAyer || fechaContacto > finAyer) return;

  const correo = contacto.assignedUser || "albertocyberpubli@gmail.com";
  let panel = PANELES[correo] || "Sin Asignar";

  if (!contadores[panel]) contadores[panel] = 0;
  contadores[panel]++;
});

// Preparar datos para mostrar
const panelesOrdenados = Object.entries(contadores)
  .sort((a, b) => b[1] - a[1]);

// Armar el reporte final
const reporte = panelesOrdenados.map(([panel, count]) => {
  const fila = { panel, mensajes: count };
  return fila;
});

// Guardar el resultado en un archivo JSON en la misma carpeta
const reportePath = path.join(__dirname, 'reporte_paneles_ayer.json');
fs.writeFileSync(reportePath, JSON.stringify(reporte, null, 2), 'utf8');
console.log('Reporte generado en reporte_paneles_ayer.json');