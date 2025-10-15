import fs from 'fs';
import fetch from 'node-fetch';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const horaInicioEjecucion = new Date().toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' });

// Sistema de logging inteligente
const logPath = path.join(__dirname, 'meta_ads_errors.log');
const logData = {
  ejecucion_id: Date.now(),
  fecha: horaInicioEjecucion,
  errores: [],
  metricas: {},
  alertas: []
};

function logError(context, error, data = {}) {
  const errorInfo = {
    timestamp: new Date().toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' }),
    context,
    error: error.message || error,
    stack: error.stack || null,
    data
  };
  logData.errores.push(errorInfo);
  console.error(`❌ [${context}]: ${error.message || error}`);
}

function logMetrica(key, value) {
  logData.metricas[key] = value;
}

function logAlerta(mensaje, data = {}) {
  const alerta = {
    timestamp: new Date().toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' }),
    mensaje,
    data
  };
  logData.alertas.push(alerta);
  console.warn(`⚠️ ALERTA: ${mensaje}`);
}

console.log(`🟢 INICIO del script: ${horaInicioEjecucion}`);
console.log(`⏰ Script ejecutado: ${new Date().toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' })}`);

const fechaInicio = new Date().toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' });
const cuentasPath = path.join(__dirname, 'cuentas_meta_ads.json');
const cuentas = JSON.parse(fs.readFileSync(cuentasPath, 'utf8'));
const output = [];

function esTipoMensaje(actionType) {
  return actionType === 'onsite_conversion.total_messaging_connection';
}

// Función auxiliar para esperar
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Función auxiliar para reintentos con backoff exponencial
async function fetchConReintentos(url, maxReintentos = 3, delayInicial = 10000) {
  for (let intento = 1; intento <= maxReintentos; intento++) {
    try {
      const response = await fetch(url);
      
      // Si es exitoso, retornar inmediatamente
      if (response.ok) {
        return { response, data: await response.json() };
      }
      
      // Si es error 403, 429 (rate limit) o 500+ (errores del servidor), reintentar
      if ([403, 429, 500, 502, 503, 504].includes(response.status)) {
        if (intento < maxReintentos) {
          const delay = delayInicial * Math.pow(2, intento - 1); // Backoff exponencial
          console.log(`🔄 Reintentando en ${delay/1000}s (intento ${intento}/${maxReintentos}) - Error ${response.status}`);
          await sleep(delay);
          continue;
        }
      }
      
      // Para otros errores HTTP, no reintentar
      return { response, data: null };
      
    } catch (error) {
      // Errores de red - reintentar
      if (intento < maxReintentos) {
        const delay = delayInicial * Math.pow(2, intento - 1);
        console.log(`🔄 Reintentando por error de red en ${delay/1000}s (intento ${intento}/${maxReintentos})`);
        await sleep(delay);
        continue;
      }
      throw error;
    }
  }
}

// Función mejorada para obtener imágenes de anuncios
async function obtenerImagenesAnuncios(campaignId, accessToken) {
    try {
      const adsUrl = `https://graph.facebook.com/v19.0/${campaignId}/ads?fields=id,name,creative{thumbnail_url,image_url,object_story_spec}&access_token=${accessToken}`;
      
      const { response, data } = await fetchConReintentos(adsUrl);
      
      if (!response.ok) {
        logError('obtenerImagenesAnuncios', new Error(`HTTP ${response.status}: ${response.statusText}`), { campaignId });
        return { error: true, error_type: 'http_error', error_code: response.status, error_message: response.statusText };
      }
      
      if (data.error) {
        logError('obtenerImagenesAnuncios', new Error(`API Error: ${data.error.message}`), { campaignId, error_code: data.error.code });
        return { error: true, error_type: 'api_error', error_code: data.error.code, error_message: data.error.message };
      }
      
      if (!data.data || data.data.length === 0) {
        logAlerta('No se encontraron anuncios para la campaña', { campaignId });
        return null;
      }

      // Extraer todas las URLs de imagen posibles del primer anuncio
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
      logError('obtenerImagenesAnuncios', error, { campaignId });
      return { error: true, error_type: 'network_error', error_message: error.message };
    }
  }
