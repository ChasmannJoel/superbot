import fs from 'fs';
import fetch from 'node-fetch';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const horaInicioEjecucion = new Date().toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' });
console.log(`🟢 INICIO del script: ${horaInicioEjecucion}`);
console.log(`⏰ Script ejecutado: ${new Date().toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' })}`);

const fechaInicio = new Date().toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' });
const cuentasPath = path.join(__dirname, '..', 'meta', 'cuentas_meta_ads.json');
console.log(`Leyendo cuentas desde: ${cuentasPath}`);
const cuentas = JSON.parse(fs.readFileSync(cuentasPath, 'utf8'));
const output = [];

function esTipoMensaje(actionType) {
  return actionType === 'onsite_conversion.total_messaging_connection';
}

async function obtenerImagenesAnuncios(campaignId, accessToken) {
  try {
    const adsUrl = `https://graph.facebook.com/v19.0/${campaignId}/ads?fields=id,name,creative{thumbnail_url,image_url,object_story_spec}&access_token=${accessToken}`;
    console.log(`Obteniendo imágenes para campaña: ${campaignId}`);
    const response = await fetch(adsUrl);

    if (!response.ok) {
      console.error(`Error al obtener anuncios: ${response.statusText}`);
      return null;
    }

    const data = await response.json();

    if (!data.data || data.data.length === 0) {
      console.warn(`No se encontraron anuncios para campaña: ${campaignId}`);
      return null;
    }

    const ad = data.data[0];
    const creative = ad.creative || {};

    return {
      thumbnail_url: creative.thumbnail_url || null,
      image_url: creative.image_url || null,
      story_image_url: creative.object_story_spec?.link_data?.image_url || null,
      ad_id: ad.id,
      ad_name: ad.name
    };
  } catch (error) {
    console.error(`Error en obtenerImagenesAnuncios: ${error.message}`);
    return null;
  }
}

async function obtenerDatosAdsets(campaignId, accessToken, fechaInicio, fechaFin) {
  const url = `https://graph.facebook.com/v19.0/${campaignId}/adsets?fields=id,name,status,daily_budget,lifetime_budget,start_time,end_time,insights.time_range({'since':'${fechaInicio}','until':'${fechaFin}'}).fields(spend,actions)&access_token=${accessToken}`;
  console.log(`Obteniendo adsets para campaña: ${campaignId} entre ${fechaInicio} y ${fechaFin}`);

  try {
    const response = await fetch(url);
    const data = await response.json();

    if (!data.data || data.data.length === 0) {
      console.warn(`No se encontraron adsets para campaña: ${campaignId}`);
      return [];
    }

    return data.data.map(adset => {
      const actions = adset.insights?.data?.[0]?.actions || [];
      const resultados = actions
        .filter(a => esTipoMensaje(a.action_type))
        .reduce((acc, cur) => acc + Number(cur.value || 0), 0);

      const gasto = parseFloat(adset.insights?.data?.[0]?.spend || 0);
      const costoPorResultado = resultados > 0 ? gasto / resultados : 0;

      return {
        adset_id: adset.id,
        adset_name: adset.name,
        status: adset.status,
        daily_budget: adset.daily_budget,
        lifetime_budget: adset.lifetime_budget,
        start_time: adset.start_time,
        end_time: adset.end_time,
        gasto,
        resultados,
        costoPorResultado: parseFloat(costoPorResultado.toFixed(2))
      };
    });
  } catch (error) {
    console.error(`❌ Error en obtenerDatosAdsets: ${error.message}`);
    return [];
  }
}

// 1. Configuración de fecha para Argentina
const ahora = new Date();
const ahoraArgentina = new Date(ahora.toLocaleString('en-US', { timeZone: 'America/Argentina/Buenos_Aires' }));
const ayerArgentina = new Date(ahoraArgentina);
ayerArgentina.setDate(ayerArgentina.getDate() - 1);
const ayerFormateado = ayerArgentina.toISOString().split('T')[0];
console.log(`Recolectando datos para AYER: ${ayerFormateado}`);

