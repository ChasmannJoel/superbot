#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const META_JSON = path.join(__dirname, '..', 'meta', 'campanias_meta_ads.json');
const META_AYER_JSON = path.join(__dirname, '..', 'ayer', 'campanias_meta_ads.json');
const CLIENTIFY_JSON = path.join(__dirname, '..', 'clientify', 'reporte_paneles2.json');
const OUTPUT_DIR = path.join(__dirname, 'salidas');

function parseArgs(argv) {
  const args = {};
  argv.forEach((arg) => {
    if (!arg.startsWith('--')) return;
    const [key, value] = arg.slice(2).split('=');
    args[key] = value === undefined ? true : value;
  });
  return args;
}

function toDate(value) {
  if (!value) return new Date();
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Fecha inválida: ${value}. Usa el formato YYYY-MM-DD.`);
  }
  return date;
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function readJson(filePath) {
  if (!fs.existsSync(filePath)) {
    return null;
  }
  const raw = fs.readFileSync(filePath, 'utf8');
  return JSON.parse(raw);
}

function formatDate(date) {
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${day}/${month}`;
}

function flattenCampanias(metaData) {
  if (!metaData || !Array.isArray(metaData.equipos)) return [];
  const campanias = [];
  metaData.equipos.forEach((equipo) => {
    equipo.cuentas?.forEach((cuenta) => {
      cuenta.campanias?.forEach((campania) => {
        campanias.push({
          equipo: equipo.nombre,
          cuentaId: cuenta.id,
          cuentaNombre: cuenta.nombre || cuenta.id,
          ...campania,
        });
      });
    });
  });
  return campanias;
}

function parseNombreFecha(nombre) {
  if (typeof nombre !== 'string') return null;
  const match = nombre.match(/\((\d{2}\/\d{2})\)/);
  return match ? match[1] : null;
}

function describeCampania(campania) {
  const mensajes = campania.metricas_diarias?.messages ?? 0;
  const gasto = campania.metricas_diarias?.spend ?? 0;
  const costo = campania.metricas_diarias?.costoPorMensaje ?? 0;
  const estado = campania.estado ?? 'DESCONOCIDO';
  return `${campania.nombre} | Estado: ${estado} | Msj: ${mensajes} | $${gasto.toFixed(2)} | Costo/Msj: $${costo.toFixed(2)}`;
}

function listarCampaniasNuevas(campanias, fechaCorta) {
  return campanias
    .filter((campania) => parseNombreFecha(campania.nombre) === fechaCorta)
    .map((campania) => `- ${describeCampania(campania)}`);
}

function listarCampaniasObjetivo(campanias, objetivoMensajes) {
  return campanias
    .filter((campania) => (campania.metricas_diarias?.messages ?? 0) >= objetivoMensajes)
    .map((campania) => `- ${describeCampania(campania)}`);
}

function listarCampaniasCaidas(campanias) {
  return campanias
    .filter((campania) => {
      const mensajes = campania.metricas_diarias?.messages;
      return (campania.estado === 'ACTIVE' || campania.estado === 'PAUSED') && (!mensajes || mensajes === 0);
    })
    .map((campania) => `- ${describeCampania(campania)}`);
}

function listarCampaniasCaras(campanias, umbralCosto) {
  return campanias
    .flatMap((campania) => {
      const adsets = Array.isArray(campania.adsets) ? campania.adsets : [];
      return adsets
        .filter((adset) => (adset.costoPorResultado ?? 0) > umbralCosto)
        .map((adset) => `- ${campania.nombre} | Adset: ${adset.adset_name} | Msj: ${adset.resultados ?? 0} | Costo/Resultado: $${(adset.costoPorResultado ?? 0).toFixed(2)}`);
    });
}

function listarCampaniasPausadas(campanias) {
  return campanias
    .flatMap((campania) => {
      const adsets = Array.isArray(campania.adsets) ? campania.adsets : [];
      return adsets
        .filter((adset) => adset.status === 'PAUSED')
        .map((adset) => `- ${campania.nombre} | Adset: ${adset.adset_name} | Msj: ${adset.resultados ?? 0} | Costo/Resultado: $${(adset.costoPorResultado ?? 0).toFixed(2)}`);
    });
}

