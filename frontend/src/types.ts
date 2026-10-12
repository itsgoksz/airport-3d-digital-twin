export type CameraMode = 
  | 'airport' // Default Orbit freely around airport
  | 'follow' // Orbit target follows aircraft
  | 'chase' // Behind aircraft like Flight Simulator
  | 'cockpit' // Inside aircraft
  | 'wing' // Passenger seat wing view
  | 'tower' // Static camera near runway
  | 'spotter' // Static camera beside runway watching arrivals
  | 'drone'; // Completely free camera
