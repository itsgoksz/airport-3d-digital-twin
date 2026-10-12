import React, { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGLTF, ContactShadows } from '@react-three/drei';
import * as THREE from 'three';

export interface AircraftPhysicsState {
    altitude: number; // meters
    velocity: number; // m/s
    pitchRad: number;
    bankRad: number;
}

interface AnimatedA320Props {
    physicsState: React.MutableRefObject<AircraftPhysicsState>;
    touchingDown: boolean;
}

export const AnimatedA320: React.FC<AnimatedA320Props> = ({ physicsState, touchingDown }) => {
    const { scene } = useGLTF('/A320.glb') as any;
    
    // Clone the scene
    const { clone } = useMemo(() => {
        const c = scene.clone(true);
        return { clone: c };
    }, [scene]);

    return (
        <group>
            {/* Photorealistic Fuselage */}
            {/* Native Nose is -X. Rotate by -90 to align with -Z (Forward) */}
            <primitive 
                object={clone} 
                // We shift it DOWN by 3.2 meters so that its belly sits perfectly at Y=-1.5,
                // attaching flawlessly to our procedural retractable landing gears!
                position={[0, -3.2, 0]}
                rotation={[0, -Math.PI / 2, 0]} 
            />
            
            {/* Procedural Retractable Landing Gear */}
            {/* Native Nose Gear is +Z=12 (backward). Rotate by 180 to align with -Z (forward) */}
            <group rotation={[0, Math.PI, 0]}>
                <ProceduralLandingGear physicsState={physicsState} />
            </group>

            {/* Aircraft Animated Lights */}
            <AircraftLights physicsState={physicsState} />

            {/* Contact Shadow to ground the aircraft (Rendered once per plane for max performance) */}
            <ContactShadows 
                position={[0, -4.0, 0]} 
                opacity={0.7} 
                scale={60} 
                blur={2} 
                far={10} 
                frames={1} 
            />
        </group>
    );
};

