export const RAIN_OPACITY = 0.40;
export const CELEBRATION_OPACITY = 0.9;
export const COLUMN_DENSITY = 1; // 1 = every column, 2 = every other

// R80: Knobs for character mix ratios and word probability
export const RATIO_PRIMARY = 0.50;   // Full-width Katakana
export const RATIO_SECONDARY = 0.25; // Hiragana
export const RATIO_TERTIARY = 0.15;  // Kanji
// Remainder (~0.10) is half-width Katakana + digits

export const WORD_PROBABILITY = 1 / 12;

const KANJI_SET = '悟未来時間電脳空夢光影力心道真実';
const WORD_LIST = ['悟り', '未来', '時間', '電脳', '現実', '覚醒', '自由', '真実'];

const KATAKANA_EXCLUDES = new Set([0x30A1, 0x30A3, 0x30A5, 0x30A7, 0x30A9, 0x30C3, 0x30E3, 0x30E5, 0x30E7]);
const HIRAGANA_EXCLUDES = new Set([0x3041, 0x3043, 0x3045, 0x3047, 0x3049, 0x3063, 0x3083, 0x3085, 0x3087, 0x308E]);

function isHalfWidth(char: string) {
  const code = char.charCodeAt(0);
  return (code >= 0xFF66 && code <= 0xFF9D) || (code >= 0x30 && code <= 0x39);
}

function getRandomNoiseChar() {
  const r = Math.random();
  if (r < RATIO_PRIMARY) {
    let c = 0;
    do {
      c = 0x30A2 + Math.floor(Math.random() * (0x30F3 - 0x30A2 + 1));
    } while (KATAKANA_EXCLUDES.has(c));
    return String.fromCharCode(c);
  } else if (r < RATIO_PRIMARY + RATIO_SECONDARY) {
    let c = 0;
    do {
      c = 0x3042 + Math.floor(Math.random() * (0x3093 - 0x3042 + 1));
    } while (HIRAGANA_EXCLUDES.has(c));
    return String.fromCharCode(c);
  } else if (r < RATIO_PRIMARY + RATIO_SECONDARY + RATIO_TERTIARY) {
    return KANJI_SET[Math.floor(Math.random() * KANJI_SET.length)];
  } else {
    if (Math.random() > 0.5) {
      return String.fromCharCode(0x30 + Math.floor(Math.random() * 10));
    }
    return String.fromCharCode(0xFF66 + Math.floor(Math.random() * (0xFF9D - 0xFF66 + 1)));
  }
}

class RainColumn {
  x: number;
  y: number = 0;
  speed: number = 50;
  length: number = 20;
  chars: { char: string; mirrored: boolean }[] = [];
  lastUpdate: number = 0;
  
  word: string | null = null;
  wordIndex: number = 0;

  constructor(x: number, startY: number) {
    this.x = x;
    this.reset(startY);
  }

  reset(y: number) {
    this.y = y;
    this.speed = 30 + Math.random() * 60;
    this.length = 15 + Math.floor(Math.random() * 15);
    this.chars = [];
    this.lastUpdate = performance.now();
    
    if (Math.random() < WORD_PROBABILITY) {
      this.word = WORD_LIST[Math.floor(Math.random() * WORD_LIST.length)];
      this.wordIndex = 0;
    } else {
      this.word = null;
    }
  }

  update(now: number, maxRows: number) {
    if (now - this.lastUpdate > this.speed) {
      this.lastUpdate = now;
      this.y++;

      let nextChar = '';
      
      if (this.word) {
        if (this.wordIndex < this.word.length) {
          nextChar = this.word[this.wordIndex++];
        } else {
          nextChar = getRandomNoiseChar();
        }
      } else {
        // Only mutate if this is a purely noise column
        for (let i = 0; i < this.chars.length; i++) {
          if (Math.random() < 0.05) {
            const newChar = getRandomNoiseChar();
            this.chars[i].char = newChar;
            this.chars[i].mirrored = isHalfWidth(newChar) && Math.random() > 0.5;
          }
        }
        nextChar = getRandomNoiseChar();
      }

      this.chars.unshift({
        char: nextChar,
        mirrored: isHalfWidth(nextChar) && Math.random() > 0.5,
      });

      if (this.chars.length > this.length) {
        this.chars.pop();
      }

      if (this.y - this.length > maxRows) {
        this.reset(Math.floor(Math.random() * -20));
      }
    }
  }

