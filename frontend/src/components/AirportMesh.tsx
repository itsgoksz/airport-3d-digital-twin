import React, { useMemo, useState, useEffect } from 'react';
import * as THREE from 'three';
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { fetchAirportData, AirportData, wgs84ToECEF } from '../api/client';

export const AirportMesh: React.FC<{ isNight?: boolean }> = ({ isNight }) => {
  const [data, setData] = useState<AirportData | null>(null);

  useEffect(() => {
    fetchAirportData().then(setData).catch(console.error);
  }, []);

  const { 
    runwayGeometry, 
    runwayLightsGeometry, 
    buildingGeometry, 
    roofGeometry, 
    gateGeometry, 
    terminalGeometry, 
    terminalRoofGeometry, 
    terminalPillarGeometry, 
    terminalFloorGeometry,
    t1FasciaGeos: t1FasciaGeometry,
    t1BaseGeos: t1BaseGeometry,
    t2RoofGeometry,
    t2PillarGeometry,
    t2GardenGeometry,
    t1LightGeometry,
    t2LightGeometry
  } = useMemo(() => {
    if (!data || !data.runways) return { runwayGeometry: null, runwayLightsGeometry: null, buildingGeometry: null, roofGeometry: null, gateGeometry: null, terminalGeometry: null, terminalRoofGeometry: null, terminalPillarGeometry: null, terminalFloorGeometry: null };

    const groundPos = wgs84ToECEF(13.199, 77.706, 844);
    const upVector = groundPos.clone().normalize();
    const northPole = new THREE.Vector3(0, 0, 1);
    const localNorth = northPole.clone().sub(upVector.clone().multiplyScalar(northPole.dot(upVector))).normalize();
    const localEast = localNorth.clone().cross(upVector).normalize();

    const projectToLocal = (lon: number, lat: number) => {
      const pECEF = wgs84ToECEF(lat, lon, 844);
      const localOffset = pECEF.clone().sub(groundPos);
      const x = localOffset.dot(localEast); // East
      const y = localOffset.dot(localNorth); // North
      return new THREE.Vector2(x, y);
    };

    const runwayGeos: THREE.BufferGeometry[] = [];
    const lightGeos: THREE.BufferGeometry[] = [];
    const buildingGeos: THREE.BufferGeometry[] = [];
    const roofGeos: THREE.BufferGeometry[] = [];
    const terminalGeos: THREE.BufferGeometry[] = [];
    const terminalRoofGeos: THREE.BufferGeometry[] = [];
    const terminalPillarGeos: THREE.BufferGeometry[] = [];
    const terminalFloorGeos: THREE.BufferGeometry[] = [];
    const t1FasciaGeos: THREE.BufferGeometry[] = [];
    const t1BaseGeos: THREE.BufferGeometry[] = [];
    const t2RoofGeos: THREE.BufferGeometry[] = [];
    const t2PillarGeos: THREE.BufferGeometry[] = [];
    const t2GardenGeos: THREE.BufferGeometry[] = [];
    const t1LightGeos: THREE.BufferGeometry[] = [];
    const t2LightGeos: THREE.BufferGeometry[] = [];

    // 1. Process Runways & Taxiways
    data.runways.forEach((r: any) => {
      // Filter out massive aerodrome polygons, only keep actual paths
      if (r.type !== 'runway' && r.type !== 'taxiway' && r.type !== 'apron') return;
      
      const pts = r.polygon.map((p: number[]) => projectToLocal(p[0], p[1]));
      if (pts.length < 3) return;
      
      const s = new THREE.Shape(pts);
      const isRunway = r.type === 'runway';
      
      // Flat decal on the ground instead of a bulky extrusion
      const geo = new THREE.ShapeGeometry(s);
      geo.rotateX(-Math.PI / 2);
      // Lift it exactly 0.5m above the ground to hide the baked-in satellite planes
      // while preventing z-fighting with the Google 3D Tiles terrain
      geo.translate(0, 0.5, 0); 
      
      runwayGeos.push(geo);

      // Add Runway Edge Lights
      if (isRunway) {
        pts.forEach((pt: THREE.Vector2) => {
          const lightGeo = new THREE.BoxGeometry(2, 2, 2);
          lightGeo.translate(pt.x, 2.0, -pt.y); // Z is inverted 
          lightGeos.push(lightGeo);
        });
      }
    });
    // 2. Extrude 3D Buildings with photorealistic materials
    data.buildings.forEach((b: any) => {
      const pts = b.polygon.map((p: number[]) => projectToLocal(p[0], p[1]));
      if (pts.length < 3) return;

      const s = new THREE.Shape(pts);
      const isTerminal = b.category === 'terminal';
      
      let geo: THREE.BufferGeometry;
      let roofGeo: THREE.BufferGeometry;
      
      if (isTerminal) {
        // Find bounding box for scaling
        let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
        pts.forEach((p: THREE.Vector2) => {
          if (p.x < minX) minX = p.x;
          if (p.x > maxX) maxX = p.x;
          if (p.y < minZ) minZ = p.y;
          if (p.y > maxZ) maxZ = p.y;
        });
        const width = maxX - minX;
        const length = maxZ - minZ;
        const cx = (minX + maxX) / 2;
        const cz = (minZ + maxZ) / 2;

        // The actual terminals are massive (> 600m wide). Ancillary/cargo buildings are smaller.
        const isTerminal2 = width > 500 && cx > 800;
        const isTerminal1 = !isTerminal2 && width > 500 && cx < 800;

        // Flat glass walls for the terminal
        const extrudeSettingsWalls = { depth: b.height - 2, bevelEnabled: false, steps: 1 };
        geo = new THREE.ExtrudeGeometry(s, extrudeSettingsWalls);
        geo.rotateX(-Math.PI / 2);
        
        if (isTerminal2) {
          // ----------------------------------------------------
          // TERMINAL 2: "Terminal in a Garden" Architecture
          // ----------------------------------------------------
          
          // Massive flat overhanging roof
          const overhangPts = pts.map((p: THREE.Vector2) => {
             const dirX = p.x - cx;
             const dirY = p.y - cz;
             const dist = Math.sqrt(dirX*dirX + dirY*dirY);
             if (dist === 0) return p;
             return new THREE.Vector2(cx + (dirX/dist)*(dist + 25), cz + (dirY/dist)*(dist + 25)); // Huge 25m overhang
          });
          const overhangShape = new THREE.Shape(overhangPts);
          
          roofGeo = new THREE.ExtrudeGeometry(overhangShape, { depth: 2.0, bevelEnabled: false, steps: 1 });
          roofGeo.rotateX(-Math.PI / 2);
          roofGeo.translate(0, b.height + 4, 0); // Flat roof elevated above walls
          
          geo.computeVertexNormals();
          roofGeo.computeVertexNormals();
          
          // Procedural Bamboo Pillars and Hanging Gardens
          for (let i = 0; i < overhangPts.length; i++) {
            const p1 = overhangPts[i];
            const p2 = overhangPts[(i + 1) % overhangPts.length];
            const segmentLen = p1.distanceTo(p2);
            
            if (segmentLen > 30) {
              const numPillars = Math.floor(segmentLen / 30);
              for (let j = 1; j <= numPillars; j++) {
                const t = j / (numPillars + 1);
                const px = p1.x + (p2.x - p1.x) * t;
                const pz = -(p1.y + (p2.y - p1.y) * t);
                
                // Straight Bamboo Clad Pillar
                const pHeight = b.height + 4;
                const pillarGeo = new THREE.CylinderGeometry(1.2, 1.2, pHeight, 8);
                pillarGeo.translate(px, pHeight / 2, pz);
                t2PillarGeos.push(pillarGeo);
                
                // Hanging Gardens & Bamboo Lights
                const numPlants = 5 + Math.floor(Math.random() * 5);
                for (let k = 0; k < numPlants; k++) {
                  const plantX = px + (Math.random() - 0.5) * 25;
                  const plantZ = pz + (Math.random() - 0.5) * 25;
                  const isLight = Math.random() > 0.7; // 30% chance to be a glowing bamboo light
                  
                  if (isLight) {
                    const dropLen = 2 + Math.random() * 5;
                    const lightGeo = new THREE.SphereGeometry(2.0, 8, 8);
                    lightGeo.scale(1, 1.2, 1);
                    lightGeo.translate(plantX, pHeight - dropLen, plantZ);
                    t2LightGeos.push(lightGeo);
                  } else {
                    const dropLen = 2 + Math.random() * 12;
                    const plantGeo = new THREE.SphereGeometry(1.5 + Math.random() * 3, 5, 5); 
                    plantGeo.scale(1, 2 + Math.random() * 2.5, 1);
                    plantGeo.translate(plantX, pHeight - dropLen, plantZ);
                    t2GardenGeos.push(plantGeo);
                  }
                }
                
                // Dense Ground Garden (Jungle at the base)
                const numGroundPlants = 8 + Math.floor(Math.random() * 10);
                for (let k = 0; k < numGroundPlants; k++) {
                  const gx = px + (Math.random() - 0.5) * 25;
                  const gz = pz + (Math.random() - 0.5) * 25;
                  const radius = 2 + Math.random() * 4;
                  const bushGeo = new THREE.SphereGeometry(radius, 6, 6);
                  bushGeo.scale(1, 0.5 + Math.random() * 0.5, 1);
                  bushGeo.translate(gx, b.height + radius * 0.5, gz);
                  t2GardenGeos.push(bushGeo);
                }
              }
            }
          }
          
          terminalGeos.push(geo);
          t2RoofGeos.push(roofGeo);
          
        } else if (isTerminal1) {
          // ----------------------------------------------------
          // TERMINAL 1: Architectural Directional Wave
          // ----------------------------------------------------
          
          // Massive overhanging roof base (Flat roof for the whole polygon, including concourses)
          const overhangPts = pts.map((p: THREE.Vector2) => {
             const dirX = p.x - cx;
             const dirY = p.y - cz;
             const dist = Math.sqrt(dirX*dirX + dirY*dirY);
             if (dist === 0) return p;
             return new THREE.Vector2(cx + (dirX/dist)*(dist + 5), cz + (dirY/dist)*(dist + 5)); // 5m overhang for base roof
          });
          const overhangShape = new THREE.Shape(overhangPts);
          
          roofGeo = new THREE.ExtrudeGeometry(overhangShape, { depth: 1.0, bevelEnabled: false, steps: 1 });
          roofGeo.rotateX(-Math.PI / 2);
          roofGeo.translate(0, b.height, 0); // Base flat roof
          
          // The massive Sweeping Canopy (Only over the 360m central main hall!)
          const canopyWidth = Math.min(width, 360);
          const canopyLength = length + 40;
          
          // Helper for realistic architectural roof shape
          const getT1WaveHeight = (x: number, z: number) => {
            const dx = x - cx;
            const dz = z - (-cz);
            const nx = dx / (canopyWidth / 2 || 1);
            const nz = dz / (canopyLength / 2 || 1);
            
            // South side (driveway) flares up at the ends like a smile
            const southFactor = Math.max(0, nz);
            const uShape = nx * nx;
            const sweepHeight = uShape * 22.0;
            
            // North side (runway) has a central elevated pyramidal pavilion
            let northHeight = 0;
            if (nz < 0 && Math.abs(dx) < 100) {
               const pyramidX = 1 - Math.abs(dx) / 100;
               const pyramidZ = Math.abs(nz);
               northHeight = Math.min(pyramidX, pyramidZ) * 15.0;
            }
            
            return (sweepHeight * southFactor) + northHeight;
          };

          // Highly subdivided sweeping canopy roof (strictly limited width)
          const sweepGeo = new THREE.PlaneGeometry(canopyWidth, canopyLength, 64, 64);
          sweepGeo.rotateX(-Math.PI / 2);
          sweepGeo.translate(cx, b.height + 15, -cz); // Shifted up by 15m ABOVE the flat roof
          
          // Apply realistic wave
          const attr = sweepGeo.attributes.position as THREE.BufferAttribute;
          for (let i = 0; i < attr.count; i++) {
            const x = attr.getX(i);
            const y = attr.getY(i);
            const z = attr.getZ(i);
            const wave = getT1WaveHeight(x, z);
            attr.setY(i, y + wave);
          }
          sweepGeo.computeVertexNormals();
          terminalRoofGeos.push(sweepGeo);
          
          // Cyan Fascia (Thick rim around the canopy)
          const fasciaGeo = new THREE.PlaneGeometry(canopyWidth + 5, canopyLength + 5, 64, 64);
          fasciaGeo.rotateX(-Math.PI / 2);
          fasciaGeo.translate(cx, b.height + 14.5, -cz); 
          const fAttr = fasciaGeo.attributes.position as THREE.BufferAttribute;
          for (let i = 0; i < fAttr.count; i++) {
            const x = fAttr.getX(i);
            const y = fAttr.getY(i);
            const z = fAttr.getZ(i);
            const wave = getT1WaveHeight(x, z);
            
            const dx = Math.abs(x - cx);
            const dz = Math.abs(-z - cz);
            if (dx > canopyWidth/2 || dz > canopyLength/2) {
              fAttr.setY(i, y + wave);
            } else {
              fAttr.setY(i, y + wave - 2.0); // push it under the main roof
            }
          }
          fasciaGeo.computeVertexNormals();
          t1FasciaGeos.push(fasciaGeo);
          
          geo.computeVertexNormals();
          roofGeo.computeVertexNormals();

          // Procedural Massive Black Pyramid Bases & White Strut Clusters
          // Generate them purely along the South edge of the canopy
          const numPillars = Math.floor(canopyWidth / 40); // one every 40m
          for (let j = 0; j <= numPillars; j++) {
            const t = j / numPillars;
            const px = cx - canopyWidth/2 + canopyWidth * t;
            const pz = -cz + canopyLength/2 - 5; // South edge
            
            const waveAtPillar = getT1WaveHeight(px, pz);
            const pHeight = b.height + 15 + waveAtPillar;
            
            // Massive black concrete truncated pyramid base
            const baseGeo = new THREE.CylinderGeometry(2.5, 4.5, 6, 4);
            baseGeo.rotateY(Math.PI / 4);
            baseGeo.translate(px, 3, pz);
            t1BaseGeos.push(baseGeo);
            
            // Chaotic cluster of thin white struts erupting from the base
            const numStruts = 4;
            for (let k = 0; k < numStruts; k++) {
              const angle = (k / numStruts) * Math.PI * 2 + (Math.random() * 0.5);
              const spread = 6.0;
              const dx = Math.cos(angle) * spread;
              const dz = Math.sin(angle) * spread;
              
              const len = Math.sqrt((pHeight-6) * (pHeight-6) + dx * dx + dz * dz);
              const strutGeo = new THREE.CylinderGeometry(0.3, 0.4, len);
              
              const d = new THREE.Object3D();
              d.position.set(px + dx / 2, 6 + (pHeight-6) / 2, pz + dz / 2);
              d.lookAt(px + dx, pHeight, pz + dz);
              d.rotateX(Math.PI / 2);
              d.updateMatrix();
              strutGeo.applyMatrix4(d.matrix);
              terminalPillarGeos.push(strutGeo);
            }
          }
          
          // Ceiling lights under the sweeping canopy
          const numT1Lights = Math.floor(canopyWidth / 15);
          for (let j = 1; j < numT1Lights; j++) {
            const tx = cx - canopyWidth/2 + canopyWidth * (j / numT1Lights);
            for (let kz = 1; kz <= 4; kz++) {
               const tz = -cz - canopyLength/2 + (canopyLength * 0.2 * kz); // Spread across depth
               const wave = getT1WaveHeight(tx, tz);
               const h = b.height + 15 + wave - 1.5; // Hang just below the roof
               
               // Only place lights where there is actual roof
               if (h > b.height + 2) {
                 const lightGeo = new THREE.CylinderGeometry(1.5, 1.5, 0.5, 8);
                 lightGeo.translate(tx, h, tz);
                 t1LightGeos.push(lightGeo);
               }
            }
          }
          
          // Lower Flat Driveway Canopy (Arrivals/Departures road canopy)
          const lowerCanopyGeo = new THREE.PlaneGeometry(canopyWidth + 20, 30);
          lowerCanopyGeo.rotateX(-Math.PI / 2);
          lowerCanopyGeo.translate(cx, b.height / 2, -cz + length / 2 + 15); // stick it out the front (south side)
          terminalRoofGeos.push(lowerCanopyGeo);
          
          // Procedural Interior Floors for Depth Effect
          for (let fy = 5; fy < b.height - 2; fy += 5) {
              const floorGeo = new THREE.ShapeGeometry(s);
              floorGeo.rotateX(-Math.PI / 2);
              floorGeo.translate(0, fy, 0);
              
              const coreGeo = new THREE.BoxGeometry(40, 5, 40);
              coreGeo.translate(cx, fy - 2.5, -cz);
              terminalFloorGeos.push(coreGeo);
              terminalFloorGeos.push(floorGeo);
          }
          
          terminalGeos.push(geo);
          terminalRoofGeos.push(roofGeo);
          
        } else {
          // ----------------------------------------------------
          // GENERIC TERMINALS (Ancillary Buildings)
          // ----------------------------------------------------
          const extrudeSettings = { depth: b.height, bevelEnabled: false, steps: 1 };
          const genericGeo = new THREE.ExtrudeGeometry(s, extrudeSettings);
          genericGeo.rotateX(-Math.PI / 2);
          
          const genericRoof = new THREE.ShapeGeometry(s);
          genericRoof.rotateX(-Math.PI / 2);
          genericRoof.translate(0, b.height + 0.1, 0);

          terminalGeos.push(genericGeo);
          terminalRoofGeos.push(genericRoof);
        }
      } else {
        const extrudeSettings = { depth: b.height, bevelEnabled: false, steps: 1 };
        geo = new THREE.ExtrudeGeometry(s, extrudeSettings);
        geo.rotateX(-Math.PI / 2);
        
        roofGeo = new THREE.ShapeGeometry(s);
        roofGeo.rotateX(-Math.PI / 2);
        roofGeo.translate(0, b.height + 0.1, 0);

        buildingGeos.push(geo);
        roofGeos.push(roofGeo);
      }
    });

    const gateGeos: THREE.BufferGeometry[] = [];
    // 3. Procedural Jet Bridges at Gates
    if (data.gates) {
      data.gates.forEach((gate: any) => {
        const pt = projectToLocal(gate.point[0], gate.point[1]);
        
        let minDist = Infinity;
        let nearestBldgCenter = new THREE.Vector2(0, 0);
        data.buildings.forEach((b: any) => {
           const center = projectToLocal(b.center[0], b.center[1]);
           const dist = pt.distanceTo(center);
           if (dist < minDist) {
              minDist = dist;
              nearestBldgCenter = center;
           }
        });
        
        const dir = new THREE.Vector2().subVectors(nearestBldgCenter, pt).normalize();
        
        const bridgeGeo = new THREE.BoxGeometry(3, 4, 15);
        const dummy = new THREE.Object3D();
        dummy.position.set(pt.x + dir.x * 7.5, 4, -pt.y - dir.y * 7.5);
        
        // Point away from the gate towards the building
        const targetX = dummy.position.x + dir.x;
        const targetZ = dummy.position.z - dir.y; 
        dummy.lookAt(targetX, 4, targetZ);
        dummy.updateMatrix();
        bridgeGeo.applyMatrix4(dummy.matrix);
        
        const hubGeo = new THREE.CylinderGeometry(2.5, 2.5, 6, 16);
        hubGeo.translate(pt.x, 3, -pt.y);
        
        gateGeos.push(bridgeGeo);
        gateGeos.push(hubGeo);
      });
    }

    let mergedRunways = null;
    let mergedLights = null;

    let mergedBuildings = null;
    let mergedRoofs = null;
    let mergedGates = null;
    let mergedTerminal = null;
    let mergedTerminalRoofs = null;
    let mergedTerminalPillars = null;
    let mergedTerminalFloors = null;
    let mergedT1Fascia = null;
    let mergedT1Bases = null;
    let mergedT2Roofs = null;
    let mergedT2Pillars = null;
    let mergedT2Gardens = null;
    let mergedT1Lights = null;
    let mergedT2Lights = null;

    if (runwayGeos.length > 0) {
      mergedRunways = BufferGeometryUtils.mergeGeometries(runwayGeos, false);
      mergedRunways.computeVertexNormals();
    }
    
    if (lightGeos.length > 0) {
      mergedLights = BufferGeometryUtils.mergeGeometries(lightGeos, false);
    }

    if (buildingGeos.length > 0) {
      mergedBuildings = BufferGeometryUtils.mergeGeometries(buildingGeos, false);
      mergedBuildings.computeVertexNormals();
      mergedRoofs = BufferGeometryUtils.mergeGeometries(roofGeos, false);
    }
    
    if (terminalGeos.length > 0) {
      mergedTerminal = BufferGeometryUtils.mergeGeometries(terminalGeos, false);
      mergedTerminal.computeVertexNormals();
      
      if (terminalRoofGeos.length > 0) {
        // Mixed Plane/Extrude/Shape geometries will crash mergeGeometries if some are indexed and some are not.
        const safeGeos = terminalRoofGeos.map(g => g.index ? g.toNonIndexed() : g);
        mergedTerminalRoofs = BufferGeometryUtils.mergeGeometries(safeGeos, false);
        // Ensure roof has proper UVs for the grid texture
        if (mergedTerminalRoofs.attributes.position) {
          const pos = mergedTerminalRoofs.attributes.position;
          const uvs = new Float32Array(pos.count * 2);
          for (let i = 0; i < pos.count; i++) {
            uvs[i * 2] = pos.getX(i) / 100;
            uvs[i * 2 + 1] = pos.getZ(i) / 100;
          }
          mergedTerminalRoofs.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
        }
      }
      
      if (terminalPillarGeos.length > 0) {
        mergedTerminalPillars = BufferGeometryUtils.mergeGeometries(terminalPillarGeos, false);
        mergedTerminalPillars.computeVertexNormals();
      }
      
      if (terminalFloorGeos.length > 0) {
        mergedTerminalFloors = BufferGeometryUtils.mergeGeometries(terminalFloorGeos, false);
        mergedTerminalFloors.computeVertexNormals();
      }
    }
    
    if (t2RoofGeos.length > 0) {
      mergedT2Roofs = BufferGeometryUtils.mergeGeometries(t2RoofGeos, false);
      mergedT2Roofs.computeVertexNormals();
    }
    
    if (t2PillarGeos.length > 0) {
      mergedT2Pillars = BufferGeometryUtils.mergeGeometries(t2PillarGeos, false);
      mergedT2Pillars.computeVertexNormals();
    }
    
    if (t2GardenGeos.length > 0) {
      mergedT2Gardens = BufferGeometryUtils.mergeGeometries(t2GardenGeos, false);
      mergedT2Gardens.computeVertexNormals();
    }
    
    if (t1LightGeos.length > 0) {
      mergedT1Lights = BufferGeometryUtils.mergeGeometries(t1LightGeos, false);
      mergedT1Lights.computeVertexNormals();
    }
    
    if (t2LightGeos.length > 0) {
      mergedT2Lights = BufferGeometryUtils.mergeGeometries(t2LightGeos, false);
      mergedT2Lights.computeVertexNormals();
    }
    
    if (t1FasciaGeos.length > 0) {
      mergedT1Fascia = BufferGeometryUtils.mergeGeometries(t1FasciaGeos, false);
      mergedT1Fascia.computeVertexNormals();
    }
    
    if (t1BaseGeos.length > 0) {
      mergedT1Bases = BufferGeometryUtils.mergeGeometries(t1BaseGeos, false);
      mergedT1Bases.computeVertexNormals();
    }
    
    if (gateGeos.length > 0) {
      mergedGates = BufferGeometryUtils.mergeGeometries(gateGeos, false);
      mergedGates.computeVertexNormals();
    }
    
    return { 
      runwayGeometry: mergedRunways, 
      runwayLightsGeometry: mergedLights, 
      buildingGeometry: mergedBuildings, 
      roofGeometry: mergedRoofs, 
      gateGeometry: mergedGates,
      terminalGeometry: mergedTerminal,
      terminalRoofGeometry: mergedTerminalRoofs,
      terminalPillarGeometry: mergedTerminalPillars,
      terminalFloorGeometry: mergedTerminalFloors,
      t1FasciaGeos: mergedT1Fascia,
      t1BaseGeos: mergedT1Bases,
      t2RoofGeometry: mergedT2Roofs,
      t2PillarGeometry: mergedT2Pillars,
      t2GardenGeometry: mergedT2Gardens,
      t1LightGeometry: mergedT1Lights,
      t2LightGeometry: mergedT2Lights
    };
  }, [data]);

  // Procedural Grid Texture for Terminal Roof Panels
  const roofGridTexture = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#b0b8c0'; // Base metallic color
      ctx.fillRect(0, 0, 512, 512);
      ctx.strokeStyle = '#e0e5eb'; // Bright skylight ridges
      ctx.lineWidth = 4;
      for (let i = 0; i <= 512; i += 64) {
        ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, 512); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(512, i); ctx.stroke();
      }
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    return tex;
  }, []);

  // Procedural Bamboo Texture for Terminal 2
  const bambooTexture = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#c89d70'; // Warm wood/bamboo base
      ctx.fillRect(0, 0, 512, 512);
      ctx.strokeStyle = '#8b643a'; // Darker slats
      ctx.lineWidth = 4;
      for (let i = 0; i <= 512; i += 16) {
        ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, 512); ctx.stroke();
      }
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    // Scale the texture nicely for massive roofs
    tex.repeat.set(10, 10);
    return tex;
  }, []);

  return (
    <group>
      {/* High-fidelity Asphalt to hide baked-in planes */}
      {runwayGeometry && (
        <mesh receiveShadow geometry={runwayGeometry}>
          <meshPhysicalMaterial 
            color="#1a1c20" 
            roughness={0.9} 
            metalness={0.1}
            clearcoat={0.1}
            clearcoatRoughness={0.4}
            envMapIntensity={0.5}
          />
        </mesh>
      )}

      {/* Glowing Runway Edge Lights */}
      {runwayLightsGeometry && (
        <points geometry={runwayLightsGeometry}>
          <pointsMaterial size={isNight ? 25 : 15} color="#4ade80" sizeAttenuation={false} transparent opacity={isNight ? 1.0 : 0.8} />
        </points>
      )}
      
      {/* Terminal 1 Structural Glass Facade */}
      {terminalGeometry && (
        <mesh receiveShadow castShadow geometry={terminalGeometry}>
          <meshPhysicalMaterial 
            color="#a3b8cc" // Light blueish tint for terminal glass
            metalness={0.9}
            roughness={0.05}
            envMapIntensity={isNight ? 0.5 : 1.5}
            transmission={0.8} // Highly transparent glass
            thickness={2.0} // Thick structural glass
            ior={1.6}
            clearcoat={1.0}
            clearcoatRoughness={0.1}
            transparent
            opacity={0.9}
            // Emissive removed from exterior glass to prevent solid white blowout
          />
        </mesh>
      )}

      {/* Terminal 1 Sweeping Metallic Roof */}
      {terminalRoofGeometry && (
        <mesh receiveShadow castShadow geometry={terminalRoofGeometry}>
          <meshPhysicalMaterial 
            color="#d4d4d8" // Silver metallic base
            map={roofGridTexture}
            bumpMap={roofGridTexture}
            bumpScale={0.05}
            roughness={0.3} 
            metalness={0.7} 
            clearcoat={0.5} 
            envMapIntensity={1.0} 
            side={THREE.DoubleSide}
          />
        </mesh>
      )}

      {/* Terminal 1 Cyan Fascia Edge */}
      {t1FasciaGeometry && (
        <mesh receiveShadow castShadow geometry={t1FasciaGeometry}>
          <meshPhysicalMaterial 
            color="#0ea5e9" // Cyan/blue fascia trim
            roughness={0.3} 
            metalness={0.6}
            clearcoat={0.8}
            side={THREE.DoubleSide}
          />
        </mesh>
      )}
      
      {/* Terminal 1 Interior Concrete Floors (Depth Effect) */}
      {terminalFloorGeometry && (
        <mesh receiveShadow geometry={terminalFloorGeometry}>
          <meshStandardMaterial 
            color="#334155" 
            roughness={0.8} 
            emissive={isNight ? "#ffeedd" : "#000000"} 
            emissiveIntensity={isNight ? 0.8 : 0} 
          />
        </mesh>
      )}

      {/* Terminal 1 White Support Struts */}
      {terminalPillarGeometry && (
        <mesh receiveShadow castShadow geometry={terminalPillarGeometry}>
          <meshStandardMaterial color="#ffffff" roughness={0.5} metalness={0.3} />
        </mesh>
      )}
      
      {/* Terminal 1 Massive Black Concrete Bases */}
      {t1BaseGeometry && (
        <mesh receiveShadow castShadow geometry={t1BaseGeometry}>
          <meshStandardMaterial color="#1e293b" roughness={0.9} metalness={0.0} />
        </mesh>
      )}

      {/* Terminal 1 Ceiling Lights */}
      {t1LightGeometry && (
        <mesh geometry={t1LightGeometry}>
          <meshStandardMaterial color="#ffffff" emissive="#e0f2fe" emissiveIntensity={2.5} />
        </mesh>
      )}

      {/* Terminal 2 Flat Bamboo Roof (Terminal in a Garden) */}
      {t2RoofGeometry && (
        <mesh receiveShadow castShadow geometry={t2RoofGeometry}>
          <meshPhysicalMaterial 
            color="#e5c8a8" // Warm base tone
            map={bambooTexture}
            bumpMap={bambooTexture}
            bumpScale={0.02}
            roughness={0.8}
            metalness={0.1}
            side={THREE.DoubleSide}
          />
        </mesh>
      )}

      {/* Terminal 2 Vertical Bamboo Pillars */}
      {t2PillarGeometry && (
        <mesh receiveShadow castShadow geometry={t2PillarGeometry}>
          <meshStandardMaterial 
            color="#c89d70" 
            map={bambooTexture}
            roughness={0.9} 
          />
        </mesh>
      )}

      {/* Terminal 2 Hanging Gardens & Ground Jungle */}
      {t2GardenGeometry && (
        <mesh receiveShadow castShadow geometry={t2GardenGeometry}>
          <meshStandardMaterial 
            color="#2f6e32" 
            roughness={0.9} 
            metalness={0.0} 
            emissive="#1a3d1b"
            emissiveIntensity={0.2}
          />
        </mesh>
      )}

      {/* Terminal 2 Bamboo Bell Lights */}
      {t2LightGeometry && (
        <mesh geometry={t2LightGeometry}>
          <meshStandardMaterial color="#fef08a" emissive="#fde047" emissiveIntensity={2.0} wireframe={true} />
        </mesh>
      )}

      {/* Standard Buildings */}
      {buildingGeometry && (
        <mesh receiveShadow castShadow geometry={buildingGeometry}>
          <meshPhysicalMaterial 
            color="#0f172a" 
            metalness={0.8}
            roughness={0.1}
            envMapIntensity={1.0}
            transmission={0.2}
            ior={1.5}
            clearcoat={1.0}
            transparent
            opacity={0.8}
          />
        </mesh>
      )}

      {/* Standard Concrete Roofs */}
      {roofGeometry && (
        <mesh receiveShadow castShadow geometry={roofGeometry}>
          <meshStandardMaterial color="#cbd5e1" roughness={0.9} metalness={0.1} />
        </mesh>
      )}
      
      {/* Procedural Jet Bridges */}
      {gateGeometry && (
        <mesh receiveShadow castShadow geometry={gateGeometry}>
          <meshStandardMaterial color="#e2e8f0" roughness={0.7} metalness={0.3} />
        </mesh>
      )}
    </group>
  );
};
