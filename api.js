// Capa de acceso a datos: Apps Script real, o MODO DEMO (en memoria) si config.js no tiene URL.
(function () {
  const URL_ = (window.XOCHI_CONFIG && window.XOCHI_CONFIG.APPS_SCRIPT_URL || '').trim();
  const DEMO = !URL_;
  const CAP = { garita1: 66, garita2: 26, garita3: 26, garita4: 66 };

  async function get(params) {
    const r = await fetch(URL_ + '?' + new URLSearchParams(params).toString());
    const j = await r.json();
    if (!j.ok) throw new Error(j.error || 'Error del servidor');
    return j;
  }
  async function post(body) {
    const r = await fetch(URL_, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(body) });
    const j = await r.json();
    if (!j.ok) throw new Error(j.error || 'Error del servidor');
    return j;
  }

  // ---------- DEMO ----------
  const store = { diaria: [], semanal: [], compras: [], settings: Object.assign({}, XS.DEFAULTS), photos: {} };
  const pad = (n) => String(n).padStart(2, '0');
  const tsStr = (d) => pad(d.getDate()) + '/' + pad(d.getMonth() + 1) + '/' + d.getFullYear() + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds());
  const fakeImg = (txt, bg) => {
    const c = document.createElement('canvas'); c.width = 640; c.height = 480;
    const x = c.getContext('2d'); x.fillStyle = bg || '#2b3d5c'; x.fillRect(0, 0, 640, 480);
    x.fillStyle = 'rgba(255,255,255,.85)'; x.font = 'bold 34px sans-serif'; x.textAlign = 'center'; x.fillText(txt, 320, 250);
    return c.toDataURL('image/jpeg', 0.7);
  };
  const putImg = (data) => { const id = 'demo_' + Math.random().toString(36).slice(2, 12); store.photos[id] = data; return id; };

  function seed() {
    const now = Date.now(), H = 3600e3;
    const mk = (g, hAgo, nivel, hh, bat) => {
      const d = new Date(now - hAgo * H);
      const km = XS.garitaById(g).km;
      const rec = { id: 'd' + g + hAgo, garita: g, km, tecnico: 'Wilberth Mancilla', fecha: pad(d.getDate()) + '/' + pad(d.getMonth() + 1) + '/' + d.getFullYear(),
        hora: pad(d.getHours()) + ':' + pad(d.getMinutes()), l1n: '121', l2n: '120', l1l2: '241', a_l1: '12', a_l2: '11', a_n: '2', kwh: '15234', nivel: String(nivel),
        horas_h: String(hh), horas_m: '30', bateria_v: String(bat), notas: '', firma_id: putImg(fakeImg('Firma', '#f4f6f8')), ts: tsStr(d), ts_ms: String(d.getTime()) };
      rec.alertas = XS.dailyAlerts(rec, g, store.settings).join(' | ');
      return rec;
    };
    store.diaria.push(mk('garita1', 5, 82, 281, 27.4), mk('garita2', 6, 61, 120, 27.1), mk('garita3', 4, 90, 530, 27.6), mk('garita4', 3, 44, 90, 24.1));
    const wd = {}; XS.WEEKLY_META.forEach((m) => wd[m.k] = '');
    const d = new Date(now - 30 * H);
    const w = { id: 'w1', garita: 'garita1', km: 'KM 145', tecnico: 'Wilberth Mancilla', fecha: pad(d.getDate()) + '/' + pad(d.getMonth() + 1) + '/' + d.getFullYear(), hora: '13:25',
      horometro_h: '481', horometro_m: '53', proximo_h: '673', proximo_m: '28', nivel_diesel: '77', tapon_diesel: 'Bueno', panel_transferencia: 'ACTIVO', panel_control_generador: 'ACTIVO',
      mandos_botones: 'BUENOS', pintura: 'BUENO', pintura_txt: 'Pintura opaca', golpes: 'NO', limpieza_objetos_1: 'LIMPIO', motor_limpieza: 'LIMPIO', motor_estado: 'BUENO', fuga_motor: 'NO',
      estado_aceite: 'NEGRO', fugas: 'NO', fuga_aceitera: 'NO', fuga_filtro_aceite: 'NO', fuga_mangueras_aceite: 'NO', fuga_filtros_diesel: 'NO', bomba_estado: 'BUENA', fuga_bomba: 'NO',
      fuga_manguera_diesel: 'NO', fuga_refrigerante: 'NO', fuga_mangueras_refrigerante: 'NO', radiador: 'BUENO', filtro_aire: 'BUENO', generador_estado: 'BUENO', megear: 'NO',
      bobinado: 'BUENO COLOR DE COBRE', limpieza_objetos_2: 'LIMPIO', braker: 'ON', borneras: 'APRETADAS', cable: 'BUENO', conexiones_caja: 'NORMAL', bateria_estado: 'BUENO',
      bateria_voltaje: '27.4', terminales_bateria: 'BUENO', mantenedor_carga: 'BUENO', volt_entrada_ac: '', volt_salida_dc: '', comentario_general: '',
      foto_filtro_aire_id: putImg(fakeImg('Filtro de aire')), foto_filtro_diesel_id: putImg(fakeImg('Filtro de diésel')), foto_varilla_aceite_id: putImg(fakeImg('Varilla de aceite')),
      foto_pantalla_generador_id: putImg(fakeImg('Pantalla del generador')), firma_id: putImg(fakeImg('Firma', '#f4f6f8')), ts: tsStr(d), ts_ms: String(d.getTime()) };
    w.alertas = XS.weeklyAlerts(w, store.settings).join(' | ');
    store.semanal.push(w);
  }

  const demo = {
    async getAll() {
      return JSON.parse(JSON.stringify({ diaria: store.diaria.slice().reverse(), semanal: store.semanal.slice().reverse(), compras: store.compras.slice().reverse(), settings: store.settings, capacidades: CAP }));
    },
    async save(kind, p) {
      const now = new Date();
      const rec = Object.assign({ id: 'x' + now.getTime(), garita: p.garita, km: p.km }, p.datos, { alertas: p.alertas || '', ts: tsStr(now), ts_ms: String(now.getTime()) });
      if (kind === 'diaria') rec.firma_id = putImg(p.firma);
      if (kind === 'semanal') {
        Object.keys(p.fotos).forEach((k) => rec['foto_' + k + '_id'] = putImg(p.fotos[k]));
        rec.firma_id = putImg(p.firma);
      }
      if (kind === 'compras') {
        const cap = CAP[p.garita], e = XS.num(p.datos.cant_encontrada_gal), a = XS.num(p.datos.cant_despues_gal);
        rec.nivel_encontrado_pct = String(Math.round(Math.min(cap, e) / cap * 1000) / 10);
        rec.nivel_despues_pct = String(Math.round(Math.min(cap, a) / cap * 1000) / 10);
        rec.foto_id = putImg(p.foto);
      }
      store[kind].push(rec);
      return { ok: true, id: rec.id, ts: rec.ts, ts_ms: rec.ts_ms, nivel_despues_pct: rec.nivel_despues_pct, nivel_encontrado_pct: rec.nivel_encontrado_pct };
    }
  };

  window.API = {
    DEMO,
    async getAll() { if (DEMO) { if (!store.diaria.length) seed(); return demo.getAll(); } return get({ action: 'getAll' }); },
    async saveDaily(p) { return DEMO ? demo.save('diaria', p) : post(Object.assign({ action: 'saveDaily' }, p)); },
    async saveWeekly(p) { return DEMO ? demo.save('semanal', p) : post(Object.assign({ action: 'saveWeekly' }, p)); },
    async savePurchase(p) { return DEMO ? demo.save('compras', p) : post(Object.assign({ action: 'savePurchase' }, p)); },
    async saveSettings(settings) {
      if (DEMO) { Object.assign(store.settings, settings); return { ok: true, settings: store.settings }; }
      return post({ action: 'saveSettings', settings });
    },
    _cache: {},
    async getPhoto(id) {
      if (!id) return null;
      if (this._cache[id]) return this._cache[id];
      const data = DEMO ? store.photos[id] : (await get({ action: 'getPhoto', id })).data;
      this._cache[id] = data; return data;
    }
  };
})();
