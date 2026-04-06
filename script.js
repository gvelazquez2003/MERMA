'use strict';

const CONFIG = {
  motivosCompartidos: [
    'Adherido a Bandeja/Molde/Aro',
    'Adherido al Silpad',
    'Burbuja/Mancha en la Corona',
    'Alveolado/Cavidad',
    'Crudo',
    'Quemado',
    'Color',
    'Fermentado',
    'Pan pequeño',
    'Pan grande',
    'Mal Formado',
    'Deformado(Horno)',
    'Mal corte',
    'Manchado',
    'Aplastado/Maltratado/Roto',
    'Sobrante en buen estado',
    'Caido al piso',
    'Materia Extraña',
    'Defecto de Mezcla',
  ],
  latata: {
    label: 'La Tata de la Libertad',
    endpoint: (window.MERMA_CONFIG && window.MERMA_CONFIG.LATATA_URL) || '',
    sedes: ['BC', 'LPG'],
    responsables: null,
    forceHoraSedes: ['BC', 'PB-2', 'VM'],
    forceHoraValue: '09:00',
  },
  pandt: {
    label: 'Pan de Tata',
    endpoint: (window.MERMA_CONFIG && window.MERMA_CONFIG.PANDT_URL) || '',
    sedes: ['PANIFICADORA COSTA DORADA, C.A.', 'ALIMENTOS PB2, C.A.'],
    responsables: [
      'Alexander Guevara',
      'Alexander Martinez',
      'Yefrin Arteaga',
      'Leandro Gil',
      'Jesus Alcedo',
      'Eliezer N',
      'Odalis',
      'Yosmar Blanco',
    ],
  },
};

const state = {
  empresa: '',
  products: [],
};

const APPS_SCRIPT_FETCH_OPTIONS = {
  credentials: 'include',
  redirect: 'follow',
};

const form = document.getElementById('merma-form');
const empresaSelect = document.getElementById('empresa');
const fechaInput = document.getElementById('fecha');
const horaInput = document.getElementById('hora');
const horaNowBtn = document.getElementById('hora-now-btn');
const sedeSelect = document.getElementById('sede');
const responsableInput = document.getElementById('responsable');
const rowsContainer = document.getElementById('rows');
const addRowBtn = document.getElementById('add-row');
const refreshProductsBtn = document.getElementById('refresh-products');
const statusEl = document.getElementById('products-status');
const messageEl = document.getElementById('message');
const confirmModal = document.getElementById('confirm-modal');
const confirmSummary = document.getElementById('confirm-summary');
const confirmAccept = document.getElementById('confirm-accept');
const confirmSubmit = document.getElementById('confirm-submit');

let confirmResolver = null;

init();

function init() {
  setTodayAndNow();
  bindEvents();
  setEmpresa('');
}

function bindEvents() {
  empresaSelect.addEventListener('change', () => setEmpresa(empresaSelect.value));
  sedeSelect.addEventListener('change', handleSedeChange);
  horaNowBtn.addEventListener('click', setCurrentTime);
  addRowBtn.addEventListener('click', addRow);
  refreshProductsBtn.addEventListener('click', () => fetchProducts(true));
  form.addEventListener('submit', onSubmit);
  setupConfirmModalEvents();
}

function setupConfirmModalEvents() {
  if (!confirmModal) return;

  const closeTriggers = Array.from(document.querySelectorAll('[data-close-confirm]'));
  closeTriggers.forEach((el) => {
    el.addEventListener('click', () => closeConfirmationModal(false));
  });

  if (confirmAccept) {
    confirmAccept.addEventListener('change', () => {
      confirmSubmit.disabled = !confirmAccept.checked;
    });
  }

  if (confirmSubmit) {
    confirmSubmit.addEventListener('click', () => closeConfirmationModal(true));
  }

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !confirmModal.classList.contains('hidden')) {
      closeConfirmationModal(false);
    }
  });
}

function setTodayAndNow() {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  fechaInput.value = `${yyyy}-${mm}-${dd}`;
  setCurrentTime();
}

function setCurrentTime() {
  const now = new Date();
  const hh = String(now.getHours()).padStart(2, '0');
  const min = String(now.getMinutes()).padStart(2, '0');
  horaInput.value = `${hh}:${min}`;
}

