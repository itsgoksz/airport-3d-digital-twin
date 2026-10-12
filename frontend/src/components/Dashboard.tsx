import React from 'react';
import { FlightData } from '../api/client';
import { Plane, PlaneTakeoff, PlaneLanding, Navigation2, Crosshair, Camera, Video, Compass, Eye, Maximize, Orbit, Truck } from 'lucide-react';
import { CameraMode } from '../types';

interface DashboardProps {
  flights: FlightData[];
  followedIcao24: string | null;
  setFollowedIcao24: (icao: string | null) => void;
  cameraMode: CameraMode;
  setCameraMode: (mode: CameraMode) => void;
}

const CAMERA_MODES: { id: CameraMode; label: string; icon: React.ReactNode }[] = [
  { id: 'airport', label: 'Airport View', icon: <Compass size={14} /> },
  { id: 'follow', label: 'Follow', icon: <Orbit size={14} /> },
  { id: 'chase', label: 'Chase Cam', icon: <Video size={14} /> },
  { id: 'cockpit', label: 'Cockpit', icon: <Eye size={14} /> },
  { id: 'wing', label: 'Wing View', icon: <Plane size={14} /> },
  { id: 'tower', label: 'Tower', icon: <Maximize size={14} /> },
  { id: 'spotter', label: 'Spotter', icon: <Camera size={14} /> },
  { id: 'drone', label: 'Drone', icon: <Navigation2 size={14} /> }
];

export const Dashboard: React.FC<DashboardProps> = ({ flights, followedIcao24, setFollowedIcao24, cameraMode, setCameraMode }) => {
  const categorizeFlight = (flight: FlightData) => {
    if (flight.is_ground_vehicle) return 'Ground & Service Vehicles';
    
    // Determine climb/descend trend from history
    if (flight.history && flight.history.length > 1) {
      const first = flight.history[0];
      const last = flight.history[flight.history.length - 1];
      const altDiff = last.altitude - first.altitude;
      
      // If climbing more than 10 meters over the history window -> Departure
      if (altDiff > 10) return 'Departures';
      // If descending more than 10 meters -> Arrivals
      if (altDiff < -10) return 'Arrivals';
    }
    
    // Default fallback
    return 'Arrivals';
  };

  return (
    <div className="absolute top-0 left-0 h-full w-80 p-4 pointer-events-none z-10 flex flex-col gap-4">
      
      {/* Header Panel */}
      <div className="bg-slate-900/60 backdrop-blur-md border border-slate-700/50 rounded-xl p-6 pointer-events-auto shadow-2xl">
        <h1 className="text-xl font-bold text-white flex items-center gap-2">
          <Navigation2 className="text-sky-400" />
          BLR Command Center
        </h1>
        <p className="text-slate-400 text-sm mt-1">Live Digital Twin</p>
        <div className="mt-4 flex items-center gap-4 text-sm font-medium">
          <div className="flex flex-col">
            <span className="text-slate-400 text-xs">ACTIVE FLIGHTS</span>
            <span className="text-2xl text-white">{flights.length}</span>
          </div>
          <div className="h-10 w-px bg-slate-700/50"></div>
          <div className="flex flex-col">
            <span className="text-slate-400 text-xs">STATUS</span>
            <span className="text-emerald-400 flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
              Live
            </span>
          </div>
        </div>
      </div>

      {/* Camera Modes */}
      <div className="bg-slate-900/60 backdrop-blur-md border border-slate-700/50 rounded-xl p-4 pointer-events-auto shadow-2xl">
        <h2 className="text-xs font-bold text-slate-400 mb-3 uppercase tracking-wider">Camera Mode</h2>
        <div className="grid grid-cols-2 gap-2">
          {CAMERA_MODES.map((mode) => (
            <button
              key={mode.id}
              onClick={() => setCameraMode(mode.id)}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-all ${
                cameraMode === mode.id
                  ? 'bg-sky-600 text-white shadow-[0_0_10px_rgba(2,132,199,0.5)]'
                  : 'bg-slate-800/50 text-slate-300 hover:bg-slate-700'
              }`}
            >
              {mode.icon}
              {mode.label}
            </button>
          ))}
        </div>
      </div>

      {/* Flight List Panel */}
      <div className="flex-1 bg-slate-900/60 backdrop-blur-md border border-slate-700/50 rounded-xl overflow-hidden flex flex-col pointer-events-auto shadow-2xl">
        <div className="p-4 border-b border-slate-700/50 bg-slate-800/50">
          <h2 className="text-sm font-bold text-slate-300 flex items-center gap-2">
            <PlaneTakeoff size={16} />
            Detected Aircraft
          </h2>
        </div>
        
        <div className="flex-1 overflow-y-auto p-2 space-y-4 custom-scrollbar">
          {flights.length === 0 && (
            <div className="p-4 text-center text-slate-500 text-sm">
              Waiting for radar data...
            </div>
          )}
          
          {['Arrivals', 'Departures', 'Ground & Service Vehicles'].map(category => {
            const categoryFlights = flights.filter(f => categorizeFlight(f) === category);
            if (categoryFlights.length === 0) return null;
            
            return (
              <div key={category} className="space-y-2">
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider pl-1 flex items-center gap-2">
                  {category === 'Arrivals' && <PlaneLanding size={12} />}
                  {category === 'Departures' && <PlaneTakeoff size={12} />}
                  {category === 'Ground & Service Vehicles' && <Truck size={12} />}
                  {category} ({categoryFlights.length})
                </h3>
                
                {categoryFlights.map((flight) => {
                  const isGround = flight.is_ground_vehicle;
                  
                  return (
                    <div 
                      key={flight.icao24}
                      onClick={() => setFollowedIcao24(followedIcao24 === flight.icao24 ? null : flight.icao24)}
                      className={`p-3 rounded-lg cursor-pointer transition-all border ${
                        followedIcao24 === flight.icao24 
                          ? (isGround ? 'bg-amber-900/40 border-amber-500/50 shadow-[0_0_15px_rgba(245,158,11,0.3)]' : 'bg-sky-900/40 border-sky-500/50 shadow-[0_0_15px_rgba(14,165,233,0.3)]')
                          : 'bg-slate-800/40 border-transparent hover:bg-slate-700/50 hover:border-slate-600/50'
                      }`}
                    >
                      <div className="flex justify-between items-start mb-2">
                        <span className={`font-mono font-bold ${isGround ? 'text-amber-100' : 'text-sky-100'} flex items-center gap-2`}>
                          {isGround ? (
                            <Truck size={14} className={followedIcao24 === flight.icao24 ? 'text-amber-400' : 'text-slate-400'} />
                          ) : (
                            <Plane size={14} className={followedIcao24 === flight.icao24 ? 'text-sky-400' : 'text-slate-400'} />
                          )}
                          {flight.callsign || flight.icao24}
                        </span>
                        {followedIcao24 === flight.icao24 && (
                          <Crosshair size={14} className={`${isGround ? 'text-amber-400' : 'text-sky-400'} animate-pulse`} />
                        )}
                      </div>
                      
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div className="flex flex-col">
                          <span className="text-slate-500">Altitude</span>
                          <span className="font-mono text-slate-300">{Math.round(flight.altitude)}m</span>
                        </div>
                        <div className="flex flex-col">
                          <span className="text-slate-500">Speed</span>
                          <span className="font-mono text-slate-300">{Math.round(flight.velocity || 0)}m/s</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