function mejoresCampanias(campanias, limite = 10) {
  return campanias
    .filter((campania) => (campania.metricas_diarias?.messages ?? 0) > 0)
    .sort((a, b) => {
      const mensajesA = a.metricas_diarias?.messages ?? 0;
      const mensajesB = b.metricas_diarias?.messages ?? 0;
      if (mensajesA !== mensajesB) return mensajesB - mensajesA;
      const costoA = a.metricas_diarias?.costoPorMensaje ?? Number.POSITIVE_INFINITY;
      const costoB = b.metricas_diarias?.costoPorMensaje ?? Number.POSITIVE_INFINITY;
      return costoA - costoB;
    })
    .slice(0, limite)
    .map((campania) => `- ${describeCampania(campania)}`);
}

function compararMensajesHoyAyer(campaniasHoy, campaniasAyer) {
  if (!Array.isArray(campaniasHoy) || !Array.isArray(campaniasAyer)) {
    return null;
  }
  if (!campaniasHoy.length || !campaniasAyer.length) return null;
  const indexAyer = new Map();
  campaniasAyer.forEach((campania) => {
    indexAyer.set(campania.id, campania);
  });
  const cambios = campaniasHoy
    .filter((campania) => indexAyer.has(campania.id))
    .map((campania) => {
      const yesterday = indexAyer.get(campania.id);
      const hoyMensajes = campania.metricas_diarias?.messages ?? 0;
      const ayerMensajes = yesterday.metricas_diarias?.messages ?? 0;
      const diff = hoyMensajes - ayerMensajes;
      return { campania, diff };
    })
    .filter(({ diff }) => diff !== 0)
    .sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));
  if (cambios.length === 0) return null;
  return cambios.slice(0, 10).map(({ campania, diff }) => {
    const signo = diff > 0 ? '+' : '';
    return `- ${campania.nombre} | Variación mensajes: ${signo}${diff}`;
  });
}

function seccionesPaneles(panels, umbralMensajes) {
  if (!Array.isArray(panels)) return { bajos: [], resumen: [] };
  const resumen = panels.map((panel) => {
    const campanias = Object.entries(panel.campañas || {})
      .map(([nombre, mensajes]) => `${nombre}: ${mensajes}`)
      .join(', ');
    return `- Panel ${panel.panel} | Msj: ${panel.total_mensajes_hoy} | Cargas: ${panel.cargas_hoy} | Campañas: ${campanias}`;
  });
  const bajos = panels
    .filter((panel) => (panel.total_mensajes_hoy ?? 0) < umbralMensajes)
    .map((panel) => `- ${panel.nombre || `Panel ${panel.panel}`} (${panel.total_mensajes_hoy})`);
  return { bajos, resumen };
}

function construirInformeTurno({
  fechaReporte,
  turno,
  campanias,
  panels,
  objetivoMensajes,
  umbralMensajesPanel,
  umbralCosto,
}) {
  const fechaCorta = formatDate(fechaReporte);
  const titulo = `📌 INFORME TURNO ${turno.toUpperCase()} (${fechaCorta})`;
  const nuevas = listarCampaniasNuevas(campanias, fechaCorta);
  const objetivo = listarCampaniasObjetivo(campanias, objetivoMensajes);
  const caidas = listarCampaniasCaidas(campanias);
  const pausadas = listarCampaniasPausadas(campanias);
  const caras = listarCampaniasCaras(campanias, umbralCosto);
  const { resumen: resumenPaneles, bajos: panelesBajos } = seccionesPaneles(panels, umbralMensajesPanel);

  return [
    titulo,
    'Panorama Inicial:',
    '- [Completar con resumen del turno]',
    '',
    '> 🚀 CAMPAÑAS',
    '✅ NUEVAS:',
    nuevas.length ? nuevas.join('\n') : '- (Sin registros automáticos)',
    '',
    '♻ REACTIVACIONES 00:00',
    '- [Completar en base a control manual]',
    '',
    '🚨 Pausadas (últimas 24 h):',
    pausadas.length ? pausadas.join('\n') : '- (Sin adsets en pausa detectados)',
    '',
    '⚠️ Costos elevados (>$' + umbralCosto + ' por resultado):',
    caras.length ? caras.join('\n') : '- (Sin alertas)',
    '',
    '🏁 LLEGARON AL OBJETIVO 🏁',
    objetivo.length ? objetivo.join('\n') : `- (Ninguna campaña alcanzó ${objetivoMensajes} mensajes)`,
    '',
    '⚠ CAÍDAS:',
    caidas.length ? caidas.join('\n') : '- (Sin caídas detectadas)',
    '',
    '🖥 PANELES:',
    resumenPaneles.length ? resumenPaneles.join('\n') : '- (Sin información de paneles)',
    '',
    `Paneles a reforzar (< ${umbralMensajesPanel} msj):`,
    panelesBajos.length ? panelesBajos.join('\n') : '- Todos los paneles superan el umbral',
    '',
    '🛠 TAREAS REALIZADAS:',
    '- [Enumerar tareas del turno]',
    '',
    '📢 IMPORTANTE:',
    '- [Agregar avisos y recordatorios]'
  ].join('\n');
}

