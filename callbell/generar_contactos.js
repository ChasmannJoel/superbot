import fs from 'fs';
import path from 'path';
import fetch from 'node-fetch';
import { fileURLToPath } from 'url';

// Para obtener __dirname en módulos ES
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const API_KEYS = [
  "8bxu5GXjZQsgJ5VbEMVU2wriRHayGus2.56baa9dd6af1bb716d7a0f68a308ee49190269a241ffcfd7621dab9540ed3ff5",
  "fEXgdaNWRKuBQJxkSjaUnKexHQVvvVJB.3f43128cefee3a8e5af823c509255c1d92de8e024a522b54a7a74b8b61520ef4"
];
const API_URL = "https://api.callbell.eu/v1/contacts";
const BUFFER_HORAS = 3;
const PAGINAS_SIN_CONTACTOS_LIMITE = 5;

const ahora = new Date();
const hoy = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate());
const fechaInicioBusqueda = new Date(hoy.getTime() - (BUFFER_HORAS * 60 * 60 * 1000));

async function obtenerMensajesContacto(apiKey, contactoUuid) {
  const url = `https://api.callbell.eu/v1/contacts/${contactoUuid}/messages`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${apiKey}` }
  });
  if (!res.ok) {
    console.error(`Error obteniendo mensajes para contacto ${contactoUuid}:`, res.statusText);
    return [];
  }
  const data = await res.json();
  return data.messages || [];
}
async function obtenerInfoContacto(apiKey, contactoUuid) {
  const url = `https://api.callbell.eu/v1/contacts/${contactoUuid}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${apiKey}` }
  });
  if (!res.ok) {
    console.error(`Error obteniendo info para contacto ${contactoUuid}:`, res.statusText);
    return {};
  }
  return await res.json();
}
async function obtenerTodosContactosHoy(apiKey) {
  let contactosHoy = [];
  let page = 1;
  let paginasSinContactosHoy = 0;

  while (paginasSinContactosHoy < PAGINAS_SIN_CONTACTOS_LIMITE) {
    const url = `${API_URL}?page=${page}&sort=-createdAt`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${apiKey}` }
    });
    if (!res.ok) {
      console.error(`Error en página ${page}:`, res.statusText);
      break;
    }
    const data = await res.json();
    const contactosPagina = data.contacts || [];

    // Filtrar contactos de hoy (incluyendo buffer de seguridad)
    const contactosHoyEnPagina = contactosPagina.filter(contacto => {
      if (!contacto.createdAt) return false;
      const fechaContacto = new Date(contacto.createdAt);
      return fechaContacto >= fechaInicioBusqueda;
    });

    if (contactosHoyEnPagina.length > 0) {
      // Filtrar solo los que son estrictamente de hoy
      const contactosEstrictamenteHoy = contactosHoyEnPagina.filter(contacto => {
        const fechaContacto = new Date(contacto.createdAt);
        return fechaContacto >= hoy;
      });

      // Hacer las peticiones de mensajes/info en paralelo
      await Promise.all(contactosEstrictamenteHoy.map(async (contacto) => {
        [contacto.messages, contacto.info] = await Promise.all([
          obtenerMensajesContacto(apiKey, contacto.uuid),
          obtenerInfoContacto(apiKey, contacto.uuid)
        ]);
      }));

      contactosHoy = contactosHoy.concat(contactosEstrictamenteHoy);
      paginasSinContactosHoy = 0;
      console.log(`Página ${page}: ${contactosEstrictamenteHoy.length} contactos de hoy`);
    } else {
      paginasSinContactosHoy++;
      console.log(`Página ${page}: 0 contactos de hoy (${paginasSinContactosHoy}/${PAGINAS_SIN_CONTACTOS_LIMITE})`);
    }

    if (contactosPagina.length < 20) break; // Última página
    page++;
    await new Promise(r => setTimeout(r, 300)); // Pausa para no saturar la API
  }
  return contactosHoy;
}

(async () => {
  // Pedir a todas las API keys en paralelo
  const resultados = await Promise.all(API_KEYS.map(apiKey => obtenerTodosContactosHoy(apiKey)));
  const todosContactos = resultados.flat();

  // Guarda el JSON en la misma carpeta que este script
  const rutaArchivo = path.join(__dirname, 'contactos.json');
  fs.writeFileSync(rutaArchivo, JSON.stringify(todosContactos, null, 2), 'utf8');
  console.log(`contactos.json generado con ${todosContactos.length} contactos (con mensajes incluidos).`);
})();