/**
 * Xochi · Generadores v2 — backend (Google Apps Script, script vinculado a la hoja de cálculo)
 * Hojas: Diaria, Semanal, Compras, Ajustes. Fotos y firmas se guardan en Drive (carpeta "Xochi Generadores - Fotos").
 */
var TZ = 'America/Guatemala';

// ---------- SEGURIDAD (la clave SOLO vive aquí, nunca en el HTML ni en config.js) ----------
var CLAVE = 'CAMBIA-ESTA-CLAVE';   // contraseña de acceso. Cámbiala antes de implementar.
var SESSION_HOURS = 12;            // duración de la sesión
var MAX_FAILS = 5;                 // intentos fallidos antes de bloquear
var LOCK_MINUTES = 5;              // minutos de bloqueo
var FOLDER_NAME = 'Xochi Generadores - Fotos';
var GARITAS = ['garita1', 'garita2', 'garita3', 'garita4'];
var CAPACIDADES = { garita1: 66, garita2: 26, garita3: 26, garita4: 66 };
var DEFAULTS = {
  umbral_diesel: '70', voltaje_min: '24.5', servicio_intervalo: '500',
  servicio_base_garita1: '0', servicio_base_garita2: '0', servicio_base_garita3: '0', servicio_base_garita4: '0'
};
var EDITABLE_SETTINGS = ['servicio_intervalo', 'servicio_intervalo_garita1', 'servicio_intervalo_garita2', 'servicio_intervalo_garita3', 'servicio_intervalo_garita4',
  'servicio_base_garita1', 'servicio_base_garita2', 'servicio_base_garita3', 'servicio_base_garita4'];
var INITIAL_HEADERS = {
  Diaria: ['id', 'garita', 'km', 'tecnico', 'fecha', 'hora', 'encendido', 'l1n', 'l2n', 'l1l2', 'a_l1', 'a_l2', 'a_n', 'kwh', 'nivel', 'horas_h', 'horas_m', 'bateria_v', 'notas', 'firma_id', 'alertas', 'ts', 'ts_ms'],
  Semanal: ['id', 'garita', 'km', 'tecnico', 'fecha', 'hora'],
  Compras: ['id', 'garita', 'km', 'tecnico', 'fecha_compra', 'cant_encontrada_gal', 'horas_trabajadas', 'galones_comprados', 'cant_despues_gal', 'precio_total_q', 'no_recibo', 'saldo_uno', 'nivel_encontrado_pct', 'nivel_despues_pct', 'foto_id', 'ts', 'ts_ms']
};

// ---------- entrada ----------
// Todo pasa por POST (la sesión nunca viaja en la URL). GET no devuelve datos.
function doGet(e) {
  return json_({ ok: true, status: 'Xochi Generadores API' });
}

function doPost(e) {
  try {
    var p = JSON.parse(e.postData.contents);

    if (p.action === 'login') return withLock_(function () { return doLogin(p); });

    // Sin sesión válida el servidor no lee ni modifica nada.
    if (!isValidSession(p.session)) return json_({ ok: false, code: 'AUTH', error: 'Sesión no válida o expirada.' });

    if (p.action === 'getAll') return json_(getAll_());
    if (p.action === 'getPhoto') return json_(getPhoto_(p.id));
    return withLock_(function () {
      if (p.action === 'saveDaily') return saveDaily_(p);
      if (p.action === 'saveWeekly') return saveWeekly_(p);
      if (p.action === 'savePurchase') return savePurchase_(p);
      if (p.action === 'saveSettings') return saveSettings_(p);
      return { ok: false, error: 'Acción desconocida' };
    });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  }
}

function withLock_(fn) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try { return json_(fn()); } finally { try { lock.releaseLock(); } catch (x) {} }
}

// ---------- autenticación ----------
function doLogin(payload) {
  if (CLAVE === 'CAMBIA-ESTA-CLAVE') return { ok: false, error: 'El servidor aún no tiene una CLAVE configurada (Code.gs).' };
  var cache = CacheService.getScriptCache();
  var fails = parseInt(cache.get('login_fails') || '0', 10) || 0;
  if (fails >= MAX_FAILS) {
    var t = parseInt(cache.get('login_fails_t') || '0', 10) || Date.now();
    var left = Math.max(1, Math.ceil((t + LOCK_MINUTES * 60000 - Date.now()) / 60000));
    return { ok: false, error: 'Demasiados intentos. Espera ' + left + (left === 1 ? ' minuto.' : ' minutos.') };
  }
  var clave = String((payload && payload.clave) || '').substring(0, 200);
  if (!safeEqual(clave, CLAVE)) {
    cache.put('login_fails', String(fails + 1), LOCK_MINUTES * 60);   // el contador expira a los LOCK_MINUTES
    cache.put('login_fails_t', String(Date.now()), LOCK_MINUTES * 60);
    return { ok: false, error: 'Clave incorrecta.' };
  }
  cache.remove('login_fails');
  cache.remove('login_fails_t');
  var exp = Date.now() + SESSION_HOURS * 3600 * 1000;
  return { ok: true, data: { session: exp + '.' + signSession(String(exp)) } };
}

