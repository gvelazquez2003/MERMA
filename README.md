# MERMA unificado (La Tata + Pan de Tata)

Formulario único para registrar merma con dos modos:

- **La Tata de la Libertad**
- **Pan de Tata**

## Lógica principal

1. El usuario selecciona **Empresa**.
2. Según empresa, se condicionan:
   - **Sedes** disponibles
   - **Responsable** (texto libre o lista sugerida)
   - Campos por producto (con o sin `Motivo` y `Lote`)
   - Origen de catálogo de productos
   - Formato del envío al backend

## Configuración de URLs

Edita las URLs en `index.html` dentro de `window.MERMA_CONFIG`:

- `LATATA_URL`: Web App de La Tata
- `PANDT_URL`: Web App de Pan de Tata

## Ejecución

Sirve esta carpeta con cualquier servidor estático y abre `index.html`.

Ejemplo con `serve`:

```bash
npx serve .
```

> Evita abrir con `file://` para no tener bloqueos de `fetch`.
