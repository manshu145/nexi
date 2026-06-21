/**
 * Browser audio helpers for the Gemini Live API (Live Interview feature).
 *
 * Gemini Live expects 16-bit little-endian PCM mono audio at 16 kHz as input,
 * and streams back 16-bit PCM mono at 24 kHz. These helpers capture the mic as
 * base64 PCM chunks and play the model's audio chunks back gaplessly.
 *
 * NOTE: real-time media — must be tested on a real device/browser; it cannot
 * run in CI/SSR. All classes are browser-only (guard usage behind 'use client').
 */

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunk)));
  }
  return btoa(binary);
}

export function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

/** Captures mic audio and emits base64-encoded PCM16 @ 16 kHz chunks. */
export class MicCapture {
  private ctx?: AudioContext;
  private source?: MediaStreamAudioSourceNode;
  private processor?: ScriptProcessorNode;

  constructor(private readonly onChunk: (base64Pcm16: string) => void) {}

  start(stream: MediaStream): void {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    this.ctx = new Ctx({ sampleRate: 16000 });
    this.source = this.ctx.createMediaStreamSource(stream);
    this.processor = this.ctx.createScriptProcessor(4096, 1, 1);
    this.processor.onaudioprocess = (e) => {
      const input = e.inputBuffer.getChannelData(0);
      const pcm = new Int16Array(input.length);
      for (let i = 0; i < input.length; i++) {
        const s = Math.max(-1, Math.min(1, input[i] ?? 0));
        pcm[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
      }
      this.onChunk(bytesToBase64(new Uint8Array(pcm.buffer)));
    };
    this.source.connect(this.processor);
    this.processor.connect(this.ctx.destination);
  }

  stop(): void {
    try { this.processor?.disconnect(); } catch { /* ignore */ }
    try { this.source?.disconnect(); } catch { /* ignore */ }
    try { void this.ctx?.close(); } catch { /* ignore */ }
    this.processor = undefined; this.source = undefined; this.ctx = undefined;
  }
}

/** Plays a stream of base64 PCM16 @ 24 kHz chunks back-to-back, gaplessly. */
export class PcmPlayer {
  private ctx: AudioContext;
  private nextTime = 0;
  private sources = new Set<AudioBufferSourceNode>();

  constructor(private readonly sampleRate = 24000) {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    this.ctx = new Ctx({ sampleRate });
  }

  /** Resume the context (must be called from a user gesture on some browsers). */
  async resume(): Promise<void> { try { await this.ctx.resume(); } catch { /* ignore */ } }

  play(base64Pcm16: string): void {
    const bytes = base64ToBytes(base64Pcm16);
    const usable = bytes.byteLength - (bytes.byteLength % 2);
    const pcm = new Int16Array(bytes.buffer, bytes.byteOffset, usable / 2);
    const f32 = new Float32Array(pcm.length);
    for (let i = 0; i < pcm.length; i++) f32[i] = (pcm[i] ?? 0) / 0x8000;
    if (f32.length === 0) return;
    const buffer = this.ctx.createBuffer(1, f32.length, this.sampleRate);
    buffer.copyToChannel(f32, 0);
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    src.connect(this.ctx.destination);
    const start = Math.max(this.ctx.currentTime, this.nextTime);
    src.start(start);
    this.nextTime = start + buffer.duration;
    this.sources.add(src);
    src.onended = () => this.sources.delete(src);
  }

  /** Stop everything queued (used when the model is interrupted). */
  interrupt(): void {
    for (const s of this.sources) { try { s.stop(); } catch { /* ignore */ } }
    this.sources.clear();
    this.nextTime = 0;
  }

  close(): void {
    this.interrupt();
    try { void this.ctx.close(); } catch { /* ignore */ }
  }
}
