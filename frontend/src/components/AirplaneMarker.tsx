import React, { useRef, useState, useEffect, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { FlightData, wgs84ToECEF, FlightWaypoint } from '../api/client';
import { useGLTF, Html, OrbitControls } from '@react-three/drei';
import { CameraMode } from '../types';
import { sampleTerrain } from './SceneViewer';
import { PushbackTug } from './PushbackTug';
import { TouchdownSmoke } from './TouchdownSmoke';
import { AnimatedA320, AircraftPhysicsState } from './AnimatedA320';
import { Truck } from 'lucide-react';

interface AirplaneMarkerProps {
  flight: FlightData;
  isFollowed: boolean;
  onClick: () => void;
  cameraMode: CameraMode;
}

export const AirplaneMarker: React.FC<AirplaneMarkerProps> = ({ flight, isFollowed, onClick, cameraMode }) => {
  const groupRef = useRef<THREE.Group>(null);
  const modelRef = useRef<THREE.Group>(null);
  
  const lastValidTrackRef = useRef<number>(0);
  
  const { camera } = useThree();
  
  // Delayed Replay Physics State
  const DELAY_SECONDS = 30;
  const [smoothLookAt] = useState(() => new THREE.Vector3());
  const historyRef = useRef<FlightWaypoint[]>([]);
  const localSimTime = useRef<number | null>(null);
  
  const [touchingDown, setTouchingDown] = useState(false);
  
  // Ref to hold live physics telemetry for the AnimatedA320 component
  const physicsState = useRef<AircraftPhysicsState>({
      altitude: 0,
      velocity: 0,
      pitchRad: 0,
      bankRad: 0
  });

  // Generate static tower and spotter positions for BLR
  // BLR ground elevation is ~844m. We add the building/spotter heights to this base elevation.
  const towerPos = useMemo(() => wgs84ToECEF(13.200, 77.710, 844 + 80), []); 
  const spotterPos = useMemo(() => wgs84ToECEF(13.195, 77.715, 844 + 10), []);

  useEffect(() => {
    if (flight.history && flight.history.length > 0) {
      // Sort history by time just to be safe
      historyRef.current = [...flight.history].sort((a, b) => a.time - b.time);
      const latestTime = historyRef.current[historyRef.current.length - 1].time;
      
      const effectiveDelay = historyRef.current.length > 1 ? DELAY_SECONDS : 0;
      if (localSimTime.current === null) {
          // Start clock immediately or DELAY_SECONDS behind if we have sufficient history buffer
          localSimTime.current = latestTime - effectiveDelay;
      } else {
          // Prevent the clock from falling too far behind if the tab was inactive
          if (localSimTime.current < latestTime - DELAY_SECONDS - 120) {
              localSimTime.current = latestTime - effectiveDelay;
          }
      }
    } else {
      // Fallback: create an initial waypoint from the current flight state
      const now = Math.floor(Date.now() / 1000);
      const initialWp: FlightWaypoint = {
        lat: flight.lat,
        lon: flight.lon,
        altitude: flight.altitude,
        heading: flight.heading,
        track: flight.track,
        velocity: flight.velocity || 0,
        time: now
      };
      historyRef.current = [initialWp];
      if (localSimTime.current === null) {
        localSimTime.current = now;
      }
    }
  }, [flight]);

  // Helper to generate a quaternion with aerodynamic pitch and roll
  const getWaypointQuaternion = (wp: FlightWaypoint, pos: THREE.Vector3, nextWp?: FlightWaypoint) => {
      const dummy = new THREE.Object3D();
      dummy.position.copy(pos);
      
      const normal = pos.clone().normalize();
      dummy.up.copy(normal);
      
      let bankAngleRad = 0;
      let pitchAngleRad = 0;
      
      // 1. Primary Heading (Yaw) using avionics-filtered ADSB Track/Heading
      // This prevents violent 180-degree spins caused by raw GPS lat/lon jitter when stationary or if pings arrive slightly backwards!
      const northPole = new THREE.Vector3(0, 0, 1); 
      const localNorth = northPole.clone().sub(normal.clone().multiplyScalar(northPole.dot(normal))).normalize();
      
      let trackToUse = lastValidTrackRef.current;
      if (wp.track !== undefined && wp.track !== null) {
          trackToUse = wp.track;
          lastValidTrackRef.current = wp.track;
      } else if (wp.heading !== undefined && wp.heading !== null) {
          trackToUse = wp.heading;
          lastValidTrackRef.current = wp.heading;
      }
      
      dummy.lookAt(pos.clone().add(localNorth));
      dummy.rotateOnWorldAxis(normal, -THREE.MathUtils.degToRad(trackToUse));
      
      if (nextWp) {
          // Calculate pure trajectory vector (Horizontal only, to avoid lookAt inducing pitch)
          const p1 = wgs84ToECEF(nextWp.lat, nextWp.lon, 0).normalize().multiplyScalar(pos.length());
          const distance = pos.distanceTo(p1);
          
          if (distance > 0.1) {
              
              // 2. Pitch Angle (Climb/Descent)
              if (wp.altitude === 0 && nextWp.altitude === 0) {
                  pitchAngleRad = 0; // Taxiing perfectly level
              } else if (nextWp.altitude === 0) {
                  // Landing flare (Flight path is slightly down, but nose is pitched UP to slow down)
                  pitchAngleRad = THREE.MathUtils.degToRad(7); 
              } else if (wp.altitude === 0) {
                  // Takeoff rotation (Nose pulls up aggressively while still on the runway)
                  pitchAngleRad = THREE.MathUtils.degToRad(15); 
              } else {
                  // In the air: calculate physical flight path vector
                  const heightDiff = nextWp.altitude - wp.altitude;
                  const flightPathAngle = Math.atan2(heightDiff, distance); // Positive if climbing
                  
                  // Add realistic Aerodynamic Angle of Attack (AoA) based on phase of flight
                  let aoaRad = THREE.MathUtils.degToRad(2.5); // Cruise AoA
                  if (flightPathAngle > THREE.MathUtils.degToRad(2)) {
                      aoaRad = THREE.MathUtils.degToRad(6); // Climbing heavily
                  } else if (flightPathAngle < THREE.MathUtils.degToRad(-2)) {
                      aoaRad = THREE.MathUtils.degToRad(1); // Descending (nose still slightly up or flat)
                  }
                  
                  pitchAngleRad = flightPathAngle + aoaRad;
              }
              
              // 3. Bank Angle (Roll) based on true track change
              const dt = Math.max(0.1, nextWp.time - wp.time);
              let deltaTrack = (nextWp.track || nextWp.heading || 0) - (wp.track || wp.heading || 0);
              if (deltaTrack > 180) deltaTrack -= 360;
              if (deltaTrack < -180) deltaTrack += 360;
              
              const turnRateDeg = deltaTrack / dt;
              
              if (wp.velocity !== undefined && wp.velocity > 5) {
                  // If turning right (positive deltaTrack), bank right (negative Z rotation)
                  bankAngleRad = -(turnRateDeg * 0.05); 
                  bankAngleRad = THREE.MathUtils.clamp(bankAngleRad, -0.5, 0.5);
                  
                  if (wp.altitude === 0 || nextWp.altitude === 0 || (wp.velocity !== undefined && wp.velocity < 40)) {
                      bankAngleRad = 0;
                  }
                  
                  dummy.rotateZ(bankAngleRad);
                  physicsState.current.bankRad = bankAngleRad;
              }
          }
      }
          
      // Apply pitch last so it pitches cleanly along the new forward vector
      dummy.rotateX(pitchAngleRad);
      physicsState.current.pitchRad = pitchAngleRad;
      
      return dummy.quaternion.clone();
  };

  useFrame((state, delta) => {
    if (!groupRef.current || localSimTime.current === null || historyRef.current.length === 0) return;
    
    // --- SPAWN FIX ---
    // If the plane is at the exact center of the Earth [0,0,0], teleport it to the surface instantly!
    if (groupRef.current.position.lengthSq() < 1) {
        const firstWp = historyRef.current[0];
        const effAlt = (firstWp.velocity || 0) < 60 && (firstWp.altitude || 0) < 200 ? 0 : (firstWp.altitude || 0);
        let startPos = effAlt === 0 ? null : wgs84ToECEF(firstWp.lat, firstWp.lon, effAlt - 60);
        
        if (sampleTerrain) {
            const ray = sampleTerrain(firstWp.lat, firstWp.lon);
            if (ray && (startPos === null || startPos.lengthSq() < ray.lengthSq())) {
                startPos = ray.clone();
            }
        }
        if (startPos === null) {
            startPos = wgs84ToECEF(firstWp.lat, firstWp.lon, (firstWp.altitude || 844) - 60);
        }
        groupRef.current.position.copy(startPos);
    }
    // -----------------
    
    const safeDelta = Math.min(delta, 0.1);
    localSimTime.current += safeDelta; // Advance simulation clock
    
    const hist = historyRef.current;
    let wp0: FlightWaypoint | null = null;
    let wp1: FlightWaypoint | null = null;
    let wp2: FlightWaypoint | null = null;
    
    // Find bracketing waypoints
    for (let i = 0; i < hist.length - 1; i++) {
        if (hist[i].time <= localSimTime.current && hist[i+1].time >= localSimTime.current) {
            wp0 = hist[i];
            wp1 = hist[i+1];
            wp2 = i + 2 < hist.length ? hist[i+2] : null;
            break;
        }
    }
    
    if (wp0 && wp1) {
        // EXACT PERFECT INTERPOLATION
        const t = (localSimTime.current - wp0.time) / (wp1.time - wp0.time);
        
        // Filter out barometric sensor bouncing during landing roll and taxiing
        // Any speed under 60m/s (116 knots) near the ground is kinematically impossible for flight.
        const isTaxiing0 = (wp0.velocity || 0) < 60 && (wp0.altitude || 0) < 200;
        const isTaxiing1 = (wp1.velocity || 0) < 60 && (wp1.altitude || 0) < 200;
        
        let effAlt0 = wp0.altitude || 0;
        let effAlt1 = wp1.altitude || 0;
        
        // Calculate true WGS84 terrain altitude if taxiing so takeoff/landing is buttery smooth
        if (sampleTerrain && (isTaxiing0 || effAlt0 === 0)) {
            const ray0 = sampleTerrain(wp0.lat, wp0.lon);
            if (ray0) {
                const base0 = wgs84ToECEF(wp0.lat, wp0.lon, -60);
                effAlt0 = ray0.length() - base0.length();
            } else {
                effAlt0 = 914; // Fallback BLR elevation
            }
        }
        
        if (sampleTerrain && (isTaxiing1 || effAlt1 === 0)) {
            const ray1 = sampleTerrain(wp1.lat, wp1.lon);
            if (ray1) {
                const base1 = wgs84ToECEF(wp1.lat, wp1.lon, -60);
                effAlt1 = ray1.length() - base1.length();
            } else {
                effAlt1 = 914;
            }
        }
        
        // 1. Interpolate WGS84 Coordinates FIRST
        const curLat = wp0.lat + (wp1.lat - wp0.lat) * t;
        const curLon = wp0.lon + (wp1.lon - wp0.lon) * t;
        const curAlt = effAlt0 + (effAlt1 - effAlt0) * t;
        
        let currentPos = wgs84ToECEF(curLat, curLon, curAlt - 60);
        let agl = curAlt;
        
        // 2. Continuous Terrain Raycasting EVERY FRAME for buttery smooth bumpy terrain following!
        if (sampleTerrain) {
            const ray = sampleTerrain(curLat, curLon);
            if (ray) {
                // Force clamp if we're definitively on the ground, or if our interpolated position dipped below the terrain!
                const isOnGround = (wp0.altitude === 0 && wp1.altitude === 0);
                const forceClamp = isOnGround || (currentPos.lengthSq() < ray.lengthSq());
                
                if (forceClamp) {
                    currentPos = ray.clone();
                    agl = 0;
                } else {
                    agl = currentPos.length() - ray.length();
                }
            }
        }
        
        if (!currentPos || currentPos.lengthSq() < 1) {
            currentPos = wgs84ToECEF(curLat, curLon, (curAlt || 844) - 60);
        }
        
        // 3. Feed True AGL to physics engine instantly
        physicsState.current.altitude = agl;
        physicsState.current.velocity = wp0.velocity + ((wp1.velocity || 0) - (wp0.velocity || 0)) * t;
        
        // 4. Update Position (Buttery Smooth Damping)
        // Damping absorbs photogrammetry terrain bumps and high-frequency lat/lon jitter!
        groupRef.current.position.x = THREE.MathUtils.damp(groupRef.current.position.x, currentPos.x, 15, delta);
        groupRef.current.position.y = THREE.MathUtils.damp(groupRef.current.position.y, currentPos.y, 15, delta);
        groupRef.current.position.z = THREE.MathUtils.damp(groupRef.current.position.z, currentPos.z, 15, delta);
        
        // 5. Touchdown Smoke Detector
        const shouldSmoke = effAlt0 > 0 && effAlt1 === 0 && t > 0.90 && wp1.velocity > 20;
        if (shouldSmoke !== touchingDown) {
            setTouchingDown(shouldSmoke);
        }
        
        // 6. Calculate Quaternions (Heading/Pitch/Bank) using simple WGS84 trajectory
        // The rotation is independent of local terrain bumps, keeping the aircraft stable!
        const rawPos0 = wgs84ToECEF(wp0.lat, wp0.lon, (effAlt0 || 844) - 60);
        const rawPos1 = wgs84ToECEF(wp1.lat, wp1.lon, (effAlt1 || 844) - 60);
        
        const q0 = getWaypointQuaternion(wp0, rawPos0, wp1);
        const q1 = getWaypointQuaternion(wp1, rawPos1, wp2 || wp1);
        groupRef.current.quaternion.slerpQuaternions(q0, q1, t);
        
    } else {
        // Buffer under-run (we caught up to the API, or connection dropped)
        // Gently extrapolate from the last known state to prevent freezing
        const latestWp = hist[hist.length - 1];
        if (localSimTime.current > latestWp.time) {
            const timePast = localSimTime.current - latestWp.time;
            const velocity_m_s = latestWp.velocity || 0;
            
            const effAlt = latestWp.velocity < 60 && latestWp.altitude < 200 ? 0 : latestWp.altitude;
            let pos = effAlt === 0 ? null : wgs84ToECEF(latestWp.lat, latestWp.lon, effAlt - 60);
            
            let agl = effAlt;
            if (sampleTerrain) {
                const ray = sampleTerrain(latestWp.lat, latestWp.lon);
                if (ray) {
                    if (pos === null || pos.lengthSq() < ray.lengthSq()) {
                        pos = ray.clone();
                        agl = 0;
                    } else if (pos) {
                        agl = pos.length() - ray.length();
                    }
                }
            }
            if (pos === null || pos.lengthSq() < 1) {
                pos = wgs84ToECEF(latestWp.lat, latestWp.lon, (latestWp.altitude || 844) - 60);
            }
            
            // Feed telemetry
            physicsState.current.altitude = agl;
            physicsState.current.velocity = velocity_m_s;
            
            // Extrapolate with flat physics (no banking when connection drops)
            const q = getWaypointQuaternion(latestWp, pos);
            
            const normal = pos.clone().normalize(); 
            const northPole = new THREE.Vector3(0, 0, 1); 
            const localNorth = northPole.clone().sub(normal.clone().multiplyScalar(northPole.dot(normal))).normalize();
            const localEast = localNorth.clone().cross(normal).normalize();
            
            const trackAngle = (latestWp.track !== undefined && latestWp.track !== null)
              ? latestWp.track
              : (latestWp.heading !== undefined && latestWp.heading !== null)
                ? latestWp.heading
                : (lastValidTrackRef.current || 0);
            const trackRad = THREE.MathUtils.degToRad(trackAngle); 
            const trackVec = localNorth.multiplyScalar(Math.cos(trackRad))
              .add(localEast.clone().multiplyScalar(Math.sin(trackRad))).normalize();
              
            const extraPos = pos.clone().add(trackVec.multiplyScalar(velocity_m_s * Math.min(timePast, 60)));
            
            groupRef.current.position.x = THREE.MathUtils.damp(groupRef.current.position.x, extraPos.x, 15, delta);
            groupRef.current.position.y = THREE.MathUtils.damp(groupRef.current.position.y, extraPos.y, 15, delta);
            groupRef.current.position.z = THREE.MathUtils.damp(groupRef.current.position.z, extraPos.z, 15, delta);
            
            groupRef.current.quaternion.slerp(q, THREE.MathUtils.damp(0, 1, 15, delta));
        } else if (localSimTime.current < hist[0].time) {
            // Time is too far in the past (e.g. plane just spawned with 1 data point)
            localSimTime.current = hist[0].time;
        }
    }

    // Dynamic Scale based on distance to camera
    if (modelRef.current) {
      const dist = state.camera.position.distanceTo(groupRef.current.position);
      const dynamicScale = Math.max(2, Math.min(30, dist / 800)); 
      modelRef.current.scale.setScalar(dynamicScale);
    }

    if (isFollowed) {
      const target = groupRef.current.position;
      const backward = new THREE.Vector3(0, 0, -1).applyQuaternion(groupRef.current.quaternion);
      const right = new THREE.Vector3(1, 0, 0).applyQuaternion(groupRef.current.quaternion);
      const forwardLocal = new THREE.Vector3(0, 0, 1).applyQuaternion(groupRef.current.quaternion);

      // Prevent the camera from dipping underground when the plane pitches up (flares)
      // by projecting the camera offsets onto the Earth's horizontal tangent plane.
      const worldUp = target.clone().normalize();
      const backwardFlat = backward.clone().sub(worldUp.clone().multiplyScalar(backward.dot(worldUp))).normalize();

      let cameraTargetPos = state.camera.position.clone();
      let lookAtTarget = target.clone();

      if (cameraMode === 'chase') {
        cameraTargetPos = target.clone().addScaledVector(backwardFlat, 100).addScaledVector(worldUp, 30);
      } else if (cameraMode === 'cockpit') {
        cameraTargetPos = target.clone().addScaledVector(forwardLocal, 35).addScaledVector(worldUp, 8);
        lookAtTarget = target.clone().addScaledVector(forwardLocal, 1000);
      } else if (cameraMode === 'wing') {
        cameraTargetPos = target.clone().addScaledVector(backwardFlat, 20).addScaledVector(right, 40).addScaledVector(worldUp, 10);
        lookAtTarget = target.clone().addScaledVector(forwardLocal, 1000).addScaledVector(right, 200);
      } else if (cameraMode === 'tower') {
        cameraTargetPos = towerPos;
      } else if (cameraMode === 'spotter') {
        cameraTargetPos = spotterPos;
      }

      // Smooth cinematic camera physics!
      if (cameraMode !== 'airport' && cameraMode !== 'drone' && cameraMode !== 'follow') {
        // Frame-independent lerping perfectly eliminates stutters caused by browser framerate drops
        const damping = 5.0; // Higher is stiffer, lower is looser
        const lerpFactor = 1.0 - Math.exp(-damping * safeDelta);
        
        state.camera.position.lerp(cameraTargetPos, lerpFactor);
        
        // We must lerp a stable LookAt reference target to prevent jarring feedback loops
        if (smoothLookAt.lengthSq() === 0) {
          smoothLookAt.copy(lookAtTarget);
        } else {
          smoothLookAt.lerp(lookAtTarget, lerpFactor);
        }
        
        // Fix camera rolling sideways by aligning its up vector with the local normal
        const normal = groupRef.current.position.clone().normalize();
        state.camera.up.copy(normal);
        
        state.camera.lookAt(smoothLookAt);
      }
    }
  });

  const altitudeFt = Math.round(flight.altitude * 3.28084);
  const showLandingLights = altitudeFt < 3000 && altitudeFt > 0;

  return (
    <group ref={groupRef} onClick={onClick}>
      {/* 
         We shift the modelRef UP by 4 meters so that the kinematic pitch and bank 
         rotations pivot perfectly around the aircraft's center of mass (fuselage) 
         instead of pivoting around the ground, which would cause the fuselage to swing in an arc!
      */}
      <group ref={modelRef} position={[0, flight.is_ground_vehicle ? 0 : 4, 0]}>
          {flight.is_ground_vehicle ? (
              <PushbackTug position={[0, 0, 0]} active={true} />
          ) : (
              <AnimatedA320 
                  physicsState={physicsState} 
                  touchingDown={touchingDown} 
              />
          )}

          {/* Flight Label placed inside modelRef so its position perfectly scales up with the airplane mesh! */}
          {/* We place it at Y=15 which is perfectly hovering just above the tail section of the A320. */}
          {/* We also add a translateY transform to push it up by 30 pixels on the 2D screen, guaranteeing it never overlaps the plane when viewed from extremely far away. */}
          {!(isFollowed && ['chase', 'cockpit', 'wing', 'spotter', 'follow'].includes(cameraMode)) && (
              <Html center position={[0, 15, 0]}>
                <div style={{
                  background: isFollowed 
                    ? 'rgba(250, 204, 21, 0.9)' 
                    : flight.is_ground_vehicle 
                      ? 'rgba(217, 119, 6, 0.9)' // Amber/Orange for Ground Vehicles
                      : 'rgba(0, 0, 0, 0.6)',
                  color: isFollowed ? '#000' : '#fff',
                  padding: '4px 8px',
                  borderRadius: '4px',
                  fontFamily: 'sans-serif',
                  fontSize: '12px',
                  fontWeight: 'bold',
                  pointerEvents: 'none',
                  whiteSpace: 'nowrap',
                  border: isFollowed 
                    ? '1px solid #000' 
                    : flight.is_ground_vehicle 
                      ? '1px solid rgba(253, 230, 138, 0.5)'
                      : '1px solid rgba(255,255,255,0.2)',
                  transform: 'translateY(-30px)',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  boxShadow: flight.is_ground_vehicle && !isFollowed ? '0 0 10px rgba(217, 119, 6, 0.5)' : 'none'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    {flight.is_ground_vehicle && (
                      <Truck size={12} color={isFollowed ? '#000' : '#fde68a'} />
                    )}
                    <span>{flight.callsign || flight.icao24}</span>
                  </div>
                  {!flight.is_ground_vehicle && (
                    <div style={{ fontSize: '10px', opacity: 0.8 }}>
                      {altitudeFt.toLocaleString()} ft
                    </div>
                  )}
                  {flight.is_ground_vehicle && (
                    <div style={{ fontSize: '9px', opacity: 0.9, color: isFollowed ? '#000' : '#fde68a', marginTop: '2px' }}>
                      GROUND UNIT
                    </div>
                  )}
                </div>
              </Html>
          )}
      </group>
      
      <TouchdownSmoke active={touchingDown} position={[0, -2, -6]} />

      {/* Volumetric Landing Lights */}
      {showLandingLights && (
        <group position={[0, 0, -10]}>
          <spotLight
            position={[10, 0, 0]}
            angle={0.4}
            penumbra={0.5}
            intensity={50}
            distance={2000}
            color="#ffffff"
            rotation={[-Math.PI / 4, 0, 0]}
          />
          <spotLight
            position={[-10, 0, 0]}
            angle={0.4}
            penumbra={0.5}
            intensity={50}
            distance={2000}
            color="#ffffff"
            rotation={[-Math.PI / 4, 0, 0]}
          />
        </group>
      )}

      {/* If cameraMode is 'follow' and this flight is selected, mount an OrbitControls targeting this plane! */}
      {isFollowed && cameraMode === 'follow' && (
        <OrbitControls target={groupRef.current?.position} makeDefault />
      )}
    </group>
  );
};

useGLTF.preload('/AirbusA310.glb');

