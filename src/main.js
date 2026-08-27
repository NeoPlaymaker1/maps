import { Loader } from '@googlemaps/js-api-loader';
import { MarkerClusterer, SuperClusterAlgorithm } from '@googlemaps/markerclusterer';
import '../styles.css';
import stations from '../stations.json';

const API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
const MAP_ID = import.meta.env.VITE_GOOGLE_MAPS_MAP_ID || undefined;
const DEFAULT_CENTER = { lat: -12.069392, lng: -77.047052 };
const EARTH_RADIUS_M = 6371000;
const MIN_GPS_MOVE_M = 10;
const MAX_GPS_SILENCE_MS = 5000;

const stationData = stations.map((station, index) => ({
  ...station,
  gnv: Boolean(station.gnv),
  index,
  latRad: (station.lat * Math.PI) / 180,
  lngRad: (station.lng * Math.PI) / 180,
}));

const FILTERS = {
  all: () => true,
  gnv: (station) => station.gnv,
};

let map;
let infoWindow;
let markerClusterer;
let stationMarkers = [];
let userMarker = null;
let watchId = null;
let locationRequested = false;
let lastLocation = null;
let lastLocationAt = 0;
let userCentered = false;
let nearestStation = null;
let nearestIndex = -1;
let lastNearestDistanceText = '';
let lastStatusSignature = '';
let navigationStation = null;
let activeFilter = 'all';
let normalPinIcon;
let gnvPinIcon;
let nearestPinIcon;

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
const stationCount = document.querySelector('#stationCount');
const allCount = document.querySelector('#allCount');
const gnvCount = document.querySelector('#gnvCount');
const filterButtons = [...document.querySelectorAll('[data-filter]')];
const fatal = document.querySelector('#fatal');
const navBackdrop = document.querySelector('#navBackdrop');
const navSheet = document.querySelector('#navSheet');
const closeNavBtn = document.querySelector('#closeNavBtn');
const navStationName = document.querySelector('#navStationName');
const googleMapsNav = document.querySelector('#googleMapsNav');
const wazeNav = document.querySelector('#wazeNav');

function setStatus(title, subtitle, icon = '📍', eyebrow = 'Ubicación') {
  const signature = `${eyebrow}|${icon}|${title}|${subtitle}`;
  if (signature === lastStatusSignature) return;
  lastStatusSignature = signature;
  statusIcon.textContent = icon;
  statusEyebrow.textContent = eyebrow;
  statusTitle.textContent = title;
  statusSubtitle.textContent = subtitle;
}

function getVisibleStations() {
  const matcher = FILTERS[activeFilter] || FILTERS.all;
  return stationData.filter(matcher);
}

function getBaseIcon(station) {
  return station.gnv ? gnvPinIcon : normalPinIcon;
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
  const visibleStations = getVisibleStations();
  if (!visibleStations.length) return null;

  const latRad = (position.lat * Math.PI) / 180;
  const lngRad = (position.lng * Math.PI) / 180;
  let best = visibleStations[0];
  let bestSquared = Infinity;

  for (let i = 0; i < visibleStations.length; i += 1) {
    const station = visibleStations[i];
    const x = (station.lngRad - lngRad) * Math.cos((station.latRad + latRad) / 2);
    const y = station.latRad - latRad;
    const squared = x * x + y * y;
    if (squared < bestSquared) {
      bestSquared = squared;
      best = station;
    }
  }

  return { station: best, distance: haversineMeters(position, best) };
}

function formatDistance(meters) {
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(meters < 10000 ? 1 : 0)} km`;
}

function googleMapsDirectionsUrl(station) {
  const destination = encodeURIComponent(`${station.lat},${station.lng}`);
  return `https://www.google.com/maps/dir/?api=1&destination=${destination}&travelmode=driving&dir_action=navigate`;
}

function wazeDirectionsUrl(station) {
  const coords = encodeURIComponent(`${station.lat},${station.lng}`);
  return `https://waze.com/ul?ll=${coords}&navigate=yes`;
}

