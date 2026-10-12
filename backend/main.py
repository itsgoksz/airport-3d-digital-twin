import httpx
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from typing import Dict, Any
from collections import defaultdict
import time
import json
import os
import math
import logging

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Cache dictionary for live flights
flights_cache: Dict[str, Any] = {
    "data": None,
    "last_fetched": 0,
    "rate_limited_until": 0
}

# Global dictionary to store history for interpolation
# flight_history[icao24] = [{lat, lon, altitude, heading, track, velocity, time}, ...]
flight_history = defaultdict(list)

# OpenSky API Credentials
OPENSKY_USERNAME = "sugugautham21-api-client"
OPENSKY_PASSWORD = "zbPQuM3C9X5XBs7nwHZSigWsa6neiDPE"

# BLR Bounding Box (Expanded to ~150km around Kempegowda Airport)
BBOX = {
    "lamin": 12.5,
    "lamax": 14.0,
    "lomin": 77.0,
    "lomax": 78.5
}

# --- New Weather Endpoint ---
@app.get("/api/weather")
async def get_weather():
    # Bangalore Airport coordinates
    lat, lon = 13.199, 77.706
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            url = f"https://api.open-meteo.com/v1/forecast?latitude={lat}&longitude={lon}&current=temperature_2m,weather_code,is_day&daily=sunrise,sunset&timezone=auto"
            resp = await client.get(url)
            resp.raise_for_status()
            data = resp.json()
            return {
                "temperature": data["current"]["temperature_2m"],
                "weather_code": data["current"]["weather_code"],
                "is_day": data["current"]["is_day"],
                "sunrise": data["daily"]["sunrise"][0],
                "sunset": data["daily"]["sunset"][0]
            }
    except Exception as e:
        logger.error(f"Weather fetch error: {e}")
        return {"error": "Failed to fetch weather"}
# ----------------------------