function construirInformeDiario({ fechaReporte, campaniasHoy, campaniasAyer, panels, umbralMensajesPanel, umbralCosto }) {
  const fechaCorta = formatDate(fechaReporte);
  const mejores = mejoresCampanias(campaniasHoy, 10);
  const variaciones = compararMensajesHoyAyer(campaniasHoy, campaniasAyer);
  const { bajos } = seccionesPaneles(panels, umbralMensajesPanel);
  const caras = listarCampaniasCaras(campaniasHoy, umbralCosto);

  return [
    `✨ Informe Manuela – ${fechaCorta}`,
    '1. PAGO CAPTURAS: Capturas ok. ✅',
    '2. RENDIMIENTO DE PANELES',
    '',
    '📊 Paneles con menos de ' + umbralMensajesPanel + ' msj. (REFORZAR EL CAUDAL):',
    bajos.length ? bajos.join('\n') : '- Todos los paneles superan el umbral',
    '',
    '📊 Costo por mensaje > $' + umbralCosto + ' (chequear gasto y creatividades):',
    caras.length ? caras.join('\n') : '- Todas las campañas dentro del presupuesto esperado',
    '',
    '✅ MEJORES CAMPAÑAS Y FLYERS',
    mejores.length ? mejores.join('\n') : '- No hay campañas activas con mensajes registrados',
    '',
    variaciones ? '📈 Variación vs ayer:' : null,
    variaciones ? (variaciones.length ? variaciones.join('\n') : '- Sin cambios respecto a ayer') : null,
  ]
    .filter((line) => line !== null && line !== undefined)
    .join('\n');
}

const args = parseArgs(process.argv.slice(2));
const fechaReporte = toDate(args.fecha);
const turno = (args.turno || 'manana').toLowerCase();
const objetivoMensajes = Number(args.objetivoMensajes ?? 60);
const umbralMensajesPanel = Number(args.umbralMensajesPanel ?? 100);
const umbralCosto = Number(args.umbralCostoMensaje ?? 1.2);

const campaniasHoyRaw = readJson(META_JSON) || { equipos: [] };
const campaniasAyerRaw = readJson(META_AYER_JSON);
const panelsHoy = readJson(CLIENTIFY_JSON) || [];

const campaniasHoy = flattenCampanias(campaniasHoyRaw);
const campaniasAyer = campaniasAyerRaw ? flattenCampanias(campaniasAyerRaw) : [];

ensureDir(OUTPUT_DIR);

const informeTurno = construirInformeTurno({
  fechaReporte,
  turno,
  campanias: campaniasHoy,
  panels: panelsHoy,
  objetivoMensajes,
  umbralMensajesPanel,
  umbralCosto,
});

const informeDiario = construirInformeDiario({
  fechaReporte,
  campaniasHoy: campaniasHoy,
  campaniasAyer: campaniasAyer,
  panels: panelsHoy,
  umbralMensajesPanel,
  umbralCosto,
});

const fechaISO = fechaReporte.toISOString().slice(0, 10);
const turnoFile = path.join(OUTPUT_DIR, `turno_${fechaISO}_${turno}.md`);
const diarioFile = path.join(OUTPUT_DIR, `diario_${fechaISO}.md`);

fs.writeFileSync(turnoFile, `${informeTurno}\n`, 'utf8');
fs.writeFileSync(diarioFile, `${informeDiario}\n`, 'utf8');

console.log(`Informe de turno generado en: ${turnoFile}`);
console.log(`Informe diario generado en: ${diarioFile}`);