// --- PROCEDURAL LANDING GEAR ---
const ProceduralLandingGear: React.FC<{ physicsState: any }> = ({ physicsState }) => {
    const gearRef = useRef<THREE.Group>(null);
    const extension = useRef(1);

    useFrame((_, delta) => {
        // Here we could add procedural animations for ailerons/flaps based on physicsState.
        // We do NOT apply pitch and bank here because AirplaneMarker.tsx already applies it to the entire groupRef,
        // which includes this mesh AND the procedural landing gears. Applying it again would cause double-rotation
        // and physically tear the fuselage away from the landing gears!
        if (!gearRef.current) return;
        const altitude = physicsState.current.altitude;
        // Retract gear when passing 300 meters (~1000 ft) altitude
        const target = altitude > 300 ? 0 : 1; 
        extension.current = THREE.MathUtils.damp(extension.current, target, 2, delta);
        
        // Scale the gear on the Y axis to mathematically "retract" it into the fuselage
        gearRef.current.scale.y = Math.max(0.001, extension.current);
    });

    const strutMat = new THREE.MeshStandardMaterial({ color: '#888888', metalness: 0.6, roughness: 0.4 });
    const tireMat = new THREE.MeshStandardMaterial({ color: '#111111', roughness: 0.9 });

    return (
        <group ref={gearRef}>
            {/* Nose Gear */}
            <group position={[0, -1.5, 12]}>
                {/* Strut */}
                <mesh material={strutMat} position={[0, -1.25, 0]} castShadow>
                    <cylinderGeometry args={[0.15, 0.15, 2.5, 8]} />
                </mesh>
                {/* Wheels */}
                <mesh material={tireMat} position={[-0.3, -2.5, 0]} rotation={[0, 0, Math.PI/2]} castShadow>
                    <cylinderGeometry args={[0.35, 0.35, 0.2, 16]} />
                </mesh>
                <mesh material={tireMat} position={[0.3, -2.5, 0]} rotation={[0, 0, Math.PI/2]} castShadow>
                    <cylinderGeometry args={[0.35, 0.35, 0.2, 16]} />
                </mesh>
            </group>

            {/* Left Main Gear */}
            <group position={[3.5, -1.5, -3]}>
                <mesh material={strutMat} position={[0, -1.25, 0]} castShadow>
                    <cylinderGeometry args={[0.2, 0.2, 2.5, 8]} />
                </mesh>
                {/* Tandem Bogey (2 pairs of wheels) */}
                <group position={[0, -2.5, 0]}>
                    <mesh material={strutMat} rotation={[Math.PI/2, 0, 0]}>
                        <cylinderGeometry args={[0.1, 0.1, 1, 8]} />
                    </mesh>
                    {/* Front Pair */}
                    <mesh material={tireMat} position={[-0.4, 0, 0.5]} rotation={[0, 0, Math.PI/2]} castShadow>
                        <cylinderGeometry args={[0.45, 0.45, 0.25, 16]} />
                    </mesh>
                    <mesh material={tireMat} position={[0.4, 0, 0.5]} rotation={[0, 0, Math.PI/2]} castShadow>
                        <cylinderGeometry args={[0.45, 0.45, 0.25, 16]} />
                    </mesh>
                    {/* Rear Pair */}
                    <mesh material={tireMat} position={[-0.4, 0, -0.5]} rotation={[0, 0, Math.PI/2]} castShadow>
                        <cylinderGeometry args={[0.45, 0.45, 0.25, 16]} />
                    </mesh>
                    <mesh material={tireMat} position={[0.4, 0, -0.5]} rotation={[0, 0, Math.PI/2]} castShadow>
                        <cylinderGeometry args={[0.45, 0.45, 0.25, 16]} />
                    </mesh>
                </group>
            </group>

            {/* Right Main Gear */}
            <group position={[-3.5, -1.5, -3]}>
                <mesh material={strutMat} position={[0, -1.25, 0]} castShadow>
                    <cylinderGeometry args={[0.2, 0.2, 2.5, 8]} />
                </mesh>
                {/* Tandem Bogey (2 pairs of wheels) */}
                <group position={[0, -2.5, 0]}>
                    <mesh material={strutMat} rotation={[Math.PI/2, 0, 0]}>
                        <cylinderGeometry args={[0.1, 0.1, 1, 8]} />
                    </mesh>
                    {/* Front Pair */}
                    <mesh material={tireMat} position={[-0.4, 0, 0.5]} rotation={[0, 0, Math.PI/2]} castShadow>
                        <cylinderGeometry args={[0.45, 0.45, 0.25, 16]} />
                    </mesh>
                    <mesh material={tireMat} position={[0.4, 0, 0.5]} rotation={[0, 0, Math.PI/2]} castShadow>
                        <cylinderGeometry args={[0.45, 0.45, 0.25, 16]} />
                    </mesh>
                    {/* Rear Pair */}
                    <mesh material={tireMat} position={[-0.4, 0, -0.5]} rotation={[0, 0, Math.PI/2]} castShadow>
                        <cylinderGeometry args={[0.45, 0.45, 0.25, 16]} />
                    </mesh>
                    <mesh material={tireMat} position={[0.4, 0, -0.5]} rotation={[0, 0, Math.PI/2]} castShadow>
                        <cylinderGeometry args={[0.45, 0.45, 0.25, 16]} />
                    </mesh>
                </group>
            </group>
        </group>
    );
};

