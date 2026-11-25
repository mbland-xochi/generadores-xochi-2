// Definiciones compartidas: garitas, campos de formularios, reglas de alerta.
(function () {
  const GARITAS = [
    { id: 'garita1', nombre: 'Garita 1', km: 'KM 145', cap: 66 },
    { id: 'garita2', nombre: 'Garita 2', km: 'KM 152', cap: 26 },
    { id: 'garita3', nombre: 'Garita 3', km: 'KM 162', cap: 26 },
    { id: 'garita4', nombre: 'Garita 4', km: 'KM 170', cap: 66 },
  ];

  // Reglas
  const DEFAULTS = {
    umbral_diesel: 70,          // % — por debajo se genera alerta de abastecimiento
    voltaje_min: 24.5,          // V — voltaje de batería para funcionamiento correcto
    servicio_intervalo: 500,    // horas de trabajo entre servicios generales (editable en Ajustes)
    servicio_base_garita1: 0,   // horas del generador en su último servicio general (editable)
    servicio_base_garita2: 0,
    servicio_base_garita3: 0,
    servicio_base_garita4: 0,
  };

  // Inspección diaria — Checklist_Rutinario_Electrico_Inspeccion_Diaria.xlsx (todos los campos son de texto)
  const DAILY_FIELDS = [
    { g: 'Registro', k: 'tecnico', label: 'Técnico', ph: 'Nombre del técnico', text: true },
    { g: 'Registro', k: 'fecha', label: 'Fecha', ph: 'dd/mm/aaaa', auto: 'fecha' },
    { g: 'Registro', k: 'hora', label: 'Hora', ph: 'hh:mm', auto: 'hora' },
    { g: 'Voltajes (V)', k: 'l1n', enc: true, label: 'L1 / N', num: true },
    { g: 'Voltajes (V)', k: 'l2n', enc: true, label: 'L2 / N', num: true },
    { g: 'Voltajes (V)', k: 'l1l2', enc: true, label: 'L1 / L2', num: true },
    { g: 'Carga (A)', k: 'a_l1', enc: true, label: 'L1', num: true },
    { g: 'Carga (A)', k: 'a_l2', enc: true, label: 'L2', num: true },
    { g: 'Carga (A)', k: 'a_n', enc: true, label: 'N', num: true },
    { g: 'Contador', k: 'kwh', label: 'kW/h actual', num: true },
    { g: 'Generador', k: 'nivel', label: 'Nivel diésel (%)', num: true },
    { g: 'Generador', k: 'horas_h', label: 'Horas de trabajo (h)', num: true },
    { g: 'Generador', k: 'horas_m', label: 'Min (m)', num: true },
    { g: 'Generador', k: 'bateria_v', label: 'Voltaje batería (V)', num: true },
    { g: 'Notas', k: 'notas', label: 'Notas', area: true, optional: true },
  ];

  // Inspección semanal — Checklist_Inspeccion_Semanal_Generador.xlsx
  // t:'txt' = campo de texto · t:'sel' = dropdown con las opciones de la fila · bad = índices de opciones que generan hallazgo
  const WEEKLY_META = [
    { k: 'tecnico', label: 'Técnico', t: 'txt' },
    { k: 'fecha', label: 'Fecha', t: 'txt', auto: 'fecha' },
    { k: 'hora', label: 'Hora', t: 'txt', auto: 'hora' },
  ];
  const sel = (k, label, opts, bad) => ({ k, label, t: 'sel', opts, bad: bad || [] });
  const txt = (k, label, o) => Object.assign({ k, label, t: 'txt' }, o || {});
  const com = (k, label) => ({ k, label, t: 'area', optional: true });
  const SiNoBad = ['SÍ', 'NO'];

  const WEEKLY_SECTIONS = [
    { titulo: 'Datos del generador', items: [
      txt('horometro_h', 'Horómetro encontrado (horas)', { num: true }),
      txt('horometro_m', 'Horómetro encontrado (minutos)', { num: true }),
      txt('proximo_h', 'Próximo servicio (horas)', { num: true }),
      txt('proximo_m', 'Próximo servicio (minutos)', { num: true }),
      txt('nivel_diesel', 'Nivel diésel encontrado (%)', { num: true }),
      txt('tapon_diesel', 'Estado tapón diésel'),
    ]},
    { titulo: 'Estado panel de control', items: [
      sel('panel_transferencia', 'Estado panel de transferencia', ['ACTIVO', 'OFF', 'DAÑADO'], [1, 2]),
      sel('panel_control_generador', 'Estado panel de control generador', ['ACTIVO', 'OFF', 'DAÑADO'], [1, 2]),
      sel('mandos_botones', 'Estado de mandos y botones', ['BUENOS', 'MALOS'], [1]),
      com('comentario_panel', 'Comentario'),
    ]},
    { titulo: 'Exterior electrógeno', items: [
      sel('pintura', 'Estado pintura', ['BUENO', 'MALO'], [1]),
      txt('pintura_txt', 'Estado pintura (detalle)', { optional: true }),
      sel('golpes', 'Golpes', SiNoBad, [0]),
      com('comentario_exterior', 'Comentario del exterior y evidencia con fotografía'),
    ]},
    { titulo: 'Interior electrógeno', items: [
      sel('limpieza_objetos_1', 'Limpieza de objetos extraños', ['SUCIO', 'LIMPIO', 'SE LIMPIÓ'], [0]),
      sel('motor_limpieza', 'Estado de motor (limpieza)', ['SUCIO', 'LIMPIO'], [0]),
      sel('motor_estado', 'Estado de motor', ['BUENO', 'DAÑADO'], [1]),
      sel('fuga_motor', 'Fuga en motor aceite o refrigerante', SiNoBad, [0]),
      sel('estado_aceite', 'Estado aceite', ['NEGRO', 'MARRÓN', 'CLARO'], [0]),
      sel('fugas', 'Fugas', SiNoBad, [0]),
      sel('fuga_aceitera', 'Fuga aceitera', SiNoBad, [0]),
      sel('fuga_filtro_aceite', 'Fuga en filtro aceite', SiNoBad, [0]),
      sel('fuga_mangueras_aceite', 'Fuga en mangueras aceite', SiNoBad, [0]),
      sel('fuga_filtros_diesel', 'Fuga en filtros de diésel', SiNoBad, [0]),
      sel('bomba_estado', 'Estado bomba electromecánica diésel', ['BUENA', 'MALA'], [1]),
      sel('fuga_bomba', 'Fuga en bomba electromecánica diésel', SiNoBad, [0]),
      sel('fuga_manguera_diesel', 'Fuga en manguera o tubería diésel', SiNoBad, [0]),
      sel('fuga_refrigerante', 'Fuga de refrigerante', SiNoBad, [0]),
      sel('fuga_mangueras_refrigerante', 'Fuga en mangueras de refrigerante', SiNoBad, [0]),
      sel('radiador', 'Estado radiador', ['BUENO', 'MALO'], [1]),
      sel('filtro_aire', 'Estado de filtro de aire', ['BUENO', 'REGULAR', 'MALO'], [1, 2]),
      sel('generador_estado', 'Estado de generador eléctrico', ['BUENO', 'DAÑADO'], [1]),
      sel('megear', 'Megear', SiNoBad, []),
      sel('bobinado', 'Estado de bobinado (verificación superficial)', ['BUENO COLOR DE COBRE', 'REGULAR COLOR CAFÉ OSCURO'], [1]),
      sel('limpieza_objetos_2', 'Limpieza de objetos extraños', ['SUCIO', 'LIMPIO', 'SE LIMPIÓ'], [0]),
      com('comentario_interior', 'Comentario'),
    ]},
    { titulo: 'Conexiones y braker', items: [
      sel('braker', 'Estado braker', ['ON', 'OFF'], [1]),
      sel('borneras', 'Estado borneras', ['FLOJAS', 'APRETADAS'], [0]),
      sel('cable', 'Estado de cable', ['BUENO', 'MALO'], [1]),
      sel('conexiones_caja', 'Estado interno de conexiones caja de mandos', ['NORMAL', 'SUCIO', 'ANÓMALO'], [1, 2]),
      com('comentario_novedades', 'Comentario de novedades'),
    ]},
    { titulo: 'Batería', items: [
      sel('bateria_estado', 'Estado batería', ['BUENO', 'MALO'], [1]),
      txt('bateria_voltaje', 'Voltaje batería (V)', { num: true }),
      sel('terminales_bateria', 'Estado de terminales y borneras de batería', ['BUENO', 'FLOJO', 'ZARRO'], [1, 2]),
      sel('mantenedor_carga', 'Estado mantenedor de carga (cargador de batería)', ['BUENO', 'MALO'], [1]),
      txt('volt_entrada_ac', 'Medición de voltaje entrada 120 V AC (voltios)', { num: true, optional: true }),
      txt('volt_salida_dc', 'Medición voltaje de salida 24V DC (voltios)', { num: true, optional: true }),
      com('comentario_general', 'Comentario general'),
    ]},
  ];

  const FOTOS_SEMANAL = [
    { k: 'filtro_aire', label: 'Filtro de aire' },
    { k: 'filtro_diesel', label: 'Filtro de diésel' },
    { k: 'varilla_aceite', label: 'Varilla de aceite' },
    { k: 'pantalla_generador', label: 'Pantalla del generador' },
  ];

  const PURCHASE_FIELDS = [
    { k: 'tecnico', label: 'Técnico', text: true },
    { k: 'fecha_compra', label: 'Fecha de compra', ph: 'dd/mm/aaaa', auto: 'fecha' },
    { k: 'cant_encontrada_gal', label: 'Cantidad encontrada de combustible (galones)', num: true, pct: true },
    { k: 'horas_trabajadas', label: 'Horas trabajadas', num: true },
    { k: 'galones_comprados', label: 'Cantidad de galones comprados', num: true },
    { k: 'cant_despues_gal', label: 'Cantidad de combustible después de llenado (galones)', num: true, pct: true },
    { k: 'precio_total_q', label: 'Precio total de combustible (Q)', num: true },
    { k: 'no_recibo', label: 'Número de recibo de la factura', text: true },
    { k: 'saldo_uno', label: 'Consulta de saldo de la tarjeta UNO (Q) — no obligatorio', num: true, optional: true },
  ];

  // ---------- utilidades ----------
  const num = (v) => { const n = parseFloat(String(v == null ? '' : v).replace(',', '.')); return isNaN(n) ? null : n; };
  const pad = (n) => String(n).padStart(2, '0');
  const hoy = () => { const d = new Date(); return pad(d.getDate()) + '/' + pad(d.getMonth() + 1) + '/' + d.getFullYear(); };
  const ahora = () => { const d = new Date(); return pad(d.getHours()) + ':' + pad(d.getMinutes()); };
  const garitaById = (id) => GARITAS.find((g) => g.id === id) || GARITAS[0];
  const horasDe = (h, m) => { const a = num(h); if (a == null) return null; return a + (num(m) || 0) / 60; };
  const cfg = (settings, k) => { const v = num(settings && settings[k]); return v == null ? DEFAULTS[k] : v; };

  // ---------- reglas de alerta ----------
  function dailyAlerts(d, garitaId, settings) {
    const out = [];
    const n = num(d.nivel), v = num(d.bateria_v), h = horasDe(d.horas_h, d.horas_m);
    const um = cfg(settings, 'umbral_diesel'), vm = cfg(settings, 'voltaje_min');
    if (n != null && n < um) out.push('Nivel de diésel ' + n + '% (menor a ' + um + '%): abastecer');
    if (v != null && v < vm) out.push('Voltaje de batería ' + v + ' V (mínimo ' + vm + ' V)');
    const s = servicio(h, garitaId, settings);
    if (s && s.restan <= 0) out.push('Servicio general vencido (' + Math.abs(Math.round(s.restan)) + ' h de retraso)');
    return out;
  }
  function weeklyAlerts(d, settings) {
    const out = [];
    WEEKLY_SECTIONS.forEach((s) => s.items.forEach((it) => {
      if (it.t === 'sel' && it.bad.length) {
        const i = it.opts.indexOf(d[it.k]);
        if (i >= 0 && it.bad.indexOf(i) >= 0) out.push(it.label + ': ' + d[it.k]);
      }
    }));
    const v = num(d.bateria_voltaje), vm = cfg(settings, 'voltaje_min');
    if (v != null && v < vm) out.push('Voltaje de batería ' + v + ' V (mínimo ' + vm + ' V)');
    const n = num(d.nivel_diesel), um = cfg(settings, 'umbral_diesel');
    if (n != null && n < um) out.push('Nivel de diésel ' + n + '% (menor a ' + um + '%): abastecer');
    return out;
  }
  // Intervalo de servicio por KM; si ese KM no tiene el suyo guardado, usa el general (servicio_intervalo).
  function intervalo(settings, garitaId) {
    const v = num(settings && settings['servicio_intervalo_' + garitaId]);
    return v == null ? cfg(settings, 'servicio_intervalo') : v;
  }
  function servicio(horas, garitaId, settings) {
    if (horas == null) return null;
    const base = cfg(settings, 'servicio_base_' + garitaId), inter = intervalo(settings, garitaId);
    return { restan: inter - (horas - base), intervalo: inter, base };
  }

  window.XS = { GARITAS, DEFAULTS, DAILY_FIELDS, WEEKLY_META, WEEKLY_SECTIONS, FOTOS_SEMANAL, PURCHASE_FIELDS,
    num, hoy, ahora, garitaById, horasDe, cfg, intervalo, dailyAlerts, weeklyAlerts, servicio };
})();
