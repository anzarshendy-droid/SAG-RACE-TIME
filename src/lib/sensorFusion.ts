import type { VehicleCategory } from '../types/telemetry';

export type GpsStatus = 'idle' | 'searching' | 'locked' | 'weak' | 'denied' | 'unsupported';
export type ImuStatus = 'idle' | 'active' | 'needs_permission' | 'denied' | 'unsupported';

export interface SensorSnapshot {
  speedKmh: number;
  gpsSpeedKmh: number;
  accelG: number; // longitudinal G-force
  rawAccelMs2: number;
  gpsAccuracyM: number | null;
  gpsStatus: GpsStatus;
  imuStatus: ImuStatus;
  isCalibrated: boolean;
  sampleRateHz: number;
  lat: number | null;
  lng: number | null;
}

export interface FusionCallbacks {
  onSnapshot: (snap: SensorSnapshot) => void;
}

const EARTH_RADIUS_M = 6371000;

export function haversineDistanceM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_M * c;
}

export class SensorFusionEngine {
  private watchId: number | null = null;
  private motionHandler: ((e: DeviceMotionEvent) => void) | null = null;
  private callbacks: FusionCallbacks;

  private gpsStatus: GpsStatus = 'idle';
  private imuStatus: ImuStatus = 'idle';
  private gpsAccuracyM: number | null = null;
  private gpsSpeedMs = 0;
  private lastGpsPos: { lat: number; lng: number; ts: number } | null = null;

  private fusedSpeedMs = 0;
  private currentAccelG = 0;
  private rawAccelMs2 = 0;
  private lastMotionTs = 0;
  private motionCount = 0;
  private rateWindowStart = 0;
  private sampleRateHz = 0;

  // Calibration baseline for gravity vector subtraction & forward axis
  private gravityBaseline = { x: 0, y: 0, z: 9.80665 };
  private isCalibrated = false;
  private calibratingSamples: Array<{ x: number; y: number; z: number }> = [];
  private isCalibrating = false;

  // Track total distance from run origin if needed externally
  private latestLat: number | null = null;
  private latestLng: number | null = null;

  constructor(callbacks: FusionCallbacks) {
    this.callbacks = callbacks;
  }

  public async requestImuPermission(): Promise<boolean> {
    if (typeof window === 'undefined' || !('DeviceMotionEvent' in window)) {
      this.imuStatus = 'unsupported';
      this.emit();
      return false;
    }

    const DME = DeviceMotionEvent as unknown as {
      requestPermission?: () => Promise<'granted' | 'denied'>;
    };

    if (typeof DME.requestPermission === 'function') {
      try {
        const res = await DME.requestPermission();
        if (res === 'granted') {
          this.attachMotionListener();
          return true;
        } else {
          this.imuStatus = 'denied';
          this.emit();
          return false;
        }
      } catch {
        this.imuStatus = 'denied';
        this.emit();
        return false;
      }
    }

    this.attachMotionListener();
    return true;
  }

  public start(): void {
    this.startGps();
    if (typeof window !== 'undefined' && 'DeviceMotionEvent' in window) {
      const DME = DeviceMotionEvent as unknown as {
        requestPermission?: () => Promise<'granted' | 'denied'>;
      };
      if (typeof DME.requestPermission === 'function') {
        this.imuStatus = 'needs_permission';
      } else {
        this.attachMotionListener();
      }
    } else {
      this.imuStatus = 'unsupported';
    }
    this.emit();
  }

  public stop(): void {
    if (this.watchId !== null && typeof navigator !== 'undefined' && navigator.geolocation) {
      navigator.geolocation.clearWatch(this.watchId);
      this.watchId = null;
    }
    if (this.motionHandler && typeof window !== 'undefined') {
      window.removeEventListener('devicemotion', this.motionHandler);
      this.motionHandler = null;
    }
    this.gpsStatus = 'idle';
    this.imuStatus = 'idle';
  }

