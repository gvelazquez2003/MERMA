const CONFIG = {
  spreadsheetId: '18WPHKhmnGtoNiHuALuK8486VuJeMq8LHF0tKZArq3hs',
  mermaSheetName: 'MERMA',
  productSheets: {
    latata: 'PRODUCTOS',
    pandt: 'PRODUCTOS PDT',
  },
  timeZone: Session.getScriptTimeZone() || 'America/Caracas',
  duplicateWindowMinutes: 15,
  duplicateScanRows: 1200,
  headersMerma: [
    'TIMESTAMP',
    'EMPRESA',
    'FECHA',
    'HORA',
    'SEDE',
    'RESPONSABLE',
    'CODIGO',
    'PRODUCTO',
    'UNIDAD',
    'CANTIDAD_MERMA',
    'MOTIVO',
    'LOTE',
  ],
};

function doGet(e) {
  try {
    const action = String((e && e.parameter && e.parameter.action) || '').toLowerCase();
    const empresa = normalizeEmpresa_((e && e.parameter && e.parameter.empresa) || '');

    if (action === 'ping' || !action) {
      return json_({ ok: true, success: true, message: 'Servicio MERMA disponible.' });
    }

    if (action === 'getproducts') {
      const products = getProducts_(empresa || 'latata');
      return json_({ success: true, data: { products }, message: 'Catálogo cargado.' });
    }

    if (action === 'productos') {
      const products = getProducts_(empresa || 'pandt').map((p) => ({
        codigo: p.code,
        descripcion: p.description,
        unidad: p.unit,
      }));
      return json_({ ok: true, products });
    }

    return json_({ ok: false, success: false, error: 'Acción GET no soportada.' });
  } catch (error) {
    return json_({ ok: false, success: false, error: String(error.message || error) });
  }
}

function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);

  try {
    const parsed = parsePostRequest_(e);

    if (parsed.mode === 'json') {
      const action = String(parsed.action || '').toLowerCase();
      if (action !== 'recordmerma') {
        throw new Error('Acción POST no soportada.');
      }

      const empresa = normalizeEmpresa_(parsed.payload.empresa || 'latata');
      const result = appendMermaRows_({
        empresa,
        fecha: parsed.payload.fecha,
        hora: parsed.payload.hora,
        sede: parsed.payload.sede,
        responsable: parsed.payload.responsable,
        items: parsed.payload.items,
      });

      return json_({
        success: true,
        data: { rowsInserted: result.rowsInserted },
        message: `Merma registrada: ${result.rowsInserted}`,
      });
    }

    if (parsed.mode === 'form') {
      const params = parsed.params;
      const empresa = normalizeEmpresa_(params.empresa || 'pandt');
      const items = parseProductosJson_(params.productos_json);

      const result = appendMermaRows_({
        empresa,
        fecha: params.fecha,
        hora: params.hora,
        sede: params.sede,
        responsable: params.responsable,
        items,
      });

      return json_({ ok: true, inserted: result.rowsInserted });
    }

    throw new Error('Formato POST no soportado.');
  } catch (error) {
    var errorMessage = String(error.message || error);
    return json_({ ok: false, success: false, error: errorMessage, message: errorMessage });
  } finally {
    lock.releaseLock();
  }
}

