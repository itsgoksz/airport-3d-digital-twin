import React, { useState, useMemo, useEffect } from 'react';
import * as THREE from 'three';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, FlyControls, Environment, Sky } from '@react-three/drei';
import { LiveFlightsLayer } from './LiveFlightsLayer';
import { AirportMesh } from './AirportMesh';
import { DynamicGroundTraffic } from './DynamicGroundTraffic';
import { FlightData, wgs84ToECEF, fetchWeather, WeatherData } from '../api/client';
import { CameraMode } from '../types';
import { TilesRenderer, TilesPlugin } from '3d-tiles-renderer/r3f';
import { GoogleCloudAuthPlugin, GLTFExtensionsPlugin } from '3d-tiles-renderer/plugins';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { useThree, useFrame } from '@react-three/fiber';
import { EffectComposer, Bloom, SSAO } from '@react-three/postprocessing';

// Global utility to raycast against the Google 3D Tiles terrain
export let sampleTerrain: ((lat: number, lon: number) => THREE.Vector3 | null) | null = null;

interface SceneViewerProps {
  followedIcao24: string | null;
  setFollowedIcao24: (icao: string | null) => void;
  onFlightsUpdate: (flights: FlightData[]) => void;
  cameraMode: CameraMode;
}

class TilesErrorBoundary extends React.Component<{
  children: React.ReactNode,
  groundPos?: THREE.Vector3,
  groundQuat?: THREE.Quaternion
}, {hasError: boolean, errorMsg: string}> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false, errorMsg: '' };
  }
  static getDerivedStateFromError(error: any) {
    return { hasError: true, errorMsg: error?.message || String(error) };
  }
  componentDidCatch(error: any, errorInfo: any) {
    console.error("Google 3D Tiles Renderer crashed!", error, errorInfo);
    // Attempt to recover after 5 seconds in case of temporary WebGL context loss
    setTimeout(() => {
      console.log("Attempting to recover Google 3D Tiles...");
      this.setState({ hasError: false, errorMsg: '' });
    }, 5000);
  }
  render() {
    if (this.state.hasError) {
      // Fallback base plane when Google Tiles fails, positioned at the airport!
      return (
        <group position={this.props.groundPos} quaternion={this.props.groundQuat}>
          <mesh position={[0, -0.5, 0]} receiveShadow rotation={[-Math.PI / 2, 0, 0]}>
            <planeGeometry args={[20000, 20000]} />
            <meshStandardMaterial color="#2f3e27" roughness={0.8} />
          </mesh>
        </group>
      );
    }
    return this.props.children;
  }
}