// --- AIRCRAFT LIGHTS ---
const AircraftLights: React.FC<{ physicsState: any }> = ({ physicsState }) => {
    const strobeGroupRef = useRef<THREE.Group>(null);
    const beaconGroupRef = useRef<THREE.Group>(null);
    const landingGroupRef = useRef<THREE.Group>(null);

    useFrame(({ clock }) => {
        const t = clock.elapsedTime;
        
        // Strobes: Double flash every 1.5 seconds.
        const strobeCycle = t % 1.5;
        const isStrobeOn = strobeCycle < 0.05 || (strobeCycle > 0.15 && strobeCycle < 0.20);
        if (strobeGroupRef.current) {
            strobeGroupRef.current.children.forEach((child: any) => {
                if (child.material) {
                    child.material.emissiveIntensity = isStrobeOn ? 10 : 0;
                    child.scale.setScalar(isStrobeOn ? 1.5 : 1);
                }
            });
        }
        
        // Beacon: Single flash every 1 second.
        const beaconCycle = t % 1.0;
        const isBeaconOn = beaconCycle < 0.1;
        if (beaconGroupRef.current) {
            beaconGroupRef.current.children.forEach((child: any) => {
                if (child.material) {
                    child.material.emissiveIntensity = isBeaconOn ? 8 : 0;
                    child.scale.setScalar(isBeaconOn ? 1.5 : 1);
                }
            });
        }
        
        // Landing Lights: On when altitude < 300m
        const altitude = physicsState.current.altitude;
        if (landingGroupRef.current) {
            const isLanding = altitude < 300;
            landingGroupRef.current.visible = isLanding;
        }
    });

    return (
        <group>
            {/* Navigation Lights (Solid) - Much smaller */}
            <mesh position={[-17, -2.5, 3]}>
                <sphereGeometry args={[0.2, 8, 8]} />
                <meshStandardMaterial color="#ff0000" emissive="#ff0000" emissiveIntensity={2} />
            </mesh>
            <mesh position={[17, -2.5, 3]}>
                <sphereGeometry args={[0.2, 8, 8]} />
                <meshStandardMaterial color="#00ff00" emissive="#00ff00" emissiveIntensity={2} />
            </mesh>
            <mesh position={[0, 4, 18]}>
                <sphereGeometry args={[0.2, 8, 8]} />
                <meshStandardMaterial color="#ffffff" emissive="#ffffff" emissiveIntensity={2} />
            </mesh>

            {/* Strobe Lights (Flashing White) */}
            <group ref={strobeGroupRef}>
                <mesh position={[-17.5, -2.5, 3]}>
                    <sphereGeometry args={[0.3, 8, 8]} />
                    <meshStandardMaterial color="#ffffff" emissive="#ffffff" emissiveIntensity={0} />
                </mesh>
                <mesh position={[17.5, -2.5, 3]}>
                    <sphereGeometry args={[0.3, 8, 8]} />
                    <meshStandardMaterial color="#ffffff" emissive="#ffffff" emissiveIntensity={0} />
                </mesh>
            </group>

            {/* Beacon Lights (Flashing Red Top & Bottom) */}
            <group ref={beaconGroupRef}>
                <mesh position={[0, 1.8, -2]}>
                    <sphereGeometry args={[0.2, 8, 8]} />
                    <meshStandardMaterial color="#ff0000" emissive="#ff0000" emissiveIntensity={0} />
                </mesh>
                <mesh position={[0, -3.5, 0]}>
                    <sphereGeometry args={[0.2, 8, 8]} />
                    <meshStandardMaterial color="#ff0000" emissive="#ff0000" emissiveIntensity={0} />
                </mesh>
            </group>

            {/* Landing/Taxi Lights (Fake Volumetric Beam) */}
            <group ref={landingGroupRef}>
                <mesh position={[0, -2, -20]} rotation={[Math.PI / 2, 0, 0]}>
                    {/* Narrower beam: radiusTop 1.5, radiusBottom 0.2, height 30 */}
                    <cylinderGeometry args={[2, 0.2, 30, 16, 1, true]} />
                    <meshBasicMaterial color="#ffffff" transparent opacity={0.12} side={THREE.DoubleSide} blending={THREE.AdditiveBlending} depthWrite={false} />
                </mesh>
                <mesh position={[0, -2, -6]}>
                    <sphereGeometry args={[0.4, 8, 8]} />
                    <meshStandardMaterial color="#ffffff" emissive="#ffffff" emissiveIntensity={5} />
                </mesh>
            </group>
        </group>
    );
};
