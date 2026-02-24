# Deploy del Apps Script (MERMA unificado)

## 1) Crear el proyecto

1. Abre este Spreadsheet:
   - https://docs.google.com/spreadsheets/d/18WPHKhmnGtoNiHuALuK8486VuJeMq8LHF0tKZArq3hs/edit
2. Ve a **Extensiones → Apps Script**.
3. Reemplaza el contenido por el código de [Code.gs](Code.gs).
4. Guarda.

## 2) Publicar como Web App

1. **Deploy → New deployment**.
2. Tipo: **Web app**.
3. Ejecutar como: **Me**.
4. Quién tiene acceso: **Anyone** (o **Anyone with the link**).
5. Presiona **Deploy** y copia la URL que termina en `/exec`.

## 3) Conectar con el formulario unificado

En [index.html](index.html), reemplaza ambas URLs por la misma URL del deployment:

```html
window.MERMA_CONFIG = {
  LATATA_URL: 'TU_URL_APPS_SCRIPT/exec',
  PANDT_URL: 'TU_URL_APPS_SCRIPT/exec',
};
```

## Endpoints soportados por este script

- `GET ?action=ping`
- `GET ?action=getproducts&empresa=latata|pandt`
- `GET ?action=productos&empresa=latata|pandt`
- `POST` JSON: `{ action: 'recordMerma', payload: {...} }`
- `POST` FormData: `productos_json`, `empresa`, etc.

## Hojas usadas

- Productos La Tata: `PRODUCTOS`
- Productos Pan de Tata: `PRODUCTOS PDT`
- Registros destino: `MERMA`

La hoja `MERMA` se autocompleta con encabezados si está vacía.
