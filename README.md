# Estaciones - RED OPERADORA CANTOLAO

Web móvil para visualizar 118 estaciones sobre Google Maps, detectar la ubicación actual y encontrar automáticamente la estación más cercana.

## Funciones

- Google Maps embebido.
- 118 estaciones cargadas desde `stations.json`.
- Geolocalización en tiempo real con `watchPosition()`.
- Cálculo local de distancia por Haversine.
- Estación más cercana resaltada.
- Botón **Cómo llegar** que abre la navegación de Google Maps.
- Compatible con GitHub + Vercel.

## Desarrollo local

```bash
npm install
cp .env.example .env.local
```

Edita `.env.local` y coloca tu clave:

```env
VITE_GOOGLE_MAPS_API_KEY=TU_API_KEY
```

Luego:

```bash
npm run dev
```

> La geolocalización funciona en `localhost` y en sitios HTTPS.

## Google Maps Platform

En Google Cloud habilita **Maps JavaScript API** y configura una API key.

La API key de Maps JavaScript se entrega al navegador por diseño. La seguridad debe hacerse restringiendo la clave por **HTTP referrers** y limitándola únicamente a **Maps JavaScript API**.

Para producción puedes permitir, por ejemplo:

- `https://tu-proyecto.vercel.app/*`
- `https://tu-dominio.com/*`

## Deploy en Vercel

1. Sube esta carpeta a un repositorio GitHub.
2. En Vercel elige **Add New > Project** e importa el repositorio.
3. Vercel debería detectar Vite automáticamente.
4. En **Settings > Environment Variables** agrega:
   - Name: `VITE_GOOGLE_MAPS_API_KEY`
   - Value: tu API key.
5. Haz Deploy.

Build command: `npm run build`

Output directory: `dist`

## Nota sobre la API key

Aunque se configure mediante variable de entorno, una API key usada por Maps JavaScript termina siendo visible en el navegador. No la trates como un secreto de servidor. Restringe la key en Google Cloud por dominio y API.
