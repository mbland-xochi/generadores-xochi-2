// Reportes PDF (jsPDF + autotable, incluidos en /vendor — no dependen de internet)
(function () {
  const NAVY = [27, 42, 74], CYAN = [0, 147, 208], GREEN = [10, 166, 76], RED = [200, 30, 70], GREY = [244, 246, 248];
  const W = 215.9, M = 14;

  // Carga las librerías de PDF desde /vendor; si no están en el repositorio, usa cdnjs como respaldo.
  function loadScript(src) {
    return new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new Error('No se pudo cargar ' + src)); document.head.appendChild(s); });
  }
  async function ensureLib() {
    if (window.jspdf && window.jspdf.jsPDF && new window.jspdf.jsPDF().autoTable) return;
    const base = 'https://cdnjs.cloudflare.com/ajax/libs/';
    if (!(window.jspdf && window.jspdf.jsPDF)) { try { await loadScript('vendor/jspdf.umd.min.js'); } catch (e) {} }
    if (!(window.jspdf && window.jspdf.jsPDF)) await loadScript(base + 'jspdf/2.5.1/jspdf.umd.min.js');
    if (!new window.jspdf.jsPDF().autoTable) {
      try { await loadScript('vendor/jspdf.plugin.autotable.min.js'); } catch (e) {}
      if (!new window.jspdf.jsPDF().autoTable) await loadScript(base + 'jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js');
    }
  }
  function newDoc() { return new window.jspdf.jsPDF({ unit: 'mm', format: 'letter' }); }

  let LOGO = null;
  function logoData() {
    if (LOGO) return LOGO;
    const im = document.querySelector('.logo-img');
    if (!im || !im.naturalWidth) return null;
    const c = document.createElement('canvas'); c.width = im.naturalWidth; c.height = im.naturalHeight;
    c.getContext('2d').drawImage(im, 0, 0);
    LOGO = { data: c.toDataURL('image/png'), r: im.naturalWidth / im.naturalHeight };
    return LOGO;
  }
  function header(doc, titulo, g) {
    const lg = logoData(), h = 15;
    if (lg) doc.addImage(lg.data, 'PNG', M, 5, h * lg.r, h);
    else { doc.setTextColor(...NAVY); doc.setFont('helvetica', 'bold'); doc.setFontSize(18); doc.text('Xochi', M, 15); }
    doc.setTextColor(...NAVY); doc.setFont('helvetica', 'bold'); doc.setFontSize(11);
    doc.text('ÁREA ELÉCTRICA · GENERADORES', W - M, 11, { align: 'right' });
    doc.setFontSize(9); doc.setTextColor(...CYAN); doc.text(g.nombre + ' · ' + g.km, W - M, 16.5, { align: 'right' });
    const seg = [[10, 166, 76], [91, 184, 73], [31, 179, 229], [0, 147, 208]], sw = W / seg.length;
    seg.forEach((s, i) => { doc.setFillColor(...s); doc.rect(i * sw, 22, sw + 0.1, 2.2, 'F'); });
    doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(...NAVY); doc.text(titulo, M, 31);
    doc.setTextColor(0);
    return 36;
  }

  function footers(doc) {
    const n = doc.getNumberOfPages(), d = new Date();
    const p2 = (x) => String(x).padStart(2, '0');
    const stamp = p2(d.getDate()) + '/' + p2(d.getMonth() + 1) + '/' + d.getFullYear() + ' ' + p2(d.getHours()) + ':' + p2(d.getMinutes());
    for (let i = 1; i <= n; i++) {
      doc.setPage(i); doc.setFontSize(8); doc.setTextColor(120); doc.setFont('helvetica', 'normal');
      doc.text('Xochi · Herramienta Generadores — generado ' + stamp, M, 273);
      doc.text('Página ' + i + ' de ' + n, W - M, 273, { align: 'right' });
    }
  }

  function infoTable(doc, y, rows) {
    doc.autoTable({
      startY: y, theme: 'grid', body: rows, margin: { left: M, right: M },
      styles: { fontSize: 9, cellPadding: 1.8, lineColor: [184, 194, 204], lineWidth: 0.2 },
      columnStyles: { 0: { fillColor: GREY, fontStyle: 'bold', textColor: NAVY, cellWidth: 38 }, 2: { fillColor: GREY, fontStyle: 'bold', textColor: NAVY, cellWidth: 38 } }
    });
    return doc.lastAutoTable.finalY + 5;
  }

  function sectionTable(doc, y, titulo, rows) {
    doc.autoTable({
      startY: y, theme: 'grid', margin: { left: M, right: M },
      head: [[{ content: titulo, colSpan: 2, styles: { halign: 'left' } }]],
      body: rows.map((r) => [r.label, r.value || '—']),
      headStyles: { fillColor: GREEN, textColor: 255, fontSize: 9 },
      styles: { fontSize: 8.5, cellPadding: 1.5, lineColor: [184, 194, 204], lineWidth: 0.2 },
      columnStyles: { 0: { cellWidth: 100 } },
      didParseCell: (d) => {
        if (d.section === 'body' && rows[d.row.index] && rows[d.row.index].bad) {
          d.cell.styles.textColor = RED; d.cell.styles.fontStyle = 'bold';
        }
      }
    });
    return doc.lastAutoTable.finalY + 4;
  }

  function alertBox(doc, y, alertas) {
    const list = (alertas || '').split(' | ').filter(Boolean);
    doc.autoTable({
      startY: y, theme: 'grid', margin: { left: M, right: M },
      head: [[list.length ? 'ALERTAS Y HALLAZGOS (' + list.length + ')' : 'SIN ALERTAS NI HALLAZGOS']],
      body: list.map((a) => [a]),
      headStyles: { fillColor: list.length ? RED : GREEN, textColor: 255, fontSize: 9 },
      styles: { fontSize: 8.5, cellPadding: 1.5, lineColor: [184, 194, 204], lineWidth: 0.2 }
    });
    return doc.lastAutoTable.finalY + 5;
  }

  function loadImg(src) {
    return new Promise((res) => { const im = new Image(); im.onload = () => res(im); im.onerror = () => res(null); im.src = src; });
  }
  // Dibuja una imagen ajustada dentro de una caja, centrada
  async function fitImage(doc, src, x, y, bw, bh) {
    if (!src) return;
    const im = await loadImg(src); if (!im) return;
    const s = Math.min(bw / im.width, bh / im.height), w = im.width * s, h = im.height * s;
    doc.addImage(src, src.indexOf('image/png') > 0 ? 'PNG' : 'JPEG', x + (bw - w) / 2, y + (bh - h) / 2, w, h);
  }
  function need(doc, y, h) { if (y + h > 268) { doc.addPage(); return 14; } return y; }

  async function signatureBlock(doc, y, firma, tecnico) {
    y = need(doc, y, 40);
    doc.setFontSize(9); doc.setFont('helvetica', 'bold'); doc.setTextColor(...NAVY);
    doc.text('Firma del técnico', M, y);
    doc.setDrawColor(184, 194, 204); doc.rect(M, y + 2, 80, 28);
    await fitImage(doc, firma, M + 1, y + 3, 78, 26);
    doc.setFont('helvetica', 'normal'); doc.setTextColor(60); doc.text(tecnico || '', M, y + 35);
    return y + 40;
  }

  const save = (doc, name) => doc.save(name);
  const fn = (tipo, rec) => tipo + '_' + String(rec.km).replace(/\s/g, '') + '_' + String(rec.fecha || '').replace(/\//g, '-') + '.pdf';

  async function daily(rec, g, firma) {
    await ensureLib();
    const doc = newDoc(); let y = header(doc, 'CHECK LIST RUTINARIO — INSPECCIÓN DIARIA', g);
    y = infoTable(doc, y, [['Garita', g.nombre, 'Kilómetro', g.km], ['Fecha', rec.fecha, 'Hora', rec.hora], ['Técnico', { content: rec.tecnico, colSpan: 3 }]]);
    y = sectionTable(doc, y, 'VOLTAJES (V)', [{ label: 'L1 / N', value: rec.l1n }, { label: 'L2 / N', value: rec.l2n }, { label: 'L1 / L2', value: rec.l1l2 }]);
    y = sectionTable(doc, y, 'CARGA (A)', [{ label: 'L1', value: rec.a_l1 }, { label: 'L2', value: rec.a_l2 }, { label: 'N', value: rec.a_n }]);
    const alerts = (rec.alertas || '');
    y = sectionTable(doc, y, 'CONTADOR Y GENERADOR', [
      { label: 'kW/h actual', value: rec.kwh },
      { label: 'Nivel diésel (%)', value: rec.nivel, bad: /Nivel de diésel/.test(alerts) },
      { label: 'Horas de trabajo', value: rec.horas_h + ' h ' + (rec.horas_m || '0') + ' min' },
      { label: 'Voltaje batería (V)', value: rec.bateria_v, bad: /Voltaje de batería/.test(alerts) },
    ]);
    if (rec.notas) y = sectionTable(doc, y, 'NOTAS', [{ label: 'Notas', value: rec.notas }]);
    y = alertBox(doc, y, rec.alertas);
    await signatureBlock(doc, y, firma, rec.tecnico);
    footers(doc); save(doc, fn('Diaria', rec));
  }

  async function weekly(rec, g, photos, firma) {
    await ensureLib();
    const doc = newDoc(); let y = header(doc, 'REVISIÓN SEMANAL DE GENERADOR', g);
    y = infoTable(doc, y, [['Garita', g.nombre, 'Kilómetro', g.km], ['Fecha', rec.fecha, 'Hora', rec.hora], ['Técnico', { content: rec.tecnico, colSpan: 3 }]]);
    XS.WEEKLY_SECTIONS.forEach((s) => {
      const rows = [];
      s.items.forEach((it) => {
        let v = rec[it.k];
        if (it.k === 'horometro_h') { rows.push({ label: 'Horómetro encontrado', value: (rec.horometro_h || '—') + ' h ' + (rec.horometro_m || '0') + ' min' }); return; }
        if (it.k === 'horometro_m') return;
        if (it.k === 'proximo_h') { rows.push({ label: 'Próximo servicio', value: (rec.proximo_h || '—') + ' h ' + (rec.proximo_m || '0') + ' min' }); return; }
        if (it.k === 'proximo_m') return;
        const bad = it.t === 'sel' && it.bad.indexOf(it.opts.indexOf(v)) >= 0;
        rows.push({ label: it.label, value: v, bad });
      });
      y = sectionTable(doc, y, s.titulo.toUpperCase(), rows);
    });
    y = alertBox(doc, y, rec.alertas);
    // Fotos
    doc.addPage(); y = header(doc, 'EVIDENCIA FOTOGRÁFICA — REVISIÓN SEMANAL', g);
    const bw = (W - 2 * M - 8) / 2, bh = 76;
    for (let i = 0; i < XS.FOTOS_SEMANAL.length; i++) {
      const f = XS.FOTOS_SEMANAL[i], col = i % 2, row = Math.floor(i / 2);
      const x = M + col * (bw + 8), yy = y + row * (bh + 14);
      doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(...NAVY); doc.text(f.label, x, yy);
      doc.setDrawColor(184, 194, 204); doc.rect(x, yy + 2, bw, bh);
      await fitImage(doc, photos[f.k], x + 1, yy + 3, bw - 2, bh - 2);
    }
    y = y + 2 * (bh + 14) + 2;
    await signatureBlock(doc, y, firma, rec.tecnico);
    footers(doc); save(doc, fn('Semanal', rec));
  }

  async function purchase(rec, g, foto) {
    await ensureLib();
    const doc = newDoc(); let y = header(doc, 'REPORTE DE ABASTECIMIENTO DE COMBUSTIBLE', g);
    const gal = XS.num(rec.galones_comprados), tot = XS.num(rec.precio_total_q);
    const ppg = gal && tot ? (tot / gal).toFixed(2) : '—';
    y = infoTable(doc, y, [['Garita', g.nombre, 'Kilómetro', g.km], ['Fecha de compra', rec.fecha_compra, 'Técnico', rec.tecnico]]);
    y = sectionTable(doc, y, 'NIVEL DE COMBUSTIBLE (capacidad ' + g.cap + ' galones)', [
      { label: 'Cantidad encontrada', value: rec.cant_encontrada_gal + ' gal  (' + (rec.nivel_encontrado_pct || '—') + '%)' },
      { label: 'Horas trabajadas', value: rec.horas_trabajadas },
      { label: 'Galones comprados', value: rec.galones_comprados + ' gal' },
      { label: 'Cantidad después de llenado', value: rec.cant_despues_gal + ' gal  (' + (rec.nivel_despues_pct || '—') + '%)' },
    ]);
    y = sectionTable(doc, y, 'COMPRA', [
      { label: 'Precio total', value: 'Q ' + rec.precio_total_q },
      { label: 'Precio por galón (calculado)', value: ppg === '—' ? ppg : 'Q ' + ppg },
      { label: 'Número de recibo de la factura', value: rec.no_recibo },
      { label: 'Saldo tarjeta UNO', value: rec.saldo_uno ? 'Q ' + rec.saldo_uno : 'No consultado' },
    ]);
    y = need(doc, y, 110);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(...NAVY); doc.text('Factura y saldo de la tarjeta UNO', M, y);
    doc.setDrawColor(184, 194, 204); doc.rect(M, y + 2, W - 2 * M, 150 > 268 - y ? 268 - y - 4 : 150);
    await fitImage(doc, foto, M + 1, y + 3, W - 2 * M - 2, (150 > 268 - y ? 268 - y - 4 : 150) - 2);
    footers(doc); save(doc, fn('Abastecimiento', { km: rec.km, fecha: rec.fecha_compra }));
  }

  window.PDF = { daily, weekly, purchase };
})();
