import React, { useEffect, useState } from 'react';
import { fetchLiveFlights, FlightData } from '../api/client';
import { AirplaneMarker } from './AirplaneMarker';
import { CameraMode } from '../types';

interface LiveFlightsLayerProps {
  followedIcao24: string | null;
  setFollowedIcao24: (icao: string | null) => void;
  onFlightsUpdate: (flights: FlightData[]) => void;
  cameraMode: CameraMode;
}

export const LiveFlightsLayer: React.FC<LiveFlightsLayerProps> = ({ 
  followedIcao24, 
  setFollowedIcao24,
  onFlightsUpdate,
  cameraMode
}) => {
  const [flights, setFlights] = useState<FlightData[]>([]);

  useEffect(() => {
    const pollFlights = async () => {
      try {
        const data = await fetchLiveFlights();
        setFlights(data.flights);
        onFlightsUpdate(data.flights);
      } catch (err) {
        console.error(err);
      }
    };

    pollFlights(); // Initial fetch
    const intervalId = setInterval(pollFlights, 5000); // Poll every 5 seconds

    return () => clearInterval(intervalId);
  }, [onFlightsUpdate]);

  return (
    <>
      {flights.map(flight => (
        <AirplaneMarker 
          key={flight.icao24}
          flight={flight} 
          isFollowed={followedIcao24 === flight.icao24}
          onClick={() => setFollowedIcao24(flight.icao24)}
          cameraMode={cameraMode}
        />
      ))}
    </>
  );
};
