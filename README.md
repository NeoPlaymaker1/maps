# Estaciones - RED OPERADORA CANTOLAO

Versión equilibrada para GitHub + Vercel.

## Cambios principales

- 118 estaciones mostradas como pins clásicos y nítidos.
- Marker clustering para mantener el zoom y el desplazamiento fluidos.
- Estación más cercana resaltada en naranja.
- Ubicación actual en azul.
- GPS filtrado para evitar actualizaciones innecesarias.
- Selector de navegación: Google Maps o Waze.
- Sin filtros blur sobre el mapa.

## Variable de entorno

En Vercel configura:

```text
VITE_GOOGLE_MAPS_API_KEY=TU_API_KEY
```

Opcional:

```text
VITE_GOOGLE_MAPS_MAP_ID=TU_MAP_ID
```

## Desarrollo local

```bash
npm install
npm run dev
```

## Producción

```bash
npm run build
```

Vercel detectará Vite y publicará la carpeta `dist`.
