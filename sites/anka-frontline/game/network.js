/**
 * Real WebRTC room transport. PeerJS Cloud is used only for signaling; game
 * messages travel over PeerJS DataConnections. No AI or local-network fallback.
 * The public signaling service and a player's NAT may prevent a connection.
 */
const PROTOCOL = 1;
const LABEL = 'anka-game-v1';
const MAX_PLAYERS = 4;
const CONNECTION_TIMEOUT = 30_000;
const ICE_DISCONNECT_TIMEOUT = 10_000;
const MAX_PAYLOAD_BYTES = 48 * 1024;
const MAX_WIRE_BYTES = 64 * 1024;
const MAX_BUFFERED_BYTES = 256 * 1024;
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
let peerConstructorPromise;

async function loadPeer() {
  if (!peerConstructorPromise) {
    peerConstructorPromise = import('peerjs').then(module => {
      const Peer = module.Peer || module.default?.Peer || module.default;
      if (typeof Peer !== 'function') throw new Error('PeerJS 模块没有可用的 Peer 构造函数。');
      return Peer;
    }).catch(error => {
      peerConstructorPromise = undefined;
      throw error;
    });
  }
  return peerConstructorPromise;
}

function networkError(message, code = 'network') {
  const error = new Error(message);
  error.code = code;
  return error;
}

function randomCode(length = 6) {
  if (!globalThis.crypto?.getRandomValues) throw networkError('浏览器缺少安全随机数支持，请使用较新的浏览器。', 'browser-incompatible');
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, byte => CODE_ALPHABET[byte % CODE_ALPHABET.length]).join('');
}

function normalizeCode(code) {
  const normalized = String(code ?? '').trim().toUpperCase().replace(/^ANKA-/, '');
  if (!/^[A-Z0-9]{6}$/.test(normalized)) throw networkError('请输入六位房间码，例如 ABC234。', 'invalid-room-code');
  return normalized;
}

function normalizeMode(mode) {
  const result = String(mode ?? 'coop').trim().toLowerCase();
  if (!/^[a-z0-9_-]{1,24}$/.test(result)) throw networkError('无效的联机模式。', 'invalid-mode');
  return result;
}

function peerMessage(error) {
  const type = error?.type || error?.code || 'network';
  const messages = {
    'peer-unavailable': '找不到这个房间。请检查房间码，并确认房主仍在房间中。',
    'unavailable-id': '房间码碰巧已被占用，请重新创建房间。',
    'browser-incompatible': '当前浏览器不支持所需的 WebRTC 数据连接，请使用新版 Chrome、Edge、Firefox 或 Safari。',
    'network': '无法连接公共信令服务。请检查网络；部分网络会屏蔽 PeerJS Cloud。',
    'server-error': '公共信令服务暂时不可用，请稍后重试。',
    'socket-error': '信令连接发生错误，请检查网络后重新加入房间。',
    'socket-closed': '信令连接已关闭，请重新创建或加入房间。',
    'disconnected': '信令连接已断开。',
    'ssl-unavailable': '无法建立安全的信令连接。请使用 HTTPS 页面并检查网络。',
    'webrtc': 'WebRTC 连接失败。双方的 NAT 或防火墙可能不允许直连；此时需要可用的 TURN 中继。',
    'negotiation-failed': 'WebRTC 协商失败。请重试；严格的 NAT 或防火墙可能需要 TURN 中继。',
  };
  return networkError(messages[type] || error?.message || '联机连接失败，请重试。', type);
}

function validateJSON(value, depth = 0, ancestors = new Set()) {
  if (depth > 14) throw new TypeError('联机消息嵌套过深。');
  if (value === null || typeof value === 'boolean') return;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError('联机消息不能包含非有限数值。');
    return;
  }
  if (typeof value === 'string') {
    if (value.length > 16_384) throw new TypeError('联机消息中的字符串过长。');
    return;
  }
  if (typeof value !== 'object') throw new TypeError('联机消息只能包含 JSON 数据。');
  if (ancestors.has(value)) throw new TypeError('联机消息不能包含循环引用。');
  ancestors.add(value);
  if (Array.isArray(value)) {
    if (value.length > 4096) throw new TypeError('联机消息数组过长。');
    for (const entry of value) validateJSON(entry, depth + 1, ancestors);
  } else {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) throw new TypeError('请把向量等实例转换为普通 JSON 对象或数组后发送。');
    const keys = Object.keys(value);
    if (keys.length > 512) throw new TypeError('联机消息字段过多。');
    for (const key of keys) {
      if (key === '__proto__' || key === 'prototype' || key === 'constructor') throw new TypeError('联机消息包含不支持的字段。');
      validateJSON(value[key], depth + 1, ancestors);
    }
  }
  ancestors.delete(value);
}