  public startCalibration(): Promise<void> {
    return new Promise((resolve) => {
      this.calibratingSamples = [];
      this.isCalibrating = true;
      setTimeout(() => {
        this.isCalibrating = false;
        if (this.calibratingSamples.length > 0) {
          const sum = this.calibratingSamples.reduce(
            (acc, s) => ({ x: acc.x + s.x, y: acc.y + s.y, z: acc.z + s.z }),
            { x: 0, y: 0, z: 0 }
          );
          const n = this.calibratingSamples.length;
          this.gravityBaseline = { x: sum.x / n, y: sum.y / n, z: sum.z / n };
        }
        this.fusedSpeedMs = 0;
        this.currentAccelG = 0;
        this.isCalibrated = true;
        this.emit();
        resolve();
      }, 450);
    });
  }

  public resetVelocity(): void {
    this.fusedSpeedMs = 0;
    this.gpsSpeedMs = 0;
    this.currentAccelG = 0;
  }

  private startGps(): void {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      this.gpsStatus = 'unsupported';
      this.emit();
      return;
    }

    this.gpsStatus = 'searching';
    this.emit();

    this.watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const now = performance.now();
        const { latitude, longitude, accuracy, speed } = pos.coords;
        this.latestLat = latitude;
        this.latestLng = longitude;
        this.gpsAccuracyM = typeof accuracy === 'number' ? Math.round(accuracy * 10) / 10 : null;

        if (this.gpsAccuracyM !== null && this.gpsAccuracyM <= 20) {
          this.gpsStatus = 'locked';
        } else {
          this.gpsStatus = 'weak';
        }

        let measuredSpeedMs = typeof speed === 'number' && speed >= 0 ? speed : null;

        if (measuredSpeedMs === null && this.lastGpsPos) {
          const dt = (now - this.lastGpsPos.ts) / 1000;
          if (dt > 0.15) {
            const dist = haversineDistanceM(
              this.lastGpsPos.lat,
              this.lastGpsPos.lng,
              latitude,
              longitude
            );
            // Ignore GPS jitter under accuracy noise floor
            measuredSpeedMs = dist > 1.2 ? dist / dt : 0;
          }
        }

        this.lastGpsPos = { lat: latitude, lng: longitude, ts: now };

        if (measuredSpeedMs !== null) {
          this.gpsSpeedMs = measuredSpeedMs < 0.4 ? 0 : measuredSpeedMs;
          // Complementary filter update: pull fused velocity toward GPS truth
          const trust = this.gpsAccuracyM !== null && this.gpsAccuracyM <= 10 ? 0.65 : 0.4;
          this.fusedSpeedMs = this.fusedSpeedMs * (1 - trust) + this.gpsSpeedMs * trust;
          if (this.fusedSpeedMs < 0.25 && this.gpsSpeedMs === 0) {
            this.fusedSpeedMs = 0;
          }
        }

