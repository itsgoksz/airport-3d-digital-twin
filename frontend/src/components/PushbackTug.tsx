import React, { useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';

interface PushbackTugProps {
  position?: [number, number, number] | THREE.Vector3;
  rotation?: [number, number, number] | THREE.Euler;
  active?: boolean;
}

export const PushbackTug: React.FC<PushbackTugProps> = ({ position, rotation, active = false }) => {
  const groupRef = useRef<THREE.Group>(null);
  
  // A pushback tug is typically low, wide, and heavy.
  // We'll build it out of simple primitives with nice PBR materials.
  const bodyMaterial = new THREE.MeshStandardMaterial({
    color: '#fbbf24', // Yellow industrial color
    roughness: 0.6,
    metalness: 0.4,
  });
  
  const cabinMaterial = new THREE.MeshStandardMaterial({
    color: '#333333',
    roughness: 0.2,
    metalness: 0.8,
  });
  
  const glassMaterial = new THREE.MeshPhysicalMaterial({
    color: '#000000',
    transmission: 0.9,
    opacity: 1,
    metalness: 0,
    roughness: 0.1,
    ior: 1.5,
    thickness: 0.1,
  });

  const wheelMaterial = new THREE.MeshStandardMaterial({
    color: '#1a1c20', // Dark rubber
    roughness: 0.9,
    metalness: 0.1,
  });

  useFrame((state, delta) => {
    if (active && groupRef.current) {
      // Simulate blinking beacon light
      const beacon = groupRef.current.getObjectByName('beacon') as THREE.PointLight;
      if (beacon) {
        beacon.intensity = Math.sin(state.clock.elapsedTime * 10) > 0 ? 5 : 0;
      }
    }
  });

  return (
    <group ref={groupRef} position={position} rotation={rotation}>
      {/* Main Chassis */}
      <mesh position={[0, 0.6, 0]} material={bodyMaterial} castShadow receiveShadow>
        <boxGeometry args={[2.5, 0.8, 6]} />
      </mesh>
      
      {/* Cabin */}
      <mesh position={[0, 1.4, 1.5]} material={cabinMaterial} castShadow receiveShadow>
        <boxGeometry args={[2, 0.8, 1.5]} />
      </mesh>
      
      {/* Cabin Glass */}
      <mesh position={[0, 1.4, 2.26]} material={glassMaterial} castShadow receiveShadow>
        <boxGeometry args={[1.8, 0.6, 0.1]} />
      </mesh>
      <mesh position={[0, 1.4, 0.74]} material={glassMaterial} castShadow receiveShadow>
        <boxGeometry args={[1.8, 0.6, 0.1]} />
      </mesh>

      {/* Wheels */}
      {/* Front Left */}
      <mesh position={[1.3, 0.5, 2]} rotation={[0, 0, Math.PI / 2]} material={wheelMaterial} castShadow>
        <cylinderGeometry args={[0.5, 0.5, 0.4, 16]} />
      </mesh>
      {/* Front Right */}
      <mesh position={[-1.3, 0.5, 2]} rotation={[0, 0, Math.PI / 2]} material={wheelMaterial} castShadow>
        <cylinderGeometry args={[0.5, 0.5, 0.4, 16]} />
      </mesh>
      {/* Rear Left */}
      <mesh position={[1.3, 0.5, -2]} rotation={[0, 0, Math.PI / 2]} material={wheelMaterial} castShadow>
        <cylinderGeometry args={[0.5, 0.5, 0.4, 16]} />
      </mesh>
      {/* Rear Right */}
      <mesh position={[-1.3, 0.5, -2]} rotation={[0, 0, Math.PI / 2]} material={wheelMaterial} castShadow>
        <cylinderGeometry args={[0.5, 0.5, 0.4, 16]} />
      </mesh>

      {/* Tow Bar Mechanism */}
      <mesh position={[0, 0.4, -3.5]} material={bodyMaterial} castShadow receiveShadow>
        <boxGeometry args={[0.5, 0.2, 1]} />
      </mesh>
      
      {/* Flashing Amber Beacon */}
      <mesh position={[0, 1.85, 1.5]}>
        <cylinderGeometry args={[0.1, 0.1, 0.1, 8]} />
        <meshStandardMaterial color="#ffaa00" emissive="#ffaa00" emissiveIntensity={2} />
      </mesh>
      {active && (
        <pointLight name="beacon" position={[0, 1.9, 1.5]} color="#ffaa00" distance={10} intensity={5} />
      )}
    </group>
  );
};
