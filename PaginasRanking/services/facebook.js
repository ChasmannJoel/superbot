import axios from 'axios';
import moment from 'moment'; 

async function obtenerPaginas(token) {
  const url = `https://graph.facebook.com/v19.0/me/accounts?access_token=${token}`;
  const { data } = await axios.get(url);
  const paginas = [];

  // Fechas para métricas
  const hoy = moment().utc();
  const ayer = hoy.clone().subtract(1, 'day').format('YYYY-MM-DD');
  const hace30 = hoy.clone().subtract(30, 'days').format('YYYY-MM-DD');
  const hasta = hoy.format('YYYY-MM-DD');

  for (const p of data.data) {
    const pid = p.id;
    const ptoken = p.access_token;

    // Detalles básicos
    const det = (await axios.get(
      `https://graph.facebook.com/v19.0/${pid}` +
      `?fields=name,category,business{name},followers_count,fan_count` +
      `&access_token=${token}`
    )).data;

    // Métricas del último día
    const urlDay = `https://graph.facebook.com/v19.0/${pid}/insights` +
      `?metric=page_posts_impressions,page_actions_post_reactions_total` +
      `&period=day&since=${ayer}&until=${ayer}` +
      `&access_token=${ptoken}`;
    const dayData = (await axios.get(urlDay)).data.data;

    // Métricas de los últimos 30 días
    const url30 = `https://graph.facebook.com/v19.0/${pid}/insights` +
      `?metric=page_posts_impressions,page_actions_post_reactions_total` +
      `&period=day&since=${hace30}&until=${hasta}` +
      `&access_token=${ptoken}`;
    const m30Data = (await axios.get(url30)).data.data;

    // Función auxiliar para sumar
    const sumMetric = (arr) =>
      arr.reduce((acc, m) => acc + (typeof m.value === 'object'
        ? Object.values(m.value).reduce((s,v)=>s+(v||0),0)
        : m.value || 0), 0);

    // Verificación para métricas de impresiones y reacciones
    const getMetricValue = (data, metricName) => {
      const metric = data ? data.find(m => m.name === metricName) : null;
      return metric ? sumMetric(metric.values) : 0;
    };

    const impDay = getMetricValue(dayData, 'page_posts_impressions');
    const reacDay = getMetricValue(dayData, 'page_actions_post_reactions_total');
    const imp30  = getMetricValue(m30Data, 'page_posts_impressions');
    const reac30 = getMetricValue(m30Data, 'page_actions_post_reactions_total');

            // Obtener solo la cantidad total de posteos y la fecha del último posteo
let totalPosteos = 0;
let fechaUltimoPost = null;
let primerPosteo = null; // El más antiguo
try {
  let nextUrl = `https://graph.facebook.com/v19.0/${pid}/posts?access_token=${ptoken}&limit=100`;
  let ultimoPosteoTemp = null;
  let primeraVuelta = true;

  while (nextUrl) {
    const postsData = await axios.get(nextUrl);
    const posts = postsData.data.data || [];

    totalPosteos += posts.length;
    if (primeraVuelta && posts.length > 0) {
      fechaUltimoPost = posts[0].created_time; // El más reciente
      primeraVuelta = false;
    }

    if (posts.length > 0) {
      ultimoPosteoTemp = posts[posts.length - 1]; // El más antiguo del lote actual
    }

    nextUrl = postsData.data.paging?.next || null;
  }

  primerPosteo = ultimoPosteoTemp; // Al final del paginado, este será el más antiguo
} catch (err) {
  console.warn(`Error al obtener posts de la página ${pid}:`, err.message);
}

paginas.push({
  nombre: det.name,
  categoria: det.category,
  negocio: det.business?.name || 'Sin negocio',
  followers: det.followers_count || 0,
  fans: det.fan_count || 0,
  posteosCount: totalPosteos,
  fechaUltimoPost,
  primerPosteo,      // 🔑 AHORA ESTÁ INCLUIDO AQUÍ
  impDay,
  reacDay,
  imp30,
  reac30
});
  }

  return paginas;
}

async function obtenerBMs(token) {
  const url = `https://graph.facebook.com/v19.0/me/businesses?access_token=${token}`;
  const { data } = await axios.get(url);
  const bms = [];

  for (const bm of data.data) {
    const vUrl = `https://graph.facebook.com/v19.0/${bm.id}?fields=verification_status,name&access_token=${token}`;
    const vData = await axios.get(vUrl);

    const nombreBM = vData.data.name || "Sin nombre";
    const verificado = vData.data.verification_status || "Desconocido";

    try {
      const waUrl = `https://graph.facebook.com/v19.0/${bm.id}/owned_whatsapp_business_accounts?access_token=${token}`;
      const waResponse = await axios.get(waUrl);
      const waAccounts = waResponse.data.data || [];

      if (waAccounts.length === 0) {
        bms.push({
          nombre: nombreBM,
          verificado: verificado,
          waNombre: "-",
          waTelefono: "-",
          waUltimoUso: "-"
        });
      } else {
        for (let i = 0; i < waAccounts.length; i++) {
          const wa = waAccounts[i];
          const phoneUrl = `https://graph.facebook.com/v19.0/${wa.id}/phone_numbers?access_token=${token}`;
          const phoneResponse = await axios.get(phoneUrl);
          const phoneInfo = phoneResponse.data.data?.[0] || {};

          bms.push({
            nombre: i === 0 ? nombreBM : "",
            verificado: i === 0 ? verificado : "",
            waNombre: wa.name || "Sin nombre",
            waTelefono: phoneInfo.display_phone_number || "Desconocido",
            waUltimoUso: phoneInfo.last_onboarded_time || "-"
          });
        }
      }

    } catch (error) {
      bms.push({
        nombre: nombreBM,
        verificado: verificado,
        waNombre: "Error",
        waTelefono: "Error",
        waUltimoUso: "Error"
      });
    }
  }

  return bms;
}

export { obtenerPaginas, obtenerBMs };