function isValidSession(s) {
  if (typeof s !== 'string') return false;
  var i = s.indexOf('.');
  if (i < 1) return false;
  var expStr = s.substring(0, i), sig = s.substring(i + 1);
  if (!/^\d{10,15}$/.test(expStr)) return false;
  var exp = Number(expStr), now = Date.now();
  if (exp <= now || exp > now + SESSION_HOURS * 3600 * 1000 + 60000) return false;
  return safeEqual(sig, signSession(expStr));
}

// Llave de firma: secreto aleatorio guardado en el servidor + CLAVE (si cambias la CLAVE, todas las sesiones se invalidan).
function sessionKey_() {
  var props = PropertiesService.getScriptProperties();
  var sec = props.getProperty('SESSION_SECRET');
  if (!sec) {
    sec = Utilities.getUuid() + Utilities.getUuid() + Utilities.getUuid();
    props.setProperty('SESSION_SECRET', sec);
  }
  return sec + '|' + CLAVE;
}

function signSession(msg) {
  var sig = Utilities.computeHmacSha256Signature(String(msg), sessionKey_());
  return Utilities.base64EncodeWebSafe(sig).replace(/=+$/, '');
}

// Comparación en tiempo constante
function safeEqual(a, b) {
  a = String(a); b = String(b);
  var diff = a.length ^ b.length, n = Math.max(a.length, b.length);
  for (var i = 0; i < n; i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}

function json_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}

// ---------- lectura ----------
function getAll_() {
  return {
    ok: true,
    diaria: readRows_('Diaria'),
    semanal: readRows_('Semanal'),
    compras: readRows_('Compras'),
    settings: readSettings_(),
    capacidades: CAPACIDADES
  };
}

function readRows_(name) {
  var sh = getSheet_(name);
  var last = sh.getLastRow(), cols = sh.getLastColumn();
  if (last < 2 || cols < 1) return [];
  var vals = sh.getRange(1, 1, last, cols).getDisplayValues();
  var head = vals[0], rows = [];
  for (var i = vals.length - 1; i >= 1 && rows.length < 500; i--) {   // más recientes primero, máx. 500
    var o = {};
    for (var c = 0; c < head.length; c++) if (head[c]) o[head[c]] = vals[i][c];
    rows.push(o);
  }
  return rows;
}

function readSettings_() {
  var sh = getSheet_('Ajustes'), out = {};
  for (var k in DEFAULTS) out[k] = DEFAULTS[k];
  var last = sh.getLastRow();
  if (last >= 1) sh.getRange(1, 1, last, 2).getDisplayValues().forEach(function (r) { if (r[0] && r[1] !== '') out[r[0]] = r[1]; });
  return out;
}

function getPhoto_(id) {
  if (!id || !/^[A-Za-z0-9_-]{10,}$/.test(id)) throw new Error('Id inválido');
  var folderId = folder_().getId(), file = DriveApp.getFileById(id), ok = false, it = file.getParents();
  while (it.hasNext()) { if (it.next().getId() === folderId) ok = true; }
  if (!ok) throw new Error('Archivo no permitido');
  var b = file.getBlob();
  return { ok: true, data: 'data:' + b.getContentType() + ';base64,' + Utilities.base64Encode(b.getBytes()) };
}

// ---------- escritura ----------
function saveDaily_(p) {
  checkGarita_(p.garita);
  var d = p.datos || {};
  ['tecnico', 'fecha', 'hora', 'nivel', 'horas_h', 'bateria_v'].forEach(function (k) { if (!d[k]) throw new Error('Falta el campo: ' + k); });
  if (!p.firma || String(p.firma).length < 100) throw new Error('Falta la firma del técnico');
  var rec = baseRec_(p);
  copyDatos_(rec, d);
  rec.firma_id = saveImage_(p.firma, 'firma_diaria_' + p.garita);
  rec.alertas = String(p.alertas || '');
  stamp_(rec);
  appendObj_('Diaria', rec);
  return { ok: true, id: rec.id, ts: rec.ts, ts_ms: rec.ts_ms };
}

function saveWeekly_(p) {
  checkGarita_(p.garita);
  var d = p.datos || {};
  if (!d.tecnico || !d.fecha || !d.hora) throw new Error('Faltan técnico, fecha u hora');
  if (!p.firma || String(p.firma).length < 100) throw new Error('Falta la firma del técnico');
  var fotos = p.fotos || {}, req = ['filtro_aire', 'filtro_diesel', 'varilla_aceite', 'pantalla_generador'];
  req.forEach(function (k) { if (!fotos[k]) throw new Error('Falta la foto: ' + k); });
  var rec = baseRec_(p);
  copyDatos_(rec, d);
  req.forEach(function (k) { rec['foto_' + k + '_id'] = saveImage_(fotos[k], 'semanal_' + p.garita + '_' + k); });
  rec.firma_id = saveImage_(p.firma, 'firma_semanal_' + p.garita);
  rec.alertas = String(p.alertas || '');
  stamp_(rec);
  appendObj_('Semanal', rec);
  return { ok: true, id: rec.id, ts: rec.ts, ts_ms: rec.ts_ms };
}

