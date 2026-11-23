import { useCallback, useEffect, useRef, useState } from 'react';
import {
  getSimulatedVehicleParams,
  SensorFusionEngine,
  type SensorSnapshot,
} from '../lib/sensorFusion';
import { estimateWhpFromRun } from '../lib/stats';
import type {
  DragRunRecord,
  LaunchMode,
  LiveTelemetryPayload,
  RaceDistance,
  RunState,
  SensorMode,
  SensorSensitivity,
  SplitDistance,
  SplitRecord,
  TelemetrySample,
  VehicleProfile,
} from '../types/telemetry';

function getTriggerThresholds(sensitivity: SensorSensitivity) {
  switch (sensitivity) {
    case 'low':
      return {
        launchG: 0.2,
        launchGMs: 90,
        launchKmh: 3.5,
        launchKmhMs: 60,
        foulG: 0.28,
        foulGMs: 110,
        foulKmh: 4.5,
        foulKmhMs: 80,
      };
    case 'medium':
      return {
        launchG: 0.12,
        launchGMs: 60,
        launchKmh: 2.0,
        launchKmhMs: 45,
        foulG: 0.18,
        foulGMs: 80,
        foulKmh: 3.0,
        foulKmhMs: 60,
      };
    case 'high':
      return {
        launchG: 0.07,
        launchGMs: 35,
        launchKmh: 1.2,
        launchKmhMs: 30,
        foulG: 0.12,
        foulGMs: 50,
        foulKmh: 1.8,
        foulKmhMs: 40,
      };
  }
}

interface UseDragRaceEngineOptions {
  roomId: string;
  activeVehicle: VehicleProfile;
  targetDistance: RaceDistance;
  launchMode: LaunchMode;
  sensorMode: SensorMode;
  onRunComplete: (run: DragRunRecord) => void;
  onLiveTelemetry: (payload: LiveTelemetryPayload) => void;
}

const INITIAL_SENSOR: SensorSnapshot = {
  speedKmh: 0,
  gpsSpeedKmh: 0,
  accelG: 0,
  rawAccelMs2: 0,
  gpsAccuracyM: null,
  gpsStatus: 'idle',
  imuStatus: 'idle',
  isCalibrated: false,
  sampleRateHz: 0,
  lat: null,
  lng: null,
};

