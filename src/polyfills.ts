import { Buffer } from 'buffer';
import process from 'process';
import BN from 'bn.js';

// ✅ GLOBALS BEFORE ANYTHING
if (!(globalThis as any).Buffer) {
  (globalThis as any).Buffer = Buffer;
}

if (!(globalThis as any).process) {
  (globalThis as any).process = process;
}

if (!(globalThis as any).global) {
  (globalThis as any).global = globalThis;
}

// ✅ FIX BN (THIS FIXES YOUR CURRENT ERROR)
if (!(globalThis as any).BN) {
  (globalThis as any).BN = BN;
}