function appendMermaRows_(payload) {
  validateRequired_(payload, ['empresa', 'fecha', 'sede']);

  const itemsInput = Array.isArray(payload.items) ? payload.items : [];
  if (!itemsInput.length) {
    throw new Error('Debes enviar al menos un producto.');
  }

  const empresa = normalizeEmpresa_(payload.empresa);
  const catalogByCode = getCatalogMap_(empresa);

  const rows = itemsInput.map((item, index) => {
    const codeRaw = item.productCode || item.codigo || item.code;
    const code = String(codeRaw || '').trim();
    const qtyRaw = item.cantidadMerma || item.cantidad || item.qty || item.quantity;
    const qty = Number(qtyRaw);

    if (!code) {
      throw new Error(`Producto sin código en la fila ${index + 1}.`);
    }
    if (!Number.isFinite(qty) || qty <= 0) {
      throw new Error(`Cantidad inválida en la fila ${index + 1}.`);
    }

    const catalogItem = catalogByCode[code] || null;
    const productName = String(
      item.productName || item.descripcion || item.description || (catalogItem && catalogItem.description) || ''
    ).trim();
    const unit = String(item.unit || item.unidad || (catalogItem && catalogItem.unit) || 'UND').trim();
    const motivo = String(item.motivo || '').trim();
    const lote = String(item.lote || '').trim();

    return [
      new Date(),
      empresaLabel_(empresa),
      normalizeDate_(payload.fecha),
      String(payload.hora || '').trim(),
      String(payload.sede || '').trim(),
      String(payload.responsable || '').trim(),
      code,
      productName,
      unit,
      qty,
      motivo,
      lote,
    ];
  });

  const sheet = getOrCreateMermaSheet_();
  ensureHeaders_(sheet, CONFIG.headersMerma);

  if (isRecentMermaDuplicate_(sheet, rows)) {
    throw new Error('Registro duplicado detectado: esta merma ya fue enviada recientemente.');
  }

  sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, CONFIG.headersMerma.length).setValues(rows);
  return { rowsInserted: rows.length };
}

function isRecentMermaDuplicate_(sheet, incomingRows) {
  if (!sheet || !incomingRows || !incomingRows.length) return false;

  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return false;

  const dataRows = lastRow - 1;
  const rowsToRead = Math.min(CONFIG.duplicateScanRows, dataRows);
  const startRow = lastRow - rowsToRead + 1;
  const existingRows = sheet.getRange(startRow, 1, rowsToRead, CONFIG.headersMerma.length).getValues();
  if (!existingRows.length) return false;

  const now = new Date().getTime();
  const windowMs = CONFIG.duplicateWindowMinutes * 60 * 1000;
  const recentRows = existingRows.filter((row) => {
    const ts = toMillis_(row[0]);
    return ts && (now - ts) <= windowMs;
  });
  if (!recentRows.length) return false;

  const existingCount = buildSignatureCountMap_(recentRows);
  const incomingCount = buildSignatureCountMap_(incomingRows);

  return Object.keys(incomingCount).every((signature) => {
    return (existingCount[signature] || 0) >= incomingCount[signature];
  });
}

function buildSignatureCountMap_(rows) {
  return rows.reduce((acc, row) => {
    const signature = buildRowSignature_(row);
    acc[signature] = (acc[signature] || 0) + 1;
    return acc;
  }, {});
}

function buildRowSignature_(row) {
  return [
    normalizeCell_(row[1]),
    normalizeCell_(row[2]),
    normalizeCell_(row[3]),
    normalizeCell_(row[4]),
    normalizeCell_(row[5]),
    normalizeCell_(row[6]),
    normalizeCell_(row[7]),
    normalizeCell_(row[8]),
    normalizeNumber_(row[9]),
    normalizeCell_(row[10]),
    normalizeCell_(row[11]),
  ].join('|');
}

function normalizeCell_(value) {
  return String(value === null || value === undefined ? '' : value).trim().toUpperCase();
}

function normalizeNumber_(value) {
  const number = Number(value);
  if (!isFinite(number)) return '';
  return String(number);
}

function toMillis_(value) {
  if (value instanceof Date) return value.getTime();
  const parsed = new Date(value);
  if (isNaN(parsed.getTime())) return 0;
  return parsed.getTime();
}

function getProducts_(empresa) {
  const normalized = normalizeEmpresa_(empresa || 'latata');
  const sheetName = CONFIG.productSheets[normalized];
  if (!sheetName) {
    throw new Error('Empresa inválida para catálogo.');
  }

  const sheet = getSpreadsheet_().getSheetByName(sheetName);
  if (!sheet) {
    throw new Error(`No se encontró la pestaña ${sheetName}.`);
  }

  const lastRow = sheet.getLastRow();
  const lastCol = sheet.getLastColumn();
  if (lastRow < 2 || lastCol < 1) {
    return [];
  }

  const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  const rows = sheet.getRange(2, 1, lastRow - 1, lastCol).getValues();

  const idxCode = findHeaderIndex_(headers, ['CODIGO', 'CODIGOS', 'CODE'], 0);
  const idxDesc = findHeaderIndex_(headers, ['DESCRIPCION', 'DESCRIPCIÓN', 'PRODUCTO', 'DESCRIPTION', 'DESC'], 1);
  const idxUnit = findHeaderIndex_(headers, ['UNIDAD', 'UNIDAD_PRIMARIA', 'UNIT'], 2);

  return rows
    .map((row) => {
      const code = String(row[idxCode] || '').trim();
      const description = String(row[idxDesc] || '').trim();
      const unit = String(row[idxUnit] || '').trim() || 'UND';
      return { code, description, unit };
    })
    .filter((p) => p.code && p.description);
}