function svgToDataUrl(svg) {
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function createPinIcon(fill, stroke = '#ffffff', width = 28, height = 38) {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 28 38">
      <path d="M14 1.5C7.1 1.5 1.5 7.1 1.5 14c0 9.25 12.5 22.5 12.5 22.5S26.5 23.25 26.5 14C26.5 7.1 20.9 1.5 14 1.5Z" fill="${fill}" stroke="${stroke}" stroke-width="2"/>
      <circle cx="14" cy="14" r="5" fill="#ffffff" opacity="0.98"/>
      <circle cx="14" cy="14" r="2.25" fill="${fill}"/>
    </svg>`;

  return {
    url: svgToDataUrl(svg),
    scaledSize: new google.maps.Size(width, height),
    anchor: new google.maps.Point(width / 2, height),
  };
}

function openNavigationChooser(station) {
  if (!station) return;
  navigationStation = station;
  navStationName.textContent = station.name;
  googleMapsNav.href = googleMapsDirectionsUrl(station);
  wazeNav.href = wazeDirectionsUrl(station);

  navBackdrop.classList.remove('hidden');
  navSheet.classList.remove('hidden');
  requestAnimationFrame(() => {
    navBackdrop.classList.add('visible');
    navSheet.classList.add('visible');
  });
}

function closeNavigationChooser() {
  navigationStation = null;
  navBackdrop.classList.remove('visible');
  navSheet.classList.remove('visible');
  window.setTimeout(() => {
    if (!navSheet.classList.contains('visible')) {
      navBackdrop.classList.add('hidden');
      navSheet.classList.add('hidden');
    }
  }, 180);
}

function showStationInfo(station, marker) {
  const wrapper = document.createElement('div');
  wrapper.className = 'info-window';

  const title = document.createElement('strong');
  title.textContent = station.name;
  wrapper.append(title);

  if (station.gnv) {
    const badge = document.createElement('span');
    badge.className = 'gnv-badge';
    badge.textContent = 'GNV';
    wrapper.append(badge);
  }

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'info-nav-button';
  button.textContent = 'Elegir navegación';
  button.addEventListener('click', () => {
    infoWindow.close();
    openNavigationChooser(station);
  });

  wrapper.append(button);
  infoWindow.setContent(wrapper);
  infoWindow.open({ map, anchor: marker });
}

function createStationMarkers() {
  normalPinIcon = createPinIcon('#0f2744');
  gnvPinIcon = createPinIcon('#16a34a');
  nearestPinIcon = createPinIcon('#f97316', '#ffffff', 32, 43);

  stationMarkers = stationData.map((station) => {
    const marker = new google.maps.Marker({
      position: { lat: station.lat, lng: station.lng },
      title: station.name,
      icon: getBaseIcon(station),
      optimized: true,
      clickable: true,
      zIndex: 1,
    });

    marker.addListener('click', () => showStationInfo(station, marker));
    return marker;
  });

  markerClusterer = new MarkerClusterer({
    map,
    markers: stationMarkers,
    algorithm: new SuperClusterAlgorithm({
      radius: 70,
      maxZoom: 15,
    }),
  });
}

function setNearestMarker(index) {
  if (nearestIndex === index) return;

  if (nearestIndex >= 0 && stationMarkers[nearestIndex]) {
    const previous = stationData[nearestIndex];
    stationMarkers[nearestIndex].setIcon(getBaseIcon(previous));
    stationMarkers[nearestIndex].setZIndex(1);
  }

  nearestIndex = index;

  if (nearestIndex >= 0 && stationMarkers[nearestIndex]) {
    stationMarkers[nearestIndex].setIcon(nearestPinIcon);
    stationMarkers[nearestIndex].setZIndex(5000);
  }
}

function showNearest(position) {
  const result = findNearest(position);
  if (!result) {
    nearestStation = null;
    nearestIndex = -1;
    nearestCard.classList.add('hidden');
    return;
  }

  const nextStation = result.station;
  const nextDistanceText = formatDistance(result.distance);
  const stationChanged = nearestStation?.index !== nextStation.index;

  nearestStation = nextStation;

  if (stationChanged) {
    nearestName.textContent = nextStation.name;
    setNearestMarker(nextStation.index);
  }

  if (lastNearestDistanceText !== nextDistanceText) {
    lastNearestDistanceText = nextDistanceText;
    nearestDistance.textContent = nextDistanceText;
  }

  nearestCard.classList.remove('hidden');
  statusCard.classList.add('compact');
}

function fitVisibleStations() {
  const visibleStations = getVisibleStations();
  if (!map || !visibleStations.length) return;
  const bounds = new google.maps.LatLngBounds();
  visibleStations.forEach((station) => bounds.extend({ lat: station.lat, lng: station.lng }));
  map.fitBounds(bounds, 44);
}

function updateFilterUi() {
  const visibleStations = getVisibleStations();
  stationCount.textContent = activeFilter === 'gnv'
    ? `${visibleStations.length} estaciones GNV`
    : `${visibleStations.length} estaciones`;

  filterButtons.forEach((button) => {
    const isActive = button.dataset.filter === activeFilter;
    button.classList.toggle('active', isActive);
    button.setAttribute('aria-pressed', String(isActive));
  });
}

function applyFilter(filterName, { fit = true } = {}) {
  if (!FILTERS[filterName] || !markerClusterer) return;
  activeFilter = filterName;

  if (nearestIndex >= 0 && stationMarkers[nearestIndex]) {
    stationMarkers[nearestIndex].setIcon(getBaseIcon(stationData[nearestIndex]));
    stationMarkers[nearestIndex].setZIndex(1);
  }
  nearestIndex = -1;
  nearestStation = null;
  lastNearestDistanceText = '';

  const visibleStations = getVisibleStations();
  const visibleMarkers = visibleStations.map((station) => stationMarkers[station.index]);

  infoWindow.close();
  markerClusterer.clearMarkers();
  markerClusterer.addMarkers(visibleMarkers);
  updateFilterUi();

  if (lastLocation) {
    showNearest(lastLocation);
    setStatus(
      filterName === 'gnv' ? 'Filtro GNV activo' : 'Mostrando todas las estaciones',
      filterName === 'gnv'
        ? 'La estación más cercana ahora se calcula solo entre estaciones con GNV.'
        : 'La estación más cercana se calcula entre todas las estaciones.',
      '✓',
      'FILTRO',
    );
    if (fit) {
      map.panTo(lastLocation);
      map.setZoom(Math.max(map.getZoom() ?? 14, 13));
    }
  } else if (fit) {
    fitVisibleStations();
  }
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

  if (!userMarker) {
    userMarker = new google.maps.Marker({
      map,
      position: current,
      title: 'Tu ubicación',
      optimized: true,
      zIndex: 10000,
      icon: {
        path: google.maps.SymbolPath.CIRCLE,
        scale: 8,
        fillColor: '#2563eb',
        fillOpacity: 1,
        strokeColor: '#ffffff',
        strokeWeight: 3,
      },
    });
  } else {
    userMarker.setPosition(current);
  }

  if (!userCentered) {
    userCentered = true;
    map.panTo(current);
    if ((map.getZoom() ?? 0) < 14) map.setZoom(14);
  }

  const filterLabel = activeFilter === 'gnv' ? ' GNV' : '';
  setStatus('Ubicación encontrada', `La estación${filterLabel} más cercana se actualiza con tu posición.`, '✓', 'GPS ACTIVO');
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

window.gm_authFailure = () => {
  fatal.classList.remove('hidden');
  fatal.innerHTML = '<strong>Google Maps rechazó la API key.</strong><span>Revisa Maps JavaScript API, facturación y los HTTP referrers autorizados para este dominio.</span>';
  setStatus('Google Maps bloqueó la carga', 'Revisa las restricciones de la API key para este dominio.', '!', 'MAPA');
};

async function init() {
  allCount.textContent = String(stationData.length);
  gnvCount.textContent = String(stationData.filter((station) => station.gnv).length);
  updateFilterUi();

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
      zoomControl: true,
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

    createStationMarkers();
    applyFilter('all', { fit: true });
    startLocation();
  } catch (error) {
    console.error(error);
    fatal.classList.remove('hidden');
    fatal.innerHTML = '<strong>No se pudo cargar Google Maps.</strong><span>Verifica la API key, la facturación y las restricciones del dominio.</span>';
  }
}

filterButtons.forEach((button) => {
  button.addEventListener('click', () => applyFilter(button.dataset.filter));
});

locateBtn.addEventListener('click', () => startLocation({ recenter: true }));

centerNearestBtn.addEventListener('click', () => {
  if (!nearestStation || !map) return;
  map.panTo({ lat: nearestStation.lat, lng: nearestStation.lng });
  map.setZoom(17);

  const marker = stationMarkers[nearestStation.index];
  if (marker) {
    window.setTimeout(() => showStationInfo(nearestStation, marker), 180);
  }
});

navigateBtn.addEventListener('click', () => openNavigationChooser(nearestStation));
closeNavBtn.addEventListener('click', closeNavigationChooser);
navBackdrop.addEventListener('click', closeNavigationChooser);

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && navigationStation) closeNavigationChooser();
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