export const SceneViewer: React.FC<SceneViewerProps> = ({
  followedIcao24,
  setFollowedIcao24,
  onFlightsUpdate,
  cameraMode
}) => {
  // WGS84 coordinates for BLR Kempegowda International Airport
  // WGS84 coordinates for BLR Kempegowda International Airport
  // Precise Google 3D Tiles ECEF altitude for the apron is ~844m.
  const startPos = wgs84ToECEF(13.199, 77.706, 844 + 2000); // 2km above BLR
  const groundPos = wgs84ToECEF(13.199, 77.706, 844); // Ground level (WGS84 Ellipsoidal)
  
  const upVector = startPos.clone().normalize();

  const [weather, setWeather] = useState<WeatherData | null>(null);

  useEffect(() => {
    fetchWeather().then(setWeather).catch(console.error);
    const interval = setInterval(() => {
      fetchWeather().then(setWeather).catch(console.error);
    }, 5 * 60 * 1000); // refresh every 5 min
    return () => clearInterval(interval);
  }, []);

  const { groundQuat, localNorth, localEast } = useMemo(() => {
    const northPole = new THREE.Vector3(0, 0, 1);
    const ln = northPole.clone().sub(upVector.clone().multiplyScalar(northPole.dot(upVector))).normalize();
    const le = ln.clone().cross(upVector).normalize();
    
    const dummy = new THREE.Object3D();
    dummy.position.copy(groundPos);
    dummy.up.copy(upVector);
    dummy.lookAt(groundPos.clone().sub(ln));
    return { groundQuat: dummy.quaternion, localNorth: ln, localEast: le };
  }, [groundPos, upVector]);

  // Dynamic Sun Position and Sky Colors based on live local time
  const { sunPosition, sunElevation, isNight } = useMemo(() => {
    if (!weather || !weather.sunrise || !weather.sunset) {
      return { 
        sunPosition: groundPos.clone().add(upVector.clone().multiplyScalar(5000)).add(localEast.clone().multiplyScalar(5000)), 
        sunElevation: 0.5, 
        isNight: false 
      };
    }
    
    const now = new Date().getTime();
    const sunrise = new Date(weather.sunrise).getTime();
    const sunset = new Date(weather.sunset).getTime();
    
    let elevation = 0;
    let azimuth = 0;
    
    if (now < sunrise || now > sunset) {
      elevation = -Math.PI / 4;
    } else {
      const progress = (now - sunrise) / (sunset - sunrise);
      elevation = Math.sin(progress * Math.PI) * (Math.PI / 2.5); // Max elevation ~72 deg
      azimuth = Math.PI - (progress * Math.PI);
    }
    
    // East to West traversal
    const sunDir = localEast.clone().multiplyScalar(Math.cos(Math.PI - azimuth))
        .add(localNorth.clone().multiplyScalar(Math.sin(Math.PI - azimuth) * 0.2)); 
    sunDir.normalize().multiplyScalar(Math.cos(elevation)).add(upVector.clone().multiplyScalar(Math.sin(elevation)));
    
    return { 
      sunPosition: sunDir.normalize().multiplyScalar(10000).add(groundPos),
      sunElevation: elevation,
      isNight: elevation < 0
    };
  }, [weather, localEast, localNorth, upVector, groundPos]);

  const skyColor = isNight ? '#020617' : (sunElevation < 0.2 ? '#fb923c' : '#38bdf8');
  const lightColor = isNight ? '#1e1b4b' : (sunElevation < 0.2 ? '#ffedd5' : '#ffffff');
  const lightIntensity = isNight ? 0.0 : (sunElevation < 0.2 ? 0.8 : 2.5);
  const ambientIntensity = isNight ? 0.05 : (sunElevation < 0.2 ? 0.3 : 0.6);

  const airportRef = React.useRef<THREE.Group>(null);

  return (
    <Canvas
      shadows
      camera={{ position: [startPos.x, startPos.y, startPos.z], fov: 50, near: 10, far: 1e8, up: [upVector.x, upVector.y, upVector.z] }}
      style={{ background: skyColor, transition: 'background-color 2s ease' }} 
    >
      <fog attach="fog" args={[skyColor, 2000, 60000]} />
      
      {/* Atmospheric Scattering */}
      <Sky 
        distance={450000} 
        sunPosition={[sunPosition.x, sunPosition.y, sunPosition.z]} 
        inclination={0} 
        azimuth={0.25} 
      />

      <ambientLight intensity={ambientIntensity} color="#ffffff" />
      
      {/* Dynamic Sun based on Live Local Time */}
      <directionalLight 
        position={[sunPosition.x, sunPosition.y, sunPosition.z]}
        target-position={[groundPos.x, groundPos.y, groundPos.z]}
        intensity={lightIntensity} 
        color={lightColor} 
        castShadow
        shadow-camera-near={100}
        shadow-camera-far={15000}
        shadow-camera-left={-5000}
        shadow-camera-right={5000}
        shadow-camera-top={5000}
        shadow-camera-bottom={-5000}
        shadow-mapSize={[4096, 4096]}
        shadow-bias={-0.0005}
      />
      
      <Environment preset="city" />

      <TilesEnvironment airportRef={airportRef} groundPos={groundPos} groundQuat={groundQuat} />

      {/* Overlay details on top of Google Tiles */}
      <group position={groundPos} quaternion={groundQuat} ref={airportRef}>
        <AirportMesh isNight={isNight} />
      </group>
      
      {/* Default Orbit Controls when not explicitly tracking a plane */}
      {(!followedIcao24 || cameraMode === 'airport') && (
        <OrbitControls target={[groundPos.x, groundPos.y, groundPos.z]} maxDistance={50000} />
      )}
      
      {/* True WASD Drone Controls - Toned down for less jitter */}
      {cameraMode === 'drone' && (
        <FlyControls movementSpeed={150} rollSpeed={0.2} dragToLook={true} />
      )}

      {/* Live Airplanes */}
      <LiveFlightsLayer 
        followedIcao24={followedIcao24} 
        setFollowedIcao24={setFollowedIcao24} 
        onFlightsUpdate={onFlightsUpdate}
        cameraMode={cameraMode}
      />

      {/* High-Fidelity Simulator Lighting */}
      <EffectComposer>
        <Bloom luminanceThreshold={0.8} mipmapBlur intensity={1.5} />
      </EffectComposer>
    </Canvas>
  );
};