function getCatalogMap_(empresa) {
  const products = getProducts_(empresa);
  return products.reduce((acc, item) => {
    acc[item.code] = item;
    return acc;
  }, {});
}

function findHeaderIndex_(headers, aliases, fallback) {
  const normalizedHeaders = headers.map((h) => normalizeHeader_(h));
  for (var i = 0; i < aliases.length; i++) {
    var alias = normalizeHeader_(aliases[i]);
    var found = normalizedHeaders.indexOf(alias);
    if (found >= 0) return found;
  }
  return fallback;
}

function normalizeHeader_(value) {
  return String(value || '')
    .trim()
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '_');
}

function parsePostRequest_(e) {
  const contentType = String((e && e.postData && e.postData.type) || '').toLowerCase();
  const rawBody = String((e && e.postData && e.postData.contents) || '');

  if (contentType.indexOf('application/json') !== -1) {
    var parsedJson = JSON.parse(rawBody || '{}');
    return {
      mode: 'json',
      action: parsedJson.action,
      payload: parsedJson.payload || {},
    };
  }

  const params = (e && e.parameter) || {};
  return { mode: 'form', params: params };
}

function parseProductosJson_(raw) {
  if (!raw) {
    throw new Error('productos_json es obligatorio para envío tipo formulario.');
  }
  var parsed = JSON.parse(raw);
  if (!Array.isArray(parsed)) {
    throw new Error('productos_json debe ser un arreglo.');
  }
  return parsed;
}

function getSpreadsheet_() {
  var ss = SpreadsheetApp.openById(CONFIG.spreadsheetId);
  if (!ss) {
    throw new Error('No se pudo abrir el Spreadsheet.');
  }
  return ss;
}

function getOrCreateMermaSheet_() {
  const ss = getSpreadsheet_();
  let sheet = ss.getSheetByName(CONFIG.mermaSheetName);
  if (!sheet) {
    sheet = ss.insertSheet(CONFIG.mermaSheetName);
  }
  return sheet;
}

function ensureHeaders_(sheet, headers) {
  const lastRow = sheet.getLastRow();
  if (lastRow === 0) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    return;
  }

  const existing = sheet.getRange(1, 1, 1, headers.length).getValues()[0].map((v) => String(v || '').trim());
  const same = headers.every((h, i) => existing[i] === h);
  if (!same) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  }
}

function normalizeEmpresa_(value) {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) return '';

  if (['latata', 'la tata', 'la tata de la libertad', 'tata'].indexOf(raw) !== -1) {
    return 'latata';
  }
  if (['pandt', 'pan de tata', 'pdt', 'pan'].indexOf(raw) !== -1) {
    return 'pandt';
  }
  return raw;
}

function empresaLabel_(empresa) {
  return empresa === 'pandt' ? 'Pan de Tata' : 'La Tata de la Libertad';
}

function validateRequired_(payload, fields) {
  fields.forEach((field) => {
    const value = payload[field];
    if (value === null || value === undefined || String(value).trim() === '') {
      throw new Error(`El campo ${field} es obligatorio.`);
    }
  });
}

function normalizeDate_(value) {
  if (value instanceof Date) {
    return Utilities.formatDate(value, CONFIG.timeZone, 'yyyy-MM-dd');
  }
  const text = String(value || '').trim();
  if (!text) return '';

  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    return text;
  }
  if (/^\d{2}-\d{2}-\d{4}$/.test(text)) {
    const parts = text.split('-');
    return `${parts[2]}-${parts[1]}-${parts[0]}`;
  }
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(text)) {
    const parts2 = text.split('/');
    return `${parts2[2]}-${parts2[1]}-${parts2[0]}`;
  }

  return text;
}

function json_(payload) {
  return ContentService.createTextOutput(JSON.stringify(payload)).setMimeType(ContentService.MimeType.JSON);
}