        this.emit();
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) {
          this.gpsStatus = 'denied';
        } else {
          this.gpsStatus = 'weak';
        }
        this.emit();
      },
      {
        enableHighAccuracy: true,
        maximumAge: 0,
        timeout: 5000,
      }
    );
  }

  private attachMotionListener(): void {
    if (this.motionHandler) return;
    this.imuStatus = 'active';
    this.rateWindowStart = performance.now();
    this.motionCount = 0;

    this.motionHandler = (event: DeviceMotionEvent) => {
      const now = performance.now();
      this.motionCount += 1;
      if (now - this.rateWindowStart >= 1000) {
        this.sampleRateHz = Math.round((this.motionCount * 1000) / (now - this.rateWindowStart));
        this.motionCount = 0;
        this.rateWindowStart = now;
      }

      const rawG = event.accelerationIncludingGravity;
      if (this.isCalibrating && rawG) {
        this.calibratingSamples.push({
          x: rawG.x ?? 0,
          y: rawG.y ?? 0,
          z: rawG.z ?? 9.80665,
        });
        return;
      }

      const lin = event.acceleration;
      let ax = 0;
      let ay = 0;
      let az = 0;

      if (lin && (lin.x !== null || lin.y !== null || lin.z !== null)) {
        ax = lin.x ?? 0;
        ay = lin.y ?? 0;
        az = lin.z ?? 0;
      } else if (rawG) {
        ax = (rawG.x ?? 0) - this.gravityBaseline.x;
        ay = (rawG.y ?? 0) - this.gravityBaseline.y;
        az = (rawG.z ?? 9.80665) - this.gravityBaseline.z;
      }

      // Compute forward longitudinal component (projected orthogonal to gravity baseline)
      const gMag = Math.hypot(
        this.gravityBaseline.x,
        this.gravityBaseline.y,
        this.gravityBaseline.z
      ) || 9.80665;
      const gxUnit = this.gravityBaseline.x / gMag;
      const gyUnit = this.gravityBaseline.y / gMag;
      const gzUnit = this.gravityBaseline.z / gMag;

      const dotG = ax * gxUnit + ay * gyUnit + az * gzUnit;
      const hx = ax - dotG * gxUnit;
      const hy = ay - dotG * gyUnit;
      const hz = az - dotG * gzUnit;
      const horizMag = Math.hypot(hx, hy, hz);

      // Sign based on primary horizontal axis (landscape/portrait vehicle mount)
      const signSource = Math.abs(hz) >= Math.abs(hx) ? hz : hx;
      const signedHoriz = horizMag < 0.28 ? 0 : (signSource >= 0 ? 1 : -1) * horizMag;

      // Low-pass smooth IMU noise
      this.rawAccelMs2 = this.rawAccelMs2 * 0.65 + signedHoriz * 0.35;
      this.currentAccelG = this.rawAccelMs2 / 9.80665;

      if (this.lastMotionTs > 0) {
        const dt = Math.min((now - this.lastMotionTs) / 1000, 0.1);
        if (Math.abs(this.rawAccelMs2) > 0.35) {
          this.fusedSpeedMs = Math.max(0, this.fusedSpeedMs + this.rawAccelMs2 * dt);
        } else if (this.gpsSpeedMs < 0.5) {
          // Zero-velocity update (ZUPT) damping when stationary
          this.fusedSpeedMs = Math.max(0, this.fusedSpeedMs * 0.92);
        }
      }
      this.lastMotionTs = now;
      this.emit();
    };

    window.addEventListener('devicemotion', this.motionHandler);
  }

  private emit(): void {
    this.callbacks.onSnapshot({
      speedKmh: Math.round(this.fusedSpeedMs * 3.6 * 10) / 10,
      gpsSpeedKmh: Math.round(this.gpsSpeedMs * 3.6 * 10) / 10,
      accelG: Math.round(this.currentAccelG * 100) / 100,
      rawAccelMs2: Math.round(this.rawAccelMs2 * 100) / 100,
      gpsAccuracyM: this.gpsAccuracyM,
      gpsStatus: this.gpsStatus,
      imuStatus: this.imuStatus,
      isCalibrated: this.isCalibrated,
      sampleRateHz: this.sampleRateHz,
      lat: this.latestLat,
      lng: this.latestLng,
    });
  }
}

export function getSimulatedVehicleParams(category: VehicleCategory, weightKg: number) {
  // Base peak acceleration & power curve tuned to drag category
  const weightFactor = Math.max(0.65, Math.min(1.4, (category.startsWith('Motor') ? 165 : 1250) / Math.max(90, weightKg)));
  switch (category) {
    case 'Motor 2-Tak':
      return { maxG: 0.96 * weightFactor, topSpeedKmh: 168 * Math.sqrt(weightFactor), shiftCount: 5 };
    case 'Motor 4-Tak':
      return { maxG: 0.91 * weightFactor, topSpeedKmh: 162 * Math.sqrt(weightFactor), shiftCount: 5 };
    case 'Mobil Pro':
      return { maxG: 1.18 * weightFactor, topSpeedKmh: 225 * Math.sqrt(weightFactor), shiftCount: 4 };
    case 'Mobil Street':
      return { maxG: 0.78 * weightFactor, topSpeedKmh: 185 * Math.sqrt(weightFactor), shiftCount: 4 };
    default:
      return { maxG: 0.88 * weightFactor, topSpeedKmh: 175 * Math.sqrt(weightFactor), shiftCount: 4 };
  }
}