function setEmpresa(empresa) {
  state.empresa = empresa;
  resetRows();
  state.products = [];
  populateSedes();
  setupResponsableInput();
  toggleBaseFields(Boolean(empresa));

  if (!empresa) {
    setStatus('Selecciona una empresa para cargar productos.', false);
    return;
  }

  fetchProducts(false);
}

function toggleBaseFields(enabled) {
  [fechaInput, horaInput, horaNowBtn, sedeSelect, responsableInput, addRowBtn, refreshProductsBtn].forEach((el) => {
    el.disabled = !enabled;
  });
}

function populateSedes() {
  const company = CONFIG[state.empresa];
  sedeSelect.innerHTML = '<option value="">Selecciona una sede</option>';
  if (!company) return;

  company.sedes.forEach((sede) => {
    const option = document.createElement('option');
    option.value = sede;
    option.textContent = sede;
    sedeSelect.appendChild(option);
  });
}

function setupResponsableInput() {
  const company = CONFIG[state.empresa];
  if (!company) {
    responsableInput.value = '';
    responsableInput.removeAttribute('list');
    return;
  }

  if (Array.isArray(company.responsables)) {
    const listId = 'responsables-list';
    let list = document.getElementById(listId);
    if (!list) {
      list = document.createElement('datalist');
      list.id = listId;
      document.body.appendChild(list);
    }
    list.innerHTML = '';
    company.responsables.forEach((name) => {
      const opt = document.createElement('option');
      opt.value = name;
      list.appendChild(opt);
    });
    responsableInput.setAttribute('list', listId);
    responsableInput.placeholder = 'Selecciona o escribe un responsable';
  } else {
    responsableInput.removeAttribute('list');
    responsableInput.placeholder = 'Nombre y apellido';
  }
}

function handleSedeChange() {
  if (state.empresa !== 'latata') return;
  const company = CONFIG.latata;
  if (!company) return;
  const selectedSede = String(sedeSelect.value || '').trim();
  if (company.forceHoraSedes.includes(selectedSede)) {
    horaInput.value = company.forceHoraValue;
  }
}

function resetRows() {
  rowsContainer.innerHTML = '';
}

function addRow() {
  if (!state.empresa) {
    setMessage('Selecciona primero la empresa.', 'error');
    return;
  }

  const row = document.createElement('div');
  row.className = `row ${state.empresa === 'latata' ? 'row--latata' : ''}`;
  row.innerHTML = state.empresa === 'latata' ? latataRowTemplate() : pandtRowTemplate();

  const removeBtn = row.querySelector('.remove');
  removeBtn.addEventListener('click', () => {
    row.remove();
  });

  const productSelect = row.querySelector('[data-role="product"]');
  fillProductOptions(productSelect);

  const loteInput = row.querySelector('[data-role="lote"]');
  if (loteInput) {
    const updateLote = () => {
      if (loteInput.dataset.manual === '1') return;
      loteInput.value = buildPanLote();
    };
    loteInput.addEventListener('input', () => {
      loteInput.dataset.manual = '1';
    });
    fechaInput.addEventListener('change', updateLote);
    updateLote();
  }

  rowsContainer.appendChild(row);
}

function latataRowTemplate() {
  const motivos = getMotivosOptionsHtml();

  return `
    <label>
      <span>Producto</span>
      <select data-role="product" required></select>
    </label>
    <label>
      <span>Cantidad merma</span>
      <input type="number" min="1" step="1" value="1" data-role="qty" required />
    </label>
    <label>
      <span>Motivo</span>
      <select data-role="motivo" required>
        <option value="">Selecciona motivo</option>
        ${motivos}
      </select>
    </label>
    <label>
      <span>Lote</span>
      <input type="text" data-role="lote" placeholder="Ej: LT-230226" required />
    </label>
    <button type="button" class="remove">Eliminar</button>
  `;
}

function pandtRowTemplate() {
  const motivos = getMotivosOptionsHtml();

  return `
    <label>
      <span>Producto</span>
      <select data-role="product" required></select>
    </label>
    <label>
      <span>Cantidad merma</span>
      <input type="number" min="1" step="1" value="1" data-role="qty" required />
    </label>
    <label>
      <span>Motivo</span>
      <select data-role="motivo" required>
        <option value="">Selecciona motivo</option>
        ${motivos}
      </select>
    </label>
    <label>
      <span>Lote</span>
      <input type="text" data-role="lote" placeholder="Ej: BC230226" required />
    </label>
    <button type="button" class="remove">Eliminar</button>
  `;
}

