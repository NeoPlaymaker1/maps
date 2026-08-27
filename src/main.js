import { Loader } from '@googlemaps/js-api-loader';
import '../styles.css';
import stations from '../stations.json';

const API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
const MAP_ID = import.meta.env.VITE_GOOGLE_MAPS_MAP_ID || undefined;
const DEFAULT_CENTER = { lat: -12.069392, lng: -77.047052 };
const EARTH_RADIUS_M = 6371000;
const MIN_GPS_MOVE_M = 8;
const MAX_GPS_SILENCE_MS = 4000;
const MAX_DEVICE_PIXEL_RATIO = 2;

const stationData = stations.map((station, index) => ({
  ...station,
  index,
  latRad: (station.lat * Math.PI) / 180,
  lngRad: (station.lng * Math.PI) / 180,
}));

let map;
let stationOverlay;
let infoWindow;
let watchId = null;
let locationRequested = false;
let lastLocation = null;
let lastLocationAt = 0;
let userCentered = false;
let nearestStation = null;
let nearestIndex = -1;
let lastNearestDistanceText = '';
let lastStatusSignature = '';

const statusCard = document.querySelector('#statusCard');
const statusIcon = document.querySelector('#statusIcon');
const statusEyebrow = document.querySelector('#statusEyebrow');
const statusTitle = document.querySelector('#statusTitle');
const statusSubtitle = document.querySelector('#statusSubtitle');
const nearestCard = document.querySelector('#nearestCard');
const nearestName = document.querySelector('#nearestName');
const nearestDistance = document.querySelector('#nearestDistance');
const navigateBtn = document.querySelector('#navigateBtn');
const centerNearestBtn = document.querySelector('#centerNearestBtn');
const locateBtn = document.querySelector('#locateBtn');
const fatal = document.querySelector('#fatal');

function setStatus(title, subtitle, icon = '📍', eyebrow = 'Ubicación') {
  const signature = `${eyebrow}|${icon}|${title}|${subtitle}`;
  if (signature === lastStatusSignature) return;
  lastStatusSignature = signature;
  statusIcon.textContent = icon;
  statusEyebrow.textContent = eyebrow;
  statusTitle.textContent = title;
  statusSubtitle.textContent = subtitle;
}

function haversineMeters(a, b) {
  const toRad = Math.PI / 180;
  const lat1 = a.lat * toRad;
  const lat2 = b.lat * toRad;
  const dLat = (b.lat - a.lat) * toRad;
  const dLng = (b.lng - a.lng) * toRad;
  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const h = sinLat * sinLat + Math.cos(lat1) * Math.cos(lat2) * sinLng * sinLng;
  return 2 * EARTH_RADIUS_M * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function findNearest(position) {
  const latRad = (position.lat * Math.PI) / 180;
  const lngRad = (position.lng * Math.PI) / 180;
  let best = stationData[0];
  let bestSquared = Infinity;

  for (let i = 0; i < stationData.length; i += 1) {
    const station = stationData[i];
    const x = (station.lngRad - lngRad) * Math.cos((station.latRad + latRad) / 2);
    const y = station.latRad - latRad;
    const squared = x * x + y * y;
    if (squared < bestSquared) {
      bestSquared = squared;
      best = station;
    }
  }

  return {
    station: best,
    distance: haversineMeters(position, best),
  };
}

function formatDistance(meters) {
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(meters < 10000 ? 1 : 0)} km`;
}

function googleMapsDirectionsUrl(station) {
  return `https://www.google.com/maps/dir/?api=1&destination=${station.lat},${station.lng}&travelmode=driving`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function metersPerPixel(latitude, zoom) {
  return (156543.03392 * Math.cos((latitude * Math.PI) / 180)) / 2 ** zoom;
}

class StationCanvasOverlay extends google.maps.OverlayView {
  constructor(mapInstance, stationList) {
    super();
    this.mapInstance = mapInstance;
    this.stationList = stationList;
    this.stationLatLngs = stationList.map((station) => new google.maps.LatLng(station.lat, station.lng));
    this.canvas = null;
    this.context = null;
    this.frameId = 0;
    this.userPosition = null;
    this.userLatLng = null;
    this.nearestIndex = -1;
    this.dpr = Math.min(window.devicePixelRatio || 1, MAX_DEVICE_PIXEL_RATIO);
    this.pixelWidth = 0;
    this.pixelHeight = 0;
    this.setMap(mapInstance);
  }

  onAdd() {
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'station-canvas';
    this.canvas.setAttribute('aria-hidden', 'true');
    this.context = this.canvas.getContext('2d', { alpha: true });
    this.getPanes().overlayLayer.appendChild(this.canvas);
  }

  draw() {
    if (!this.canvas || !this.context || this.frameId) return;
    this.frameId = requestAnimationFrame(() => {
      this.frameId = 0;
      this.render();
    });
  }

