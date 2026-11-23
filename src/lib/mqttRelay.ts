// Lightweight zero-dependency MQTT v3.1.1 over WebSocket client
// Enables real-time telemetry, remote start tree commands, and room sync
// across Vercel static deploys, Capacitor Android APKs, and cross-network phones.

const RELAY_BROKERS = [
  'wss://broker.emqx.io:8084/mqtt',
  'wss://broker.hivemq.com:8884/mqtt',
];

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function encodeUtf8String(str: string): Uint8Array<ArrayBuffer> {
  const bytes = encoder.encode(str);
  const out = new Uint8Array(new ArrayBuffer(2 + bytes.length));
  out[0] = (bytes.length >> 8) & 0xff;
  out[1] = bytes.length & 0xff;
  out.set(bytes, 2);
  return out;
}

function encodeRemainingLength(len: number): Uint8Array<ArrayBuffer> {
  const bytes: number[] = [];
  let n = len;
  do {
    let digit = n % 128;
    n = Math.floor(n / 128);
    if (n > 0) digit |= 0x80;
    bytes.push(digit);
  } while (n > 0);
  const out = new Uint8Array(new ArrayBuffer(bytes.length));
  out.set(bytes);
  return out;
}

function buildPacket(headerByte: number, bodyChunks: Uint8Array[]): Uint8Array<ArrayBuffer> {
  const bodyLen = bodyChunks.reduce((sum, c) => sum + c.length, 0);
  const remBytes = encodeRemainingLength(bodyLen);
  const packet = new Uint8Array(new ArrayBuffer(1 + remBytes.length + bodyLen));
  packet[0] = headerByte;
  packet.set(remBytes, 1);
  let offset = 1 + remBytes.length;
  for (const chunk of bodyChunks) {
    packet.set(chunk, offset);
    offset += chunk.length;
  }
  return packet;
}

export function buildConnectPacket(clientId: string): Uint8Array<ArrayBuffer> {
  const protoName = encodeUtf8String('MQTT');
  const flags = new Uint8Array([0x04, 0x02, 0x00, 20]); // Level 4 (3.1.1), Clean Session, KeepAlive 20s
  const clientBytes = encodeUtf8String(clientId);
  return buildPacket(0x10, [protoName, flags, clientBytes]);
}

export function buildSubscribePacket(packetId: number, topicFilter: string): Uint8Array<ArrayBuffer> {
  const pid = new Uint8Array([(packetId >> 8) & 0xff, packetId & 0xff]);
  const filterBytes = encodeUtf8String(topicFilter);
  const qosByte = new Uint8Array([0x00]);
  return buildPacket(0x82, [pid, filterBytes, qosByte]);
}

export function buildPublishPacket(
  topic: string,
  payload: string,
  retain = false
): Uint8Array<ArrayBuffer> {
  const topicBytes = encodeUtf8String(topic);
  const payloadBytes = encoder.encode(payload);
  const headerByte = 0x30 | (retain ? 0x01 : 0x00);
  return buildPacket(headerByte, [topicBytes, payloadBytes]);
}

export interface MqttRelayHandlers {
  clientId: string;
  topicPrefix: string;
  onConnected: () => void;
  onDisconnected: () => void;
  onMessage: (topic: string, payload: string) => void;
}

export class MqttWsRelay {
  private handlers: MqttRelayHandlers;
  private ws: WebSocket | null = null;
  private rxBuf: Uint8Array = new Uint8Array(0);
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private connectTimeout: ReturnType<typeof setTimeout> | null = null;
  private disposed = false;
  private connected = false;
  private attempt = 0;
  private nextPacketId = 1;

  constructor(handlers: MqttRelayHandlers) {
    this.handlers = handlers;
  }

  public isConnected(): boolean {
    return this.connected && this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }

  public start(): void {
    this.disposed = false;
    this.connect();
  }

  public reconnect(): void {
    this.cleanupSocket();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.attempt = 0;
    if (!this.disposed) {
      this.connect();
    }
  }