const TilesEnvironment: React.FC<{ 
  airportRef: React.RefObject<THREE.Group>,
  groundPos: THREE.Vector3,
  groundQuat: THREE.Quaternion
}> = ({ airportRef, groundPos, groundQuat }) => {
  const gl = useThree(state => state.gl);
  
  const dracoLoader = useMemo(() => {
    const loader = new DRACOLoader();
    loader.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.7/');
    return loader;
  }, []);

  const ktx2Loader = useMemo(() => {
    const loader = new KTX2Loader();
    loader.setTranscoderPath('https://unpkg.com/three@0.160.0/examples/jsm/libs/basis/');
    loader.detectSupport(gl);
    return loader;
  }, [gl]);

  const apiToken = (import.meta as any).env?.VITE_GOOGLE_MAPS_API_KEY || "AIzaSyCScW-2xJuAbh-vu69HG6rD3mCwAWizVcs";
  const authArgs = useMemo(() => [{ apiToken, autoRefreshToken: true }], [apiToken]);
  const gltfArgs = useMemo(() => [{ dracoLoader, ktxLoader: ktx2Loader, meshoptDecoder: MeshoptDecoder }], [dracoLoader, ktx2Loader]);

  const tilesRef = React.useRef<any>(null);

  useEffect(() => {
    // Implement global sampleTerrain using raycaster against the tiles and airport groups
    sampleTerrain = (lat: number, lon: number): THREE.Vector3 | null => {
      const objectsToTest: THREE.Object3D[] = [];
      if (tilesRef.current && tilesRef.current.group) objectsToTest.push(tilesRef.current.group);
      if (airportRef.current) objectsToTest.push(airportRef.current);
      
      if (objectsToTest.length === 0) return null;
      
      const pos = wgs84ToECEF(lat, lon, 844 + 5000); // Start ray 5km above
      const dir = pos.clone().normalize().negate(); // Point towards earth center
      
      const raycaster = new THREE.Raycaster(pos, dir);
      raycaster.firstHitOnly = true; // Optimization
      
      const intersects = raycaster.intersectObjects(objectsToTest, true);
      if (intersects.length > 0) {
        return intersects[0].point;
      }
      return null;
    };
    
    return () => {
      sampleTerrain = null;
    };
  }, []);

  return (
    <group>
      <TilesErrorBoundary groundPos={groundPos} groundQuat={groundQuat}>
        <TilesRenderer ref={tilesRef} url="https://tile.googleapis.com/v1/3dtiles/root.json">
          <TilesPlugin plugin={GoogleCloudAuthPlugin} args={authArgs} />
          <TilesPlugin plugin={GLTFExtensionsPlugin} args={gltfArgs} />
        </TilesRenderer>
      </TilesErrorBoundary>
    </group>
  );
};
