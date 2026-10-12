# Airport 3D Digital Twin 🛫🌐

An interactive, real-time 3D Digital Twin and live flight tracking simulator for Kempegowda International Airport (BLR / VOBL, Bengaluru), built with **React Three Fiber**, **Three.js**, **Google 3D Photorealistic Tiles**, and **FastAPI**.

---

## ✨ Features

- **Live ADS-B Flight Tracking**: Fetches real-time ADS-B transponder telemetry (ADS-B One API) within a 100km radius of VOBL, rendering arriving, departing, and en-route aircraft with smooth interpolation.
- **Google 3D Photorealistic Tiles**: World-scale streaming 3D geospatial tiles powered by `3d-tiles-renderer` with precise WGS84 ECEF to local Topocentric East-North-Up coordinate transformations.
- **Photorealistic Aircraft Lighting (FAA/ICAO Compliant)**:
  - **Wingtip Strobes**: Synchronized double-flash high-intensity white strobes every 1.5 seconds.
  - **Anti-Collision Beacons**: Flashing red beacons mounted on the fuselage upper and lower surfaces at 1.0-second intervals.
  - **Navigation Position Lights**: Steady red (port/left wing) and green (starboard/right wing) plus white tail position light.
  - **Landing Lights**: Forward-facing nose and wing-root landing beams with volumetric lighting cones, active below 10,000 ft and on runway approach.
- **Ground Operations & Touchdown Dynamics**:
  - Ground contact shadows for realistic tarmac grounding.
  - Dynamic touchdown tire smoke particle bursts upon runway contact.
  - Ground pushback tugs and dynamic airport service vehicles.
- **Terminal Architecture & Atmosphere**:
  - Detailed 3D procedural layouts for Terminal 1 and Terminal 2.
  - Procedural ceiling light panels for Terminal 1.
  - Kempegowda Terminal 2 "Terminal in a Garden" themed bamboo bell chandeliers and indoor lush gardens.
- **Dynamic Solar & Atmospheric Scattering**:
  - Sun position calculated in real time (solar elevation and azimuth) synchronized with Open-Meteo sunrise/sunset and live weather data.
  - Drei atmospheric Sky shader matching time of day and golden hour twilight.

---

## 🛠️ Tech Stack

### Frontend
- **Framework**: React 18, Vite, TypeScript
- **3D Engine**: Three.js, `@react-three/fiber`, `@react-three/drei`
- **Geospatial Tiles**: `3d-tiles-renderer`
- **Icons & Styling**: Lucide React, Tailwind CSS

### Backend
- **Framework**: FastAPI, Uvicorn
- **HTTP Client**: HTTPX (async client with caching)
- **Data Providers**:
  - ADS-B One API (Live aircraft positions)
  - Open-Meteo API (Airport solar angles and weather)
  - OpenStreetMap / Overpass API (Runways, taxiways, and terminal polygons)

---

## 🚀 Getting Started

### Prerequisites
- **Node.js** >= 18.x
- **Python** >= 3.10
- **pnpm** or **npm**

---

### Backend Setup

1. Navigate to the backend directory:
   ```bash
   cd backend
   ```

2. Create and activate a Python virtual environment:
   ```bash
   python3 -m venv venv
   source venv/bin/activate    # On Windows: venv\Scripts\activate
   ```

3. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```

4. Start the backend server:
   ```bash
   uvicorn main:app --port 8000 --reload
   ```
   The backend will be live at `http://127.0.0.1:8000`.

---

### Frontend Setup

1. Navigate to the frontend directory:
   ```bash
   cd frontend
   ```

2. Install dependencies:
   ```bash
   npm install
   # or
   pnpm install
   ```

3. (Optional) Configure environment variables:
   Create a `.env` file in `frontend/` if you wish to use your own Google Photorealistic 3D Tiles API key:
   ```env
   VITE_GOOGLE_MAPS_API_KEY=your_google_maps_api_key_here
   ```

4. Start the Vite development server:
   ```bash
   npm run dev
   # or
   pnpm dev
   ```
   Open `http://localhost:5173` in your browser.

---

## 📂 Project Structure

```
├── backend/
│   ├── main.py                  # FastAPI application & API endpoints
│   ├── requirements.txt         # Python dependencies
│   └── airport_data_cache_v7.json # Cached OSM airport layout data
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── AirplaneMarker.tsx      # ADS-B aircraft markers & flight paths
│   │   │   ├── AirportMesh.tsx         # Airport terminals, runways & lighting
│   │   │   ├── AnimatedA320.tsx        # High-fidelity A320 with FAA lighting
│   │   │   ├── DynamicGroundTraffic.tsx# Service vehicle simulation
│   │   │   ├── SceneViewer.tsx         # R3F Canvas, 3D tiles & dynamic sky
│   │   │   ├── TouchdownSmoke.tsx      # Runway touchdown smoke particles
│   │   │   └── PushbackTug.tsx         # Animated pushback tugs
│   │   ├── api/                        # API fetch utilities
│   │   └── types.ts                    # TypeScript types
│   ├── public/
│   │   ├── A320.glb                    # Optimized A320 3D model
│   │   └── AirbusA310.glb              # Airbus A310 model
│   └── package.json
└── README.md
```

---

## 📄 License

MIT License. Feel free to use and contribute!