  public stop(): void {
    this.disposed = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.isConnected()) {
      try {
        const disc = new Uint8Array(new ArrayBuffer(2));
        disc[0] = 0xe0;
        disc[1] = 0x00;
        this.ws?.send(disc);
      } catch {
        // ignore
      }
    }
    this.cleanupSocket();
  }

  public publish(subtopic: string, data: unknown, retain = false): boolean {
    if (!this.isConnected() || !this.ws) return false;
    try {
      const topic = `${this.handlers.topicPrefix}/${subtopic}`;
      const json = typeof data === 'string' ? data : JSON.stringify(data);
      this.ws.send(buildPublishPacket(topic, json, retain));
      return true;
    } catch {
      return false;
    }
  }

  private cleanupSocket(): void {
    this.connected = false;
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
    if (this.connectTimeout) {
      clearTimeout(this.connectTimeout);
      this.connectTimeout = null;
    }
    if (this.ws) {
      const old = this.ws;
      this.ws = null;
      old.onopen = null;
      old.onmessage = null;
      old.onerror = null;
      old.onclose = null;
      try {
        old.close();
      } catch {
        // ignore
      }
    }
    this.rxBuf = new Uint8Array(0);
  }

  private connect(): void {
    if (this.disposed) return;
    this.cleanupSocket();

    const url = RELAY_BROKERS[this.attempt % RELAY_BROKERS.length];
    let ws: WebSocket;
    try {
      ws = new WebSocket(url, ['mqtt']);
    } catch {
      this.scheduleReconnect();
      return;
    }
    ws.binaryType = 'arraybuffer';
    this.ws = ws;

    this.connectTimeout = setTimeout(() => {
      if (!this.connected && this.ws === ws) {
        this.cleanupSocket();
        this.scheduleReconnect();
      }
    }, 6000);

    ws.onopen = () => {
      if (this.disposed || this.ws !== ws) return;
      try {
        ws.send(buildConnectPacket(`sag-${this.handlers.clientId}`));
      } catch {
        this.cleanupSocket();
        this.scheduleReconnect();
      }
    };

    ws.onmessage = (ev) => {
      if (this.disposed || this.ws !== ws) return;
      if (!(ev.data instanceof ArrayBuffer)) return;
      const chunk = new Uint8Array(ev.data);
      const merged = new Uint8Array(this.rxBuf.length + chunk.length);
      merged.set(this.rxBuf, 0);
      merged.set(chunk, this.rxBuf.length);
      this.rxBuf = merged;
      this.processRxBuffer();
    };

    ws.onerror = () => {
      // onclose will handle cleanup and reconnect
    };

    ws.onclose = () => {
      if (this.ws !== ws) return;
      const wasConnected = this.connected;
      this.cleanupSocket();
      if (wasConnected) {
        this.handlers.onDisconnected();
      }
      if (!this.disposed) {
        this.scheduleReconnect();
      }
    };
  }

  private scheduleReconnect(): void {
    if (this.disposed || this.reconnectTimer) return;
    this.attempt += 1;
    const delay = Math.min(1200 * Math.pow(1.4, Math.min(this.attempt, 5)), 8000);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }

  private processRxBuffer(): void {
    while (this.rxBuf.length >= 2) {
      const byte0 = this.rxBuf[0];
      let multiplier = 1;
      let remLen = 0;
      let idx = 1;
      let completeVarint = false;

      while (idx < this.rxBuf.length && idx <= 4) {
        const encodedByte = this.rxBuf[idx];
        remLen += (encodedByte & 0x7f) * multiplier;
        idx += 1;
        if ((encodedByte & 0x80) === 0) {
          completeVarint = true;
          break;
        }
        multiplier *= 128;
      }

      if (!completeVarint) break;
      const totalLen = idx + remLen;
      if (this.rxBuf.length < totalLen) break;

      const body = this.rxBuf.subarray(idx, totalLen);
      this.rxBuf = this.rxBuf.subarray(totalLen);

      const packetType = (byte0 >> 4) & 0x0f;
      if (packetType === 2) {
        // CONNACK
        const returnCode = body.length >= 2 ? body[1] : 1;
        if (returnCode === 0 && this.ws) {
          if (this.connectTimeout) {
            clearTimeout(this.connectTimeout);
            this.connectTimeout = null;
          }
          this.connected = true;
          this.attempt = 0;
          const pid = this.nextPacketId++;
          if (this.nextPacketId > 65000) this.nextPacketId = 1;
          this.ws.send(buildSubscribePacket(pid, `${this.handlers.topicPrefix}/#`));

          if (this.pingTimer) clearInterval(this.pingTimer);
          this.pingTimer = setInterval(() => {
            if (this.isConnected() && this.ws) {
              try {
                const ping = new Uint8Array(new ArrayBuffer(2));
                ping[0] = 0xc0;
                ping[1] = 0x00;
                this.ws.send(ping);
              } catch {
                // ignore
              }
            }
          }, 15000);

          this.handlers.onConnected();
        }
      } else if (packetType === 3) {
        // PUBLISH
        if (body.length < 2) continue;
        const topicLen = (body[0] << 8) | body[1];
        if (2 + topicLen > body.length) continue;
        const topic = decoder.decode(body.subarray(2, 2 + topicLen));
        const qos = (byte0 >> 1) & 0x03;
        const payloadStart = 2 + topicLen + (qos > 0 ? 2 : 0);
        if (payloadStart > body.length) continue;
        const payload = decoder.decode(body.subarray(payloadStart));
        this.handlers.onMessage(topic, payload);
      }
    }
  }
}
