import React, { useEffect, useState, useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { fetchAirportData, AirportData, wgs84ToECEF } from '../api/client';
import { PushbackTug } from './PushbackTug';

// A simple Boxy Baggage Cart
const BaggageCart: React.FC<{ position?: THREE.Vector3, rotation?: THREE.Euler }> = ({ position, rotation }) => {
  const bodyMaterial = new THREE.MeshStandardMaterial({ color: '#cccccc', roughness: 0.8, metalness: 0.2 });
  const wheelMaterial = new THREE.MeshStandardMaterial({ color: '#1a1c20', roughness: 0.9, metalness: 0.1 });

  return (
    <group position={position} rotation={rotation}>
      {/* Chassis */}
      <mesh position={[0, 0.4, 0]} material={bodyMaterial} castShadow>
        <boxGeometry args={[1.5, 0.2, 3]} />
      </mesh>
      {/* Luggage box */}
      <mesh position={[0, 1.0, 0]} material={new THREE.MeshStandardMaterial({ color: '#3b82f6' })} castShadow>
        <boxGeometry args={[1.2, 1.0, 2.5]} />
      </mesh>
      {/* Wheels */}
      <mesh position={[0.8, 0.2, 1]} rotation={[0, 0, Math.PI / 2]} material={wheelMaterial} castShadow>
        <cylinderGeometry args={[0.2, 0.2, 0.2, 16]} />
      </mesh>
      <mesh position={[-0.8, 0.2, 1]} rotation={[0, 0, Math.PI / 2]} material={wheelMaterial} castShadow>
        <cylinderGeometry args={[0.2, 0.2, 0.2, 16]} />
      </mesh>
      <mesh position={[0.8, 0.2, -1]} rotation={[0, 0, Math.PI / 2]} material={wheelMaterial} castShadow>
        <cylinderGeometry args={[0.2, 0.2, 0.2, 16]} />
      </mesh>
      <mesh position={[-0.8, 0.2, -1]} rotation={[0, 0, Math.PI / 2]} material={wheelMaterial} castShadow>
        <cylinderGeometry args={[0.2, 0.2, 0.2, 16]} />
      </mesh>
    </group>
  );
};

export const DynamicGroundTraffic: React.FC = () => {
  const [data, setData] = useState<AirportData | null>(null);

  useEffect(() => {
    fetchAirportData().then(setData).catch(console.error);
  }, []);

  const groundPos = useMemo(() => wgs84ToECEF(13.199, 77.706, 844), []);
  const upVector = groundPos.clone().normalize();
  const northPole = new THREE.Vector3(0, 0, 1);
  const localNorth = northPole.clone().sub(upVector.clone().multiplyScalar(northPole.dot(upVector))).normalize();
  const localEast = localNorth.clone().cross(upVector).normalize();

  const projectToLocal = (lon: number, lat: number) => {
    const pECEF = wgs84ToECEF(lat, lon, 844);
    const localOffset = pECEF.clone().sub(groundPos);
    const x = localOffset.dot(localEast); // East
    const y = localOffset.dot(localNorth); // North
    return new THREE.Vector3(x, 0.5, -y); // Z is inverted relative to North, Y is 0.5m above ground
  };

  const paths = useMemo(() => {
    if (!data) return [];
    const validPaths: THREE.Vector3[][] = [];

    // Extract all paths from roads
    data.roads.forEach(road => {
      if (road.line.length > 1) {
        validPaths.push(road.line.map(p => projectToLocal(p[0], p[1])));
      }
    });

    // Extract all paths from runways/taxiways
    data.runways.forEach(r => {
      if (r.polygon.length > 1) {
         validPaths.push(r.polygon.map(p => projectToLocal(p[0], p[1])));
      }
    });

    return validPaths;
  }, [data]);

  // Create 50 vehicles
  const vehicles = useMemo(() => {
    if (paths.length === 0) return [];
    
    return Array.from({ length: 50 }).map((_, i) => {
      const pathIndex = Math.floor(Math.random() * paths.length);
      const path = paths[pathIndex];
      const speed = 5 + Math.random() * 10; // m/s
      const type = Math.random() > 0.5 ? 'tug' : 'cart';
      
      // Calculate total path length
      let totalLength = 0;
      const distances: number[] = [0];
      for (let j = 1; j < path.length; j++) {
        const d = path[j-1].distanceTo(path[j]);
        totalLength += d;
        distances.push(totalLength);
      }
      
      return {
        id: i,
        type,
        path,
        distances,
        totalLength,
        speed,
        progress: Math.random() * totalLength, // Random start pos
      };
    });
  }, [paths]);

  const groupRef = useRef<THREE.Group>(null);

  useFrame((state, delta) => {
    if (!groupRef.current || vehicles.length === 0) return;

    vehicles.forEach((v, idx) => {
      v.progress += v.speed * delta;
      if (v.progress > v.totalLength) {
        v.progress = 0; // loop
      }

      // Find current segment
      let segment = 0;
      for (let i = 0; i < v.distances.length - 1; i++) {
        if (v.progress >= v.distances[i] && v.progress <= v.distances[i+1]) {
          segment = i;
          break;
        }
      }

      const p0 = v.path[segment];
      const p1 = v.path[segment + 1];
      if (!p0 || !p1) return;

      const segmentDist = v.distances[segment + 1] - v.distances[segment];
      const t = segmentDist > 0 ? (v.progress - v.distances[segment]) / segmentDist : 0;
      
      const pos = new THREE.Vector3().lerpVectors(p0, p1, t);
      
      const obj = groupRef.current!.children[idx];
      if (obj) {
        obj.position.copy(pos);
        if (segmentDist > 0.1) {
           obj.lookAt(p1.clone().setY(pos.y));
        }
      }
    });
  });

  if (vehicles.length === 0) return null;

  return (
    <group ref={groupRef}>
      {vehicles.map((v) => (
        <group key={v.id}>
           {v.type === 'tug' ? <PushbackTug active={true} /> : <BaggageCart />}
        </group>
      ))}
    </group>
  );
};
