/**
 * src/lib/stream-stub.ts
 *
 * Browser-safe stream polyfill.
 *
 * The plain `empty-stub.ts` (exports nothing) caused:
 *   TypeError: can't access property "prototype", Ee.Readable is undefined
 * because packages like `ws`, `concat-stream`, and `keccak` do:
 *   const { Readable } = require('stream');
 *   SomeClass.prototype = Object.create(Readable.prototype);
 *
 * This stub provides the minimum class surface so those prototype chains
 * are set up without crashing. None of these Node.js stream operations
 * actually run in the browser — the stubs just keep the module graph happy.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

export class EventEmitter {
  private _events: Record<string, ((...args: any[]) => void)[]> = {};
  on(event: string, listener: (...args: any[]) => void) { (this._events[event] ??= []).push(listener); return this; }
  once(event: string, listener: (...args: any[]) => void) { const w = (...a: any[]) => { this.off(event, w); listener(...a); }; return this.on(event, w); }
  off(event: string, listener: (...args: any[]) => void) { this._events[event] = (this._events[event] || []).filter(l => l !== listener); return this; }
  removeListener(event: string, listener: (...args: any[]) => void) { return this.off(event, listener); }
  emit(event: string, ...args: any[]) { (this._events[event] || []).forEach(l => l(...args)); return (this._events[event] || []).length > 0; }
  removeAllListeners(event?: string) { if (event) delete this._events[event]; else this._events = {}; return this; }
}

export class Stream extends EventEmitter {
  pipe<T extends NodeJS.WritableStream>(dest: T) { return dest; }
}

export class Readable extends Stream {
  readable = false;
  read(_size?: number): any { return null; }
  setEncoding(_enc: string) { return this; }
  resume() { return this; }
  pause() { return this; }
  pipe<T extends NodeJS.WritableStream>(dest: T) { return dest; }
  unpipe(_dest?: NodeJS.WritableStream) { return this; }
  unshift(_chunk: any) { /* noop */ }
  wrap(_stream: any) { return this; }
  push(_chunk: any) { return true; }
  destroy(_err?: Error) { return this; }
  [Symbol.asyncIterator](): AsyncIterator<any> {
    return { next: async () => ({ value: undefined, done: true }) };
  }
}

export class Writable extends Stream {
  writable = false;
  write(_chunk: any, _enc?: any, _cb?: () => void) { return true; }
  end(_chunk?: any, _enc?: any, _cb?: () => void) { return this; }
  destroy(_err?: Error) { return this; }
  cork() { /* noop */ }
  uncork() { /* noop */ }
  setDefaultEncoding(_enc: string) { return this; }
}

export class Duplex extends Readable {
  writable = false;
  write(_chunk: any, _enc?: any, _cb?: () => void) { return true; }
  end(_chunk?: any, _enc?: any, _cb?: () => void) { return this; }
}

export class Transform extends Duplex {
  _transform(_chunk: any, _enc: string, callback: () => void) { callback(); }
  _flush(callback: () => void) { callback(); }
}

export class PassThrough extends Transform {}

/** Named exports that match Node.js `stream` module surface */
export default {
  Stream,
  Readable,
  Writable,
  Duplex,
  Transform,
  PassThrough,
  // Some packages do: const pipeline = require('stream').pipeline
  pipeline: (...args: any[]) => {
    const cb = args[args.length - 1];
    if (typeof cb === 'function') cb(null);
  },
  finished: (_stream: any, cb: (err?: Error) => void) => { cb(); },
};
