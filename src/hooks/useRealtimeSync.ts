import { useCallback, useEffect, useRef, useState } from 'react';
import { MqttWsRelay } from '../lib/mqttRelay';
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
export type SyncTransportMode = 'ws' | 'relay' | 'http' | 'offline';

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

  const isLocalHost =
    window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
  if (window.location.protocol === 'capacitor:' || (isLocalHost && !window.location.port)) {
    return { httpBase: '', wsUrl: '' };
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
  const relayRef = useRef<MqttWsRelay | null>(null);
  const bcRef = useRef<BroadcastChannel | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const httpPollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const presenceTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pendingQueueRef = useRef<unknown[]>([]);
  const lastHttpLivePushRef = useRef<number>(0);
  const lastRelayLivePushRef = useRef<number>(0);
  const httpOkRef = useRef<boolean>(false);
  const serverClientsCountRef = useRef<number>(1);
  const relayPeersRef = useRef<Map<string, number>>(new Map());

  const roomRef = useRef<string>(roomId);
  const roleRef = useRef<'driver' | 'pit'>(clientRole);
  const runsRef = useRef<DragRunRecord[]>(runs);
  const vehiclesRef = useRef<VehicleProfile[]>(vehicles);

  roomRef.current = roomId;
  roleRef.current = clientRole;
  runsRef.current = runs;
  vehiclesRef.current = vehicles;

  const updateClientsCount = useCallback(() => {
    const now = Date.now();
    for (const [id, ts] of relayPeersRef.current.entries()) {
      if (now - ts > 18000) {
        relayPeersRef.current.delete(id);
      }
    }
    const relayTotal = relayPeersRef.current.size + 1;
    setClientsCount(Math.max(1, serverClientsCountRef.current, relayTotal));
  }, []);

  const recomputeConnectionStatus = useCallback((attempt = 0) => {
    const wsOpen = wsRef.current !== null && wsRef.current.readyState === WebSocket.OPEN;
    const relayOpen = relayRef.current !== null && relayRef.current.isConnected();

    if (wsOpen) {
      setConnectionState('connected');
      setTransportMode('ws');
      return;
    }
    if (relayOpen) {
      setConnectionState('connected');
      setTransportMode('relay');
      return;
    }
    if (httpOkRef.current) {
      setConnectionState('connected');
      setTransportMode('http');
      return;
    }
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      setConnectionState('offline');
      setTransportMode('offline');
      return;
    }
    setConnectionState(attempt >= 2 ? 'offline' : 'reconnecting');
    setTransportMode('offline');
  }, []);

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
    (state: RoomSyncState, pushLocalRun: (run: DragRunRecord) => void) => {
      if (Array.isArray(state.vehicles) && state.vehicles.length > 0) {
        setVehicles((prev) => {
          const map = new Map<string, VehicleProfile>();
          prev.forEach((v) => map.set(v.id, v));
          state.vehicles.forEach((v) => {
            const existing = map.get(v.id);
            if (!existing || v.updatedAt >= existing.updatedAt) {
              map.set(v.id, v);
            }
          });
          return Array.from(map.values());
        });
      }
      if (Array.isArray(state.runs)) {
        setRuns((prev) => {
          const serverIds = new Set(state.runs.map((r) => r.id));
          const localOnly = prev.filter(
            (r) => r.roomId === state.roomId && !serverIds.has(r.id)
          );
          localOnly.forEach((r) => pushLocalRun(r));
          const mergedMap = new Map<string, DragRunRecord>();
          [...localOnly, ...state.runs].forEach((r) => mergedMap.set(r.id, r));
          return Array.from(mergedMap.values()).sort((a, b) => b.createdAt - a.createdAt);
        });
      }
      if (typeof state.clientsCount === 'number') {
        serverClientsCountRef.current = Math.max(1, state.clientsCount);
        updateClientsCount();
      }
      if (state.liveTelemetry) {
        setRemoteLiveTelemetry(state.liveTelemetry);
      }
      if (state.latestCommand) {
        acceptIncomingCommand(state.latestCommand);
      }
    },
    [acceptIncomingCommand, updateClientsCount]
  );

  const postRestMutation = useCallback(
    async (
      endpointPath: string,
      method: 'POST' | 'DELETE',
      body?: unknown
    ): Promise<boolean> => {
      try {
        const { httpBase } = resolveSyncEndpoints();
        if (!httpBase && typeof window !== 'undefined' && window.location.protocol === 'capacitor:') {
          return false;
        }
        const res = await fetch(`${httpBase}${endpointPath}`, {
          method,
          headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
          body: body !== undefined ? JSON.stringify(body) : undefined,
        });
        const contentType = res.headers.get('content-type') || '';
        if (res.ok && contentType.includes('application/json')) {
          httpOkRef.current = true;
          setLastSyncTs(Date.now());
          return true;
        }
      } catch {
        // ignore network errors; relay & offline cache remain active
      }
      return false;
    },
    []
  );

  const syncViaHttp = useCallback(async (): Promise<boolean> => {
    try {
      const { httpBase } = resolveSyncEndpoints();
      if (!httpBase && typeof window !== 'undefined' && window.location.protocol === 'capacitor:') {
        httpOkRef.current = false;
        return false;
      }
      const targetRoom = roomRef.current;
      const res = await fetch(`${httpBase}/api/rooms/${encodeURIComponent(targetRoom)}`, {
        cache: 'no-store',
      });
      const contentType = res.headers.get('content-type') || '';
      if (!res.ok || !contentType.includes('application/json')) {
        httpOkRef.current = false;
        return false;
      }
      const data = (await res.json()) as RoomSyncState;
      if (!data || data.roomId !== targetRoom) {
        httpOkRef.current = false;
        return false;
      }

      httpOkRef.current = true;
      mergeRoomState(data, (localRun) => {
        void postRestMutation(
          `/api/rooms/${encodeURIComponent(targetRoom)}/runs`,
          'POST',
          localRun
        );
      });
      setLastSyncTs(Date.now());
      recomputeConnectionStatus(0);
      return true;
    } catch {
      httpOkRef.current = false;
      return false;
    }
  }, [mergeRoomState, postRestMutation, recomputeConnectionStatus]);

  const sendMessage = useCallback(
    (msg: Record<string, unknown>, restFallback?: () => Promise<boolean>) => {
      const ws = wsRef.current;
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(msg));
      } else if (restFallback) {
        void restFallback().then((ok) => {
          if (!ok && (!relayRef.current || !relayRef.current.isConnected())) {
            pendingQueueRef.current.push(msg);
            if (pendingQueueRef.current.length > 50) {
              pendingQueueRef.current.shift();
            }
          }
        });
      } else if (!relayRef.current || !relayRef.current.isConnected()) {
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
    relayPeersRef.current.clear();
    serverClientsCountRef.current = 1;
    httpOkRef.current = false;

    const { wsUrl } = resolveSyncEndpoints();
    const currentRoom = roomId;

    const handleInboundSyncEvent = (subtopic: string, rawPayload: string) => {
      try {
        const data = JSON.parse(rawPayload) as Record<string, unknown>;
        if (!data || data.senderId === clientIdRef.current) return;
        const senderId = typeof data.senderId === 'string' ? data.senderId : '';

        if (subtopic === 'presence') {
          if (senderId) {
            if (data.leaving) {
              relayPeersRef.current.delete(senderId);
            } else {
              relayPeersRef.current.set(senderId, Date.now());
            }
            updateClientsCount();
          }
          return;
        }

        if (senderId) {
          relayPeersRef.current.set(senderId, Date.now());
          updateClientsCount();
        }
        setLastSyncTs(Date.now());

        if (subtopic === 'live' && data.payload) {
          setRemoteLiveTelemetry(data.payload as LiveTelemetryPayload);
        } else if (subtopic === 'cmd' && data.command) {
          acceptIncomingCommand(data.command as RemoteRaceCommand);
        } else if (subtopic === 'run/create' && data.run) {
          const incoming = data.run as DragRunRecord;
          setRuns((prev) => (prev.some((r) => r.id === incoming.id) ? prev : [incoming, ...prev]));
        } else if (subtopic === 'run/delete' && typeof data.runId === 'string') {
          setRuns((prev) => prev.filter((r) => r.id !== data.runId));
        } else if (subtopic === 'vehicle/upsert' && data.vehicle) {
          const v = data.vehicle as VehicleProfile;
          setVehicles((prev) => {
            const idx = prev.findIndex((item) => item.id === v.id);
            if (idx >= 0) {
              const next = [...prev];
              next[idx] = v;
              return next;
            }
            return [...prev, v];
          });
        } else if (subtopic === 'vehicle/delete' && typeof data.vehicleId === 'string') {
          setVehicles((prev) => prev.filter((v) => v.id !== data.vehicleId));
        } else if (subtopic === 'sync/req') {
          relayRef.current?.publish('sync/res', {
            senderId: clientIdRef.current,
            runs: runsRef.current.filter((r) => r.roomId === roomRef.current).slice(0, 60),
            vehicles: vehiclesRef.current,
          });
        } else if (subtopic === 'sync/res') {
          const incomingRuns = Array.isArray(data.runs) ? (data.runs as DragRunRecord[]) : [];
          const incomingVehicles = Array.isArray(data.vehicles)
            ? (data.vehicles as VehicleProfile[])
            : [];
          if (incomingVehicles.length > 0) {
            setVehicles((prev) => {
              const map = new Map<string, VehicleProfile>();
              prev.forEach((v) => map.set(v.id, v));
              incomingVehicles.forEach((v) => {
                const ex = map.get(v.id);
                if (!ex || v.updatedAt > ex.updatedAt) map.set(v.id, v);
              });
              return Array.from(map.values());
            });
          }
          if (incomingRuns.length > 0) {
            setRuns((prev) => {
              const map = new Map<string, DragRunRecord>();
              prev.forEach((r) => map.set(r.id, r));
              incomingRuns.forEach((r) => map.set(r.id, r));
              return Array.from(map.values()).sort((a, b) => b.createdAt - a.createdAt);
            });
          }
        }
      } catch {
        // ignore malformed packets
      }
    };

    // 1. BroadcastChannel for instant multi-tab sync on the same device
    const bc =
      typeof BroadcastChannel !== 'undefined'
        ? new BroadcastChannel(`sag_sync_${currentRoom}`)
        : null;
    bcRef.current = bc;
    if (bc) {
      bc.onmessage = (ev) => {
        if (disposed || !ev.data || typeof ev.data !== 'object') return;
        const { subtopic, payload } = ev.data as { subtopic?: string; payload?: string };
        if (subtopic && payload) {
          handleInboundSyncEvent(subtopic, payload);
        }
      };
    }

    // 2. Universal Cloud WebSocket Relay (works on Vercel, Android APK, and cross-network phones)
    const topicPrefix = `sag-racetime/v2/${currentRoom}`;
    const relay = new MqttWsRelay({
      clientId: `${clientIdRef.current}-${currentRoom}`,
      topicPrefix,
      onConnected: () => {
        if (disposed) return;
        setLastSyncTs(Date.now());
        recomputeConnectionStatus(attempt);
        relay.publish('presence', {
          senderId: clientIdRef.current,
          role: roleRef.current,
          ts: Date.now(),
        });
        relay.publish('sync/req', { senderId: clientIdRef.current });
      },
      onDisconnected: () => {
        if (disposed) return;
        recomputeConnectionStatus(attempt);
      },
      onMessage: (topic, payload) => {
        if (disposed) return;
        const subtopic = topic.startsWith(`${topicPrefix}/`)
          ? topic.slice(topicPrefix.length + 1)
          : topic;
        handleInboundSyncEvent(subtopic, payload);
      },
    });
    relayRef.current = relay;
    relay.start();

    presenceTimerRef.current = setInterval(() => {
      if (disposed) return;
      if (relay.isConnected()) {
        relay.publish('presence', {
          senderId: clientIdRef.current,
          role: roleRef.current,
          ts: Date.now(),
        });
      }
      updateClientsCount();
    }, 7000);

    // 3. Same-origin HTTP REST state check (when backed by Express server)
    void syncViaHttp().then(() => {
      if (!disposed) {
        recomputeConnectionStatus(attempt);
      }
    });

    const pollMs = roleRef.current === 'pit' ? 1400 : 2500;
    httpPollTimerRef.current = setInterval(() => {
      if (disposed) return;
      if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
        void syncViaHttp().then((ok) => {
          if (!disposed && !ok) {
            recomputeConnectionStatus(attempt);
          }
        });
      }
    }, pollMs);

    // 4. Same-origin Server WebSocket (/ws)
    const connectWs = () => {
      if (disposed || !wsUrl) return;
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        recomputeConnectionStatus(attempt);
        reconnectTimerRef.current = setTimeout(connectWs, 3000);
        return;
      }

      let ws: WebSocket;
      try {
        ws = new WebSocket(wsUrl);
      } catch {
        return;
      }
      wsRef.current = ws;

      ws.onopen = () => {
        if (disposed) {
          ws.close();
          return;
        }
        attempt = 0;
        setLastSyncTs(Date.now());
        recomputeConnectionStatus(0);

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
              serverClientsCountRef.current = Math.max(1, msg.clientsCount);
              updateClientsCount();
            }
          } else if (type === 'telemetry:live' && msg.payload) {
            setRemoteLiveTelemetry(msg.payload as LiveTelemetryPayload);
          } else if (type === 'race:command' && msg.command) {
            acceptIncomingCommand(msg.command as RemoteRaceCommand);
          } else if (type === 'run:created' && msg.run) {
            const incoming = msg.run as DragRunRecord;
            setRuns((prev) => (prev.some((r) => r.id === incoming.id) ? prev : [incoming, ...prev]));
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
        void syncViaHttp().then(() => {
          if (!disposed) {
            recomputeConnectionStatus(attempt);
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
      relay.reconnect();
      if (wsUrl && (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN)) {
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
      if (presenceTimerRef.current) clearInterval(presenceTimerRef.current);
      if (wsRef.current) wsRef.current.close();
      if (relay.isConnected()) {
        relay.publish('presence', {
          senderId: clientIdRef.current,
          leaving: true,
        });
      }
      relay.stop();
      relayRef.current = null;
      if (bc) {
        bc.close();
        bcRef.current = null;
      }
    };
  }, [
    roomId,
    clientRole,
    reconnectNonce,
    mergeRoomState,
    syncViaHttp,
    acceptIncomingCommand,
    recomputeConnectionStatus,
    updateClientsCount,
  ]);

  const publishRelayAndBc = useCallback((subtopic: string, data: Record<string, unknown>) => {
    const body = { ...data, senderId: clientIdRef.current };
    const serialized = JSON.stringify(body);
    relayRef.current?.publish(subtopic, serialized);
    try {
      bcRef.current?.postMessage({ subtopic, payload: serialized });
    } catch {
      // ignore
    }
  }, []);

  const reconnectNow = useCallback(() => {
    setConnectionState('connecting');
    void syncViaHttp();
    relayRef.current?.reconnect();
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
      }

      const now = Date.now();
      if (now - lastRelayLivePushRef.current >= 120) {
        lastRelayLivePushRef.current = now;
        publishRelayAndBc('live', { payload });
      }

      if (!ws || ws.readyState !== WebSocket.OPEN) {
        if (httpOkRef.current && now - lastHttpLivePushRef.current >= 400) {
          lastHttpLivePushRef.current = now;
          void postRestMutation(
            `/api/rooms/${encodeURIComponent(roomRef.current)}/live`,
            'POST',
            payload
          );
        }
      }
    },
    [postRestMutation, publishRelayAndBc]
  );

  const saveRun = useCallback(
    (run: DragRunRecord) => {
      setRuns((prev) => (prev.some((r) => r.id === run.id) ? prev : [run, ...prev]));
      const targetRoom = roomRef.current;
      publishRelayAndBc('run/create', { run });
      sendMessage(
        { type: 'run:create', roomId: targetRoom, run },
        () => postRestMutation(`/api/rooms/${encodeURIComponent(targetRoom)}/runs`, 'POST', run)
      );
    },
    [sendMessage, postRestMutation, publishRelayAndBc]
  );

  const deleteRun = useCallback(
    (runId: string) => {
      setRuns((prev) => prev.filter((r) => r.id !== runId));
      const targetRoom = roomRef.current;
      publishRelayAndBc('run/delete', { runId });
      sendMessage(
        { type: 'run:delete', roomId: targetRoom, runId },
        () =>
          postRestMutation(
            `/api/rooms/${encodeURIComponent(targetRoom)}/runs/${encodeURIComponent(runId)}`,
            'DELETE'
          )
      );
    },
    [sendMessage, postRestMutation, publishRelayAndBc]
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
      publishRelayAndBc('vehicle/upsert', { vehicle });
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
    [sendMessage, postRestMutation, publishRelayAndBc]
  );

  const deleteVehicle = useCallback(
    (vehicleId: string) => {
      setVehicles((prev) => (prev.length <= 1 ? prev : prev.filter((v) => v.id !== vehicleId)));
      const targetRoom = roomRef.current;
      publishRelayAndBc('vehicle/delete', { vehicleId });
      sendMessage(
        { type: 'vehicle:delete', roomId: targetRoom, vehicleId },
        () =>
          postRestMutation(
            `/api/rooms/${encodeURIComponent(targetRoom)}/vehicles/${encodeURIComponent(vehicleId)}`,
            'DELETE'
          )
      );
    },
    [sendMessage, postRestMutation, publishRelayAndBc]
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
      const wsOpen = ws !== null && ws.readyState === WebSocket.OPEN;
      if (wsOpen) {
        ws.send(JSON.stringify({ type: 'race:command', roomId: targetRoom, command }));
      }

      publishRelayAndBc('cmd', { command });
      const relayOpen = relayRef.current?.isConnected() ?? false;

      const httpOk = httpOkRef.current
        ? await postRestMutation(
            `/api/rooms/${encodeURIComponent(targetRoom)}/command`,
            'POST',
            command
          )
        : false;
      return wsOpen || relayOpen || httpOk;
    },
    [postRestMutation, publishRelayAndBc]
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
