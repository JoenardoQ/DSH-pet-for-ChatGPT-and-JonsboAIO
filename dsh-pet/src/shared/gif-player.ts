/** Decode the actual GIF once, draw successive frames for both UI and USB output.
 * Canvas.drawImage(animatedImg) is not a reliable source of animated frames.
 * WebCodecs provides frame durations and disposal-correct decoded frames.
 */
interface GifFrame {
  image: CanvasImageSource & { duration: number | null; close(): void };
}
interface GifDecoder {
  tracks: { ready: Promise<void>; selectedTrack: { frameCount: number } | null };
  decode(options: { frameIndex: number }): Promise<GifFrame>;
  close(): void;
}
type DecoderClass = new (options: { data: ArrayBuffer; type: string }) => GifDecoder;

export class GifPlayer {
  declare readonly canvas: HTMLCanvasElement;
  declare ready: boolean;
  declare private decoder: GifDecoder | null;
  declare private timer: ReturnType<typeof setTimeout> | null;
  declare private request: AbortController | null;
  declare private generation: number;
  declare private once: boolean;
  declare private url: string | null;
  declare private ended: () => void;
  constructor(container: HTMLElement) {
    this.ready = false;
    this.decoder = null;
    this.timer = null;
    this.request = null;
    this.generation = 0;
    this.once = false;
    this.url = null;
    this.ended = () => {};
    this.canvas = document.createElement('canvas');
    this.canvas.width = 640;
    this.canvas.height = 360;
    this.canvas.className = 'pet-gif';
    Object.assign(this.canvas.style, {
      position: 'absolute',
      inset: '0',
      width: '100%',
      height: '100%',
      pointerEvents: 'none',
      display: 'none',
      objectFit: 'contain',
    });
    container.appendChild(this.canvas);
  }
  stop(): void {
    this.generation++;
    this.url = null;
    this.request?.abort();
    this.request = null;
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
    this.decoder?.close();
    this.decoder = null;
    this.ready = false;
    this.canvas.style.display = 'none';
  }
  async play(url: string, once: boolean, ended: () => void): Promise<void> {
    this.once = once;
    this.ended = ended;
    if (this.url === url && this.timer !== null) return;
    this.stop();
    this.url = url;
    const gen = this.generation;
    this.request = new AbortController();
    const response = await fetch(url, { signal: AbortSignal.any([this.request.signal, AbortSignal.timeout(10000)]) });
    if (!response.ok) throw Error('GIF HTTP ' + response.status);
    const data = await response.arrayBuffer();
    if (gen !== this.generation) return;
    const Decoder = (globalThis as unknown as { ImageDecoder?: DecoderClass }).ImageDecoder;
    if (!Decoder) throw Error('当前内核缺少 GIF 逐帧解码支持，请更新 Chromium / Electron');
    const decoder = new Decoder({ data, type: 'image/gif' });
    this.decoder = decoder;
    await decoder.tracks.ready;
    if (gen !== this.generation) return;
    const count = decoder.tracks.selectedTrack?.frameCount ?? 0;
    if (count < 2) {
      this.stop();
      throw Error('动作 GIF 必须包含多帧');
    }
    const ctx = this.canvas.getContext('2d');
    if (!ctx) {
      this.stop();
      throw Error('Canvas unavailable');
    }
    let index = 0;
    let nextAt = performance.now();
    const draw = async (): Promise<void> => {
      if (gen !== this.generation) return;
      let frame: GifFrame;
      try {
        frame = await decoder.decode({ frameIndex: index });
      } catch (error) {
        if (gen === this.generation) {
          this.stop();
          console.error(error);
        }
        return;
      }
      if (gen !== this.generation) {
        frame.image.close();
        return;
      }
      ctx.clearRect(0, 0, 640, 360);
      ctx.drawImage(frame.image, 0, 0, 640, 360);
      const duration = Math.max(20, Math.min(1000, (frame.image.duration ?? 100000) / 1000));
      frame.image.close();
      this.ready = true;
      this.canvas.style.display = '';
      nextAt += duration;
      this.timer = setTimeout(() => {
        if (gen !== this.generation) return;
        index++;
        if (index === count) {
          if (this.once) {
            this.timer = null;
            this.ended();
            return;
          }
          index = 0;
        }
        void draw();
      }, Math.max(0, nextAt - performance.now()));
    };
    await draw();
  }
  finishLoop(): void {
    this.once = true;
  }
  dispose(): void {
    this.stop();
    this.canvas.remove();
  }
}