function jsonSize(value) {
  validateJSON(value);
  const text = JSON.stringify(value);
  return new TextEncoder().encode(text).byteLength;
}

function listen(emitter, name, handler) {
  emitter.on(name, handler);
  return () => {
    if (typeof emitter.off === 'function') emitter.off(name, handler);
    else emitter.removeListener?.(name, handler);
  };
}

export class GameNetwork {
  constructor({ onEvent, onStatus } = {}) {
    this.onEvent = typeof onEvent === 'function' ? onEvent : () => {};
    this.onStatus = typeof onStatus === 'function' ? onStatus : () => {};
    this._peer = null;
    this._connections = new Map();
    this._rejections = new Set();
    this._members = new Set();
    this._peerListeners = [];
    this._timers = new Set();
    this._operation = null;
    this._epoch = 0;
    this._role = null;
    this._code = '';
    this._id = '';
    this._hostId = '';
    this._mode = '';
    this._signalReady = false;
    this._joined = false;
    this._state = 'idle';
  }

  get isHost() { return this._role === 'host'; }
  get connected() {
    if (this.isHost) return !!this._peer && (this._signalReady || [...this._connections.values()].some(c => c.ready && c.connection.open));
    return this._joined && !!this._connections.get(this._hostId)?.connection.open;
  }
  // Total players, including this browser once it has entered the room.
  get peerCount() { return this._members.size; }
  get localId() { return this._id; }
  get roomCode() { return this._code; }
  get mode() { return this._mode; }

  async host(mode = 'coop') {
    const selectedMode = normalizeMode(mode);
    const code = randomCode();
    return this._begin('host', code, selectedMode);
  }

  async join(code) {
    return this._begin('guest', normalizeCode(code), '');
  }

  _begin(role, code, mode) {
    this._shutdown(networkError('联机会话已取消。', 'cancelled'));
    const epoch = this._epoch;
    this._role = role;
    this._code = code;
    this._mode = mode;
    this._hostId = `anka-${code}`;
    const promise = new Promise((resolve, reject) => {
      const timer = this._later(() => {
        if (this._epoch !== epoch) return;
        this._fail(networkError('连接超过 30 秒。请检查房间码及双方网络；严格 NAT 或防火墙可能需要 TURN 中继。', 'timeout'));
      }, CONNECTION_TIMEOUT);
      this._operation = { resolve, reject, timer, epoch };
    });
    this._status(role === 'host' ? 'hosting' : 'joining');
    this._startPeer(epoch).catch(error => {
      if (this._epoch === epoch) this._fail(error?.code ? error : peerMessage(error));
    });
    return promise;
  }