@app.get("/api/airport-data")
async def get_airport_data():
    """Fetches highly detailed city and airport infrastructure data from Overpass API (with disk caching)."""
    cache_file = "airport_data_cache_v7.json"
    
    # Check if we have a local cache file to avoid Overpass rate limits
    if os.path.exists(cache_file):
        with open(cache_file, "r") as f:
            return json.load(f)
            
    overpass_url = "https://lz4.overpass-api.de/api/interpreter"
    
    # Bangalore Kempegowda Airport Center
    lat_center = 13.199
    lon_center = 77.706
    
    # 3km x 3km Bounding Box (Safe for Overpass)
    lat_min = lat_center - 0.015
    lat_max = lat_center + 0.015
    lon_min = lon_center - 0.015
    lon_max = lon_center + 0.015

    query = f"""
    [out:json][timeout:60];
    (
      way["aeroway"]({lat_min},{lon_min},{lat_max},{lon_max});
      relation["aeroway"]({lat_min},{lon_min},{lat_max},{lon_max});
      node["aeroway"="gate"]({lat_min},{lon_min},{lat_max},{lon_max});
      node["aeroway"="parking_position"]({lat_min},{lon_min},{lat_max},{lon_max});
      way["building"]({lat_min},{lon_min},{lat_max},{lon_max});
      relation["building"]({lat_min},{lon_min},{lat_max},{lon_max});
      way["highway"~"^(primary|secondary|tertiary|residential|trunk|motorway|service|pedestrian|footway)$"]({lat_min},{lon_min},{lat_max},{lon_max});
      way["landuse"~"^(grass|meadow)$"]({lat_min},{lon_min},{lat_max},{lon_max});
      way["leisure"~"^(park|garden)$"]({lat_min},{lon_min},{lat_max},{lon_max});
      way["natural"~"^(grass|water)$"]({lat_min},{lon_min},{lat_max},{lon_max});
      relation["natural"="water"]({lat_min},{lon_min},{lat_max},{lon_max});
      way["water"]({lat_min},{lon_min},{lat_max},{lon_max});
      relation["water"]({lat_min},{lon_min},{lat_max},{lon_max});
    );
    out body;
    >;
    out skel qt;
    """
    
    async with httpx.AsyncClient() as client:
        try:
            response = await client.post(
                overpass_url, 
                data={"data": query}, 
                headers={"User-Agent": "LiveAirport-Simulator/1.0"},
                timeout=60.0
            )
            
            # If Overpass rate limits us and we have no cache, return empty
            if response.status_code == 429:
                return {"runways": [], "buildings": [], "roads": [], "lakes": []}
                
            response.raise_for_status()
            data = response.json()
            
            lat_scale = 111320
            lon_scale = 111320 * math.cos(math.radians(lat_center))
            
            nodes = {}
            node_dict = {n["id"]: n for n in data.get("elements", []) if n["type"] == "node"}
            way_dict = {w["id"]: w for w in data.get("elements", []) if w["type"] == "way"}
            
            for el in data.get("elements", []):
                if el["type"] == "node":
                    nodes[el["id"]] = [el["lon"], el["lat"]]

            runways = []
            buildings = []
            roads = []
            lakes = []
            parks = []
            gates = []
            
            import random

            for element in data.get("elements", []):
                if element["type"] == "way":
                    tags = element.get("tags", {})
                    way_nodes = [nodes[nid] for nid in element.get("nodes", []) if nid in nodes]
                    if not way_nodes:
                        continue

                    if "aeroway" in tags and tags.get("aeroway") != "terminal":
                        if tags.get("area") == "yes" or tags.get("aeroway") in ["apron"]:
                            if len(way_nodes) > 2 and way_nodes[0] == way_nodes[-1]:
                                cx = sum(p[0] for p in way_nodes[:-1]) / (len(way_nodes) - 1)
                                cz = sum(p[1] for p in way_nodes[:-1]) / (len(way_nodes) - 1)
                                runways.append({
                                    "id": element["id"],
                                    "polygon": way_nodes,
                                    "type": tags.get("aeroway", "taxiway"),
                                    "center": [round(cx, 2), round(cz, 2)]
                                })
                                
                    if ("building" in tags or tags.get("aeroway") == "terminal") and ("water" not in tags and tags.get("natural") != "water"):
                        if len(way_nodes) > 2 and way_nodes[0] == way_nodes[-1]:
                            cx = sum(p[0] for p in way_nodes[:-1]) / (len(way_nodes) - 1)
                            cz = sum(p[1] for p in way_nodes[:-1]) / (len(way_nodes) - 1)
                            
                            levels = tags.get("building:levels", "2")
                            try:
                                levels = int(levels)
                            except:
                                levels = 2
                                
                            height = max(levels * 3, 5)
                            
                            category = "commercial" if tags.get("building") in ["commercial", "retail", "terminal"] else "residential"
                            if "terminal" in tags.get("aeroway", "") or tags.get("building") == "terminal":
                                category = "terminal"
                                height = 20
                                
                            buildings.append({
                                "id": element["id"],
                                "polygon": way_nodes,
                                "center": [round(cx, 2), round(cz, 2)],
                                "height": height,
                                "category": category,
                                "name": tags.get("name")
                            })
                    elif "highway" in tags:
                        roads.append({
                            "id": element["id"],
                            "line": way_nodes,
                            "type": tags.get("highway", "residential")
                        })
                    elif tags.get("landuse") in ["grass", "meadow"] or tags.get("leisure") in ["park", "garden"] or tags.get("natural") == "grass":
                        if len(way_nodes) > 2:
                            parks.append({
                                "id": element["id"],
                                "polygon": way_nodes,
                                "type": "grass"
                            })
                    elif tags.get("natural") == "water" or tags.get("water") in ["lake", "pond", "reservoir", "river", "basin"]:
                        if len(way_nodes) > 2:
                            lakes.append({
                                "id": element["id"],
                                "polygon": way_nodes,
                                "name": tags.get("name", "Water Body")
                            })
                            
                elif element["type"] == "relation":
                    tags = element.get("tags", {})
                    if tags.get("natural") == "water" or tags.get("water") == "lake":
                        polygon = []
                        for member in element.get("members", []):
                            if member.get("type") == "way" and member.get("role") == "outer":
                                way_id = member.get("ref")
                                if way_id in way_dict:
                                    way = way_dict[way_id]
                                    for node_id in way.get("nodes", []):
                                        if node_id in nodes:
                                            polygon.append(nodes[node_id])
                        
                        # Deduplicate consecutive points
                        clean_poly = []
                        for p in polygon:
                            if not clean_poly or clean_poly[-1] != p:
                                clean_poly.append(p)
                                
                        if len(clean_poly) > 2:
                            lakes.append({
                                "id": element["id"],
                                "polygon": clean_poly,
                                "name": tags.get("name", "Water Body")
                            })
                    
                    if ("building" in tags or tags.get("aeroway") == "terminal") and ("water" not in tags and tags.get("natural") != "water"):
                        outer_polys = []
                        for member in element.get("members", []):
                            if member.get("type") == "way" and member.get("role") == "outer":
                                way_id = member.get("ref")
                                if way_id in way_dict:
                                    way = way_dict[way_id]
                                    ring = []
                                    for node_id in way.get("nodes", []):
                                        if node_id in nodes:
                                            ring.append(nodes[node_id])
                                            
                                    clean_ring = []
                                    for p in ring:
                                        if not clean_ring or clean_ring[-1] != p:
                                            clean_ring.append(p)
                                    if len(clean_ring) > 2:
                                        outer_polys.append(clean_ring)
                                        
                        levels = tags.get("building:levels", "2")
                        try:
                            levels = int(levels)
                        except:
                            levels = 2
                            
                        height = max(levels * 3, 5)
                        category = "commercial" if tags.get("building") in ["commercial", "retail", "terminal"] else "residential"
                        if "terminal" in tags.get("aeroway", "") or tags.get("building") == "terminal":
                            category = "terminal"
                            height = 20
                            
                        for i, poly in enumerate(outer_polys):
                            cx = sum(p[0] for p in poly[:-1]) / (len(poly) - 1)
                            cz = sum(p[1] for p in poly[:-1]) / (len(poly) - 1)
                            
                            buildings.append({
                                "id": f"{element['id']}_{i}",
                                "polygon": poly,
                                "center": [round(cx, 2), round(cz, 2)],
                                "height": height,
                                "category": category,
                                "name": tags.get("name")
                            })
                            
                elif element["type"] == "node":
                    tags = element.get("tags", {})
                    if tags.get("aeroway") in ["gate", "parking_position"]:
                        gates.append({
                            "id": element["id"],
                            "point": [element["lon"], element["lat"]],
                            "ref": tags.get("ref", "")
                        })
            
            result = {
                "runways": runways,
                "buildings": buildings,
                "roads": roads,
                "lakes": lakes,
                "parks": parks,
                "gates": gates
            }
            
            # Save to disk cache
            with open(cache_file, "w") as f:
                json.dump(result, f)
                
            return result
            
        except httpx.HTTPError as e:
            print("HTTPError fetching airport data:", e)
            import traceback
            traceback.print_exc()
            # Fallback for completely failing network
            return {"runways": [], "buildings": [], "roads": [], "lakes": [], "gates": []}