  draw(ctx: CanvasRenderingContext2D, fontSize: number, opacityMod: number) {
    for (let i = 0; i < this.chars.length; i++) {
      const charObj = this.chars[i];
      const cellY = this.y - i;
      if (cellY < 0) continue;

      if (i === 0) {
        ctx.fillStyle = `rgba(220, 255, 220, ${opacityMod})`;
        ctx.shadowColor = `rgba(0, 255, 65, ${opacityMod})`;
        ctx.shadowBlur = 4;
      } else {
        const ratio = 1 - i / this.length;
        ctx.fillStyle = `rgba(0, 255, 65, ${ratio * opacityMod})`;
        ctx.shadowBlur = 0;
      }

      ctx.save();
      const px = this.x * fontSize;
      const py = cellY * fontSize;
      if (charObj.mirrored) {
        ctx.translate(px + fontSize, py);
        ctx.scale(-1, 1);
        ctx.fillText(charObj.char, 0, 0);
      } else {
        ctx.translate(px, py);
        ctx.fillText(charObj.char, 0, 0);
      }
      ctx.restore();
    }
  }
}

class MatrixRenderer {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  columns: RainColumn[] = [];
  fontSize: number = 16;
  opacity: number;
  animationFrameId: number = 0;
  lastFrameTime: number = 0;
  fpsInterval: number = 1000 / 30; // ~30fps
  prefersReducedMotion: boolean;
  running: boolean = false;
  duration?: number;
  startTime?: number;
  onComplete?: () => void;
  private resizeHandler: () => void;

  constructor(canvas: HTMLCanvasElement, opacity: number, duration?: number, onComplete?: () => void) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    this.opacity = opacity;
    this.duration = duration;
    this.onComplete = onComplete;
    this.prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    
    this.resizeHandler = this.resize.bind(this);
    this.resize();
    window.addEventListener('resize', this.resizeHandler);
  }

  resize() {
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
    this.initColumns();
  }

  initColumns() {
    const isMobile = window.innerWidth < 768;
    const spacing = isMobile ? Math.max(2, COLUMN_DENSITY) : COLUMN_DENSITY;
    const colCount = Math.floor(this.canvas.width / this.fontSize);
    
    this.columns = [];
    for (let x = 0; x < colCount; x += spacing) {
      this.columns.push(new RainColumn(x, Math.floor(Math.random() * -50)));
    }
  }

  start() {
    if (this.prefersReducedMotion) {
      this.drawStatic();
      if (this.duration) {
        setTimeout(() => this.onComplete?.(), this.duration);
      }
      return;
    }
    
    this.running = true;
    this.startTime = performance.now();
    this.lastFrameTime = performance.now();
    this.loop(performance.now());
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this.animationFrameId);
  }

  destroy() {
    this.stop();
    window.removeEventListener('resize', this.resizeHandler);
  }

  drawStatic() {
    this.ctx.fillStyle = `rgba(0, 10, 0, ${this.opacity})`;
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
  }

  loop(now: number) {
    if (!this.running) return;

    if (this.duration && this.startTime && now - this.startTime > this.duration) {
      this.destroy();
      this.onComplete?.();
      return;
    }

    if (document.hidden) {
      this.animationFrameId = requestAnimationFrame(this.loop.bind(this));
      return;
    }

    const elapsed = now - this.lastFrameTime;
    if (elapsed > this.fpsInterval) {
      this.lastFrameTime = now - (elapsed % this.fpsInterval);

      this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
      this.ctx.font = `${this.fontSize}px 'Share Tech Mono', 'Noto Sans JP', 'Hiragino Kaku Gothic', 'Yu Gothic', 'MS Gothic', monospace`;
      this.ctx.textBaseline = 'top';

      const maxRows = Math.ceil(this.canvas.height / this.fontSize);
      for (const col of this.columns) {
        col.update(now, maxRows);
        col.draw(this.ctx, this.fontSize, this.opacity);
      }
    }

    this.animationFrameId = requestAnimationFrame(this.loop.bind(this));
  }
}

const backgroundRenderers: Record<string, MatrixRenderer> = {};

export function initMatrixRain(canvasId: string) {
  const canvas = document.getElementById(canvasId) as HTMLCanvasElement;
  if (!canvas) return;
  
  if (backgroundRenderers[canvasId]) {
    backgroundRenderers[canvasId].destroy();
  }
  
  const renderer = new MatrixRenderer(canvas, RAIN_OPACITY);
  backgroundRenderers[canvasId] = renderer;
  renderer.start();
}

export function triggerMatrixCelebration() {
  const overlay = document.getElementById('celebration-overlay');
  const canvas = document.getElementById('celebration-canvas') as HTMLCanvasElement;
  if (!overlay || !canvas) return;

  overlay.classList.remove('hidden');
  
  const renderer = new MatrixRenderer(canvas, CELEBRATION_OPACITY, 5000, () => {
    overlay.classList.add('hidden');
  });
  renderer.start();
}