  setUserPosition(position) {
    this.userPosition = position;
    if (!this.userLatLng) {
      this.userLatLng = new google.maps.LatLng(position.lat, position.lng);
    } else {
      this.userLatLng = new google.maps.LatLng(position.lat, position.lng);
    }
    this.draw();
  }

  setNearestIndex(index) {
    if (this.nearestIndex === index) return;
    this.nearestIndex = index;
    this.draw();
  }

  render() {
    if (!this.canvas || !this.context) return;

    const projection = this.getProjection();
    const bounds = this.mapInstance.getBounds();
    if (!projection || !bounds) return;

    const southWest = projection.fromLatLngToDivPixel(bounds.getSouthWest());
    const northEast = projection.fromLatLngToDivPixel(bounds.getNorthEast());
    if (!southWest || !northEast) return;

    const left = Math.floor(southWest.x);
    const top = Math.floor(northEast.y);
    const width = Math.max(1, Math.ceil(northEast.x - southWest.x));
    const height = Math.max(1, Math.ceil(southWest.y - northEast.y));

    this.canvas.style.left = `${left}px`;
    this.canvas.style.top = `${top}px`;
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;

    const pixelWidth = Math.ceil(width * this.dpr);
    const pixelHeight = Math.ceil(height * this.dpr);
    if (pixelWidth !== this.pixelWidth || pixelHeight !== this.pixelHeight) {
      this.pixelWidth = pixelWidth;
      this.pixelHeight = pixelHeight;
      this.canvas.width = pixelWidth;
      this.canvas.height = pixelHeight;
    }

    const ctx = this.context;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);

    const zoom = this.mapInstance.getZoom() ?? 12;
    const stationRadius = zoom < 11 ? 2.25 : zoom < 13 ? 3 : zoom < 15 ? 4 : 5;
    const stationStroke = zoom < 13 ? 1 : 1.5;
    const margin = 12;

    // Todas las estaciones normales se dibujan en una sola ruta Canvas.
    ctx.beginPath();
    for (let i = 0; i < this.stationLatLngs.length; i += 1) {
      if (i === this.nearestIndex) continue;
      const point = projection.fromLatLngToDivPixel(this.stationLatLngs[i]);
      if (!point) continue;
      const x = point.x - left;
      const y = point.y - top;
      if (x < -margin || x > width + margin || y < -margin || y > height + margin) continue;
      ctx.moveTo(x + stationRadius, y);
      ctx.arc(x, y, stationRadius, 0, Math.PI * 2);
    }
    ctx.fillStyle = 'rgba(15, 23, 42, 0.90)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.96)';
    ctx.lineWidth = stationStroke;
    ctx.stroke();

    // La estación más cercana se pinta por encima sin crear otro Marker DOM.
    if (this.nearestIndex >= 0) {
      const point = projection.fromLatLngToDivPixel(this.stationLatLngs[this.nearestIndex]);
      if (point) {
        const x = point.x - left;
        const y = point.y - top;
        const radius = zoom < 13 ? 6 : 8;
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fillStyle = '#f97316';
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2.5;
        ctx.stroke();
      }
    }

    // Ubicación actual del usuario.
    if (this.userLatLng) {
      const point = projection.fromLatLngToDivPixel(this.userLatLng);
      if (point) {
        const x = point.x - left;
        const y = point.y - top;
        const radius = zoom < 13 ? 6 : 8;

        ctx.beginPath();
        ctx.arc(x, y, radius + 5, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(37, 99, 235, 0.16)';
        ctx.fill();

        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fillStyle = '#2563eb';
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 3;
        ctx.stroke();
      }
    }
  }

  onRemove() {
    if (this.frameId) cancelAnimationFrame(this.frameId);
    this.frameId = 0;
    this.canvas?.remove();
    this.canvas = null;
    this.context = null;
  }
}

function showStationInfo(station) {
  const url = googleMapsDirectionsUrl(station);
  infoWindow.setContent(`
    <div class="info-window">
      <strong>${escapeHtml(station.name)}</strong>
      <a href="${url}" target="_blank" rel="noopener">Cómo llegar</a>
    </div>
  `);
  infoWindow.setPosition({ lat: station.lat, lng: station.lng });
  infoWindow.open({ map });
}

function handleMapClick(event) {
  if (!event.latLng) return;

  const click = { lat: event.latLng.lat(), lng: event.latLng.lng() };
  const result = findNearest(click);
  const zoom = map.getZoom() ?? 12;
  const hitRadiusMeters = Math.max(24, metersPerPixel(click.lat, zoom) * 12);

  if (result.distance <= hitRadiusMeters) showStationInfo(result.station);
}