  async _startPeer(epoch) {
    const Peer = await loadPeer();
    if (this._epoch !== epoch) return;
    const id = this.isHost ? this._hostId : `anka-player-${randomCode()}-${randomCode(4)}`;
    // No host or key override: use the documented default PeerServer Cloud.
    const peer = new Peer(id, { secure: true, debug: 0 });
    this._peer = peer;
    const active = () => this._epoch === epoch && this._peer === peer;
    this._peerListeners.push(
      listen(peer, 'open', assignedId => {
        if (!active()) return;
        this._id = assignedId;
        this._signalReady = true;
        if (this.isHost) {
          this._members.add(assignedId);
          this._joined = true;
          this._finishOperation();
          this._status('hosting');
        } else {
          const connection = peer.connect(this._hostId, {
            label: LABEL, serialization: 'json', reliable: true,
            metadata: { protocol: PROTOCOL, room: this._code },
          });
          this._bindConnection(connection, epoch);
        }
      }),
      listen(peer, 'connection', connection => {
        if (!active()) { connection.close(); return; }
        if (!this.isHost) { connection.close(); return; }
        const metadata = connection.metadata;
        if (connection.label !== LABEL || metadata?.protocol !== PROTOCOL || metadata?.room !== this._code) {
          connection.close(); return;
        }
        if (this._connections.size >= MAX_PLAYERS - 1) {
          this._rejectConnection(connection, '房间已满，最多支持四名玩家。', 'room-full', epoch); return;
        }
        if (this._connections.has(connection.peer)) {
          this._rejectConnection(connection, '这个玩家已在房间中。', 'duplicate-peer', epoch); return;
        }
        this._bindConnection(connection, epoch);
      }),
      listen(peer, 'disconnected', () => {
        if (!active()) return;
        this._signalReady = false;
        if (this._operation) {
          this._fail(networkError('信令服务已断开，未能完成房间连接。', 'signaling-disconnected'));
        } else {
          this._status(this.connected ? 'connected' : 'disconnected', networkError('信令服务已断开；已有直连仍可通信，但新玩家暂时不能加入。', 'signaling-disconnected'));
        }
      }),
      listen(peer, 'close', () => {
        if (active()) this._fail(networkError('联机服务已关闭，房间连接结束。', 'closed'), 'disconnected');
      }),
      listen(peer, 'error', error => {
        if (!active()) return;
        const readable = peerMessage(error);
        // A failure to negotiate with one guest must not kick all other guests.
        if (this.isHost && !this._operation && ['peer-unavailable', 'webrtc', 'negotiation-failed'].includes(readable.code)) {
          this._status(this.connected ? 'connected' : 'hosting', readable);
        } else if (this.connected && !this._operation && ['network', 'disconnected'].includes(readable.code)) {
          this._signalReady = false;
          this._status('connected', readable);
        } else this._fail(readable);
      }),
    );
  }

  _bindConnection(connection, epoch) {
    const record = { connection, ready: false, cleanups: [], iceTimer: null, timer: null };
    this._connections.set(connection.peer, record);
    const active = () => this._epoch === epoch && this._connections.get(connection.peer) === record;
    record.timer = this._later(() => {
      if (active()) this._drop(connection.peer, networkError('玩家的数据通道未能在 30 秒内连通。', 'timeout'));
    }, CONNECTION_TIMEOUT);
    record.cleanups.push(
      listen(connection, 'open', () => {
        if (!active()) return;
        this._bindTransportState(record, epoch);
        if (!active()) return;
        if (this.isHost) {
          record.ready = true;
          this._clearTimer(record.timer); record.timer = null;
          this._members.add(connection.peer);
          const sent = this._sendWire(connection, this._control('welcome', {
            code: this._code, mode: this._mode, hostId: this._id,
            playerId: connection.peer, members: [...this._members],
          }));
          if (!sent) {
            this._drop(connection.peer, networkError('无法发送房间握手，请重新加入。', 'handshake-failed'));
            return;
          }
          this._announceMembers();
          this._status('connected');
        }
      }),
      listen(connection, 'data', wire => {
        if (!active()) return;
        try { this._receive(record, wire); }
        catch (error) { this._drop(connection.peer, networkError(error.message || '收到无效的联机数据。', 'invalid-message')); }
      }),
      listen(connection, 'close', () => {
        if (active()) this._drop(connection.peer, networkError(this.isHost ? '一名玩家离开了房间。' : '与房主的连接已断开。', 'peer-left'));
      }),
      listen(connection, 'error', error => {
        if (active()) this._drop(connection.peer, peerMessage(error));
      }),
    );
  }