async function obtenerDatosAdsets(campaignId, accessToken, fechaInicio, fechaFin) {
    const url = `https://graph.facebook.com/v19.0/${campaignId}/adsets?fields=id,name,status,daily_budget,lifetime_budget,start_time,end_time,targeting,insights.time_range({'since':'${fechaInicio}','until':'${fechaFin}'}).fields(spend,actions)&access_token=${accessToken}`;

  try {
    const { response, data } = await fetchConReintentos(url);
    
    if (!response.ok) {
      logError('obtenerDatosAdsets', new Error(`HTTP ${response.status}: ${response.statusText}`), { campaignId });
      return { error: true, error_type: 'http_error', error_code: response.status, error_message: response.statusText };
    }

    if (data.error) {
      logError('obtenerDatosAdsets', new Error(`API Error: ${data.error.message}`), { campaignId, error_code: data.error.code });
      return { error: true, error_type: 'api_error', error_code: data.error.code, error_message: data.error.message };
    }

    if (!data.data || data.data.length === 0) {
      logAlerta('No se encontraron adsets para la campaña', { campaignId });
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
        region: adset.targeting?.geo_locations || null,
        gasto,
        resultados,
        costoPorResultado: parseFloat(costoPorResultado.toFixed(2))
      };
    });
  } catch (error) {
    logError('obtenerDatosAdsets', error, { campaignId });
    return { error: true, error_type: 'network_error', error_message: error.message };
  }
}


// 1. Configuración de fecha para Argentina
const ahora = new Date();
const offsetArgentina = -3; // UTC-3 para Argentina
const hoyArgentina = new Date(ahora.getTime() + offsetArgentina * 60 * 60 * 1000);
const hoyFormateado = hoyArgentina.toISOString().split('T')[0];

