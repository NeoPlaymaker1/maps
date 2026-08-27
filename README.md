# Estaciones - RED OPERADORA CANTOLAO (optimizado)

Web móvil para visualizar 118 estaciones sobre Google Maps, detectar la ubicación actual y encontrar automáticamente la estación más cercana.

## Optimización aplicada

- Las 118 estaciones ya no usan 118 `google.maps.Marker`.
- Todos los puntos se dibujan en **un único Canvas Overlay**, reduciendo drásticamente DOM, SVG, listeners y repintados durante zoom/pan.
- Solo existe un `InfoWindow`, abierto por detección de proximidad al tocar el mapa.
- La estación más cercana y la ubicación del usuario se dibujan en el mismo canvas; no se crean/destruyen markers.
- Los repintados del overlay se agrupan con `requestAnimationFrame`.
- El canvas usa un DPR máximo de 2 para evitar renderizado 3x/4x innecesario en móviles de alta densidad.
- Se evita procesar jitter GPS: una actualización se procesa si el usuario se mueve al menos 8 m o pasan 4 s.
- El seguimiento GPS se suspende cuando la pestaña queda oculta.
- Se eliminaron `backdrop-filter: blur(...)` y transiciones costosas sobre el mapa.
- Los paneles usan fondos sólidos y contención CSS para reducir recomposición.
- Google Maps carga con la versión `quarterly`, más estable para producción.
- Vite minifica JS/CSS en producción y no genera source maps.

## Desarrollo local

```bash
npm install
cp .env.example .env.local
npm run dev
```

En `.env.local`:

```text
VITE_GOOGLE_MAPS_API_KEY=TU_API_KEY
```

Opcionalmente puedes usar un Map ID:

```text
VITE_GOOGLE_MAPS_MAP_ID=TU_MAP_ID
```

## Vercel

1. Sube todos los archivos a GitHub, reemplazando el proyecto anterior.
2. En Vercel conserva `VITE_GOOGLE_MAPS_API_KEY` en **Environment Variables**.
3. Vercel detectará Vite automáticamente.
4. Haz un nuevo deploy.

Build command: `npm run build`

Output directory: `dist`

La geolocalización requiere HTTPS (Vercel ya lo proporciona) o `localhost`.

## API key

La clave de Maps JavaScript se entrega al navegador por diseño. Restringe la key en Google Cloud por HTTP referrer y limita su uso a Maps JavaScript API.

## Vercel y dominios de preview

Si restringes la API key por HTTP referrer, autoriza el dominio que realmente estás abriendo. Por ejemplo:

- `https://mapscantolao.vercel.app/*` para producción.
- El dominio exacto de preview/branch de Vercel si lo vas a probar desde ese URL.

No es recomendable autorizar `https://*.vercel.app/*` en producción porque permitiría usar la key desde cualquier proyecto alojado bajo ese dominio.
