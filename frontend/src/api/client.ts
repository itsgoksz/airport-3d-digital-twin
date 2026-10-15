import * as THREE from 'three';

let activePort: number | null = null;
const CANDIDATE_PORTS = [8000, 8001];

async function apiFetch(path: string): Promise<Response> {
  const envBase = (import.meta as any).env?.VITE_API_BASE;
  if (envBase) {
    return fetch(`${envBase}${path}`);
  }

  const ports = activePort 
    ? [activePort, ...CANDIDATE_PORTS.filter(p => p !== activePort)] 
    : CANDIDATE_PORTS;

  let lastError: any = null;
  for (const port of ports) {
    try {
      const res = await fetch(`http://localhost:${port}/api${path}`);
      if (res.ok) {
        activePort = port;
        return res;
      }
    } catch (err) {
      lastError = err;
    }
  }

  throw lastError || new Error(`Could not connect to backend server on ports ${CANDIDATE_PORTS.join(', ')}`);
}

export function wgs84ToECEF(lat: number, lon: number, alt: number): THREE.Vector3 {
  const a = 6378137.0; // semi-major axis in meters
  const eSq = 0.00669437999014; // first eccentricity squared
  const latRad = THREE.MathUtils.degToRad(lat);
  const lonRad = THREE.MathUtils.degToRad(lon);
  
  const sinLat = Math.sin(latRad);
  const cosLat = Math.cos(latRad);
  const sinLon = Math.sin(lonRad);
  const cosLon = Math.cos(lonRad);

  const N = a / Math.sqrt(1 - eSq * sinLat * sinLat);

  // ECEF Z is typically North pole, X is prime meridian equator.
  // 3d-tiles-renderer maps ECEF Z to Three.js Y (up) by default using a rotation, 
  // or it expects standard Three.js vectors. Let's return raw ECEF.
  // Wait, Three.js TilesRenderer natively handles raw ECEF XYZ and applies a group rotation.
  const x = (N + alt) * cosLat * cosLon;
  const y = (N + alt) * cosLat * sinLon;
  const z = (N * (1 - eSq) + alt) * sinLat;
  
  return new THREE.Vector3(x, y, z);
}

export interface AirportData {
  runways: {
    id: number;
    type: string;
    polygon: number[][];
    center: number[];
  }[];
  buildings: {
    id: number;
    category: string;
    height: number;
    name?: string;
    polygon: number[][];
    center: number[];
  }[];
  roads: {
    id: number;
    type: string;
    line: number[][];
  }[];
  lakes: {
    id: number;
    name?: string;
    polygon: number[][];
  }[];
  parks: {
    id: number;
    type: string;
    polygon: number[][];
  }[];
  gates: {
    id: number;
    ref: string;
    point: number[];
  }[];
}

export interface WeatherData {
  temperature: number;
  weather_code: number;
  is_day: number;
  sunrise: string;
  sunset: string;
}

export interface FlightWaypoint {
  lat: number;
  lon: number;
  altitude: number;
  heading: number | null;
  track: number | null;
  velocity: number;
  time: number;
}

export interface FlightData {
  icao24: string;
  callsign: string;
  lat: number;
  lon: number;
  x: number;
  z: number;
  altitude: number;
  heading: number | null;
  track: number | null;
  velocity?: number;
  history?: FlightWaypoint[];
  is_ground_vehicle?: boolean;
}

export interface FlightsResponse {
  flights: FlightData[];
}

export const fetchAirportData = async (): Promise<AirportData> => {
  const res = await apiFetch('/airport-data');
  if (!res.ok) throw new Error('Failed to fetch airport data');
  return res.json();
};

export const fetchWeather = async (): Promise<WeatherData> => {
  const res = await apiFetch('/weather');
  if (!res.ok) throw new Error('Failed to fetch weather data');
  return res.json();
};

export const fetchLiveFlights = async (): Promise<FlightsResponse> => {
  const res = await apiFetch('/live-flights');
  if (!res.ok) throw new Error('Failed to fetch live flights');
  return res.json();
};
