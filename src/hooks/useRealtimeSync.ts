import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  DragRunRecord,
  LaunchMode,
  LiveTelemetryPayload,
  RaceDistance,
  RemoteRaceCommand,
  RoomSyncState,
  VehicleProfile,
} from '../types/telemetry';

export type SyncConnectionState = 'connecting' | 'connected' | 'reconnecting' | 'offline';
export type SyncTransportMode = 'ws' | 'http' | 'offline';

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

function resolveSyncEndpoints(): { httpBase: string; wsUrl: string } {
  if (typeof window === 'undefined') {
    return { httpBase: '', wsUrl: '' };
  }
  const envApi = (import.meta.env.VITE_API_URL as string | undefined)?.trim().replace(/\/+$/, '') || '';
  const envWs = (import.meta.env.VITE_WS_URL as string | undefined)?.trim() || '';

  if (envApi) {
    const wsFromApi = envApi.replace(/^http:/i, 'ws:').replace(/^https:/i, 'wss:') + '/ws';
    return { httpBase: envApi, wsUrl: envWs || wsFromApi };
  }

  if (envWs) {
    const httpFromWs = envWs
      .replace(/\/ws\/?$/i, '')
      .replace(/^ws:/i, 'http:')
      .replace(/^wss:/i, 'https:');
    return { httpBase: httpFromWs, wsUrl: envWs };
  }

  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return {
    httpBase: '',
    wsUrl: `${protocol}//${window.location.host}/ws`,
  };
}

