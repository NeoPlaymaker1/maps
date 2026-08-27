import { Loader } from '@googlemaps/js-api-loader';
import '../styles.css';
import stations from '../stations.json';

const API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
const DEFAULT_CENTER = { lat: -12.069392, lng: -77.047052 };

let map;
let userMarker;
let nearestMarker;
let nearestStation;
let infoWindow;
let watchId = null;
const stationMarkers = [];

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
  statusIcon.textContent = icon;
  statusEyebrow.textContent = eyebrow;
  statusTitle.textContent = title;
  statusSubtitle.textContent = subtitle;
}

function haversineMeters(a, b) {
  const R = 6371000;
  const toRad = (v) => (v * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function formatDistance(meters) {
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(meters < 10000 ? 1 : 0)} km`;
}

function googleMapsDirectionsUrl(station) {
  return `https://www.google.com/maps/dir/?api=1&destination=${station.lat},${station.lng}&travelmode=driving`;
}

function findNearest(position) {
  let best = null;
  let bestDistance = Infinity;
  for (const station of stations) {
    const distance = haversineMeters(position, station);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = station;
    }
  }
  return { station: best, distance: bestDistance };
}

function showNearest(position) {
  const result = findNearest(position);
  nearestStation = result.station;

  nearestName.textContent = nearestStation.name;
  nearestDistance.textContent = formatDistance(result.distance);
  navigateBtn.href = googleMapsDirectionsUrl(nearestStation);
  nearestCard.classList.remove('hidden');
  statusCard.classList.add('compact');

  if (nearestMarker) nearestMarker.setMap(null);
  nearestMarker = new google.maps.Marker({
    position: nearestStation,
    map,
    title: `Más cercana: ${nearestStation.name}`,
    zIndex: 1000,
    icon: {
      path: google.maps.SymbolPath.CIRCLE,
      scale: 11,
      fillColor: '#f97316',
      fillOpacity: 1,
      strokeColor: '#ffffff',
      strokeWeight: 3
    }
  });
}

function updateUserLocation(position) {
  const current = {
    lat: position.coords.latitude,
    lng: position.coords.longitude
  };

  if (!userMarker) {
    userMarker = new google.maps.Marker({
      position: current,
      map,
      title: 'Tu ubicación',
      zIndex: 2000,
      icon: {
        path: google.maps.SymbolPath.CIRCLE,
        scale: 9,
        fillColor: '#2563eb',
        fillOpacity: 1,
        strokeColor: '#ffffff',
        strokeWeight: 4
      }
    });
    map.setCenter(current);
    map.setZoom(14);
  } else {
    userMarker.setPosition(current);
  }

  setStatus('Ubicación encontrada', 'La estación más cercana se actualiza con tu posición.', '✓', 'GPS ACTIVO');
  showNearest(current);
}

function geolocationError(error) {
  const messages = {
    1: 'Permiso de ubicación denegado.',
    2: 'No pudimos determinar tu ubicación.',
    3: 'La ubicación tardó demasiado en responder.'
  };
  setStatus(
    messages[error.code] || 'No se pudo obtener tu ubicación.',
    'Puedes permitir la ubicación desde los permisos del navegador y volver a intentarlo.',
    '!',
    'GPS'
  );
}

function startLocation() {
  if (!navigator.geolocation) {
    setStatus('Tu navegador no soporta geolocalización.', 'Abre la web desde un navegador moderno.', '!', 'GPS');
    return;
  }

  setStatus('Buscando tu ubicación…', 'Esto puede tardar unos segundos.', '📍', 'GPS');
  if (watchId !== null) navigator.geolocation.clearWatch(watchId);
  watchId = navigator.geolocation.watchPosition(updateUserLocation, geolocationError, {
    enableHighAccuracy: true,
    maximumAge: 5000,
    timeout: 15000
  });
}

function addStationMarkers() {
  const bounds = new google.maps.LatLngBounds();
  infoWindow = new google.maps.InfoWindow();

  stations.forEach((station) => {
    const marker = new google.maps.Marker({
      position: station,
      map,
      title: station.name,
      icon: {
        path: google.maps.SymbolPath.CIRCLE,
        scale: 6,
        fillColor: '#0f172a',
        fillOpacity: 0.92,
        strokeColor: '#ffffff',
        strokeWeight: 2
      }
    });

    marker.addListener('click', () => {
      const url = googleMapsDirectionsUrl(station);
      infoWindow.setContent(`
        <div class="info-window">
          <strong>${station.name}</strong>
          <a href="${url}" target="_blank" rel="noopener">Cómo llegar</a>
        </div>
      `);
      infoWindow.open({ anchor: marker, map });
    });

    stationMarkers.push(marker);
    bounds.extend(station);
  });

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
      version: 'weekly'
    });
    await loader.load();

    map = new google.maps.Map(document.querySelector('#map'), {
      center: DEFAULT_CENTER,
      zoom: 12,
      mapTypeControl: false,
      streetViewControl: false,
      fullscreenControl: false,
      clickableIcons: false,
      gestureHandling: 'greedy',
      styles: [
        { featureType: 'poi', elementType: 'labels', stylers: [{ visibility: 'off' }] }
      ]
    });

    addStationMarkers();
    startLocation();
  } catch (error) {
    console.error(error);
    fatal.classList.remove('hidden');
    fatal.innerHTML = '<strong>No se pudo cargar Google Maps.</strong><span>Verifica la API key, la facturación y las restricciones del dominio.</span>';
  }
}

locateBtn.addEventListener('click', startLocation);
centerNearestBtn.addEventListener('click', () => {
  if (!nearestStation || !map) return;
  map.panTo(nearestStation);
  map.setZoom(16);
});

init();