// 2. Función modificada para obtener datos de campaña
async function obtenerDatosCampania(campaignId, accessToken) {
  try {
    // Obtener datos básicos de la campaña
    const campaniaUrl = `https://graph.facebook.com/v19.0/${campaignId}?fields=id,name,status,objective,special_ad_category,start_time,stop_time&access_token=${accessToken}`;
    
    const { response: campaniaRes, data: campaniaData } = await fetchConReintentos(campaniaUrl);
    
    if (!campaniaRes.ok) {
      logError('obtenerDatosCampania - básicos', new Error(`HTTP ${campaniaRes.status}: ${campaniaRes.statusText}`), { campaignId });
      return {
        id: campaignId,
        nombre: 'CAMPAÑA CON ERROR',
        estado: 'ERROR',
        error: true,
        error_type: 'http_error',
        error_code: campaniaRes.status,
        error_message: `Error HTTP ${campaniaRes.status}: ${campaniaRes.statusText}`,
        metricas_diarias: { messages: 0, spend: 0, costoPorMensaje: 0 }
      };
    }
    
    if (campaniaData.error) {
      logError('obtenerDatosCampania - básicos', new Error(`API Error: ${campaniaData.error.message}`), { campaignId, error_code: campaniaData.error.code });
      return {
        id: campaignId,
        nombre: 'CAMPAÑA CON ERROR',
        estado: 'ERROR',
        error: true,
        error_type: 'api_error',
        error_code: campaniaData.error.code,
        error_message: campaniaData.error.message,
        metricas_diarias: { messages: 0, spend: 0, costoPorMensaje: 0 }
      };
    }

    // Obtener insights SOLO del día actual (Argentina)
    const insightsUrl = `https://graph.facebook.com/v19.0/${campaignId}/insights?fields=spend,actions&time_range={'since':'${hoyFormateado}','until':'${hoyFormateado}'}&access_token=${accessToken}`;
    
    let insightsError = null;
    let insightsData = { data: [] };
    
    try {
      const { response: insightsRes, data: insights } = await fetchConReintentos(insightsUrl);
      
      if (!insightsRes.ok) {
        insightsError = { error_code: insightsRes.status, error_message: `HTTP ${insightsRes.status}: ${insightsRes.statusText}` };
        logError('obtenerDatosCampania - insights', new Error(`HTTP ${insightsRes.status}: ${insightsRes.statusText}`), { campaignId });
      } else if (insights.error) {
        insightsError = { error_code: insights.error.code, error_message: insights.error.message };
        logError('obtenerDatosCampania - insights', new Error(`API Error: ${insights.error.message}`), { campaignId, error_code: insights.error.code });
      } else {
        insightsData = insights;
      }
    } catch (error) {
      insightsError = { error_code: 'NETWORK_ERROR', error_message: error.message };
      logError('obtenerDatosCampania - insights', error, { campaignId });
    }

    // Procesar insights
    let messages = 0;
    let spend = 0;

    if (!insightsError && insightsData.data && insightsData.data.length > 0) {
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
      // Solo alertar si la campaña está activa pero no tiene insights
      if (campaniaData.status === 'ACTIVE') {
        logAlerta('Campaña activa sin insights del día', { campaignId, nombre: campaniaData.name, status: campaniaData.status });
      }
    }

    const imagenes = await obtenerImagenesAnuncios(campaignId, accessToken);
    
    const adsets = await obtenerDatosAdsets(
      campaignId,
      accessToken,
      hoyFormateado,
      hoyFormateado
    );

    // Crear objeto de campaña siempre, incluso si hay errores
    const campaniaCompleta = {
      id: campaignId,
      nombre: campaniaData.name,
      estado: campaniaData.status,
      objetivo: campaniaData.objective,
      metricas_diarias: {
        messages,
        spend,
        costoPorMensaje: spend / (messages || 1)
      },
      imagenes,
      adsets
    };

    // Agregar información de errores si los hay
    let tieneErroresCriticos = false;
    let tieneErroresMenores = false;
    
    if (insightsError) {
      campaniaCompleta.insights_error = {
        error_type: 'insights_error',
        ...insightsError
      };
      // Error de insights en campaña ACTIVA = crítico
      // Error de insights en campaña PAUSADA = menor (normal)
      if (campaniaData.status === 'ACTIVE') {
        tieneErroresCriticos = true;
      } else {
        tieneErroresMenores = true;
      }
    }

    if (imagenes?.error) {
      campaniaCompleta.imagenes_error = imagenes;
      tieneErroresMenores = true; // Error de imágenes = menor
    }

    if (adsets?.error) {
      campaniaCompleta.adsets_error = adsets;
      campaniaCompleta.adsets = [];
      tieneErroresMenores = true; // Error de adsets = menor
    }

    // LÓGICA INTELIGENTE DE INCLUSIÓN:
    const tieneActividad = spend > 0 || messages > 0;
    const debeIncluir = tieneActividad || tieneErroresCriticos || campaniaCompleta.error;
    
    if (debeIncluir) {
      return campaniaCompleta;
    }
    
    // Log para debug: campañas excluidas por errores menores
    if (tieneErroresMenores) {
      console.log(`🚫 Campaña excluida (solo errores menores): ${campaniaData.name} - Estado: ${campaniaData.status}`);
    }
    
    return null; // No incluir si solo tiene errores menores sin actividad

  } catch (error) {
    logError('obtenerDatosCampania', error, { campaignId });
    // Siempre incluir campañas con errores críticos
    return {
      id: campaignId,
      nombre: 'CAMPAÑA CON ERROR CRÍTICO',
      estado: 'ERROR',
      error: true,
      error_type: 'critical_error',
      error_message: error.message,
      metricas_diarias: { messages: 0, spend: 0, costoPorMensaje: 0 }
    };
  }
}

// ... todo tu código anterior igual ...

