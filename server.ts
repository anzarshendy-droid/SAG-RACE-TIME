import express from 'express';
import fs from 'fs';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { WebSocketServer, WebSocket } from 'ws';
import type {
  DragRunRecord,
  LiveTelemetryPayload,
  VehicleProfile,
} from './src/types/telemetry.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;
const IS_PROD = process.env.NODE_ENV === 'production';
const DATA_DIR = path.resolve(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'sync-rooms.json');

interface StoredRoom {
  roomId: string;
  vehicles: VehicleProfile[];
  runs: DragRunRecord[];
  updatedAt: number;
}

interface ClientMeta {
  ws: WebSocket;
  roomId: string;
  clientRole: 'driver' | 'pit';
}

const DEFAULT_VEHICLE: VehicleProfile = {
  id: 'veh-default-01',
  name: 'Unit Utama SAG',
  category: 'Motor 2-Tak',
  weightKg: 165,
  powerSpec: '155cc Tune Up',
  tireSpec: 'Drag Slick 60/80-17',
  notes: 'Setup standar lintasan 201m / 402m',
  updatedAt: Date.now(),
};

const rooms = new Map<string, StoredRoom>();
const liveByRoom = new Map<string, LiveTelemetryPayload>();
const clientsByRoom = new Map<string, Set<ClientMeta>>();

function sanitizeRoomId(raw: unknown): string {
  if (typeof raw !== 'string') return 'SAG-01';
  const cleaned = raw.trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '').slice(0, 24);
  return cleaned || 'SAG-01';
}

function loadRoomsFromDisk(): void {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (fs.existsSync(DATA_FILE)) {
      const raw = fs.readFileSync(DATA_FILE, 'utf-8');
      const parsed = JSON.parse(raw) as Record<string, StoredRoom>;
      for (const [id, room] of Object.entries(parsed)) {
        if (room && typeof room.roomId === 'string') {
          rooms.set(id, {
            roomId: room.roomId,
            vehicles: Array.isArray(room.vehicles) ? room.vehicles : [{ ...DEFAULT_VEHICLE }],
            runs: Array.isArray(room.runs) ? room.runs : [],
            updatedAt: typeof room.updatedAt === 'number' ? room.updatedAt : Date.now(),
          });
        }
      }
    }
  } catch (err) {
    console.error('Failed to load sync rooms:', err);
  }
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;
function scheduleSave(): void {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      const obj: Record<string, StoredRoom> = {};
      for (const [id, room] of rooms.entries()) {
        obj[id] = room;
      }
      fs.writeFileSync(DATA_FILE, JSON.stringify(obj, null, 2), 'utf-8');
    } catch (err) {
      console.error('Failed to persist sync rooms:', err);
    }
  }, 400);
}

function getOrCreateRoom(roomId: string): StoredRoom {
  const id = sanitizeRoomId(roomId);
  let room = rooms.get(id);
  if (!room) {
    room = {
      roomId: id,
      vehicles: [{ ...DEFAULT_VEHICLE, updatedAt: Date.now() }],
      runs: [],
      updatedAt: Date.now(),
    };
    rooms.set(id, room);
    scheduleSave();
  }
  return room;
}

function broadcastToRoom(roomId: string, message: unknown, excludeWs?: WebSocket): void {
  const set = clientsByRoom.get(roomId);
  if (!set) return;
  const serialized = JSON.stringify(message);
  for (const client of set) {
    if (client.ws !== excludeWs && client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(serialized);
    }
  }
}

function broadcastPresence(roomId: string): void {
  const count = clientsByRoom.get(roomId)?.size ?? 0;
  broadcastToRoom(roomId, {
    type: 'room:presence',
    roomId,
    clientsCount: count,
  });
}