// 2. Función modificada para obtener datos de campaña
async function obtenerDatosCampania(campaignId, accessToken) {
  try {
    // Obtener datos básicos de la campaña
    const campaniaUrl = `https://graph.facebook.com/v19.0/${campaignId}?fields=id,name,status,objective,start_time,stop_time&access_token=${accessToken}`;
    console.log(`Obteniendo datos básicos de campaña: ${campaignId}`);
    const campaniaRes = await fetch(campaniaUrl);
    const campaniaData = await campaniaRes.json();

    // Obtener insights SOLO del día anterior (Argentina)
    const insightsUrl = `https://graph.facebook.com/v19.0/${campaignId}/insights?fields=spend,actions&time_range={'since':'${ayerFormateado}','until':'${ayerFormateado}'}&access_token=${accessToken}`;
    console.log(`Obteniendo insights de campaña: ${campaignId} para el día ${ayerFormateado}`);
    const insightsRes = await fetch(insightsUrl);
    const insightsData = await insightsRes.json();

    // Procesar insights
    let messages = 0;
    let spend = 0;

    if (insightsData.data && insightsData.data.length > 0) {
      insightsData.data.forEach(insight => {
        spend += parseFloat(insight.spend || 0);
        if (insight.actions) {
          insight.actions.forEach(action => {
            if (action.action_type === 'onsite_conversion.total_messaging_connection') {
              messages += parseInt(action.value || 0);
            }
          });
        }
      });
    } else {
      console.warn(`No hay insights para campaña: ${campaignId}`);
    }

    const imagenes = await obtenerImagenesAnuncios(campaignId, accessToken);

    const adsets = await obtenerDatosAdsets(
      campaignId,
      accessToken,
      ayerFormateado, // Usa la fecha de ayer
      ayerFormateado
    );

    // Solo devolver campañas con actividad
    if (spend > 0 || messages > 0) {
      console.log(`Campaña ${campaignId} incluida (spend: ${spend}, messages: ${messages})`);
      return {
        id: campaignId,
        nombre: campaniaData.name,
        estado: campaniaData.status,
        metricas_diarias: {
          messages,
          spend,
          costoPorMensaje: spend / (messages || 1)
        },
        imagenes,
        adsets
      };
    } else {
      console.log(`Campaña ${campaignId} ignorada (sin actividad)`);
    }
    return null;

  } catch (error) {
    console.error(`Error en campaña ${campaignId}: ${error.message}`);
    return null;
  }
}

/// Función principal
(async () => {
  await Promise.all(cuentas.map(async (cuenta) => {
    console.log(`Procesando cuenta: ${cuenta.nombre}`);
    const datosCuenta = {
      nombre: cuenta.nombre,
      cuentas: []
    };

    await Promise.all(cuenta.idsCuentasAnuncios.map(async (idCuenta) => {
      console.log(`Procesando cuenta publicitaria: ${idCuenta}`);
      const cuentaData = { id: idCuenta };

      try {
        // 1. Obtener saldos de la cuenta
        const saldosUrl = `https://graph.facebook.com/v19.0/${idCuenta}?fields=spend_cap,amount_spent,balance&access_token=${cuenta.token}`;
        console.log(`Obteniendo saldos de: ${idCuenta}`);
        cuentaData.saldos = await fetch(saldosUrl).then(res => res.json());

        // 2. Obtener campañas con estado ACTIVE o PAUSED (sin filtrar por fecha)
        const campaniasUrl = `https://graph.facebook.com/v19.0/${idCuenta}/campaigns?fields=id,name,status,start_time,stop_time,effective_status&filtering=[{"field":"effective_status","operator":"IN","value":["ACTIVE","PAUSED"]}]&access_token=${cuenta.token}`;
        console.log(`Obteniendo campañas de: ${idCuenta}`);
        const campaniasRes = await fetch(campaniasUrl);
        const campaniasData = await campaniasRes.json();

        // 3. Procesar cada campaña en paralelo
        cuentaData.campanias = (await Promise.all(
          (campaniasData.data || []).map(async (campania) => {
            console.log(`Procesando campaña: ${campania.id} (${campania.name})`);
            const campaniaCompleta = await obtenerDatosCampania(campania.id, cuenta.token);
            if (
              campaniaCompleta &&
              (
                campaniaCompleta.metricas_diarias?.spend > 0 ||
                campaniaCompleta.metricas_diarias?.messages > 0
              )
            ) {
              return campaniaCompleta;
            }
            return null;
          })
        )).filter(Boolean);
      } catch (error) {
        console.error(`Error procesando cuenta ${idCuenta}: ${error.message}`);
      }

      datosCuenta.cuentas.push(cuentaData);
    }));

    output.push(datosCuenta);
  }));

  // Antes de guardar los resultados, agrega:
  console.log('Datos recolectados:', JSON.stringify(output, null, 2));
  console.log('Total campañas procesadas:', output.reduce((acc, cuenta) => acc + cuenta.cuentas.reduce((a, c) => a + (c.campanias?.length || 0), 0), 0));
  const fechaFin = new Date().toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' });

  const resultadoFinal = {
    fecha_inicio: fechaInicio,
    fecha_fin: fechaFin,
    datos: output
  };

  fs.writeFileSync(path.join(__dirname, 'campanias_meta_ads.json'), JSON.stringify(resultadoFinal, null, 2));

  fs.appendFileSync('./cron_ejecuciones.log', `Ejecutado: ${new Date().toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' })}\n`);
  // Guardar resultados
  console.log('✅ Datos guardados en campanias_meta_ads.json');
})();
const horaFinEjecucion = new Date().toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' });
console.log(`🔴 FIN del script: ${horaFinEjecucion}`);
const ejecucionInfo = {
  inicio: horaInicioEjecucion,
  fin: horaFinEjecucion
};
fs.writeFileSync(path.join(__dirname, 'horarios_ejecucion_meta_ads.json'), JSON.stringify(ejecucionInfo, null, 2));