  _bindTransportState(record, epoch) {
    const pc = record.connection.peerConnection;
    if (!pc?.addEventListener) return;
    const stateChanged = () => {
      if (this._epoch !== epoch || this._connections.get(record.connection.peer) !== record) return;
      const state = pc.connectionState;
      if (state === 'failed' || state === 'closed') {
        this._drop(record.connection.peer, networkError('WebRTC 数据连接已中断，请重新加入房间。', 'webrtc'));
      } else if (state === 'disconnected' && !record.iceTimer) {
        record.iceTimer = this._later(() => {
          record.iceTimer = null;
          if (this._connections.get(record.connection.peer) === record && pc.connectionState === 'disconnected') {
            this._drop(record.connection.peer, networkError('网络连接已丢失，请重新加入房间。', 'webrtc'));
          }
        }, ICE_DISCONNECT_TIMEOUT);
      } else if (state === 'connected') {
        this._clearTimer(record.iceTimer); record.iceTimer = null;
      }
    };
    pc.addEventListener('connectionstatechange', stateChanged);
    record.cleanups.push(() => pc.removeEventListener('connectionstatechange', stateChanged));
    stateChanged();
  }

  _receive(record, wire) {
    if (!wire || typeof wire !== 'object' || wire.__anka !== PROTOCOL || jsonSize(wire) > MAX_WIRE_BYTES) throw new TypeError('收到无法识别的联机消息。');
    const { connection } = record;
    if (wire.kind === 'event') {
      if (!record.ready) throw new TypeError('玩家握手尚未完成。');
      if (jsonSize(wire.payload) > MAX_PAYLOAD_BYTES) throw new TypeError('联机消息过大。');
      this._invoke(this.onEvent, wire.payload, connection.peer);
      return;
    }
    if (this.isHost) throw new TypeError('客户端发送了无效的房间控制消息。');
    if (connection.peer !== this._hostId) throw new TypeError('消息并非来自房主。');
    if (wire.kind === 'reject') {
      this._fail(networkError(String(wire.reason || '房间拒绝了连接。'), String(wire.code || 'rejected')));
    } else if (wire.kind === 'welcome') {
      if (record.ready || wire.code !== this._code || wire.hostId !== this._hostId || wire.playerId !== this._id) throw new TypeError('房间握手信息不匹配。');
      this._mode = normalizeMode(wire.mode);
      this._setMembers(wire.members);
      record.ready = true;
      this._joined = true;
      this._clearTimer(record.timer); record.timer = null;
      this._finishOperation();
      this._status('connected');
    } else if (wire.kind === 'members') {
      if (!record.ready) throw new TypeError('房间握手尚未完成。');
      this._setMembers(wire.members);
      this._status('connected');
    } else throw new TypeError('未知的房间控制消息。');
  }

  _setMembers(members) {
    if (!Array.isArray(members) || members.length < 2 || members.length > MAX_PLAYERS || members.some(id => typeof id !== 'string' || id.length > 128)) throw new TypeError('无效的房间玩家列表。');
    const unique = new Set(members);
    if (unique.size !== members.length || !unique.has(this._id) || !unique.has(this._hostId)) throw new TypeError('房间玩家列表不匹配。');
    this._members = unique;
  }

  _control(kind, data) { return { __anka: PROTOCOL, kind, ...data }; }

  _announceMembers() {
    const wire = this._control('members', { members: [...this._members] });
    for (const { connection, ready } of this._connections.values()) if (ready) this._sendWire(connection, wire);
  }

  _rejectConnection(connection, reason, code, epoch) {
    const cleanups = [];
    let timer;
    let closed = false;
    const rejected = { connection, close: null };
    const close = () => {
      if (closed) return;
      closed = true;
      this._rejections.delete(rejected);
      this._clearTimer(timer);
      for (const cleanup of cleanups) cleanup();
      try { connection.close(); } catch { /* Already closed. */ }
    };
    rejected.close = close;
    this._rejections.add(rejected);
    const opened = () => {
      if (closed) return;
      if (this._epoch !== epoch) { close(); return; }
      this._clearTimer(timer);
      this._sendWire(connection, this._control('reject', { reason, code }));
      timer = this._later(close, 250);
    };
    cleanups.push(listen(connection, 'open', opened));
    cleanups.push(listen(connection, 'error', close), listen(connection, 'close', close));
    timer = this._later(close, CONNECTION_TIMEOUT);
    if (connection.open) queueMicrotask(opened);
  }