export function useDragRaceEngine({
  roomId,
  activeVehicle,
  targetDistance,
  launchMode,
  sensorMode,
  onRunComplete,
  onLiveTelemetry,
}: UseDragRaceEngineOptions) {
  const [sensor, setSensor] = useState<SensorSnapshot>(INITIAL_SENSOR);
  const [runState, setRunState] = useState<RunState>('idle');
  const [treeStep, setTreeStep] = useState<number>(0);
  const [elapsedSec, setElapsedSec] = useState<number>(0);
  const [distanceM, setDistanceM] = useState<number>(0);
  const [liveSpeedKmh, setLiveSpeedKmh] = useState<number>(0);
  const [liveAccelG, setLiveAccelG] = useState<number>(0);
  const [peakSpeedKmh, setPeakSpeedKmh] = useState<number>(0);
  const [peakAccelG, setPeakAccelG] = useState<number>(0);
  const [reactionTimeSec, setReactionTimeSec] = useState<number | null>(null);
  const [zeroTo60Sec, setZeroTo60Sec] = useState<number | null>(null);
  const [zeroTo100Sec, setZeroTo100Sec] = useState<number | null>(null);
  const [splits, setSplits] = useState<SplitRecord[]>([]);
  const [samples, setSamples] = useState<TelemetrySample[]>([]);
  const [lastCompletedRun, setLastCompletedRun] = useState<DragRunRecord | null>(null);
  const [isCalibrating, setIsCalibrating] = useState<boolean>(false);
  const [sensitivity, setSensitivityState] = useState<SensorSensitivity>(() => {
    if (typeof window === 'undefined') return 'medium';
    const saved = window.localStorage.getItem('sag_sensor_sensitivity_v2');
    if (saved === 'low' || saved === 'medium' || saved === 'high') return saved;
    return 'medium';
  });

  const fusionRef = useRef<SensorFusionEngine | null>(null);
  const sensitivityRef = useRef<SensorSensitivity>(sensitivity);
  sensitivityRef.current = sensitivity;
  const sensorRef = useRef<SensorSnapshot>(INITIAL_SENSOR);
  const runStateRef = useRef<RunState>('idle');
  const rafRef = useRef<number | null>(null);
  const timersRef = useRef<Array<ReturnType<typeof setTimeout>>>([]);
  const simLaunchTriggerRef = useRef<boolean>(false);

  // Mutable run-tracking refs for 60Hz loop
  const greenTsRef = useRef<number>(0);
  const launchTsRef = useRef<number>(0);
  const prevFrameTsRef = useRef<number>(0);
  const distRef = useRef<number>(0);
  const peakSpeedRef = useRef<number>(0);
  const peakGRef = useRef<number>(0);
  const rtRef = useRef<number | null>(null);
  const zero60Ref = useRef<number | null>(null);
  const zero100Ref = useRef<number | null>(null);
  const splitsRef = useRef<SplitRecord[]>([]);
  const samplesRef = useRef<TelemetrySample[]>([]);
  const lastSampleT = useRef<number>(-1);
  const lastLiveBroadcastRef = useRef<number>(0);
  const gpsAccListRef = useRef<number[]>([]);

  // Simulation physics state
  const simSpeedMsRef = useRef<number>(0);

  const clearAllTimers = useCallback(() => {
    timersRef.current.forEach((t) => clearTimeout(t));
    timersRef.current = [];
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, []);

  // Manage live GPS + IMU lifecycle
  useEffect(() => {
    if (sensorMode !== 'live') {
      fusionRef.current?.stop();
      fusionRef.current = null;
      return;
    }
    const engine = new SensorFusionEngine({
      onSnapshot: (snap) => {
        sensorRef.current = snap;
        setSensor(snap);
        if (runStateRef.current === 'idle') {
          setLiveSpeedKmh(snap.speedKmh);
          setLiveAccelG(snap.accelG);
        }
      },
    });
    fusionRef.current = engine;
    engine.setSensitivity(sensitivityRef.current);
    engine.start();

    return () => {
      engine.stop();
      fusionRef.current = null;
    };
  }, [sensorMode]);

  const setSensitivity = useCallback((next: SensorSensitivity) => {
    setSensitivityState(next);
    sensitivityRef.current = next;
    fusionRef.current?.setSensitivity(next);
    try {
      window.localStorage.setItem('sag_sensor_sensitivity_v2', next);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    return () => clearAllTimers();
  }, [clearAllTimers]);

  const broadcastLive = useCallback(
    (
      nextState: RunState,
      step: number,
      tSec: number,
      dist: number,
      spd: number,
      g: number,
      force = false
    ) => {
      const now = performance.now();
      if (!force && now - lastLiveBroadcastRef.current < 85) return;
      lastLiveBroadcastRef.current = now;
      onLiveTelemetry({
        roomId,
        driverDevice: 'Cockpit Driver',
        vehicleName: activeVehicle.name,
        targetDistance,
        runState: nextState,
        treeStep: step,
        elapsedSec: Math.round(tSec * 1000) / 1000,
        distanceM: Math.round(dist * 10) / 10,
        speedKmh: Math.round(spd * 10) / 10,
        accelG: Math.round(g * 100) / 100,
        peakSpeedKmh: Math.round(peakSpeedRef.current * 10) / 10,
        peakAccelG: Math.round(peakGRef.current * 100) / 100,
        reactionTimeSec: rtRef.current,
        splits: splitsRef.current,
        gpsAccuracyM: sensorRef.current.gpsAccuracyM,
        sensorMode,
        updatedAt: Date.now(),
      });
    },
    [roomId, activeVehicle.name, targetDistance, sensorMode, onLiveTelemetry]
  );

  const resetRun = useCallback(() => {
    clearAllTimers();
    runStateRef.current = 'idle';
    setRunState('idle');
    setTreeStep(0);
    setElapsedSec(0);
    setDistanceM(0);
    setLiveSpeedKmh(sensorMode === 'live' ? sensorRef.current.speedKmh : 0);
    setLiveAccelG(sensorMode === 'live' ? sensorRef.current.accelG : 0);
    setPeakSpeedKmh(0);
    setPeakAccelG(0);
    setReactionTimeSec(null);
    setZeroTo60Sec(null);
    setZeroTo100Sec(null);
    setSplits([]);
    setSamples([]);
    simSpeedMsRef.current = 0;
    simLaunchTriggerRef.current = false;
    broadcastLive('idle', 0, 0, 0, 0, 0, true);
  }, [clearAllTimers, sensorMode, broadcastLive]);

  const finishRun = useCallback(
    (finalEt: number, finalSplits: SplitRecord[], isRedLight = false) => {
      clearAllTimers();
      runStateRef.current = isRedLight ? 'redlight' : 'finished';
      setRunState(runStateRef.current);

      const targetSplit = finalSplits.find((s) => s.distance === targetDistance);
      const etSec = targetSplit ? targetSplit.timeSec : finalEt;
      const trapSpeedKmh = targetSplit ? targetSplit.speedKmh : peakSpeedRef.current;

      const avgAcc =
        gpsAccListRef.current.length > 0
          ? Math.round(
              (gpsAccListRef.current.reduce((a, b) => a + b, 0) /
                gpsAccListRef.current.length) *
                10
            ) / 10
          : null;

      const runRecord: DragRunRecord = {
        id: `run-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        roomId,
        vehicleId: activeVehicle.id,
        vehicleName: activeVehicle.name,
        targetDistance,
        launchMode,
        sensorMode,
        reactionTimeSec: rtRef.current !== null ? Math.round(rtRef.current * 1000) / 1000 : null,
        isRedLight,
        etSec: Math.round(etSec * 1000) / 1000,
        trapSpeedKmh: Math.round(trapSpeedKmh * 10) / 10,
        peakSpeedKmh: Math.round(peakSpeedRef.current * 10) / 10,
        peakAccelG: Math.round(peakGRef.current * 100) / 100,
        zeroTo60Sec: zero60Ref.current !== null ? Math.round(zero60Ref.current * 100) / 100 : null,
        zeroTo100Sec: zero100Ref.current !== null ? Math.round(zero100Ref.current * 100) / 100 : null,
        estimatedWhp: isRedLight
          ? null
          : estimateWhpFromRun(activeVehicle.weightKg, trapSpeedKmh, targetDistance),
        splits: finalSplits,
        samples: samplesRef.current,
        avgGpsAccuracyM: avgAcc,
        createdAt: Date.now(),
      };

      setLastCompletedRun(runRecord);
      onRunComplete(runRecord);
      broadcastLive(
        runStateRef.current,
        isRedLight ? -1 : 4,
        etSec,
        targetDistance,
        trapSpeedKmh,
        0,
        true
      );
    },
    [
      clearAllTimers,
      targetDistance,
      roomId,
      activeVehicle,
      launchMode,
      sensorMode,
      onRunComplete,
      broadcastLive,
    ]
  );

  const beginActiveTrackingLoop = useCallback(() => {
    const splitTargets: SplitDistance[] =
      targetDistance === 402 ? [20, 100, 201, 402] : [20, 100, 201];
    const simParams = getSimulatedVehicleParams(activeVehicle.category, activeVehicle.weightKg);

    launchTsRef.current = performance.now();
    prevFrameTsRef.current = launchTsRef.current;
    distRef.current = 0;
    peakSpeedRef.current = 0;
    peakGRef.current = 0;
    zero60Ref.current = null;
    zero100Ref.current = null;
    splitsRef.current = [];
    samplesRef.current = [{ t: 0, distanceM: 0, speedKmh: 0, accelG: 0 }];
    lastSampleT.current = 0;
    gpsAccListRef.current = [];
    simSpeedMsRef.current = 0;

    setSamples([...samplesRef.current]);
    setSplits([]);

    const stepLoop = (now: number) => {
      if (runStateRef.current !== 'running') return;

      const dt = Math.min(Math.max((now - prevFrameTsRef.current) / 1000, 0.004), 0.08);
      prevFrameTsRef.current = now;
      const tSec = (now - launchTsRef.current) / 1000;

      let speedKmh = 0;
      let accelG = 0;

      if (sensorMode === 'simulation') {
        const topMs = simParams.topSpeedKmh / 3.6;
        const speedRatio = Math.min(1, simSpeedMsRef.current / topMs);
        // Simulate launch traction curve + gear shift momentary dip
        const shiftProgress = (speedRatio * simParams.shiftCount) % 1;
        const shiftDip = shiftProgress > 0.88 && speedRatio < 0.94 ? 0.25 : 1.0;
        const launchRamp = Math.min(1, tSec / 0.14);
        const rawG = simParams.maxG * launchRamp * (1 - Math.pow(speedRatio, 1.45)) * shiftDip;
        accelG = Math.max(0.03, rawG + (Math.random() - 0.5) * 0.02);
        simSpeedMsRef.current = Math.min(topMs, simSpeedMsRef.current + accelG * 9.80665 * dt);
        speedKmh = simSpeedMsRef.current * 3.6;
      } else {
        speedKmh = sensorRef.current.speedKmh;
        accelG = sensorRef.current.accelG;
        if (sensorRef.current.gpsAccuracyM !== null) {
          gpsAccListRef.current.push(sensorRef.current.gpsAccuracyM);
        }
      }

      const prevDist = distRef.current;
      const speedMs = speedKmh / 3.6;
      const nextDist = prevDist + speedMs * dt;
      const prevT = Math.max(0, tSec - dt);
      distRef.current = nextDist;

      if (speedKmh > peakSpeedRef.current) {
        peakSpeedRef.current = speedKmh;
        setPeakSpeedKmh(speedKmh);
      }
      if (accelG > peakGRef.current) {
        peakGRef.current = accelG;
        setPeakAccelG(accelG);
      }

      if (zero60Ref.current === null && speedKmh >= 60) {
        zero60Ref.current = tSec;
        setZeroTo60Sec(tSec);
      }
      if (zero100Ref.current === null && speedKmh >= 100) {
        zero100Ref.current = tSec;
        setZeroTo100Sec(tSec);
      }

      // Check split distance crossings with linear interpolation
      for (const sd of splitTargets) {
        if (
          !splitsRef.current.some((sp) => sp.distance === sd) &&
          nextDist >= sd &&
          nextDist > prevDist
        ) {
          const frac = (sd - prevDist) / (nextDist - prevDist);
          const exactT = prevT + frac * (tSec - prevT);
          const rec: SplitRecord = {
            distance: sd,
            timeSec: Math.round(exactT * 1000) / 1000,
            speedKmh: Math.round(speedKmh * 10) / 10,
            gForce: Math.round(accelG * 100) / 100,
          };
          splitsRef.current = [...splitsRef.current, rec];
          setSplits(splitsRef.current);
        }
      }

      // Record telemetry sample at ~20Hz
      if (tSec - lastSampleT.current >= 0.05) {
        lastSampleT.current = tSec;
        const pt: TelemetrySample = {
          t: Math.round(tSec * 100) / 100,
          distanceM: Math.round(nextDist * 10) / 10,
          speedKmh: Math.round(speedKmh * 10) / 10,
          accelG: Math.round(accelG * 100) / 100,
          gpsAccuracyM: sensorRef.current.gpsAccuracyM,
        };
        samplesRef.current = [...samplesRef.current, pt];
        setSamples(samplesRef.current);
      }

      setElapsedSec(tSec);
      setDistanceM(nextDist);
      setLiveSpeedKmh(speedKmh);
      setLiveAccelG(accelG);

      broadcastLive('running', launchMode === 'tree' ? 4 : 0, tSec, nextDist, speedKmh, accelG);

      if (nextDist >= targetDistance) {
        // Ensure final sample is recorded
        samplesRef.current = [
          ...samplesRef.current,
          {
            t: Math.round(tSec * 100) / 100,
            distanceM: targetDistance,
            speedKmh: Math.round(speedKmh * 10) / 10,
            accelG: Math.round(accelG * 100) / 100,
          },
        ];
        setSamples(samplesRef.current);
        finishRun(tSec, splitsRef.current, false);
        return;
      }

      rafRef.current = requestAnimationFrame(stepLoop);
    };

    rafRef.current = requestAnimationFrame(stepLoop);
  }, [
    targetDistance,
    activeVehicle.category,
    activeVehicle.weightKg,
    sensorMode,
    launchMode,
    broadcastLive,
    finishRun,
  ]);

  const triggerManualLaunch = useCallback(() => {
    if (sensorMode !== 'simulation') return;
    if (runStateRef.current === 'countdown') {
      // Jump start / Red light!
      clearAllTimers();
      const rtNeg = (performance.now() - (greenTsRef.current || performance.now() + 350)) / 1000;
      rtRef.current = rtNeg < 0 ? rtNeg : -0.05;
      setReactionTimeSec(rtRef.current);
      setTreeStep(-1);
      finishRun(0, [], true);
      return;
    }
    if (runStateRef.current === 'armed') {
      simLaunchTriggerRef.current = true;
      const rt =
        launchMode === 'tree' && greenTsRef.current > 0
          ? (performance.now() - greenTsRef.current) / 1000
          : null;
      rtRef.current = rt;
      setReactionTimeSec(rt);
      runStateRef.current = 'running';
      setRunState('running');
      beginActiveTrackingLoop();
    }
  }, [sensorMode, launchMode, clearAllTimers, finishRun, beginActiveTrackingLoop]);

  const startRace = useCallback((overrideLaunchMode?: LaunchMode) => {
    const activeLaunchMode =
      overrideLaunchMode === 'tree' || overrideLaunchMode === 'rollout'
        ? overrideLaunchMode
        : launchMode;
    clearAllTimers();
    setElapsedSec(0);
    setDistanceM(0);
    setPeakSpeedKmh(0);
    setPeakAccelG(0);
    setReactionTimeSec(null);
    setZeroTo60Sec(null);
    setZeroTo100Sec(null);
    setSplits([]);
    setSamples([]);
    rtRef.current = null;
    simLaunchTriggerRef.current = false;

    if (sensorMode === 'live') {
      fusionRef.current?.resetVelocity();
    }

    if (activeLaunchMode === 'rollout') {
      runStateRef.current = 'armed';
      setRunState('armed');
      setTreeStep(0);
      broadcastLive('armed', 0, 0, 0, 0, 0, true);

      if (sensorMode === 'simulation') {
        const autoT = setTimeout(() => {
          if (runStateRef.current !== 'armed') return;
          runStateRef.current = 'running';
          setRunState('running');
          beginActiveTrackingLoop();
        }, 700);
        timersRef.current.push(autoT);
      } else {
        const th = getTriggerThresholds(sensitivityRef.current);
        let accelSustainedSince: number | null = null;
        let speedSustainedSince: number | null = null;
        const waitMove = (now: number) => {
          if (runStateRef.current !== 'armed') return;
          if (Math.abs(sensorRef.current.accelG) >= th.launchG) {
            accelSustainedSince = accelSustainedSince ?? now;
          } else {
            accelSustainedSince = null;
          }
          if (sensorRef.current.speedKmh >= th.launchKmh) {
            speedSustainedSince = speedSustainedSince ?? now;
          } else {
            speedSustainedSince = null;
          }
          const accelConfirmed =
            accelSustainedSince !== null && now - accelSustainedSince >= th.launchGMs;
          const speedConfirmed =
            speedSustainedSince !== null && now - speedSustainedSince >= th.launchKmhMs;
          if (accelConfirmed || speedConfirmed) {
            runStateRef.current = 'running';
            setRunState('running');
            beginActiveTrackingLoop();
            return;
          }
          rafRef.current = requestAnimationFrame(waitMove);
        };
        rafRef.current = requestAnimationFrame(waitMove);
      }
      return;
    }

    // Christmas Tree Launch Mode with RT
    runStateRef.current = 'staging';
    setRunState('staging');
    setTreeStep(0);
    broadcastLive('staging', 0, 0, 0, 0, 0, true);

    const tStage = setTimeout(() => {
      if (runStateRef.current !== 'staging') return;
      runStateRef.current = 'countdown';
      setRunState('countdown');
      setTreeStep(1);
      broadcastLive('countdown', 1, 0, 0, 0, 0, true);

      // Watch for genuine jump-start in Live mode during countdown (ignore brief vibration spikes)
      if (sensorMode === 'live') {
        const th = getTriggerThresholds(sensitivityRef.current);
        let foulAccelSince: number | null = null;
        let foulSpeedSince: number | null = null;
        const checkFoul = (now: number) => {
          if (runStateRef.current !== 'countdown') return;
          if (Math.abs(sensorRef.current.accelG) >= th.foulG) {
            foulAccelSince = foulAccelSince ?? now;
          } else {
            foulAccelSince = null;
          }
          if (sensorRef.current.speedKmh >= th.foulKmh) {
            foulSpeedSince = foulSpeedSince ?? now;
          } else {
            foulSpeedSince = null;
          }
          const accelFoul = foulAccelSince !== null && now - foulAccelSince >= th.foulGMs;
          const speedFoul = foulSpeedSince !== null && now - foulSpeedSince >= th.foulKmhMs;
          if (accelFoul || speedFoul) {
            const foulRt = (performance.now() - greenTsRef.current) / 1000;
            rtRef.current = foulRt < 0 ? foulRt : -0.05;
            setReactionTimeSec(rtRef.current);
            setTreeStep(-1);
            finishRun(0, [], true);
            return;
          }
          rafRef.current = requestAnimationFrame(checkFoul);
        };
        greenTsRef.current = performance.now() + 1500;
        rafRef.current = requestAnimationFrame(checkFoul);
      } else {
        greenTsRef.current = performance.now() + 1500;
      }

      const t2 = setTimeout(() => {
        if (runStateRef.current !== 'countdown') return;
        setTreeStep(2);
        broadcastLive('countdown', 2, 0, 0, 0, 0, true);
      }, 500);

      const t3 = setTimeout(() => {
        if (runStateRef.current !== 'countdown') return;
        setTreeStep(3);
        broadcastLive('countdown', 3, 0, 0, 0, 0, true);
      }, 1000);

      const tGo = setTimeout(() => {
        if (runStateRef.current !== 'countdown') return;
        greenTsRef.current = performance.now();
        runStateRef.current = 'armed';
        setRunState('armed');
        setTreeStep(4);
        broadcastLive('armed', 4, 0, 0, 0, 0, true);

        if (sensorMode === 'simulation') {
          const autoGo = setTimeout(() => {
            if (runStateRef.current !== 'armed') return;
            const rt = (performance.now() - greenTsRef.current) / 1000;
            rtRef.current = rt;
            setReactionTimeSec(rt);
            runStateRef.current = 'running';
            setRunState('running');
            beginActiveTrackingLoop();
          }, 215);
          timersRef.current.push(autoGo);
        } else {
          const th = getTriggerThresholds(sensitivityRef.current);
          let goAccelSince: number | null = null;
          let goSpeedSince: number | null = null;
          const waitGreenLaunch = (now: number) => {
            if (runStateRef.current !== 'armed') return;
            if (Math.abs(sensorRef.current.accelG) >= th.launchG) {
              goAccelSince = goAccelSince ?? now;
            } else {
              goAccelSince = null;
            }
            if (sensorRef.current.speedKmh >= th.launchKmh) {
              goSpeedSince = goSpeedSince ?? now;
            } else {
              goSpeedSince = null;
            }
            const accelConfirmed = goAccelSince !== null && now - goAccelSince >= th.launchGMs;
            const speedConfirmed = goSpeedSince !== null && now - goSpeedSince >= th.launchKmhMs;
            if (accelConfirmed || speedConfirmed) {
              const rt = (performance.now() - greenTsRef.current) / 1000;
              rtRef.current = rt;
              setReactionTimeSec(rt);
              runStateRef.current = 'running';
              setRunState('running');
              beginActiveTrackingLoop();
              return;
            }
            rafRef.current = requestAnimationFrame(waitGreenLaunch);
          };
          rafRef.current = requestAnimationFrame(waitGreenLaunch);
        }
      }, 1500);

      timersRef.current.push(t2, t3, tGo);
    }, 550);

    timersRef.current.push(tStage);
  }, [
    clearAllTimers,
    sensorMode,
    launchMode,
    broadcastLive,
    beginActiveTrackingLoop,
    finishRun,
  ]);

  const calibrateSensors = useCallback(async () => {
    if (!fusionRef.current) return;
    setIsCalibrating(true);
    await fusionRef.current.requestImuPermission();
    await fusionRef.current.startCalibration();
    setIsCalibrating(false);
  }, []);

  const requestImuAccess = useCallback(async () => {
    if (!fusionRef.current) return false;
    return fusionRef.current.requestImuPermission();
  }, []);

  return {
    sensor,
    runState,
    treeStep,
    elapsedSec,
    distanceM,
    liveSpeedKmh,
    liveAccelG,
    peakSpeedKmh,
    peakAccelG,
    reactionTimeSec,
    zeroTo60Sec,
    zeroTo100Sec,
    splits,
    samples,
    lastCompletedRun,
    isCalibrating,
    sensitivity,
    setSensitivity,
    startRace,
    resetRun,
    triggerManualLaunch,
    calibrateSensors,
    requestImuAccess,
  };
}