function showNearest(position) {
  const result = findNearest(position);
  const nextStation = result.station;
  const nextDistanceText = formatDistance(result.distance);
  const stationChanged = nearestIndex !== nextStation.index;

  nearestStation = nextStation;
  nearestIndex = nextStation.index;

  if (stationChanged) {
    nearestName.textContent = nextStation.name;
    navigateBtn.href = googleMapsDirectionsUrl(nextStation);
    stationOverlay.setNearestIndex(nearestIndex);
  }

  if (lastNearestDistanceText !== nextDistanceText) {
    lastNearestDistanceText = nextDistanceText;
    nearestDistance.textContent = nextDistanceText;
  }

  if (nearestCard.classList.contains('hidden')) nearestCard.classList.remove('hidden');
  if (!statusCard.classList.contains('compact')) statusCard.classList.add('compact');
}

function shouldProcessLocation(current, timestamp) {
  if (!lastLocation) return true;
  const elapsed = timestamp - lastLocationAt;
  if (elapsed >= MAX_GPS_SILENCE_MS) return true;
  return haversineMeters(lastLocation, current) >= MIN_GPS_MOVE_M;
}

function updateUserLocation(position) {
  const current = {
    lat: position.coords.latitude,
    lng: position.coords.longitude,
  };
  const timestamp = performance.now();

  if (!shouldProcessLocation(current, timestamp)) return;
  lastLocation = current;
  lastLocationAt = timestamp;

  stationOverlay.setUserPosition(current);

  if (!userCentered) {
    userCentered = true;
    map.panTo(current);
    if ((map.getZoom() ?? 0) < 14) map.setZoom(14);
  }

  setStatus('Ubicación encontrada', 'La estación más cercana se actualiza con tu posición.', '✓', 'GPS ACTIVO');
  showNearest(current);
}

function geolocationError(error) {
  const messages = {
    1: 'Permiso de ubicación denegado.',
    2: 'No pudimos determinar tu ubicación.',
    3: 'La ubicación tardó demasiado en responder.',
  };

  setStatus(
    messages[error.code] || 'No se pudo obtener tu ubicación.',
    'Permite la ubicación desde los permisos del navegador y vuelve a intentarlo.',
    '!',
    'GPS',
  );
}

function stopLocationWatch() {
  if (watchId === null) return;
  navigator.geolocation.clearWatch(watchId);
  watchId = null;
}

function startLocation({ recenter = false } = {}) {
  if (!navigator.geolocation) {
    setStatus('Tu navegador no soporta geolocalización.', 'Abre la web desde un navegador moderno.', '!', 'GPS');
    return;
  }

  locationRequested = true;
  if (recenter && lastLocation) {
    map.panTo(lastLocation);
    map.setZoom(Math.max(map.getZoom() ?? 14, 14));
  }

  if (watchId !== null) return;

  setStatus('Buscando tu ubicación…', 'Esto puede tardar unos segundos.', '📍', 'GPS');
  watchId = navigator.geolocation.watchPosition(updateUserLocation, geolocationError, {
    enableHighAccuracy: true,
    maximumAge: 10000,
    timeout: 15000,
  });
}

function fitAllStations() {
  const bounds = new google.maps.LatLngBounds();
  for (let i = 0; i < stationData.length; i += 1) bounds.extend(stationData[i]);
  map.fitBounds(bounds, 44);
}

async function init() {
  if (!API_KEY) {
    fatal.classList.remove('hidden');
    fatal.innerHTML = '<strong>Falta configurar Google Maps.</strong><span>Agrega VITE_GOOGLE_MAPS_API_KEY en las variables de entorno de Vercel.</span>';
    setStatus('Mapa pendiente de configuración', 'Agrega la API key para cargar Google Maps.', '!', 'CONFIGURACIÓN');
    return;
  }

  try {
    const loader = new Loader({
      apiKey: API_KEY,
      version: 'quarterly',
    });

    await loader.load();

    const mapOptions = {
      center: DEFAULT_CENTER,
      zoom: 12,
      disableDefaultUI: true,
      clickableIcons: false,
      gestureHandling: 'greedy',
      keyboardShortcuts: false,
      tilt: 0,
      heading: 0,
      backgroundColor: '#e2e8f0',
    };

    if (MAP_ID) mapOptions.mapId = MAP_ID;

    map = new google.maps.Map(document.querySelector('#map'), mapOptions);
    infoWindow = new google.maps.InfoWindow({ disableAutoPan: false });
    stationOverlay = new StationCanvasOverlay(map, stationData);

    map.addListener('click', handleMapClick);

    fitAllStations();
    startLocation();
  } catch (error) {
    console.error(error);
    fatal.classList.remove('hidden');
    fatal.innerHTML = '<strong>No se pudo cargar Google Maps.</strong><span>Verifica la API key, la facturación y las restricciones del dominio.</span>';
  }
}

locateBtn.addEventListener('click', () => startLocation({ recenter: true }));

centerNearestBtn.addEventListener('click', () => {
  if (!nearestStation || !map) return;
  map.panTo(nearestStation);
  map.setZoom(16);
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    stopLocationWatch();
  } else if (locationRequested) {
    startLocation();
  }
});

window.addEventListener('pagehide', stopLocationWatch);

init();