function savePurchase_(p) {
  checkGarita_(p.garita);
  var d = p.datos || {};
  ['tecnico', 'fecha_compra', 'cant_encontrada_gal', 'horas_trabajadas', 'cant_despues_gal', 'galones_comprados', 'precio_total_q', 'no_recibo'].forEach(function (k) {
    if (!d[k]) throw new Error('Falta el campo: ' + k);
  });
  if (!p.foto) throw new Error('Falta la foto de la factura y saldo de la tarjeta UNO');
  var cap = CAPACIDADES[p.garita];
  var enc = parseFloat(String(d.cant_encontrada_gal).replace(',', '.')), des = parseFloat(String(d.cant_despues_gal).replace(',', '.'));
  var rec = baseRec_(p);
  copyDatos_(rec, d);
  rec.nivel_encontrado_pct = isNaN(enc) ? '' : String(Math.round(Math.min(cap, enc) / cap * 1000) / 10);
  rec.nivel_despues_pct = isNaN(des) ? '' : String(Math.round(Math.min(cap, des) / cap * 1000) / 10);
  rec.foto_id = saveImage_(p.foto, 'compra_' + p.garita);
  stamp_(rec);
  appendObj_('Compras', rec);
  return { ok: true, id: rec.id, ts: rec.ts, ts_ms: rec.ts_ms, nivel_despues_pct: rec.nivel_despues_pct, nivel_encontrado_pct: rec.nivel_encontrado_pct };
}

function saveSettings_(p) {
  var sh = getSheet_('Ajustes'), s = p.settings || {}, cur = readSettings_();
  EDITABLE_SETTINGS.forEach(function (k) {
    if (s[k] !== undefined && s[k] !== '' && !isNaN(parseFloat(s[k]))) cur[k] = String(s[k]);
  });
  var rows = Object.keys(cur).map(function (k) { return [k, cur[k]]; });
  sh.clear();
  sh.getRange(1, 1, rows.length, 2).setNumberFormat('@').setValues(rows);
  return { ok: true, settings: cur };
}

// ---------- utilidades ----------
function checkGarita_(g) { if (GARITAS.indexOf(g) < 0) throw new Error('Garita inválida'); }
function baseRec_(p) { return { id: Utilities.getUuid(), garita: p.garita, km: String(p.km || '') }; }
function stamp_(rec) {
  var now = new Date();
  rec.ts = Utilities.formatDate(now, TZ, 'dd/MM/yyyy HH:mm:ss');
  rec.ts_ms = String(now.getTime());
}
function copyDatos_(rec, d) {
  Object.keys(d).forEach(function (k) {
    if (!/^[a-z0-9_]{1,40}$/.test(k) || k in rec) return;
    rec[k] = String(d[k] == null ? '' : d[k]).substring(0, 2000);
  });
}

function folder_() {
  var it = DriveApp.getFoldersByName(FOLDER_NAME);
  return it.hasNext() ? it.next() : DriveApp.createFolder(FOLDER_NAME);
}

function saveImage_(dataUrl, name) {
  var m = /^data:(image\/(?:jpeg|png));base64,(.+)$/.exec(String(dataUrl));
  if (!m) throw new Error('Imagen inválida');
  var ext = m[1] === 'image/png' ? '.png' : '.jpg';
  var blob = Utilities.newBlob(Utilities.base64Decode(m[2]), m[1], name + '_' + Date.now() + ext);
  return folder_().createFile(blob).getId();
}

function getSheet_(name) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    var h = INITIAL_HEADERS[name];
    if (h) { setCols_(sh, 1, h); sh.setFrozenRows(1); }
  }
  return sh;
}

// Crea columnas nuevas (texto plano) y escribe encabezados
function setCols_(sh, startCol, names) {
  var rng = sh.getRange(1, startCol, 1, names.length);
  rng.setNumberFormat('@').setValues([names]).setFontWeight('bold').setBackground('#1B2A4A').setFontColor('#FFFFFF');
  sh.getRange(2, startCol, Math.max(sh.getMaxRows() - 1, 1), names.length).setNumberFormat('@');
}

function appendObj_(name, rec) {
  var sh = getSheet_(name);
  var cols = sh.getLastColumn();
  var head = cols > 0 ? sh.getRange(1, 1, 1, cols).getValues()[0] : [];
  var missing = Object.keys(rec).filter(function (k) { return head.indexOf(k) < 0; });
  if (missing.length) {
    setCols_(sh, head.length + 1, missing);
    head = head.concat(missing);
    if (sh.getFrozenRows() < 1) sh.setFrozenRows(1);
  }
  var row = head.map(function (k) { return rec[k] === undefined ? '' : rec[k]; });
  var r = Math.max(sh.getLastRow(), 1) + 1;
  sh.getRange(r, 1, 1, row.length).setNumberFormat('@').setValues([row]);
}
