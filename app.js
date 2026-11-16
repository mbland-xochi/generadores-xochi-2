(function () {
  const { GARITAS, DAILY_FIELDS, WEEKLY_META, WEEKLY_SECTIONS, FOTOS_SEMANAL, PURCHASE_FIELDS, num, hoy, ahora, garitaById, horasDe, cfg } = XS;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  let DATA = { diaria: [], semanal: [], compras: [], settings: Object.assign({}, XS.DEFAULTS) };
  const state = { km: 'garita1', tipo: 'diaria', kmAbas: 'garita1', busy: false };
  const photos = { weekly: {}, compra: {} };
  const pads = {};

  // ---------- util ----------
  let toastT;
  function toast(msg, err) {
    const t = $('#toast'); t.textContent = msg; t.className = 'toast' + (err ? ' err' : ''); t.hidden = false;
    clearTimeout(toastT); toastT = setTimeout(() => (t.hidden = true), err ? 6000 : 2800);
  }
  const netMsg = (e) => /Failed to fetch|NetworkError|Load failed/i.test(String(e)) ? 'No se pudo conectar. Revisa tu internet y la URL del Apps Script en config.js.' : (e.message || String(e));
  const tsNum = (r) => Number(r.ts_ms) || 0;
  const fmtN = (v, d = 1) => (v == null ? '—' : (Math.round(v * Math.pow(10, d)) / Math.pow(10, d)).toString());

  // ---------- pestañas ----------
  function goto(tab) {
    $$('#tabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === tab));
    $$('.tab').forEach((s) => s.classList.toggle('on', s.id === 'tab-' + tab));
    if (location.hash !== '#' + tab) history.replaceState(null, '', '#' + tab);
    window.scrollTo(0, 0);
    fillAuto(); sizePads();
  }
  $('#tabs').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) goto(b.dataset.tab); });

  // ---------- chips KM ----------
  function chips(id, key, onChange) {
    const box = $(id);
    box.innerHTML = GARITAS.map((g) => `<button type="button" class="chip" data-id="${g.id}">${g.km}<small>${g.nombre}</small></button>`).join('');
    const paint = () => $$('.chip', box).forEach((c) => c.classList.toggle('on', c.dataset.id === state[key]));
    box.addEventListener('click', (e) => { const c = e.target.closest('.chip'); if (!c) return; state[key] = c.dataset.id; paint(); onChange && onChange(); });
    paint();
    return paint;
  }
  let paintKmInsp, paintKmAbas;

  // ---------- generador de campos ----------
  function fieldHTML(f, idp) {
    const req = f.optional ? '' : '<i> *</i>';
    const id = idp + f.k;
    let ctl;
    if (f.t === 'sel') ctl = `<select id="${id}"><option value="">Seleccionar…</option>${f.opts.map((o) => `<option>${esc(o)}</option>`).join('')}</select>`;
    else if (f.t === 'area' || f.area) ctl = `<textarea id="${id}" rows="2"></textarea>`;
    else ctl = `<input id="${id}" type="text" ${f.num ? 'inputmode="decimal"' : ''} ${f.ph ? `placeholder="${esc(f.ph)}"` : ''} ${f.auto ? `data-auto="${f.auto}"` : ''}>`;
    const wide = (f.t === 'area' || f.area) ? ' style="grid-column:1/-1"' : '';
    return `<div class="field" data-k="${f.k}"${wide}><label for="${id}">${esc(f.label)}${req}</label>${ctl}${f.pct ? `<div class="hint" id="${id}_hint"></div>` : ''}</div>`;
  }
  function groupedHTML(fields, idp) {
    let out = '', cur = null, open = false;
    fields.forEach((f) => {
      if (f.g !== cur) { if (open) out += '</div>'; out += `<div class="fgroup">${esc(f.g)}</div><div class="grid">`; cur = f.g; open = true; }
      out += fieldHTML(f, idp);
    });
    return out + (open ? '</div>' : '');
  }
  const photoHTML = (key, label, req = true) => `<div class="field" data-photo="${key}"><label>${esc(label)}${req ? '<i> *</i>' : ''}</label><div class="photo"><input type="file" accept="image/*"><span>Tomar o subir foto</span></div></div>`;
  const sigHTML = (id) => `<div class="fgroup">Firma del técnico <span class="muted" style="text-transform:none;font-weight:400">— obligatoria</span></div><div class="field" data-sig="${id}"><canvas class="sig" id="${id}"></canvas><div class="row end" style="margin-top:6px"><button type="button" class="btn ghost sm" data-clear="${id}">Borrar firma</button></div></div>`;

  function buildForms() {
    $('#formDiaria').innerHTML = groupedHTML(DAILY_FIELDS, 'd_') + sigHTML('sigD') +
      '<div id="errD"></div><button type="submit" class="btn green submit">Guardar inspección diaria</button>';

    const wf = WEEKLY_SECTIONS.map((s) =>
      `<div class="fgroup">${esc(s.titulo)}</div><div class="grid">${s.items.map((it) => fieldHTML(it, 'w_')).join('')}</div>`).join('');
    $('#formSemanal').innerHTML =
      `<div class="fgroup">Registro</div><div class="grid">${WEEKLY_META.map((m) => fieldHTML(m, 'w_')).join('')}</div>` + wf +
      `<div class="fgroup">Fotos obligatorias</div><div class="photos">${FOTOS_SEMANAL.map((f) => photoHTML(f.k, f.label)).join('')}</div>` +
      sigHTML('sigW') + '<div id="errW"></div><button type="submit" class="btn green submit">Guardar inspección semanal</button>';

    $('#formCompra').innerHTML =
      `<div class="grid">${PURCHASE_FIELDS.map((f) => fieldHTML(f, 'c_')).join('')}</div>` +
      `<div class="fgroup">Factura</div><div class="photos">${photoHTML('factura', 'Foto de la factura y saldo de la tarjeta UNO')}</div>` +
      '<div id="errC"></div><button type="submit" class="btn green submit">Registrar abastecimiento</button>';

    ['sigD', 'sigW'].forEach((id) => (pads[id] = makePad($('#' + id))));
    document.addEventListener('click', (e) => { const b = e.target.closest('[data-clear]'); if (b) pads[b.dataset.clear].clear(); });

    $('#formDiaria').addEventListener('submit', (e) => { e.preventDefault(); submitDaily(); });
    $('#formSemanal').addEventListener('submit', (e) => { e.preventDefault(); submitWeekly(); });
    $('#formCompra').addEventListener('submit', (e) => { e.preventDefault(); submitPurchase(); });

    // marcar campos editados (para no pisar fecha/hora) y limpiar errores
    $$('.form').forEach((f) => {
      f.addEventListener('input', (e) => { if (e.target.dataset) e.target.dataset.touched = '1'; const fl = e.target.closest('.field'); if (fl) fl.classList.remove('err'); hints(); });
      f.addEventListener('change', (e) => { const fl = e.target.closest('.field'); if (fl) fl.classList.remove('err'); });
    });
    $$('.photo input').forEach((inp) => inp.addEventListener('change', onPhoto));
  }

  // ---------- firma ----------
  function makePad(c) {
    const ctx = c.getContext('2d'); let drawing = false, dirty = false;
    function size() {
      const r = c.getBoundingClientRect(); if (!r.width) return;
      const d = window.devicePixelRatio || 1, w = Math.round(r.width * d);
      if (c.width === w) return;
      c.width = w; c.height = Math.round(r.height * d); ctx.setTransform(d, 0, 0, d, 0, 0);
      ctx.lineWidth = 2.4; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = '#0b1424'; dirty = false;
    }
    const pt = (e) => { const r = c.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
    c.addEventListener('pointerdown', (e) => { size(); drawing = true; c.setPointerCapture(e.pointerId); const [x, y] = pt(e); ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 0.1, y + 0.1); ctx.stroke(); dirty = true; c.closest('.field').classList.remove('err'); e.preventDefault(); });
    c.addEventListener('pointermove', (e) => { if (!drawing) return; const [x, y] = pt(e); ctx.lineTo(x, y); ctx.stroke(); });
    ['pointerup', 'pointercancel', 'pointerleave'].forEach((ev) => c.addEventListener(ev, () => { drawing = false; }));
    return { size, isEmpty: () => !dirty, data: () => c.toDataURL('image/png'),
      clear() { ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, c.width, c.height); ctx.restore(); dirty = false; } };
  }
  const sizePads = () => Object.values(pads).forEach((p) => p.size());
  window.addEventListener('resize', sizePads);

  // ---------- fotos ----------
  function compress(file, max = 1280, q = 0.72) {
    return new Promise((res, rej) => {
      const url = URL.createObjectURL(file), im = new Image();
      im.onload = () => {
        const s = Math.min(1, max / Math.max(im.width, im.height)), w = Math.round(im.width * s), h = Math.round(im.height * s);
        const c = document.createElement('canvas'); c.width = w; c.height = h; c.getContext('2d').drawImage(im, 0, 0, w, h);
        URL.revokeObjectURL(url); res(c.toDataURL('image/jpeg', q));
      };
      im.onerror = () => rej(new Error('No se pudo leer la imagen'));
      im.src = url;
    });
  }
  async function onPhoto(e) {
    const inp = e.target, file = inp.files && inp.files[0]; if (!file) return;
    const fld = inp.closest('[data-photo]'), key = fld.dataset.photo, bag = fld.closest('#formSemanal') ? photos.weekly : photos.compra;
    try {
      const data = await compress(file); bag[key] = data;
      const box = $('.photo', fld); box.classList.add('has');
      box.innerHTML = `<img src="${data}" alt=""><span>Foto lista · toca para cambiar</span>`;
      box.appendChild(inp); fld.classList.remove('err');
    } catch (err) { toast(err.message, true); }
  }
  function resetPhotos(form, bag) {
    Object.keys(bag).forEach((k) => delete bag[k]);
    $$('[data-photo]', form).forEach((f) => { const box = $('.photo', f); const inp = $('input', box); inp.value = ''; box.classList.remove('has'); box.innerHTML = '<span>Tomar o subir foto</span>'; box.appendChild(inp); });
  }

  // ---------- auto fecha/hora y avisos ----------
  function fillAuto() {
    $$('input[data-auto]').forEach((i) => { if (!i.dataset.touched) i.value = i.dataset.auto === 'fecha' ? hoy() : ahora(); });
  }
  function hints() {
    const um = cfg(DATA.settings, 'umbral_diesel'), vm = cfg(DATA.settings, 'voltaje_min');
    const g = garitaById(state.kmAbas);
    ['c_cant_encontrada_gal', 'c_cant_despues_gal'].forEach((id) => {
      const el = $('#' + id), h = $('#' + id + '_hint'); if (!el || !h) return;
      const v = num(el.value);
      if (v == null) { h.textContent = 'Capacidad ' + g.cap + ' galones'; h.className = 'hint'; return; }
      const p = Math.round(Math.min(v, g.cap) / g.cap * 1000) / 10;
      h.textContent = '= ' + p + '% de ' + g.cap + ' gal' + (v > g.cap ? ' (excede la capacidad)' : ''); h.className = 'hint' + (v > g.cap ? ' low' : '');
    });
  }

  // ---------- lectura / validación ----------
  function readFields(fields, idp, form) {
    const vals = {}, missing = [];
    $$('.field', form).forEach((f) => f.classList.remove('err'));
    fields.forEach((f) => {
      const el = $('#' + idp + f.k), v = el.value.trim(); vals[f.k] = v;
      const bad = (!f.optional && !v) || (f.num && v && num(v) == null);
      if (bad) { missing.push(f.label + (v ? ' (valor inválido)' : '')); el.closest('.field').classList.add('err'); }
    });
    return { vals, missing };
  }
  function showErr(id, list) {
    $('#' + id).innerHTML = `<div class="err-box"><b>Revisa estos campos:</b><br>${list.map(esc).join('<br>')}</div>`;
    const first = $('.field.err', $('#' + id).closest('form')); if (first) first.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }
  const weeklyFields = () => WEEKLY_META.concat(WEEKLY_SECTIONS.flatMap((s) => s.items));

  async function guarded(btn, label, fn) {
    if (state.busy) return; state.busy = true; btn.disabled = true; const old = btn.textContent; btn.textContent = label;
    try { await fn(); } catch (e) { toast(netMsg(e), true); } finally { state.busy = false; btn.disabled = false; btn.textContent = old; }
  }
  function doneBox(id, titulo, alertas, onPdf) {
    const box = $('#' + id), list = (alertas || '').split(' | ').filter(Boolean);
    box.innerHTML = `<b>${esc(titulo)}</b>${list.length ? '<ul class="alist" style="margin-top:8px">' + list.map((a) => `<li>${esc(a)}</li>`).join('') + '</ul>' : '<div class="muted small">Sin alertas ni hallazgos.</div>'}<div class="actions"><button class="btn sm" type="button">Descargar PDF otra vez</button></div>`;
    $('button', box).onclick = onPdf; box.hidden = false; box.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }
  async function safePdf(fn) { try { toast('Generando PDF…'); await fn(); } catch (e) { console.error(e); toast('No se pudo generar el PDF: ' + e.message, true); } }

  // ---------- guardar: diaria ----------
  async function submitDaily() {
    const form = $('#formDiaria'), g = garitaById(state.km);
    const { vals, missing } = readFields(DAILY_FIELDS, 'd_', form);
    if (pads.sigD.isEmpty()) { missing.push('Firma del técnico'); $('[data-sig=sigD]').classList.add('err'); }
    if (missing.length) return showErr('errD', missing);
    $('#errD').innerHTML = '';
    const alertas = XS.dailyAlerts(vals, g.id, DATA.settings).join(' | ');
    const firma = pads.sigD.data();
    await guarded($('button[type=submit]', form), 'Guardando…', async () => {
      const r = await API.saveDaily({ garita: g.id, km: g.km, datos: vals, firma, alertas });
      const rec = Object.assign({ id: r.id, garita: g.id, km: g.km, ts: r.ts, ts_ms: r.ts_ms, alertas }, vals);
      toast('Inspección diaria guardada');
      refresh();
      const pdf = () => safePdf(() => PDF.daily(rec, g, firma));
      doneBox('inspDone', 'Inspección diaria guardada · ' + g.km + ' ' + g.nombre, alertas, pdf);
      pdf();
      pads.sigD.clear(); $('#d_notas').value = ''; $$('input', form).forEach((i) => { if (i.id !== 'd_tecnico') { delete i.dataset.touched; if (!i.dataset.auto) i.value = ''; } }); fillAuto();
    });
  }

  // ---------- guardar: semanal ----------
  async function submitWeekly() {
    const form = $('#formSemanal'), g = garitaById(state.km);
    const { vals, missing } = readFields(weeklyFields(), 'w_', form);
    FOTOS_SEMANAL.forEach((f) => { if (!photos.weekly[f.k]) { missing.push('Foto: ' + f.label); $('[data-photo=' + f.k + ']', form).classList.add('err'); } });
    if (pads.sigW.isEmpty()) { missing.push('Firma del técnico'); $('[data-sig=sigW]').classList.add('err'); }
    if (missing.length) return showErr('errW', missing);
    $('#errW').innerHTML = '';
    const alertas = XS.weeklyAlerts(vals, DATA.settings).join(' | ');
    const firma = pads.sigW.data(), fotos = Object.assign({}, photos.weekly);
    await guarded($('button[type=submit]', form), 'Guardando y subiendo fotos…', async () => {
      const r = await API.saveWeekly({ garita: g.id, km: g.km, datos: vals, fotos, firma, alertas });
      const rec = Object.assign({ id: r.id, garita: g.id, km: g.km, ts: r.ts, ts_ms: r.ts_ms, alertas }, vals);
      toast('Inspección semanal guardada');
      refresh();
      const pdf = () => safePdf(() => PDF.weekly(rec, g, fotos, firma));
      doneBox('inspDone', 'Inspección semanal guardada · ' + g.km + ' ' + g.nombre, alertas, pdf);
      pdf();
      pads.sigW.clear(); resetPhotos(form, photos.weekly);
      $$('input,select,textarea', form).forEach((i) => { if (i.type === 'file' || i.id === 'w_tecnico') return; delete i.dataset.touched; if (!i.dataset.auto) i.value = ''; }); fillAuto();
    });
  }

  // ---------- guardar: abastecimiento ----------
  async function submitPurchase() {
    const form = $('#formCompra'), g = garitaById(state.kmAbas);
    const { vals, missing } = readFields(PURCHASE_FIELDS, 'c_', form);
    const ant = num(vals.cant_despues_gal), enc = num(vals.cant_encontrada_gal);
    if (ant != null && ant > g.cap) { missing.push('Cantidad después de llenado excede la capacidad (' + g.cap + ' gal)'); $('#c_cant_despues_gal').closest('.field').classList.add('err'); }
    if (enc != null && enc > g.cap) { missing.push('Cantidad encontrada excede la capacidad (' + g.cap + ' gal)'); $('#c_cant_encontrada_gal').closest('.field').classList.add('err'); }
    if (!photos.compra.factura) { missing.push('Foto de la factura y saldo de la tarjeta UNO'); $('[data-photo=factura]', form).classList.add('err'); }
    if (missing.length) return showErr('errC', missing);
    $('#errC').innerHTML = '';
    const foto = photos.compra.factura;
    await guarded($('button[type=submit]', form), 'Guardando…', async () => {
      const r = await API.savePurchase({ garita: g.id, km: g.km, datos: vals, foto });
      const rec = Object.assign({ id: r.id, garita: g.id, km: g.km, ts: r.ts, ts_ms: r.ts_ms, nivel_encontrado_pct: r.nivel_encontrado_pct, nivel_despues_pct: r.nivel_despues_pct }, vals);
      toast('Abastecimiento registrado');
      refresh();
      const pdf = () => safePdf(() => PDF.purchase(rec, g, foto));
      doneBox('abasDone', 'Abastecimiento registrado · ' + g.km + ' ' + g.nombre + ' · nivel ahora ' + r.nivel_despues_pct + '%', '', pdf);
      pdf();
      resetPhotos(form, photos.compra);
      $$('input', form).forEach((i) => { if (i.type === 'file' || i.id === 'c_tecnico') return; delete i.dataset.touched; if (!i.dataset.auto) i.value = ''; }); fillAuto(); hints();
    });
  }

  // ---------- estado por generador ----------
  function statusOf(g) {
    const S = DATA.settings, id = g.id, pts = [];
    const dl = DATA.diaria.filter((r) => r.garita === id), wl = DATA.semanal.filter((r) => r.garita === id), cl = DATA.compras.filter((r) => r.garita === id);
    dl.forEach((r) => pts.push({ ts: tsNum(r), nivel: num(r.nivel), horas: horasDe(r.horas_h, r.horas_m), bat: num(r.bateria_v) }));
    wl.forEach((r) => pts.push({ ts: tsNum(r), nivel: num(r.nivel_diesel), horas: horasDe(r.horometro_h, r.horometro_m), bat: num(r.bateria_voltaje) }));
    cl.forEach((r) => pts.push({ ts: tsNum(r), nivel: num(r.nivel_despues_pct), horas: num(r.horas_trabajadas) }));
    pts.sort((a, b) => b.ts - a.ts);
    const pick = (k) => { const p = pts.find((x) => x[k] != null); return p ? p[k] : null; };
    const nivel = pick('nivel'), horas = pick('horas'), bat = pick('bat');
    const ultD = dl.slice().sort((a, b) => tsNum(b) - tsNum(a))[0], ultS = wl.slice().sort((a, b) => tsNum(b) - tsNum(a))[0];
    const um = cfg(S, 'umbral_diesel'), vm = cfg(S, 'voltaje_min');
    const alertas = [];
    if (nivel != null && nivel < um) alertas.push('Nivel de diésel ' + fmtN(nivel) + '% (menor a ' + um + '%): abastecer');
    if (bat != null && bat < vm) alertas.push('Voltaje de batería ' + fmtN(bat) + ' V (mínimo ' + vm + ' V)');
    const sv = XS.servicio(horas, id, S);
    if (sv && sv.restan <= 0) alertas.push('Servicio general vencido (' + Math.round(Math.abs(sv.restan)) + ' h de retraso)');
    let semHall = [];
    if (ultS) semHall = (ultS.alertas || '').split(' | ').filter((a) => a && !/^Nivel de diésel|^Voltaje de batería/.test(a));
    if (semHall.length) alertas.push('Última semanal: ' + semHall.length + ' hallazgo(s) — ' + semHall.slice(0, 2).join('; ') + (semHall.length > 2 ? ' y ' + (semHall.length - 2) + ' más (ver PDF)' : ''));
    const sinDatos = !pts.length;
    return { g, nivel, horas, bat, sv, ultD, ultS, alertas, abastecer: nivel != null && nivel < um, estado: sinDatos ? 'none' : (alertas.length ? 'alert' : 'ok') };
  }
  const lvClass = (n) => n == null ? '' : n < 25 ? 'lv-crit' : n < cfg(DATA.settings, 'umbral_diesel') ? 'lv-warn' : 'lv-ok';

  function renderResumen() {
    const st = GARITAS.map(statusOf);
    const nAl = st.filter((s) => s.estado === 'alert').length, nAb = st.filter((s) => s.abastecer).length, nOk = st.filter((s) => s.estado === 'ok').length;
    $('#kpis').innerHTML = `<div class="kpi"><b style="color:var(--green-t)">${nOk}</b><span>Normales</span></div><div class="kpi"><b style="color:var(--red-t)">${nAl}</b><span>Con alertas</span></div><div class="kpi"><b style="color:var(--amber-t)">${nAb}</b><span>Por abastecer</span></div>`;
    const um = cfg(DATA.settings, 'umbral_diesel');
    $('#cards').innerHTML = st.map((s) => {
      const g = s.g, gal = s.nivel != null ? fmtN(s.nivel / 100 * g.cap) : null;
      const pill = s.estado === 'none' ? '<span class="pill none">Sin datos</span>' : s.estado === 'alert' ? '<span class="pill alert">Alerta</span>' : '<span class="pill ok">Normal</span>';
      const bat = s.bat != null && s.bat < cfg(DATA.settings, 'voltaje_min');
      const svTxt = s.sv ? (s.sv.restan <= 0 ? `<span class="bad">vencido (${Math.round(Math.abs(s.sv.restan))} h)</span>` : `faltan ${Math.round(s.sv.restan)} h`) : '—';
      return `<div class="card ${s.estado === 'alert' ? 'alert' : ''}">
        <div class="card-h"><div><b>${g.nombre}</b><span class="km">${g.km}</span></div>${pill}</div>
        <div class="fuel"><span class="muted small">Combustible (cap. ${g.cap} gal)</span><big class="${s.abastecer ? 'bad' : ''}">${s.nivel != null ? fmtN(s.nivel) + '%' : '—'}</big></div>
        <div class="bar"><span class="${lvClass(s.nivel)}" style="width:${Math.max(0, Math.min(100, s.nivel || 0))}%"></span><i class="mark" style="left:${um}%" title="${um}%"></i></div>
        <dl class="kv">
          <dt>Galones estimados</dt><dd>${gal != null ? gal + ' gal' : '—'}</dd>
          <dt>Horas de trabajo</dt><dd>${s.horas != null ? fmtN(s.horas) + ' h' : '—'}</dd>
          <dt>Servicio general</dt><dd>${svTxt}</dd>
          <dt>Voltaje batería</dt><dd class="${bat ? 'bad' : ''}">${s.bat != null ? fmtN(s.bat) + ' V' : '—'}</dd>
          <dt>Última diaria</dt><dd>${s.ultD ? esc(s.ultD.fecha + ' ' + s.ultD.hora) : '—'}</dd>
          <dt>Última semanal</dt><dd>${s.ultS ? esc(s.ultS.fecha) : '—'}</dd>
        </dl>
        ${s.alertas.length ? '<ul class="alist">' + s.alertas.map((a) => `<li>${esc(a)}</li>`).join('') + '</ul>' : ''}
        <div class="actions">
          <button class="btn sm ghost" data-act="pdf-d" data-id="${s.ultD ? s.ultD.id : ''}" ${s.ultD ? '' : 'disabled'}>PDF diaria</button>
          <button class="btn sm ghost" data-act="pdf-s" data-id="${s.ultS ? s.ultS.id : ''}" ${s.ultS ? '' : 'disabled'}>PDF semanal</button>
          ${s.abastecer ? `<button class="btn sm warn" data-act="abast" data-g="${g.id}">Abastecer</button>` : ''}
        </div></div>`;
    }).join('');
    // pestaña abastecimiento
    $('#abBadge').hidden = !nAb; $('#abBadge').textContent = nAb;
    $('#abAlerts').innerHTML = nAb ? st.filter((s) => s.abastecer).map((s) =>
      `<div class="alertcard ${s.nivel < 25 ? 'crit' : ''}"><div><b>${s.g.km} · ${s.g.nombre}</b><div class="small">Nivel ${fmtN(s.nivel)}% (menor a ${um}%) — se requiere abastecimiento</div></div><button class="btn sm warn" data-act="abast" data-g="${s.g.id}">Registrar</button></div>`).join('')
      : `<div class="okbox">Ningún generador está por debajo de ${um}%. No hay abastecimientos pendientes.</div>`;
  }

  // ---------- historial ----------
  function renderHistorial() {
    const fk = $('#fKm').value, ft = $('#fTipo').value;
    let items = [];
    DATA.diaria.forEach((r) => items.push({ t: 'diaria', r, sum: `Nivel ${r.nivel}% · ${r.horas_h} h · ${r.bateria_v} V` }));
    DATA.semanal.forEach((r) => { const n = (r.alertas || '').split(' | ').filter(Boolean).length; items.push({ t: 'semanal', r, sum: n ? n + ' hallazgo(s)' : 'Sin hallazgos' }); });
    DATA.compras.forEach((r) => items.push({ t: 'compra', r, sum: `${r.galones_comprados} gal · Q ${r.precio_total_q} · recibo ${r.no_recibo}` }));
    items = items.filter((i) => (!fk || i.r.garita === fk) && (!ft || i.t === ft)).sort((a, b) => tsNum(b.r) - tsNum(a.r)).slice(0, 100);
    const TAG = { diaria: ['d', 'Diaria'], semanal: ['s', 'Semanal'], compra: ['c', 'Abastecimiento'] };
    $('#histList').innerHTML = items.length ? items.map((i) => {
      const al = i.t !== 'compra' && (i.r.alertas || '').length;
      return `<div class="item ${al ? 'alert' : ''}"><div><div class="t"><span class="tag ${TAG[i.t][0]}">${TAG[i.t][1]}</span>${esc(i.r.km)} · ${esc(i.r.tecnico)}</div><div class="s">${esc(i.r.fecha || i.r.fecha_compra)}${i.r.hora ? ' ' + esc(i.r.hora) : ''} · ${esc(i.sum)}</div></div><button class="btn sm ghost" data-act="pdf-${i.t}" data-id="${esc(i.r.id)}">PDF</button></div>`;
    }).join('') : '<div class="muted">Sin registros.</div>';
  }

  // ---------- PDF desde datos guardados ----------
  async function downloadPdf(kind, id) {
    await safePdf(async () => {
      if (kind === 'diaria') {
        const r = DATA.diaria.find((x) => x.id === id); if (!r) throw new Error('Registro no encontrado');
        await PDF.daily(r, garitaById(r.garita), await API.getPhoto(r.firma_id));
      } else if (kind === 'semanal') {
        const r = DATA.semanal.find((x) => x.id === id); if (!r) throw new Error('Registro no encontrado');
        const ph = {}; await Promise.all(FOTOS_SEMANAL.map(async (f) => { ph[f.k] = await API.getPhoto(r['foto_' + f.k + '_id']); }));
        await PDF.weekly(r, garitaById(r.garita), ph, await API.getPhoto(r.firma_id));
      } else {
        const r = DATA.compras.find((x) => x.id === id); if (!r) throw new Error('Registro no encontrado');
        await PDF.purchase(r, garitaById(r.garita), await API.getPhoto(r.foto_id));
      }
    });
  }
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-act]'); if (!b || b.disabled) return;
    const a = b.dataset.act;
    if (a === 'pdf-d' || a === 'pdf-diaria') downloadPdf('diaria', b.dataset.id);
    else if (a === 'pdf-s' || a === 'pdf-semanal') downloadPdf('semanal', b.dataset.id);
    else if (a === 'pdf-compra') downloadPdf('compra', b.dataset.id);
    else if (a === 'abast') { state.kmAbas = b.dataset.g; paintKmAbas(); goto('abastecimiento'); hints(); setTimeout(() => $('#formCompra').scrollIntoView({ behavior: 'smooth' }), 50); }
  });

  // ---------- ajustes ----------
  function openSettings() {
    $('#sIntervalo').value = cfg(DATA.settings, 'servicio_intervalo');
    $('#sBases').innerHTML = GARITAS.map((g) => `<div class="field"><label>${g.km} · ${g.nombre} — horas del generador en su último servicio</label><input inputmode="decimal" data-base="${g.id}" value="${cfg(DATA.settings, 'servicio_base_' + g.id)}"></div>`).join('');
    $('#modalAjustes').hidden = false;
  }
  $('#btnAjustes').onclick = openSettings;
  $('#sCancel').onclick = () => ($('#modalAjustes').hidden = true);
  $('#sSave').onclick = async () => {
    const s = { servicio_intervalo: $('#sIntervalo').value.trim().replace(',', '.') };
    $$('[data-base]').forEach((i) => (s['servicio_base_' + i.dataset.base] = i.value.trim().replace(',', '.')));
    if (Object.values(s).some((v) => num(v) == null)) return toast('Todos los valores deben ser numéricos', true);
    try { const r = await API.saveSettings(s); DATA.settings = r.settings || Object.assign(DATA.settings, s); $('#modalAjustes').hidden = true; renderAll(); toast('Ajustes guardados'); }
    catch (e) { toast(netMsg(e), true); }
  };

  // ---------- carga ----------
  function renderAll() { renderResumen(); renderHistorial(); hints(); }
  async function refresh() {
    try {
      const d = await API.getAll();
      DATA = { diaria: d.diaria || [], semanal: d.semanal || [], compras: d.compras || [], settings: Object.assign({}, XS.DEFAULTS, d.settings || {}) };
      $('#conn').className = 'conn ok'; renderAll();
    } catch (e) { $('#conn').className = 'conn err'; toast(netMsg(e), true); }
  }

  // ---------- inicio ----------
  function init() {
    if (API.DEMO) $('#demoBanner').hidden = false;
    buildForms();
    paintKmInsp = chips('#kmInsp', 'km', () => { $('#inspDone').hidden = true; });
    paintKmAbas = chips('#kmAbas', 'kmAbas', () => { $('#abasDone').hidden = true; hints(); });
    $('#fKm').innerHTML = '<option value="">Todos los KM</option>' + GARITAS.map((g) => `<option value="${g.id}">${g.km} · ${g.nombre}</option>`).join('');
    $('#fKm').onchange = $('#fTipo').onchange = renderHistorial;
    $('#tipoSeg').addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b) return; state.tipo = b.dataset.tipo;
      $$('#tipoSeg button').forEach((x) => x.classList.toggle('on', x === b));
      $('#formDiaria').hidden = state.tipo !== 'diaria'; $('#formSemanal').hidden = state.tipo !== 'semanal'; $('#inspDone').hidden = true; sizePads();
    });
    const t = location.hash.replace('#', ''); if (['resumen', 'inspeccion', 'abastecimiento', 'historial'].includes(t)) goto(t); else fillAuto();
    refresh();
    setInterval(() => { if (!document.hidden && !state.busy) refresh(); }, 30000);
  }
  init();
})();
