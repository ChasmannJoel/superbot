import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Función para formatear fecha y hora en formato legible
function formatDateTime(isoString) {
  const date = new Date(isoString);
  return date.toLocaleString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });
}

// Función para formatear duración en formato legible
function formatDuration(ms) {
  const seconds = Math.floor((ms / 1000) % 60);
  const minutes = Math.floor((ms / (1000 * 60)) % 60); // <-- Paréntesis corregido aquí
  const hours = Math.floor((ms / (1000 * 60 * 60)) % 24);

  return `${hours}h ${minutes}m ${seconds}s`;
}

function calcularPromedios(contactos) {
  const resultadoPorPanel = {};
  const FRASE_CIERRE = "¡Gracias por comunicarte con nosotros! Ya podés desestimar este chat. \nPara la próxima escribinos directamente al Principal que te enviamos. 😊";

  for (const contacto of contactos) {
    const panel = contacto.team?.name || 'Desconocido';
    const mensajes = contacto.messages || [];

    // Inicializar el panel si no existe
    if (!resultadoPorPanel[panel]) {
      resultadoPorPanel[panel] = {
        conversaciones: 0,
        veces_c4rgado: 0,
        veces_frase_cierre: 0, // <-- nuevo contador
        demoras_leves: { cantidad: 0, detalles: [] },
        demoras_graves: { cantidad: 0, detalles: [] },
        promedios: [],
        demoras_totales: []
      };
    }

    resultadoPorPanel[panel].conversaciones++;

    // Verificar si se menciona 'c4rgado'
    if (mensajes.some(m => (m.text || '').toLowerCase().includes('c4rgado'))) {
      resultadoPorPanel[panel].veces_c4rgado++;
    }

    // Contar veces que aparece la frase de cierre
    const vecesFrase = mensajes.filter(m => (m.text || '').includes(FRASE_CIERRE)).length;
    resultadoPorPanel[panel].veces_frase_cierre += vecesFrase;

    // Ordenar todos los mensajes por fecha
    const mensajesOrdenados = [...mensajes].sort((a, b) => 
      new Date(a.createdAt) - new Date(b.createdAt)
    );

    const delays = [];

    for (let i = 0; i < mensajesOrdenados.length - 1; i++) {
      const current = mensajesOrdenados[i];
      const next = mensajesOrdenados[i + 1];

      // Solo calcular si el mensaje actual es recibido y el siguiente es enviado
      if (current.status === 'received' && next.status === 'sent') {
        const delayMs = new Date(next.createdAt) - new Date(current.createdAt);
        delays.push(delayMs);

        // Clasificar las demoras con información de hora
        const delayMinutes = delayMs / 1000 / 60;
        const delayObj = {
          contactoUuid: contacto.uuid,
          horaInicio: formatDateTime(current.createdAt), // Hora del mensaje recibido
          horaRespuesta: formatDateTime(next.createdAt), // Hora de la respuesta
          demoraFormateada: formatDuration(delayMs), // Duración en formato legible
          demoraMs: delayMs,
          demoraMinutos: delayMinutes.toFixed(2),
          mensajeInicio: (current.text ? current.text.substring(0, 50) : '') + (current.text && current.text.length > 50 ? '...' : ''),
          mensajeRespuesta: (next.text ? next.text.substring(0, 50) : '') + (next.text && next.text.length > 50 ? '...' : '')
        };

        resultadoPorPanel[panel].demoras_totales.push(delayObj);

        if (delayMinutes > 10) { // Demora grave (más de 5 minutos)
          resultadoPorPanel[panel].demoras_graves.cantidad++;
          resultadoPorPanel[panel].demoras_graves.detalles.push(delayObj);
        } else if (delayMinutes > 5) { // Demora leve (1-5 minutos)
          resultadoPorPanel[panel].demoras_leves.cantidad++;
          resultadoPorPanel[panel].demoras_leves.detalles.push(delayObj);
        }
      }
    }

    // Calcular promedio solo si hay demoras
    if (delays.length > 0) {
      const suma = delays.reduce((acc, x) => acc + x, 0);
      const promedioMs = suma / delays.length;
      const promedioMinutos = promedioMs / 1000 / 60;

      resultadoPorPanel[panel].promedios.push({
        contactoUuid: contacto.uuid,
        promedioFormateado: formatDuration(promedioMs),
        promedioMinutos: promedioMinutos.toFixed(2),
        cantidadMensajes: delays.length
      });
    }
  }

  // Calcular promedios generales por panel
  for (const panel in resultadoPorPanel) {
    const demoras = resultadoPorPanel[panel].demoras_totales;
    if (demoras.length > 0) {
      const sumaTotal = demoras.reduce((acc, d) => acc + d.demoraMs, 0);
      resultadoPorPanel[panel].promedioGeneralMinutos = (sumaTotal / demoras.length / 1000 / 60).toFixed(2);
      resultadoPorPanel[panel].promedioGeneralFormateado = formatDuration(sumaTotal / demoras.length);
      resultadoPorPanel[panel].totalDemorasAnalizadas = demoras.length;
    }
  }

  return resultadoPorPanel;
}

// Ejecución del código
const archivo = path.join(__dirname, 'contactos_ayer.json');
const archivoSalida = path.join(__dirname, 'respuestas_ayer.json'); // <-- salida en la misma carpeta

try {
  const contenido = fs.readFileSync(archivo, 'utf8');
  const contactos = JSON.parse(contenido);
  const resultado = calcularPromedios(contactos);

  console.log(JSON.stringify(resultado, null, 2));

  // Guardar el resultado en la misma carpeta
  fs.writeFileSync(archivoSalida, JSON.stringify(resultado, null, 2), 'utf8');
  console.log('Resumen guardado en respuestas_ayer.json');
} catch (error) {
  console.error('Error al procesar el archivo:', error);
}