// Función principal - VERSION CORREGIDA
(async () => {
  logMetrica('cuentas_totales', cuentas.length);
  
  for (const cuenta of cuentas) {
    const datosCuenta = {
      nombre: cuenta.nombre,
      cuentas: []
    };

    await Promise.all(
      cuenta.idsCuentasAnuncios.map(async (idCuenta) => {
        const cuentaData = { id: idCuenta };

        try {
          // 1. Obtener saldos de la cuenta
          const { response: saldosRes, data: saldosData } = await fetchConReintentos(`https://graph.facebook.com/v19.0/${idCuenta}?fields=spend_cap,amount_spent,balance&access_token=${cuenta.token}`);
          
          if (!saldosRes.ok) {
            logError('obtener saldos', new Error(`HTTP ${saldosRes.status}: ${saldosRes.statusText}`), { idCuenta });
            cuentaData.saldos = { error: true };
          } else if (saldosData.error) {
            logError('obtener saldos', new Error(`API Error: ${saldosData.error.message}`), { idCuenta, error_code: saldosData.error.code });
            cuentaData.saldos = { error: true };
          } else {
            cuentaData.saldos = saldosData;
          }
        } catch (error) {
          logError('obtener saldos', error, { idCuenta });
          cuentaData.saldos = { error: true };
        }

        // 2. Obtener TODAS las campañas con paginación
        let todasCampanias = [];
        let nextUrl = `https://graph.facebook.com/v19.0/${idCuenta}/campaigns?fields=id,name,status,start_time,stop_time,effective_status&filtering=[{"field":"effective_status","operator":"IN","value":["ACTIVE","PAUSED"]}]&access_token=${cuenta.token}`;
        let paginasCampanias = 0;
        
        while (nextUrl && paginasCampanias < 10) {
          try {
            const { response: res, data } = await fetchConReintentos(nextUrl);
            paginasCampanias++;
            
            if (!res.ok) {
              logError('obtener campañas', new Error(`HTTP ${res.status}: ${res.statusText}`), { idCuenta, pagina: paginasCampanias });
              break;
            }
            
            if (data.error) {
              logError('obtener campañas', new Error(`API Error: ${data.error.message}`), { idCuenta, error_code: data.error.code });
              break;
            }
            
            if (data.data && data.data.length > 0) {
              todasCampanias = todasCampanias.concat(data.data);
            }
            nextUrl = data.paging && data.paging.next ? data.paging.next : null;
          } catch (error) {
            logError('obtener campañas', error, { idCuenta, pagina: paginasCampanias });
            break;
          }
        }

        logMetrica(`campanias_encontradas_${idCuenta}`, todasCampanias.length);
        
        if (todasCampanias.length === 0) {
          logAlerta('No se encontraron campañas para la cuenta', { idCuenta, cuenta_nombre: cuenta.nombre });
        }

        // 3. Procesar cada campaña (sin filtro de fechas)
        const campaniasProcesadas = await Promise.all(
          (todasCampanias || []).map(async (campania) => {
            try {
              // Forzar actualización del estado: obtener status actual desde el endpoint individual
              let campaniaActual = { status: campania.status }; // fallback
              
              try {
                const { response: campaniaActualRes, data: campaniaActualData } = await fetchConReintentos(`https://graph.facebook.com/v19.0/${campania.id}?fields=status&access_token=${cuenta.token}`);
                
                if (campaniaActualRes.ok && !campaniaActualData.error) {
                  campaniaActual = campaniaActualData;
                }
              } catch (error) {
                // Si falla obtener el status actualizado, usar el que ya tenemos
                logError('obtener status actualizado', error, { campaignId: campania.id });
              }
              
              const campaniaCompleta = await obtenerDatosCampania(campania.id, cuenta.token);
              if (campaniaCompleta) {
                // Sobrescribir el estado con el valor más reciente
                if (!campaniaCompleta.error) {
                  campaniaCompleta.estado = campaniaActual.status;
                }
                
                // Incluir TODAS las campañas: con datos, con errores o vacías
                return campaniaCompleta;
              }
              return null;
            } catch (error) {
              logError('procesar campaña individual', error, { campaignId: campania.id, idCuenta });
              // Siempre incluir campañas con errores de procesamiento
              return {
                id: campania.id,
                nombre: campania.name || 'CAMPAÑA CON ERROR',
                estado: 'ERROR',
                error: true,
                error_type: 'processing_error',
                error_message: error.message,
                metricas_diarias: { messages: 0, spend: 0, costoPorMensaje: 0 }
              };
            }
          })
        );
        
        cuentaData.campanias = campaniasProcesadas.filter(Boolean);
        logMetrica(`campanias_con_datos_${idCuenta}`, cuentaData.campanias.length);
        
        // Separar campañas con actividad y campañas con errores para métricas
        const campaniasConActividad = cuentaData.campanias.filter(c => 
          (c.metricas_diarias?.spend > 0 || c.metricas_diarias?.messages > 0) && !c.error
        );
        const campaniasConErrores = cuentaData.campanias.filter(c => 
          c.error || c.insights_error || c.imagenes_error || c.adsets_error
        );
        
        logMetrica(`campanias_con_actividad_${idCuenta}`, campaniasConActividad.length);
        logMetrica(`campanias_con_errores_${idCuenta}`, campaniasConErrores.length);
        logMetrica(`campanias_total_${idCuenta}`, cuentaData.campanias.length);
        
        if (todasCampanias.length > 0 && cuentaData.campanias.length === 0) {
          logAlerta('Todas las campañas de la cuenta quedaron sin datos', { 
            idCuenta, 
            cuenta_nombre: cuenta.nombre,
            campanias_totales: todasCampanias.length 
          });
        }
        
        datosCuenta.cuentas.push(cuentaData);
      })
    ); 
    
    output.push(datosCuenta);
  }

  // Métricas finales
  const totalCampanias = output.reduce((acc, cuenta) => acc + cuenta.cuentas.reduce((a, c) => a + (c.campanias?.length || 0), 0), 0);
  const totalCuentas = output.reduce((acc, cuenta) => acc + cuenta.cuentas.length, 0);
  
  logMetrica('campanias_con_datos_final', totalCampanias);
  logMetrica('cuentas_procesadas_final', totalCuentas);
  logMetrica('ejecucion_exitosa', totalCampanias > 0);
  
  // Alerta crítica si no se obtuvieron datos
  if (totalCampanias === 0) {
    logAlerta('CRÍTICO: Ejecución completa sin obtener datos de campañas', {
      cuentas_procesadas: totalCuentas,
      errores_total: logData.errores.length
    });
  }
  
  console.log(`📊 Resumen: ${totalCampanias} campañas de ${totalCuentas} cuentas procesadas`);
  if (logData.errores.length > 0) {
    console.log(`⚠️ Se registraron ${logData.errores.length} errores - ver meta_ads_errors.log`);
  }
  
  const fechaFin = new Date().toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' });

  const resultadoFinal = {
    fecha_inicio: fechaInicio,
    fecha_fin: fechaFin,
    datos: output
  };

  fs.writeFileSync(path.join(__dirname, 'campanias_meta_ads.json'), JSON.stringify(resultadoFinal, null, 2));

  // Guardar log solo si hay errores, alertas o métricas importantes
  logData.fecha_fin = fechaFin;
  if (logData.errores.length > 0 || logData.alertas.length > 0 || totalCampanias === 0) {
    fs.appendFileSync(logPath, JSON.stringify(logData, null, 2) + '\n---\n');
  }

  fs.appendFileSync('./cron_ejecuciones.log', `Ejecutado: ${fechaFin} - Campañas: ${totalCampanias} - Errores: ${logData.errores.length}\n`);
  console.log('✅ Datos guardados en campanias_meta_ads.json');

  const horaFinEjecucion = new Date().toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' });
  console.log(`🔴 FIN del script: ${horaFinEjecucion}`);
  
  const ejecucionInfo = {
    inicio: horaInicioEjecucion,
    fin: horaFinEjecucion
  };
  fs.writeFileSync(path.join(__dirname, 'horarios_ejecucion_meta_ads.json'), JSON.stringify(ejecucionInfo, null, 2));
})(); 