export function useRealtimeSync(initialRoomId: string, clientRole: 'driver' | 'pit' = 'driver') {
  const [roomId, setRoomId] = useState<string>(() => {
    if (typeof window === 'undefined') return initialRoomId;
    const urlRoom = new URLSearchParams(window.location.search).get('room');
    const saved = window.localStorage.getItem('sag_active_room_id');
    const chosen = (urlRoom || saved || initialRoomId)
      .toUpperCase()
      .replace(/[^A-Z0-9_-]/g, '')
      .slice(0, 24);
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
  const [transportMode, setTransportMode] = useState<SyncTransportMode>('offline');
  const [remoteLiveTelemetry, setRemoteLiveTelemetry] = useState<LiveTelemetryPayload | null>(null);
  const [latestRemoteCommand, setLatestRemoteCommand] = useState<RemoteRaceCommand | null>(null);
  const [lastSyncTs, setLastSyncTs] = useState<number | null>(null);
  const [reconnectNonce, setReconnectNonce] = useState<number>(0);

  const clientIdRef = useRef<string>(
    `dev-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
  );
  const handledCmdIdsRef = useRef<Set<string>>(new Set());
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const httpPollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pendingQueueRef = useRef<unknown[]>([]);
  const lastHttpLivePushRef = useRef<number>(0);
  const roomRef = useRef<string>(roomId);
  const roleRef = useRef<'driver' | 'pit'>(clientRole);

  roomRef.current = roomId;
  roleRef.current = clientRole;

  const acceptIncomingCommand = useCallback((cmd: RemoteRaceCommand | null | undefined) => {
    if (!cmd || !cmd.id) return;
    if (cmd.senderId === clientIdRef.current) return;
    if (Date.now() - cmd.issuedAt > 15000) return;
    if (handledCmdIdsRef.current.has(cmd.id)) return;
    handledCmdIdsRef.current.add(cmd.id);
    if (handledCmdIdsRef.current.size > 100) {
      const first = handledCmdIdsRef.current.values().next().value;
      if (first) handledCmdIdsRef.current.delete(first);
    }
    setLatestRemoteCommand(cmd);
  }, []);

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

  const mergeRoomState = useCallback(
    (
      state: RoomSyncState,
      pushLocalRun: (run: DragRunRecord) => void
    ) => {
      if (Array.isArray(state.vehicles) && state.vehicles.length > 0) {
        setVehicles(state.vehicles);
      }
      if (Array.isArray(state.runs)) {
        setRuns((prev) => {
          const serverIds = new Set(state.runs.map((r) => r.id));
          const localOnly = prev.filter(
            (r) => r.roomId === state.roomId && !serverIds.has(r.id)
          );
          localOnly.forEach((r) => pushLocalRun(r));
          return [...localOnly, ...state.runs].sort((a, b) => b.createdAt - a.createdAt);
        });
      }
      if (typeof state.clientsCount === 'number') {
        setClientsCount(Math.max(1, state.clientsCount));
      }
      setRemoteLiveTelemetry(state.liveTelemetry ?? null);
      if (state.latestCommand) {
        acceptIncomingCommand(state.latestCommand);
      }
    },
    [acceptIncomingCommand]
  );

  const postRestMutation = useCallback(
    async (
      endpointPath: string,
      method: 'POST' | 'DELETE',
      body?: unknown
    ): Promise<boolean> => {
      try {
        const { httpBase } = resolveSyncEndpoints();
        const res = await fetch(`${httpBase}${endpointPath}`, {
          method,
          headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
          body: body !== undefined ? JSON.stringify(body) : undefined,
        });
        if (res.ok) {
          setLastSyncTs(Date.now());
          return true;
        }
      } catch {
        // ignore network errors; offline cache remains intact
      }
      return false;
    },
    []
  );

  const syncViaHttp = useCallback(async (): Promise<boolean> => {
    try {
      const { httpBase } = resolveSyncEndpoints();
      const targetRoom = roomRef.current;
      const res = await fetch(`${httpBase}/api/rooms/${encodeURIComponent(targetRoom)}`, {
        cache: 'no-store',
      });
      const contentType = res.headers.get('content-type') || '';
      if (!res.ok || !contentType.includes('application/json')) {
        return false;
      }
      const data = (await res.json()) as RoomSyncState;
      if (!data || data.roomId !== targetRoom) return false;

      mergeRoomState(data, (localRun) => {
        void postRestMutation(
          `/api/rooms/${encodeURIComponent(targetRoom)}/runs`,
          'POST',
          localRun
        );
      });
      setLastSyncTs(Date.now());
      if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
        setConnectionState('connected');
        setTransportMode('http');
      }
      return true;
    } catch {
      return false;
    }
  }, [mergeRoomState, postRestMutation]);

  const sendMessage = useCallback(
    (msg: Record<string, unknown>, restFallback?: () => Promise<boolean>) => {
      const ws = wsRef.current;
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(msg));
        return;
      }
      if (restFallback) {
        void restFallback().then((ok) => {
          if (!ok) {
            pendingQueueRef.current.push(msg);
            if (pendingQueueRef.current.length > 50) {
              pendingQueueRef.current.shift();
            }
          }
        });
      } else {
        pendingQueueRef.current.push(msg);
        if (pendingQueueRef.current.length > 50) {
          pendingQueueRef.current.shift();
        }
      }
    },
    []
  );

  useEffect(() => {
    let disposed = false;
    let attempt = 0;

    const { wsUrl } = resolveSyncEndpoints();

    // Immediately load room state via HTTPS REST so data appears right away
    void syncViaHttp().then((ok) => {
      if (!disposed && !ok) {
        setConnectionState('connecting');
      }
    });

    // Polling backup: keeps Pit Wall & remote starter responsive even when WebSocket is blocked
    const pollMs = roleRef.current === 'pit' ? 1200 : 2200;
    httpPollTimerRef.current = setInterval(() => {
      if (disposed) return;
      if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
        void syncViaHttp().then((ok) => {
          if (!disposed && !ok && (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN)) {
            setConnectionState(attempt > 1 ? 'offline' : 'reconnecting');
            setTransportMode('offline');
          }
        });
      }
    }, pollMs);

    const connectWs = () => {
      if (disposed || !wsUrl) return;
      if (!navigator.onLine) {
        setConnectionState('offline');
        setTransportMode('offline');
        return;
      }

      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        if (disposed) {
          ws.close();
          return;
        }
        attempt = 0;
        setConnectionState('connected');
        setTransportMode('ws');
        setLastSyncTs(Date.now());

        ws.send(
          JSON.stringify({
            type: 'room:join',
            roomId: roomRef.current,
            clientRole: roleRef.current,
          })
        );

        while (pendingQueueRef.current.length > 0) {
          const item = pendingQueueRef.current.shift();
          ws.send(JSON.stringify(item));
        }

        if (pingTimerRef.current) clearInterval(pingTimerRef.current);
        pingTimerRef.current = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'ping' }));
          }
        }, 20000);
      };

      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data as string) as Record<string, unknown>;
          const type = msg.type;
          if (type === 'pong') return;
          setLastSyncTs(Date.now());

          if (type === 'room:state') {
            const state = msg as unknown as RoomSyncState;
            mergeRoomState(state, (localRun) => {
              ws.send(JSON.stringify({ type: 'run:create', roomId: state.roomId, run: localRun }));
            });
          } else if (type === 'room:presence') {
            if (typeof msg.clientsCount === 'number') {
              setClientsCount(Math.max(1, msg.clientsCount));
            }
          } else if (type === 'telemetry:live' && msg.payload) {
            setRemoteLiveTelemetry(msg.payload as LiveTelemetryPayload);
          } else if (type === 'race:command' && msg.command) {
            acceptIncomingCommand(msg.command as RemoteRaceCommand);
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
        if (pingTimerRef.current) {
          clearInterval(pingTimerRef.current);
          pingTimerRef.current = null;
        }
        if (disposed) return;

        attempt += 1;
        // Verify whether REST HTTP sync is reachable before marking offline
        void syncViaHttp().then((httpOk) => {
          if (disposed) return;
          if (httpOk) {
            setConnectionState('connected');
            setTransportMode('http');
          } else {
            setConnectionState(attempt >= 2 ? 'offline' : 'reconnecting');
            setTransportMode('offline');
          }
        });

        const delay = Math.min(2000 * Math.pow(1.5, Math.min(attempt, 6)), 15000);
        reconnectTimerRef.current = setTimeout(connectWs, delay);
      };

      ws.onerror = () => {
        ws.close();
      };
    };

    connectWs();

    const handleOnline = () => {
      if (disposed) return;
      attempt = 0;
      void syncViaHttp();
      if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
        if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
        connectWs();
      }
    };

    window.addEventListener('online', handleOnline);

    return () => {
      disposed = true;
      window.removeEventListener('online', handleOnline);
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      if (pingTimerRef.current) clearInterval(pingTimerRef.current);
      if (httpPollTimerRef.current) clearInterval(httpPollTimerRef.current);
      if (wsRef.current) wsRef.current.close();
    };
  }, [roomId, clientRole, reconnectNonce, mergeRoomState, syncViaHttp, acceptIncomingCommand]);

  const reconnectNow = useCallback(() => {
    setConnectionState('connecting');
    void syncViaHttp();
    setReconnectNonce((n) => n + 1);
  }, [syncViaHttp]);

  const changeRoom = useCallback((nextRoomRaw: string) => {
    const cleaned = nextRoomRaw
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9_-]/g, '')
      .slice(0, 24);
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
        return;
      }
      const now = Date.now();
      if (now - lastHttpLivePushRef.current >= 400) {
        lastHttpLivePushRef.current = now;
        void postRestMutation(
          `/api/rooms/${encodeURIComponent(roomRef.current)}/live`,
          'POST',
          payload
        );
      }
    },
    [postRestMutation]
  );

  const saveRun = useCallback(
    (run: DragRunRecord) => {
      setRuns((prev) => (prev.some((r) => r.id === run.id) ? prev : [run, ...prev]));
      const targetRoom = roomRef.current;
      sendMessage(
        { type: 'run:create', roomId: targetRoom, run },
        () => postRestMutation(`/api/rooms/${encodeURIComponent(targetRoom)}/runs`, 'POST', run)
      );
    },
    [sendMessage, postRestMutation]
  );

  const deleteRun = useCallback(
    (runId: string) => {
      setRuns((prev) => prev.filter((r) => r.id !== runId));
      const targetRoom = roomRef.current;
      sendMessage(
        { type: 'run:delete', roomId: targetRoom, runId },
        () =>
          postRestMutation(
            `/api/rooms/${encodeURIComponent(targetRoom)}/runs/${encodeURIComponent(runId)}`,
            'DELETE'
          )
      );
    },
    [sendMessage, postRestMutation]
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
      const targetRoom = roomRef.current;
      sendMessage(
        { type: 'vehicle:upsert', roomId: targetRoom, vehicle },
        () =>
          postRestMutation(
            `/api/rooms/${encodeURIComponent(targetRoom)}/vehicles`,
            'POST',
            vehicle
          )
      );
    },
    [sendMessage, postRestMutation]
  );

  const deleteVehicle = useCallback(
    (vehicleId: string) => {
      setVehicles((prev) => (prev.length <= 1 ? prev : prev.filter((v) => v.id !== vehicleId)));
      const targetRoom = roomRef.current;
      sendMessage(
        { type: 'vehicle:delete', roomId: targetRoom, vehicleId },
        () =>
          postRestMutation(
            `/api/rooms/${encodeURIComponent(targetRoom)}/vehicles/${encodeURIComponent(vehicleId)}`,
            'DELETE'
          )
      );
    },
    [sendMessage, postRestMutation]
  );

  const sendRaceCommand = useCallback(
    async (
      action: RemoteRaceCommand['action'],
      options?: { targetDistance?: RaceDistance; launchMode?: LaunchMode }
    ): Promise<boolean> => {
      const targetRoom = roomRef.current;
      const command: RemoteRaceCommand = {
        id: `cmd-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        roomId: targetRoom,
        senderId: clientIdRef.current,
        action,
        targetDistance: options?.targetDistance,
        launchMode: options?.launchMode,
        issuedAt: Date.now(),
      };
      handledCmdIdsRef.current.add(command.id);

      const ws = wsRef.current;
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'race:command', roomId: targetRoom, command }));
      }
      // Also POST via REST so HTTP-polling devices receive immediately too
      const httpOk = await postRestMutation(
        `/api/rooms/${encodeURIComponent(targetRoom)}/command`,
        'POST',
        command
      );
      return (ws !== null && ws.readyState === WebSocket.OPEN) || httpOk;
    },
    [postRestMutation]
  );

  return {
    roomId,
    changeRoom,
    vehicles,
    runs,
    clientsCount,
    connectionState,
    transportMode,
    remoteLiveTelemetry,
    latestRemoteCommand,
    lastSyncTs,
    reconnectNow,
    sendRaceCommand,
    publishLiveTelemetry,
    saveRun,
    deleteRun,
    upsertVehicle,
    deleteVehicle,
  };
}