function getMotivosOptionsHtml() {
  return (CONFIG.motivosCompartidos || [])
    .map((motivo) => `<option value="${escapeHtml(motivo)}">${escapeHtml(motivo)}</option>`)
    .join('');
}

function fillProductOptions(selectEl) {
  if (!selectEl) return;
  selectEl.innerHTML = '<option value="">Selecciona producto</option>';
  state.products.forEach((product) => {
    const option = document.createElement('option');
    option.value = product.code;
    option.textContent = `${product.code} — ${product.description}`;
    selectEl.appendChild(option);
  });
}

async function fetchProducts(showMessage) {
  const company = CONFIG[state.empresa];
  if (!company || !company.endpoint) {
    setStatus('Configura la URL de Apps Script para esta empresa.', true);
    return;
  }

  setStatus('Cargando productos...', false);

  try {
    const query = state.empresa === 'latata'
      ? 'action=getproducts&empresa=latata'
      : 'action=productos&empresa=pandt';
    const url = company.endpoint + (company.endpoint.includes('?') ? '&' : '?') + query;
    const response = await fetchWithDiagnostics(url, { method: 'GET', cache: 'no-store' }, 'cargar productos');
    const json = await response.json();

    if (state.empresa === 'latata') {
      const products = json && json.success && json.data && Array.isArray(json.data.products)
        ? json.data.products
        : [];
      state.products = products.map(normalizeLatataProduct).filter(Boolean);
    } else {
      const products = json && json.ok && Array.isArray(json.products)
        ? json.products
        : [];
      state.products = products.map(normalizePanProduct).filter(Boolean);
    }

    refreshRowOptions();
    setStatus(`${state.products.length} productos disponibles.`, false);
    if (!rowsContainer.children.length) {
      addRow();
    }
    if (showMessage) {
      setMessage('Catálogo actualizado.', 'ok');
    }
  } catch (error) {
    setStatus('No se pudo cargar el catálogo de productos.', true);
    if (showMessage) {
      setMessage(error.message || 'Error al actualizar catálogo.', 'error');
    }
  }
}

function normalizeLatataProduct(product) {
  if (!product) return null;
  const code = String(product.code || '').trim();
  const description = String(product.description || '').trim();
  const unit = String(product.unit || 'UND').trim();
  if (!code || !description) return null;
  return { code, description, unit };
}

function normalizePanProduct(product) {
  if (!product) return null;
  const code = String(product.codigo || '').trim();
  const description = String(product.descripcion || product.desc || '').trim();
  const unit = String(product.unidad || 'UND').trim();
  if (!code || !description) return null;
  return { code, description, unit };
}

function refreshRowOptions() {
  rowsContainer.querySelectorAll('[data-role="product"]').forEach((select) => {
    const current = select.value;
    fillProductOptions(select);
    select.value = current;
  });
}

async function onSubmit(event) {
  event.preventDefault();
  setMessage('', '');

  if (!state.empresa) {
    setMessage('Debes seleccionar una empresa.', 'error');
    return;
  }

  if (!form.reportValidity()) {
    return;
  }

  const rows = Array.from(rowsContainer.querySelectorAll('.row'));
  if (!rows.length) {
    setMessage('Agrega al menos un producto.', 'error');
    return;
  }

  const company = CONFIG[state.empresa];
  if (!company || !company.endpoint) {
    setMessage('No hay URL configurada para la empresa seleccionada.', 'error');
    return;
  }

  const summaryHtml = buildConfirmationSummary(rows);
  const accepted = await requestTwoStepConfirmation(summaryHtml);
  if (!accepted) {
    setMessage('Envío cancelado para revisar información.', 'error');
    return;
  }

  const submitBtn = form.querySelector('button[type="submit"]');
  submitBtn.disabled = true;

  try {
    if (state.empresa === 'latata') {
      await submitLatata(company.endpoint, rows);
    } else {
      await submitPan(company.endpoint, rows);
    }

    setMessage('Merma enviada correctamente.', 'ok');
    resetRows();
    addRow();
  } catch (error) {
    setMessage(error.message || 'Error al enviar la merma.', 'error');
  } finally {
    submitBtn.disabled = false;
  }
}

