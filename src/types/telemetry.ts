export type RaceDistance = 201 | 402;

export type LaunchMode = 'tree' | 'rollout';

export type SensorMode = 'live' | 'simulation';

export type RunState =
  | 'idle'
  | 'staging'
  | 'countdown'
  | 'armed'
  | 'running'
  | 'finished'
  | 'redlight';

export type VehicleCategory =
  | 'Motor 2-Tak'
  | 'Motor 4-Tak'
  | 'Mobil Street'
  | 'Mobil Pro'
  | 'Custom';

export type SplitDistance = 20 | 100 | 201 | 402;

export interface SplitRecord {
  distance: SplitDistance;
  timeSec: number;
  speedKmh: number;
  gForce: number;
}

export interface TelemetrySample {
  t: number; // seconds since launch
  distanceM: number;
  speedKmh: number;
  accelG: number;
  gpsAccuracyM?: number | null;
}

export interface VehicleProfile {
  id: string;
  name: string;
  category: VehicleCategory;
  weightKg: number;
  powerSpec: string;
  tireSpec: string;
  notes: string;
  updatedAt: number;
}

export interface DragRunRecord {
  id: string;
  roomId: string;
  vehicleId: string;
  vehicleName: string;
  targetDistance: RaceDistance;
  launchMode: LaunchMode;
  sensorMode: SensorMode;
  reactionTimeSec: number | null;
  isRedLight: boolean;
  etSec: number;
  trapSpeedKmh: number;
  peakSpeedKmh: number;
  peakAccelG: number;
  zeroTo60Sec: number | null;
  zeroTo100Sec: number | null;
  estimatedWhp: number | null;
  splits: SplitRecord[];
  samples: TelemetrySample[];
  avgGpsAccuracyM: number | null;
  createdAt: number;
}

export interface LiveTelemetryPayload {
  roomId: string;
  driverDevice: string;
  vehicleName: string;
  targetDistance: RaceDistance;
  runState: RunState;
  treeStep: number; // 0=off, 1..3=amber, 4=green, -1=redlight
  elapsedSec: number;
  distanceM: number;
  speedKmh: number;
  accelG: number;
  peakSpeedKmh: number;
  peakAccelG: number;
  reactionTimeSec: number | null;
  splits: SplitRecord[];
  gpsAccuracyM: number | null;
  sensorMode: SensorMode;
  updatedAt: number;
}

export interface RoomSyncState {
  roomId: string;
  vehicles: VehicleProfile[];
  runs: DragRunRecord[];
  clientsCount: number;
  liveTelemetry: LiveTelemetryPayload | null;
}