  _sendWire(connection, wire) {
    if (!connection.open || connection.dataChannel?.bufferedAmount > MAX_BUFFERED_BYTES || connection.bufferSize > 32) return false;
    try {
      const result = connection.send(wire);
      result?.catch?.(error => {
        if (this._connections.get(connection.peer)?.connection === connection) this._drop(connection.peer, peerMessage(error));
      });
      return true;
    } catch (error) {
      if (this._connections.get(connection.peer)?.connection === connection) this._drop(connection.peer, peerMessage(error));
      return false;
    }
  }

  send(payload) {
    if (jsonSize(payload) > MAX_PAYLOAD_BYTES) throw new TypeError('单条游戏消息最多为 48 KiB。');
    if (this.isHost) return this.broadcast(payload);
    const record = this._connections.get(this._hostId);
    return record?.ready && this._sendWire(record.connection, this._control('event', { payload })) ? 1 : 0;
  }

  broadcast(payload, exceptId) {
    if (jsonSize(payload) > MAX_PAYLOAD_BYTES) throw new TypeError('单条游戏消息最多为 48 KiB。');
    if (!this.isHost) return 0;
    const wire = this._control('event', { payload });
    let sent = 0;
    for (const [id, record] of this._connections) {
      if (record.ready && id !== exceptId && this._sendWire(record.connection, wire)) sent++;
    }
    return sent;
  }

  _drop(id, error) {
    const record = this._connections.get(id);
    if (!record) return;
    this._connections.delete(id);
    this._members.delete(id);
    this._clearTimer(record.timer);
    this._clearTimer(record.iceTimer);
    for (const cleanup of record.cleanups) cleanup();
    try { record.connection.close(); } catch { /* Already closed. */ }
    if (this.isHost) {
      this._announceMembers();
      this._status(this._connections.size ? 'connected' : this._signalReady ? 'hosting' : 'disconnected', error);
    } else this._fail(error || networkError('与房主的连接已结束。', 'peer-left'), 'disconnected');
  }

  _finishOperation() {
    const operation = this._operation;
    if (!operation) return;
    this._operation = null;
    this._clearTimer(operation.timer);
    operation.resolve({ code: this._code, id: this._id });
  }

  _fail(error, state = 'error') {
    const code = this._code;
    const readable = error instanceof Error ? error : networkError(String(error));
    this._shutdown(readable);
    this._code = code;
    this._status(state, readable);
  }

  _status(state, error = null) {
    this._state = state;
    this._invoke(this.onStatus, { state, code: this._code, peers: this.peerCount,
      members: [...this._members], localId: this._id, isHost: this.isHost,
      mode: this._mode, error: error?.message || null, errorCode: error?.code || null });
  }

  _invoke(callback, ...args) {
    try { callback(...args); }
    catch (error) { console.error('GameNetwork application callback failed:', error); }
  }

  _later(callback, delay) {
    const timer = setTimeout(() => { this._timers.delete(timer); callback(); }, delay);
    this._timers.add(timer);
    return timer;
  }

  _clearTimer(timer) {
    if (timer === null || timer === undefined) return;
    clearTimeout(timer); this._timers.delete(timer);
  }

  _shutdown(reason) {
    this._epoch++;
    const operation = this._operation;
    this._operation = null;
    for (const timer of this._timers) clearTimeout(timer);
    this._timers.clear();
    for (const rejected of [...this._rejections]) rejected.close();
    this._rejections.clear();
    for (const record of this._connections.values()) {
      for (const cleanup of record.cleanups) cleanup();
      try { record.connection.close(); } catch { /* Already closed. */ }
    }
    this._connections.clear(); this._members.clear();
    for (const cleanup of this._peerListeners) cleanup();
    this._peerListeners.length = 0;
    const peer = this._peer; this._peer = null;
    try { peer?.destroy(); } catch { /* Already destroyed. */ }
    this._role = null; this._signalReady = false; this._joined = false;
    this._id = ''; this._hostId = ''; this._code = ''; this._mode = '';
    operation?.reject(reason || networkError('联机会话已取消。', 'cancelled'));
  }

  close() {
    this._shutdown(networkError('联机会话已取消。', 'cancelled'));
    this._status('closed');
  }
}