async function submitLatata(endpoint, rows) {
  const items = rows.map((row, index) => {
    const productCode = getRowValue(row, 'product');
    const qty = Number(getRowValue(row, 'qty'));
    const motivo = getRowValue(row, 'motivo');
    const lote = getRowValue(row, 'lote');
    const product = state.products.find((p) => p.code === productCode);

    if (!productCode || !product) {
      throw new Error(`Selecciona un producto válido en la fila ${index + 1}.`);
    }
    if (!Number.isFinite(qty) || qty <= 0) {
      throw new Error(`La cantidad en la fila ${index + 1} debe ser mayor a cero.`);
    }
    if (!String(motivo || '').trim()) {
      throw new Error(`Completa motivo en la fila ${index + 1}.`);
    }
    if (!String(lote || '').trim()) {
      throw new Error(`Completa lote en la fila ${index + 1}.`);
    }

    return {
      productCode: product.code,
      productName: product.description,
      unit: product.unit,
      cantidadMerma: qty,
      motivo: String(motivo).trim(),
      lote: String(lote).trim(),
    };
  });

  const payload = {
    empresa: 'latata',
    fecha: fechaInput.value,
    hora: horaInput.value,
    sede: sedeSelect.value,
    responsable: responsableInput.value.trim(),
    items,
  };

  const fd = new FormData();
  fd.append('empresa', 'latata');
  fd.append('fecha', payload.fecha);
  fd.append('hora', payload.hora);
  fd.append('sede', payload.sede);
  fd.append('responsable', payload.responsable);
  fd.append('productos_json', JSON.stringify(items));
  fd.append('productos_count', String(items.length));

  items.forEach((item, idx) => {
    fd.append(`prodCodigo_${idx}`, item.productCode || '');
    fd.append(`motivo_${idx}`, item.motivo || '');
    fd.append(`lote_${idx}`, item.lote || '');
  });

  const response = await fetchWithDiagnostics(endpoint, {
    method: 'POST',
    body: fd,
  }, 'enviar merma');

  const data = await safeJson(response);
  if (!response.ok || !data || (data.success !== true && data.ok !== true)) {
    throw new Error((data && (data.message || data.error)) || 'La Tata rechazó la solicitud.');
  }
}

async function submitPan(endpoint, rows) {
  const productos = rows.map((row, index) => {
    const productCode = getRowValue(row, 'product');
    const qty = Number(getRowValue(row, 'qty'));
    const motivo = getRowValue(row, 'motivo');
    const lote = getRowValue(row, 'lote');
    const product = state.products.find((p) => p.code === productCode);

    if (!productCode || !product) {
      throw new Error(`Selecciona un producto válido en la fila ${index + 1}.`);
    }
    if (!Number.isFinite(qty) || qty <= 0) {
      throw new Error(`La cantidad en la fila ${index + 1} debe ser mayor a cero.`);
    }
    if (!motivo) {
      throw new Error(`Selecciona motivo en la fila ${index + 1}.`);
    }
    if (!String(lote || '').trim()) {
      throw new Error(`Completa lote en la fila ${index + 1}.`);
    }

    return {
      codigo: product.code,
      descripcion: product.description,
      unidad: product.unit,
      cantidad: qty,
      motivo,
      lote: String(lote).trim(),
    };
  });

  const fd = new FormData();
  fd.append('sheet', 'Merma');
  fd.append('empresa', 'pandt');
  fd.append('fecha', toDdMmYyyy(fechaInput.value));
  fd.append('hora', horaInput.value);
  fd.append('sede', sedeSelect.value);
  fd.append('responsable', responsableInput.value.trim());
  fd.append('nonce', generateNonce());
  fd.append('productos_json', JSON.stringify(productos));
  fd.append('productos_count', String(productos.length));

  productos.forEach((item, idx) => {
    fd.append(`prodCodigo_${idx}`, item.codigo);
    fd.append(`motivo_${idx}`, item.motivo);
    fd.append(`lote_${idx}`, item.lote);
  });

  const url = endpoint + (endpoint.includes('?') ? '&' : '?') + 'sheet=Merma';
  const response = await fetchWithDiagnostics(url, {
    method: 'POST',
    body: fd,
  }, 'enviar merma');

  const data = await safeJson(response);
  if (!response.ok || !data || data.ok !== true) {
    throw new Error((data && data.error) || 'Pan de Tata rechazó la solicitud.');
  }
}

function getRowValue(row, role) {
  const el = row.querySelector(`[data-role="${role}"]`);
  return el ? el.value : '';
}