@app.get("/api/live-flights")
async def get_live_flights():
    """Fetches live flight states from OpenSky API with a 10-second cache and mock fallback."""
    global flights_cache
    
    current_time = time.time()
    
    # If we are rate limited, don't spam the API for 60 seconds
    if current_time < flights_cache["rate_limited_until"]:
        return flights_cache["data"]
        
    if flights_cache["data"] and (current_time - flights_cache["last_fetched"]) < 10:
        return flights_cache["data"]
        
    url = f"https://opensky-network.org/api/states/all?lamin={BBOX['lamin']}&lomin={BBOX['lomin']}&lamax={BBOX['lamax']}&lomax={BBOX['lomax']}"
    
    # Generate mock fallback data
    mock_data = {
        "flights": [
            {
                "icao24": "mock1",
                "callsign": "MOCK123",
                "lat": 13.199,
                "lon": 77.706,
                "x": 0,
                "z": -100,
                "altitude": 1000,
                "heading": 45,
                "velocity": 150
            },
            {
                "icao24": "mock2",
                "callsign": "BLR456",
                "lat": 13.210,
                "lon": 77.710,
                "x": 500,
                "z": -500,
                "altitude": 2000,
                "heading": 135,
                "velocity": 200
            }
        ]
    }
    
    url = "https://api.adsb.lol/v2/lat/13.199/lon/77.706/dist/100"
    async with httpx.AsyncClient(timeout=10.0) as client:
        try:
            response = await client.get(url)
            response.raise_for_status()
            data = response.json()
            
            # Extract aircraft array
            aircraft_list = data.get("ac", [])
            
            formatted_flights = []
            now_sec = data.get("now", 0) // 1000
            
            center_lat, center_lon = 13.199, 77.706
            lat_scale = 111320
            lon_scale = 111320 * 0.9735
            
            for ac in aircraft_list:
                alt = ac.get("alt_baro", 0)
                if alt == "ground" or alt is None:
                    alt = 0
                else:
                    alt = float(alt)
                
                lat = ac.get("lat")
                lon = ac.get("lon")
                if lat is None or lon is None:
                    continue
                    
                is_ground_vehicle = False
                category = ac.get("category", "")
                if isinstance(category, str) and category.startswith("C"):
                    is_ground_vehicle = True
                    
                callsign = ac.get("flight", "").strip().upper()
                if any(k in callsign for k in ["FOLOW", "FOLLOW", "TUG", "TXLU", "TRUCK", "SWEEP", "CAR", "FIRE"]):
                    is_ground_vehicle = True
                
                velocity_kts = ac.get("gs", 0.0)
                velocity_ms = float(velocity_kts) * 0.514444 if velocity_kts else 0.0
                if alt == 0:
                    velocity_ms = 0.0
                heading = float(ac.get("true_heading")) if ac.get("true_heading") is not None else None
                track = float(ac.get("track")) if ac.get("track") is not None else None

                z = -(lat - center_lat) * lat_scale
                x = (lon - center_lon) * lon_scale
                    
                icao24 = ac.get("hex", "")
                
                flight_point = {
                    "lat": float(lat),
                    "lon": float(lon),
                    "altitude": alt * 0.3048,
                    "heading": heading,
                    "track": track,
                    "velocity": velocity_ms,
                    "time": now_sec
                }
                
                # Update history
                if icao24:
                    flight_history[icao24].append(flight_point)
                    # Trim history to last 60 seconds
                    flight_history[icao24] = [p for p in flight_history[icao24] if now_sec - p["time"] <= 60]
                
                formatted_flights.append({
                    "icao24": icao24,
                    "callsign": ac.get("flight", "").strip(),
                    "lat": float(lat),
                    "lon": float(lon),
                    "x": x,
                    "z": z,
                    "altitude": alt * 0.3048, # Convert feet to meters
                    "heading": heading,
                    "track": track,
                    "velocity": velocity_ms,
                    "is_ground_vehicle": is_ground_vehicle,
                    "history": flight_history.get(icao24, [flight_point])
                })
            
            # If no flights found, use mock data for demo purposes if empty
            if not formatted_flights:
                formatted_flights = mock_data["flights"]
                
            result = {"flights": formatted_flights}
            flights_cache["data"] = result
            flights_cache["last_fetched"] = current_time
            
            return result
            
        except Exception:
            if flights_cache["data"]:
                return flights_cache["data"]
            return mock_data
