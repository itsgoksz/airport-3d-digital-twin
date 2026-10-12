import React, { useState, useCallback } from 'react'
import { SceneViewer } from './components/SceneViewer'
import { Dashboard } from './components/Dashboard'
import { FlightData } from './api/client'
import { CameraMode } from './types'

function App() {
  const [flights, setFlights] = useState<FlightData[]>([])
  const [followedIcao24, setFollowedIcao24] = useState<string | null>(null)
  const [cameraMode, setCameraMode] = useState<CameraMode>('airport')

  const handleFlightsUpdate = useCallback((newFlights: FlightData[]) => {
    setFlights(newFlights)
  }, [])

  return (
    <div className="w-full h-full relative overflow-hidden bg-slate-900">
      <SceneViewer 
        followedIcao24={followedIcao24}
        setFollowedIcao24={setFollowedIcao24}
        onFlightsUpdate={handleFlightsUpdate}
        cameraMode={cameraMode}
      />
      <Dashboard 
        flights={flights}
        followedIcao24={followedIcao24}
        setFollowedIcao24={setFollowedIcao24}
        cameraMode={cameraMode}
        setCameraMode={setCameraMode}
      />
    </div>
  )
}

export default App