async function startServer(): Promise<void> {
  loadRoomsFromDisk();

  const app = express();
  app.use(express.json({ limit: '2mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, rooms: rooms.size });
  });

  app.get('/api/rooms/:roomId', (req, res) => {
    const roomId = sanitizeRoomId(req.params.roomId);
    const room = getOrCreateRoom(roomId);
    res.json({
      roomId: room.roomId,
      vehicles: room.vehicles,
      runs: room.runs,
      clientsCount: clientsByRoom.get(room.roomId)?.size ?? 0,
      liveTelemetry: liveByRoom.get(room.roomId) ?? null,
    });
  });

  const server = http.createServer(app);
  const wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (ws) => {
    let meta: ClientMeta | null = null;

    const detachClient = (): void => {
      if (!meta) return;
      const set = clientsByRoom.get(meta.roomId);
      if (set) {
        set.delete(meta);
        if (set.size === 0) {
          clientsByRoom.delete(meta.roomId);
        } else {
          broadcastPresence(meta.roomId);
        }
      }
      meta = null;
    };

    ws.on('message', (raw) => {
      let msg: Record<string, unknown>;
      try {
        msg = JSON.parse(raw.toString()) as Record<string, unknown>;
      } catch {
        return;
      }

      const type = msg.type;
      if (type === 'room:join') {
        const roomId = sanitizeRoomId(msg.roomId);
        const clientRole = msg.clientRole === 'pit' ? 'pit' : 'driver';
        detachClient();
        const room = getOrCreateRoom(roomId);
        meta = { ws, roomId, clientRole };
        let set = clientsByRoom.get(roomId);
        if (!set) {
          set = new Set();
          clientsByRoom.set(roomId, set);
        }
        set.add(meta);

        ws.send(
          JSON.stringify({
            type: 'room:state',
            roomId,
            vehicles: room.vehicles,
            runs: room.runs,
            clientsCount: set.size,
            liveTelemetry: liveByRoom.get(roomId) ?? null,
          })
        );
        broadcastPresence(roomId);
        return;
      }

      const roomId = sanitizeRoomId(msg.roomId ?? meta?.roomId);
      const room = getOrCreateRoom(roomId);

      if (type === 'telemetry:live' && msg.payload && typeof msg.payload === 'object') {
        const payload = msg.payload as LiveTelemetryPayload;
        liveByRoom.set(roomId, payload);
        broadcastToRoom(roomId, { type: 'telemetry:live', payload }, ws);
        return;
      }

      if (type === 'run:create' && msg.run && typeof msg.run === 'object') {
        const run = msg.run as DragRunRecord;
        if (!run.id || typeof run.etSec !== 'number') return;
        const exists = room.runs.some((r) => r.id === run.id);
        if (!exists) {
          room.runs.unshift({ ...run, roomId });
          if (room.runs.length > 200) {
            room.runs = room.runs.slice(0, 200);
          }
          room.updatedAt = Date.now();
          scheduleSave();
          broadcastToRoom(roomId, { type: 'run:created', run: { ...run, roomId } });
        }
        return;
      }

      if (type === 'run:delete' && typeof msg.runId === 'string') {
        const prevLen = room.runs.length;
        room.runs = room.runs.filter((r) => r.id !== msg.runId);
        if (room.runs.length !== prevLen) {
          room.updatedAt = Date.now();
          scheduleSave();
          broadcastToRoom(roomId, { type: 'run:deleted', runId: msg.runId });
        }
        return;
      }

      if (type === 'vehicle:upsert' && msg.vehicle && typeof msg.vehicle === 'object') {
        const vehicle = msg.vehicle as VehicleProfile;
        if (!vehicle.id || !vehicle.name) return;
        const idx = room.vehicles.findIndex((v) => v.id === vehicle.id);
        const normalized: VehicleProfile = {
          ...vehicle,
          updatedAt: Date.now(),
        };
        if (idx >= 0) {
          room.vehicles[idx] = normalized;
        } else {
          room.vehicles.push(normalized);
        }
        room.updatedAt = Date.now();
        scheduleSave();
        broadcastToRoom(roomId, { type: 'vehicle:upserted', vehicle: normalized });
        return;
      }

      if (type === 'vehicle:delete' && typeof msg.vehicleId === 'string') {
        if (room.vehicles.length <= 1) return;
        const prevLen = room.vehicles.length;
        room.vehicles = room.vehicles.filter((v) => v.id !== msg.vehicleId);
        if (room.vehicles.length !== prevLen) {
          room.updatedAt = Date.now();
          scheduleSave();
          broadcastToRoom(roomId, { type: 'vehicle:deleted', vehicleId: msg.vehicleId });
        }
      }
    });

    ws.on('close', detachClient);
    ws.on('error', detachClient);
  });

  if (!IS_PROD) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: process.env.DISABLE_HMR !== 'true',
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`SAG Race Time server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Fatal server error:', err);
  process.exit(1);
});
