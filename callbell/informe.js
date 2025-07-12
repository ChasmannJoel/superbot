import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Para obtener el path de la carpeta actual (ESM)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuración
const BUFFER_HORAS = 3;
const admins = [
'publicidadcyber3071@gmail.com',
'cyberpublicidades@gmail.com'
];

// Cargar mapeo de paneles (mail → panel)
const equiposPath = path.join(__dirname, 'equipos.json');
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

// Cargar contactos
const contactosPath = path.join(__dirname, 'contactos.json');
const contactos = JSON.parse(fs.readFileSync(contactosPath, 'utf8')); // array de contactos

// Fechas
const ahora = new Date();
const hoyBA = new Date(ahora.toLocaleString('en-US', { timeZone: 'America/Argentina/Buenos_Aires' }));
hoyBA.setHours(0, 0, 0, 0);
const fechaInicioBusqueda = new Date(hoyBA.getTime() - BUFFER_HORAS * 60 * 60 * 1000);

// Inicializar estructura de reporte
const reporte = {};

// Procesar contactos
contactos.forEach(contacto => {
if (!contacto.createdAt) return;

const fechaContacto = new Date(contacto.createdAt);
if (fechaContacto < fechaInicioBusqueda) return;
if (fechaContacto < hoyBA) return;

const correo = contacto.assignedUser || "albertocyberpubli@gmail.com";
let panel = PANELES[correo] || "Sin Asignar";

// Origen del mensaje
const url = contacto.customFields?.["whatsapp cloud ad source url"] || "Sin campaña";

if (!reporte[panel]) {
  reporte[panel] = { total: 0, origenes: {}, usuarios: {} };
}
reporte[panel].total++;
reporte[panel].origenes[url] = (reporte[panel].origenes[url] || 0) + 1;
reporte[panel].usuarios[correo] = (reporte[panel].usuarios[correo] || 0) + 1;
});

// Mostrar reporte en consola y guardar como JSON
const filas = [];
console.log("Panel\tTotal mensajes hoy\tDetalle por origen\tTotales por usuario");
for (const [panel, info] of Object.entries(reporte)) {
  const detalle = Object.entries(info.origenes)
    .map(([url, count]) => `${url}: ${count}`)
    .join(" | ");
  const usuarios = Object.entries(info.usuarios)
    .map(([correo, count]) => `${correo}: ${count}`)
    .join(" | ");
  console.log(`${panel}\t${info.total}\t${detalle}\t${usuarios}`);
  filas.push({
    panel,
    total_mensajes_hoy: info.total,
    detalle_por_origen: info.origenes,
    totales_por_usuario: info.usuarios
  });
}

// Guardar el resultado en un archivo JSON en la misma carpeta
const reportePath = path.join(__dirname, 'reporte_paneles.json');
fs.writeFileSync(reportePath, JSON.stringify(filas, null, 2), 'utf8');
console.log('Reporte generado en reporte_paneles.json');