function toDdMmYyyy(value) {
  const text = String(value || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    return text;
  }
  const [yyyy, mm, dd] = text.split('-');
  return `${dd}-${mm}-${yyyy}`;
}

function buildPanLote() {
  const value = String(fechaInput.value || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return '';
  }
  const [yyyy, mm, dd] = value.split('-');
  return `BC${dd}${mm}${yyyy.slice(2)}`;
}

function generateNonce() {
  try {
    if (window.crypto && window.crypto.getRandomValues) {
      const arr = new Uint32Array(4);
      window.crypto.getRandomValues(arr);
      return Array.from(arr).map((n) => n.toString(16)).join('');
    }
  } catch (error) {
    // fallback abajo
  }
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
}

async function safeJson(response) {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch (error) {
    return null;
  }
}

async function fetchWithDiagnostics(url, options, actionLabel) {
  try {
    return await fetch(url, {
      ...APPS_SCRIPT_FETCH_OPTIONS,
      ...(options || {}),
    });
  } catch (error) {
    const baseMessage = `No se pudo ${actionLabel} en Apps Script.`;
    const details = 'Verifica el deployment Web App como "Execute as: Me" y acceso "Anyone with the link", o inicia sesion Google en este navegador.';
    const reason = error && error.message ? ` Detalle: ${error.message}` : '';
    throw new Error(`${baseMessage} ${details}${reason}`);
  }
}

function setStatus(text, isError) {
  statusEl.textContent = text;
  statusEl.style.color = isError ? 'var(--error)' : 'var(--muted)';
}

function setMessage(text, type) {
  messageEl.textContent = text;
  messageEl.className = 'message';
  if (type) {
    messageEl.classList.add(type);
  }
}

function requestTwoStepConfirmation(summaryHtml) {
  if (!confirmModal || !confirmSummary || !confirmAccept || !confirmSubmit) {
    return Promise.resolve(window.confirm('Confirma el envío de MERMA.'));
  }

  confirmSummary.innerHTML = summaryHtml;
  confirmAccept.checked = false;
  confirmSubmit.disabled = true;
  confirmModal.classList.remove('hidden');
  document.body.style.overflow = 'hidden';

  return new Promise((resolve) => {
    confirmResolver = resolve;
  });
}

function closeConfirmationModal(accepted) {
  if (confirmModal) {
    confirmModal.classList.add('hidden');
  }
  document.body.style.overflow = '';

  if (typeof confirmResolver === 'function') {
    const resolver = confirmResolver;
    confirmResolver = null;
    resolver(Boolean(accepted));
  }
}

function buildConfirmationSummary(rows) {
  const meta = [
    ['Empresa', CONFIG[state.empresa] ? CONFIG[state.empresa].label : '-'],
    ['Fecha', fechaInput.value || '-'],
    ['Hora', horaInput.value || '-'],
    ['Sede', sedeSelect.value || '-'],
    ['Responsable', responsableInput.value.trim() || '-'],
  ];

  const metaHtml = meta
    .map(([label, value]) => `<div><strong>${escapeHtml(label)}:</strong> ${escapeHtml(value)}</div>`)
    .join('');

  const showMotivoLote = state.empresa === 'pandt' || state.empresa === 'latata';

  const rowsHtml = rows
    .map((row, index) => {
      const code = getRowValue(row, 'product');
      const qty = getRowValue(row, 'qty');
      const motivo = getRowValue(row, 'motivo');
      const lote = getRowValue(row, 'lote');
      const product = state.products.find((p) => p.code === code);
      const name = product ? product.description : '';

      return `
        <tr>
          <td>${index + 1}</td>
          <td>${escapeHtml(code || '-')}</td>
          <td>${escapeHtml(name || '-')}</td>
          <td>${escapeHtml(qty || '-')}</td>
          ${showMotivoLote ? `<td>${escapeHtml(motivo || '-')}</td><td>${escapeHtml(lote || '-')}</td>` : ''}
        </tr>
      `;
    })
    .join('');

  return `
    <div class="confirm-summary__meta">${metaHtml}</div>
    <div class="confirm-summary__table-wrap">
      <table>
        <thead>
          <tr>
            <th>#</th>
            <th>Código</th>
            <th>Producto</th>
            <th>Cantidad</th>
            ${showMotivoLote ? '<th>Motivo</th><th>Lote</th>' : ''}
          </tr>
        </thead>
        <tbody>${rowsHtml}</tbody>
      </table>
    </div>
  `;
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
