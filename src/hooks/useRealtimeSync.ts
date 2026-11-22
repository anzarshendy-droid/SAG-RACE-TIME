import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  DragRunRecord,
  LiveTelemetryPayload,
  RoomSyncState,
  VehicleProfile,
} from '../types/telemetry';

export type SyncConnectionState = 'connecting' | 'connected' | 'reconnecting' | 'offline';

const DEFAULT_VEHICLES: VehicleProfile[] = [
  {
    id: 'veh-default-01',
    name: 'Unit Utama SAG',
    category: 'Motor 2-Tak',
    weightKg: 165,
    powerSpec: '155cc Tune Up',
    tireSpec: 'Drag Slick 60/80-17',
    notes: 'Setup standar lintasan 201m / 402m',
    updatedAt: Date.now(),
  },
];

function getStorageKey(roomId: string): string {
  return `sag_race_time_room_${roomId}`;
}

export function useRealtimeSync(initialRoomId: string, clientRole: 'driver' | 'pit' = 'driver') {
  const [roomId, setRoomId] = useState<string>(() => {
    if (typeof window === 'undefined') return initialRoomId;
    const urlRoom = new URLSearchParams(window.location.search).get('room');
    const saved = window.localStorage.getItem('sag_active_room_id');
    const chosen = (urlRoom || saved || initialRoomId).toUpperCase().replace(/[^A-Z0-9_-]/g, '').slice(0, 24);
    return chosen || 'SAG-01';
  });

  const [vehicles, setVehicles] = useState<VehicleProfile[]>(() => {
    if (typeof window === 'undefined') return DEFAULT_VEHICLES;
    try {
      const cached = window.localStorage.getItem(getStorageKey(roomId));
      if (cached) {
        const parsed = JSON.parse(cached) as { vehicles?: VehicleProfile[] };
        if (Array.isArray(parsed.vehicles) && parsed.vehicles.length > 0) return parsed.vehicles;
      }
    } catch {
      // ignore
    }
    return DEFAULT_VEHICLES;
  });

  const [runs, setRuns] = useState<DragRunRecord[]>(() => {
    if (typeof window === 'undefined') return [];
    try {
      const cached = window.localStorage.getItem(getStorageKey(roomId));
      if (cached) {
        const parsed = JSON.parse(cached) as { runs?: DragRunRecord[] };
        if (Array.isArray(parsed.runs)) return parsed.runs;
      }
    } catch {
      // ignore
    }
    return [];
  });

  const [clientsCount, setClientsCount] = useState<number>(1);
  const [connectionState, setConnectionState] = useState<SyncConnectionState>('connecting');
  const [remoteLiveTelemetry, setRemoteLiveTelemetry] = useState<LiveTelemetryPayload | null>(null);
  const [lastSyncTs, setLastSyncTs] = useState<number | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingQueueRef = useRef<unknown[]>([]);
  const roomRef = useRef<string>(roomId);
  const roleRef = useRef<'driver' | 'pit'>(clientRole);

  roomRef.current = roomId;
  roleRef.current = clientRole;

  // Persist local cache whenever vehicles or runs change
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem('sag_active_room_id', roomId);
      window.localStorage.setItem(getStorageKey(roomId), JSON.stringify({ vehicles, runs }));
    } catch {
      // ignore storage quota errors
    }
  }, [roomId, vehicles, runs]);

  const sendMessage = useCallback((msg: unknown) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg));
    } else {
      pendingQueueRef.current.push(msg);
      if (pendingQueueRef.current.length > 50) {
        pendingQueueRef.current.shift();
      }
    }
  }, []);

  useEffect(() => {
    let disposed = false;
    let attempt = 0;

    const connect = () => {
      if (disposed) return;
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/ws`;
      setConnectionState(attempt === 0 ? 'connecting' : 'reconnecting');

      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        if (disposed) {
          ws.close();
          return;
        }
        attempt = 0;
        setConnectionState('connected');
        setLastSyncTs(Date.now());
        ws.send(
          JSON.stringify({
            type: 'room:join',
            roomId: roomRef.current,
            clientRole: roleRef.current,
          })
        );
        // Flush queued mutations
        while (pendingQueueRef.current.length > 0) {
          const item = pendingQueueRef.current.shift();
          ws.send(JSON.stringify(item));
        }
      };

      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data as string) as Record<string, unknown>;
          const type = msg.type;
          setLastSyncTs(Date.now());

          if (type === 'room:state') {
            const state = msg as unknown as RoomSyncState;
            if (Array.isArray(state.vehicles) && state.vehicles.length > 0) {
              setVehicles(state.vehicles);
            }
            if (Array.isArray(state.runs)) {
              setRuns((prev) => {
                // Merge local runs not yet on server idempotently
                const serverIds = new Set(state.runs.map((r) => r.id));
                const localOnly = prev.filter((r) => r.roomId === state.roomId && !serverIds.has(r.id));
                localOnly.forEach((r) => {
                  ws.send(JSON.stringify({ type: 'run:create', roomId: state.roomId, run: r }));
                });
                return [...localOnly, ...state.runs].sort((a, b) => b.createdAt - a.createdAt);
              });
            }
            if (typeof state.clientsCount === 'number') {
              setClientsCount(state.clientsCount);
            }
            setRemoteLiveTelemetry(state.liveTelemetry ?? null);
          } else if (type === 'room:presence') {
            if (typeof msg.clientsCount === 'number') {
              setClientsCount(msg.clientsCount);
            }
          } else if (type === 'telemetry:live' && msg.payload) {
            setRemoteLiveTelemetry(msg.payload as LiveTelemetryPayload);
          } else if (type === 'run:created' && msg.run) {
            const incoming = msg.run as DragRunRecord;
            setRuns((prev) => {
              if (prev.some((r) => r.id === incoming.id)) return prev;
              return [incoming, ...prev];
            });
          } else if (type === 'run:deleted' && typeof msg.runId === 'string') {
            setRuns((prev) => prev.filter((r) => r.id !== msg.runId));
          } else if (type === 'vehicle:upserted' && msg.vehicle) {
            const v = msg.vehicle as VehicleProfile;
            setVehicles((prev) => {
              const idx = prev.findIndex((item) => item.id === v.id);
              if (idx >= 0) {
                const next = [...prev];
                next[idx] = v;
                return next;
              }
              return [...prev, v];
            });
          } else if (type === 'vehicle:deleted' && typeof msg.vehicleId === 'string') {
            setVehicles((prev) => prev.filter((v) => v.id !== msg.vehicleId));
          }
        } catch {
          // ignore malformed messages
        }
      };

      ws.onclose = () => {
        if (disposed) return;
        setConnectionState('reconnecting');
        attempt += 1;
        const delay = Math.min(1000 * Math.pow(1.5, attempt), 8000);
        reconnectTimerRef.current = setTimeout(connect, delay);
      };

      ws.onerror = () => {
        ws.close();
      };
    };

    connect();

    return () => {
      disposed = true;
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      if (wsRef.current) wsRef.current.close();
    };
  }, [roomId]);

  const changeRoom = useCallback((nextRoomRaw: string) => {
    const cleaned = nextRoomRaw.trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '').slice(0, 24);
    if (!cleaned || cleaned === roomRef.current) return;
    setRuns([]);
    setRemoteLiveTelemetry(null);
    setRoomId(cleaned);
  }, []);

  const publishLiveTelemetry = useCallback(
    (payload: LiveTelemetryPayload) => {
      const ws = wsRef.current;
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'telemetry:live', roomId: roomRef.current, payload }));
      }
    },
    []
  );

  const saveRun = useCallback(
    (run: DragRunRecord) => {
      setRuns((prev) => (prev.some((r) => r.id === run.id) ? prev : [run, ...prev]));
      sendMessage({ type: 'run:create', roomId: roomRef.current, run });
    },
    [sendMessage]
  );

  const deleteRun = useCallback(
    (runId: string) => {
      setRuns((prev) => prev.filter((r) => r.id !== runId));
      sendMessage({ type: 'run:delete', roomId: roomRef.current, runId });
    },
    [sendMessage]
  );

  const upsertVehicle = useCallback(
    (vehicle: VehicleProfile) => {
      setVehicles((prev) => {
        const idx = prev.findIndex((v) => v.id === vehicle.id);
        if (idx >= 0) {
          const next = [...prev];
          next[idx] = vehicle;
          return next;
        }
        return [...prev, vehicle];
      });
      sendMessage({ type: 'vehicle:upsert', roomId: roomRef.current, vehicle });
    },
    [sendMessage]
  );

  const deleteVehicle = useCallback(
    (vehicleId: string) => {
      setVehicles((prev) => (prev.length <= 1 ? prev : prev.filter((v) => v.id !== vehicleId)));
      sendMessage({ type: 'vehicle:delete', roomId: roomRef.current, vehicleId });
    },
    [sendMessage]
  );

  return {
    roomId,
    changeRoom,
    vehicles,
    runs,
    clientsCount,
    connectionState,
    remoteLiveTelemetry,
    lastSyncTs,
    publishLiveTelemetry,
    saveRun,
    deleteRun,
    upsertVehicle,
    deleteVehicle,
  };
}
