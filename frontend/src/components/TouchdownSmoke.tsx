import React, { useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

interface TouchdownSmokeProps {
  active: boolean;
  position: [number, number, number];
}

export const TouchdownSmoke: React.FC<TouchdownSmokeProps> = ({ active, position }) => {
  const groupRef = useRef<THREE.Group>(null);

  // Create 5 smoke puffs
  const [particles] = useState(() => Array.from({ length: 5 }).map((_, i) => ({
    id: i,
    meshRef: React.createRef<THREE.Mesh>(),
    matRef: React.createRef<THREE.MeshBasicMaterial>(),
    baseScale: Math.random() * 2 + 1,
    offset: new THREE.Vector3((Math.random() - 0.5) * 4, (Math.random() - 0.5) * 2, (Math.random() - 0.5) * 4),
    expansionRate: Math.random() * 5 + 5,
    fadeRate: Math.random() * 0.5 + 0.5,
    active: false
  })));

  const wasActive = useRef(false);

  useFrame((state, delta) => {
    if (!groupRef.current) return;

    // Detect the exact frame touchdown starts
    if (active && !wasActive.current) {
      // Trigger smoke!
      particles.forEach(p => {
        p.active = true;
        if (p.meshRef.current && p.matRef.current) {
          p.meshRef.current.visible = true;
          p.meshRef.current.scale.setScalar(p.baseScale);
          p.meshRef.current.position.copy(p.offset);
          p.matRef.current.opacity = 0.6;
        }
      });
      wasActive.current = true;
    } else if (!active) {
      wasActive.current = false;
    }

    // Animate smoke
    particles.forEach(p => {
      if (p.active && p.meshRef.current && p.matRef.current) {
        p.meshRef.current.scale.addScalar(delta * p.expansionRate);
        p.meshRef.current.position.addScaledVector(new THREE.Vector3(0, 1, 0), delta * 2); // Drift up

        p.matRef.current.opacity -= delta * p.fadeRate;
        if (p.matRef.current.opacity <= 0) {
          p.matRef.current.opacity = 0;
          p.meshRef.current.visible = false;
          p.active = false;
        }
      }
    });
  });

  return (
    <group ref={groupRef} position={position}>
      {particles.map((p) => (
        <mesh key={p.id} ref={p.meshRef} visible={false}>
          <sphereGeometry args={[1, 8, 8]} />
          <meshBasicMaterial
            ref={p.matRef}
            color="#dddddd"
            transparent
            opacity={0.6}
            depthWrite={false}
          />
        </mesh>
      ))}
    </group>
  );
};
