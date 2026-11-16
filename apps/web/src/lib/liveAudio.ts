/** Microphone capture and speaker playback for the live interview. Raw 16-bit PCM in both directions. */

const INPUT_RATE = 16000;
const OUTPUT_RATE = 24000;

const WORKLET = `
class PcmCapture extends AudioWorkletProcessor {
  constructor() { super(); this.buf = new Int16Array(1600); this.n = 0; }
  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (!ch) return true;
    for (let i = 0; i < ch.length; i++) {
      const s = Math.max(-1, Math.min(1, ch[i]));
      this.buf[this.n++] = s < 0 ? s * 0x8000 : s * 0x7fff;
      if (this.n === this.buf.length) {
        this.port.postMessage(this.buf.buffer.slice(0));
        this.n = 0;
      }
    }
    return true;
  }
}
registerProcessor('pcm-capture', PcmCapture);
`;

function toBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

function fromBase64(data: string): Int16Array {
  const binary = atob(data);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Int16Array(bytes.buffer, 0, Math.floor(bytes.length / 2));
}

export const MIC_MIME = `audio/pcm;rate=${INPUT_RATE}`;

/** Streams the microphone as base64 PCM chunks of 100 ms. Returns a function that stops it. */
export async function startMic(stream: MediaStream, onChunk: (base64: string) => void): Promise<() => void> {
  const ctx = new AudioContext({ sampleRate: INPUT_RATE });
  const url = URL.createObjectURL(new Blob([WORKLET], { type: 'application/javascript' }));
  try {
    await ctx.audioWorklet.addModule(url);
  } finally {
    URL.revokeObjectURL(url);
  }
  const source = ctx.createMediaStreamSource(stream);
  const node = new AudioWorkletNode(ctx, 'pcm-capture');
  node.port.onmessage = (e: MessageEvent<ArrayBuffer>) => onChunk(toBase64(e.data));
  source.connect(node);
  // A worklet only runs while it is connected to the output. It writes nothing, so this stays silent.
  node.connect(ctx.destination);
  await ctx.resume();
  return () => {
    node.port.onmessage = null;
    source.disconnect();
    node.disconnect();
    void ctx.close();
  };
}

/** Plays the interviewer's audio chunks back to back, and can drop what is queued when the candidate interrupts. */
export class Speaker {
  private readonly ctx = new AudioContext({ sampleRate: OUTPUT_RATE });
  private nextAt = 0;
  private playing = new Set<AudioBufferSourceNode>();

  async resume(): Promise<void> {
    await this.ctx.resume();
  }

  play(base64: string): void {
    const pcm = fromBase64(base64);
    if (pcm.length === 0) return;
    const buffer = this.ctx.createBuffer(1, pcm.length, OUTPUT_RATE);
    const channel = buffer.getChannelData(0);
    for (let i = 0; i < pcm.length; i++) channel[i] = pcm[i]! / 0x8000;
    const node = this.ctx.createBufferSource();
    node.buffer = buffer;
    node.connect(this.ctx.destination);
    const at = Math.max(this.ctx.currentTime + 0.02, this.nextAt);
    node.start(at);
    this.nextAt = at + buffer.duration;
    this.playing.add(node);
    node.onended = () => this.playing.delete(node);
  }

  /** Seconds of audio still waiting to be heard. */
  pending(): number {
    return Math.max(0, this.nextAt - this.ctx.currentTime);
  }

  flush(): void {
    for (const node of this.playing) {
      try {
        node.stop();
      } catch {
        // already stopped
      }
    }
    this.playing.clear();
    this.nextAt = 0;
  }

  close(): void {
    this.flush();
    void this.ctx.close();
  }
}
