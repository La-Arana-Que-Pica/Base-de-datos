// Visor de precisión: zoom con rueda y pellizco, desplazamiento, píxeles nítidos con cuadrícula, cuentagotas sobre los bytes
// originales (independiente del zoom y de la gestión de color), lupa para pantallas táctiles y manejo con teclado.
import { hex, editorValues } from './colors.js';

const MIN_ZOOM = 0.02, MAX_ZOOM = 96, GRID_FROM = 10, LOUPE_PX = 11;

export class Viewer {
  constructor({ stage, canvas, loupe, readout, onPick, onChange }) {
    Object.assign(this, { stage, canvas, loupe, readout, onPick, onChange });
    this.ctx = canvas.getContext('2d');
    this.lctx = loupe.querySelector('canvas').getContext('2d');
    this.image = null; this.zoom = 1; this.ox = 0; this.oy = 0;
    this.tool = 'pick'; this.sample = 1; this.overlay = null; this.showOverlay = false;
    this.cursor = null;        // píxel del cursor de teclado
    this.pointers = new Map();
    this.bind();
    new ResizeObserver(() => { const keep = this.fitted; this.resize(); if (keep) this.fit(); else this.draw(); }).observe(stage);
  }

  // ---------- imagen ----------
  setImage(img) {
    this.image?.bitmap?.close?.();
    this.image = img; this.cursor = null;
    this.resize(); this.fit();
  }
  clear() { this.image?.bitmap?.close?.(); this.image = null; this.hideLoupe(); this.draw(); }
  setOverlay(canvas) { this.overlay = canvas; this.draw(); }

  resize() {
    const r = this.stage.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
    this.w = Math.max(1, r.width); this.h = Math.max(1, r.height); this.dpr = dpr;
    this.canvas.width = Math.round(this.w * dpr); this.canvas.height = Math.round(this.h * dpr);
  }

  fit() {
    if (!this.image) return this.draw();
    const pad = 12, z = Math.min((this.w - pad * 2) / this.image.width, (this.h - pad * 2) / this.image.height);
    this.setView(Math.min(Math.max(z, MIN_ZOOM), MAX_ZOOM), null);
    this.ox = (this.w - this.image.width * this.zoom) / 2; this.oy = (this.h - this.image.height * this.zoom) / 2;
    this.fitted = true; this.draw(); this.emit();
  }
  /** 100 %: un píxel de la textura = un píxel de la pantalla. */
  actual() { this.zoomTo(1 / this.dpr, this.w / 2, this.h / 2); }
  zoomBy(f, cx = this.w / 2, cy = this.h / 2) { this.zoomTo(this.zoom * f, cx, cy); }
  zoomTo(z, cx, cy) {
    if (!this.image) return;
    z = Math.min(Math.max(z, MIN_ZOOM), MAX_ZOOM);
    const ix = (cx - this.ox) / this.zoom, iy = (cy - this.oy) / this.zoom;
    this.zoom = z; this.ox = cx - ix * z; this.oy = cy - iy * z;
    this.fitted = false; this.clamp(); this.draw(); this.emit();
  }
  setView(z) { this.zoom = z; }
  pan(dx, dy) { this.ox += dx; this.oy += dy; this.fitted = false; this.clamp(); this.draw(); }
  clamp() {
    if (!this.image) return;
    const iw = this.image.width * this.zoom, ih = this.image.height * this.zoom, m = 40;
    this.ox = Math.min(this.w - m, Math.max(m - iw, this.ox));
    this.oy = Math.min(this.h - m, Math.max(m - ih, this.oy));
  }
  emit() { this.onChange?.({ zoom: this.zoom * this.dpr }); }

  toImage(x, y) { return [Math.floor((x - this.ox) / this.zoom), Math.floor((y - this.oy) / this.zoom)]; }
  inside(px, py) { return this.image && px >= 0 && py >= 0 && px < this.image.width && py < this.image.height; }

  /** Color real del píxel (o promedio 3×3) leído de los bytes originales. */
  sampleAt(px, py) {
    if (!this.inside(px, py)) return null;
    const { raw, width, height } = this.image, r = this.sample === 3 ? 1 : 0;
    let sr = 0, sg = 0, sb = 0, n = 0;
    for (let y = py - r; y <= py + r; y++) for (let x = px - r; x <= px + r; x++) {
      if (x < 0 || y < 0 || x >= width || y >= height) continue;
      const o = (y * width + x) * 4; sr += raw[o]; sg += raw[o + 1]; sb += raw[o + 2]; n++;
    }
    return { x: px, y: py, hex: hex([Math.round(sr / n), Math.round(sg / n), Math.round(sb / n)]) };
  }

  // ---------- dibujo ----------
  draw() {
    const { ctx, dpr } = this;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    if (!this.image) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const { width: W, height: H, bitmap } = this.image, z = this.zoom;
    const sx0 = Math.max(0, Math.floor(-this.ox / z)), sy0 = Math.max(0, Math.floor(-this.oy / z));
    const sx1 = Math.min(W, Math.ceil((this.w - this.ox) / z)), sy1 = Math.min(H, Math.ceil((this.h - this.oy) / z));
    if (sx1 <= sx0 || sy1 <= sy0) return;
    const dx = this.ox + sx0 * z, dy = this.oy + sy0 * z, dw = (sx1 - sx0) * z, dh = (sy1 - sy0) * z;
    if (this.image.checker) { ctx.fillStyle = this.checkerPattern(); ctx.fillRect(dx, dy, dw, dh); }
    ctx.imageSmoothingEnabled = z * dpr < 1;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(bitmap, sx0, sy0, sx1 - sx0, sy1 - sy0, dx, dy, dw, dh);
    if (this.showOverlay && this.overlay) {
      ctx.imageSmoothingEnabled = false;
      const ow = this.overlay.width / W, oh = this.overlay.height / H;
      ctx.drawImage(this.overlay, sx0 * ow, sy0 * oh, (sx1 - sx0) * ow, (sy1 - sy0) * oh, dx, dy, dw, dh);
    }
    if (z * dpr >= GRID_FROM) {
      ctx.beginPath();
      for (let x = sx0; x <= sx1; x++) { const X = Math.round((this.ox + x * z) * dpr) / dpr + 0.5 / dpr; ctx.moveTo(X, dy); ctx.lineTo(X, dy + dh); }
      for (let y = sy0; y <= sy1; y++) { const Y = Math.round((this.oy + y * z) * dpr) / dpr + 0.5 / dpr; ctx.moveTo(dx, Y); ctx.lineTo(dx + dw, Y); }
      ctx.lineWidth = 1 / dpr; ctx.strokeStyle = 'rgba(0,0,0,.35)'; ctx.stroke();
    }
    if (this.cursor && this.stage.matches(':focus-visible')) {
      const [cx, cy] = this.cursor, s = Math.max(z, 6), x = this.ox + (cx + 0.5) * z - s / 2, y = this.oy + (cy + 0.5) * z - s / 2;
      ctx.lineWidth = 2; ctx.strokeStyle = '#000'; ctx.strokeRect(x - 1, y - 1, s + 2, s + 2);
      ctx.lineWidth = 1; ctx.strokeStyle = '#fff'; ctx.strokeRect(x, y, s, s);
    }
  }
  checkerPattern() {
    if (!this._checker) {
      const c = document.createElement('canvas'); c.width = c.height = 16;
      const g = c.getContext('2d'); g.fillStyle = '#cfd6d9'; g.fillRect(0, 0, 16, 16); g.fillStyle = '#eef2f3'; g.fillRect(0, 0, 8, 8); g.fillRect(8, 8, 8, 8);
      this._checker = this.ctx.createPattern(c, 'repeat');
    }
    return this._checker;
  }

  // ---------- lupa y lectura ----------
  showLoupe(x, y, px, py) {
    const s = this.sampleAt(px, py);
    if (!s) { this.hideLoupe(); return null; }
    const L = this.loupe, size = 132, g = this.lctx, cell = size / LOUPE_PX, half = LOUPE_PX >> 1;
    L.hidden = false;
    const left = Math.min(Math.max(4, x - size / 2), this.w - size - 4);
    let top = y - size - 64;
    if (top < 4) top = Math.min(this.h - size - 40, y + 48);
    L.style.transform = `translate(${left}px, ${top}px)`;
    g.imageSmoothingEnabled = false;
    g.fillStyle = '#0b1418'; g.fillRect(0, 0, size, size);
    g.drawImage(this.image.bitmap, px - half, py - half, LOUPE_PX, LOUPE_PX, 0, 0, size, size);
    g.lineWidth = 2; g.strokeStyle = '#000'; g.strokeRect(half * cell - 1, half * cell - 1, cell + 2, cell + 2);
    g.strokeStyle = '#fff'; g.lineWidth = 1.5; g.strokeRect(half * cell + 0.75, half * cell + 0.75, cell - 1.5, cell - 1.5);
    const v = editorValues(s.hex);
    L.querySelector('[data-loupe-swatch]').style.background = '#' + s.hex;
    L.querySelector('[data-loupe-text]').textContent = `R ${v[0]} G ${v[1]} B ${v[2]}`;
    return s;
  }
  hideLoupe() { this.loupe.hidden = true; }
  showReadout(s) {
    if (!s) { this.readout.hidden = true; return; }
    const v = editorValues(s.hex);
    this.readout.hidden = false;
    this.readout.innerHTML = `<i style="background:#${s.hex}"></i><b>R ${v[0]} · G ${v[1]} · B ${v[2]}</b><span>#${s.hex} · x ${s.x}, y ${s.y}</span>`;
  }

  // ---------- eventos ----------
  bind() {
    const st = this.stage, local = e => { const r = st.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
    st.addEventListener('wheel', e => {
      if (!this.image) return;
      e.preventDefault();
      const [x, y] = local(e), d = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
      this.zoomBy(Math.exp(-d * (e.ctrlKey ? 0.01 : 0.0018)), x, y);
    }, { passive: false });

    st.addEventListener('pointerdown', e => {
      if (!this.image || (e.pointerType === 'mouse' && e.button !== 0 && e.button !== 1)) return;
      st.setPointerCapture(e.pointerId);
      const [x, y] = local(e);
      this.pointers.set(e.pointerId, { x, y, sx: x, sy: y, type: e.pointerType, moved: false, button: e.button });
      if (this.pointers.size === 2) {
        this.hideLoupe();
        const [a, b] = [...this.pointers.values()];
        this.pinch = { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2, z: this.zoom };
      } else if (e.pointerType !== 'mouse' && this.tool === 'pick') {
        this.touchPick = this.showLoupe(x, y, ...this.toImage(x, y));
      }
    });
    st.addEventListener('pointermove', e => {
      const [x, y] = local(e), p = this.pointers.get(e.pointerId);
      if (!p) {
        if (e.pointerType === 'mouse' && this.image) this.showReadout(this.sampleAt(...this.toImage(x, y)));
        return;
      }
      const dx = x - p.x, dy = y - p.y;
      p.x = x; p.y = y;
      if (Math.hypot(x - p.sx, y - p.sy) > 4) p.moved = true;
      if (this.pinch && this.pointers.size >= 2) {
        const [a, b] = [...this.pointers.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y) || 1, cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2;
        this.pan(cx - this.pinch.cx, cy - this.pinch.cy);
        this.pinch.cx = cx; this.pinch.cy = cy;
        this.zoomTo(this.pinch.z * d / this.pinch.d, cx, cy);
        return;
      }
      if (p.type !== 'mouse' && this.tool === 'pick') { this.touchPick = this.showLoupe(x, y, ...this.toImage(x, y)); return; }
      if (p.moved || this.tool === 'pan' || p.button === 1) { this.pan(dx, dy); st.classList.add('is-panning'); }
      if (p.type === 'mouse') this.showReadout(this.sampleAt(...this.toImage(x, y)));
    });
    const end = e => {
      const p = this.pointers.get(e.pointerId);
      if (!p) return;
      this.pointers.delete(e.pointerId);
      st.classList.remove('is-panning');
      if (this.pinch) { if (this.pointers.size < 2) { this.pinch = null; this.touchPick = null; this.pointers.clear(); } return; }
      if (e.type === 'pointercancel') { this.hideLoupe(); this.touchPick = null; return; }
      if (p.type !== 'mouse' && this.tool === 'pick') {
        this.hideLoupe();
        if (this.touchPick) this.onPick?.(this.touchPick);
        this.touchPick = null;
        return;
      }
      if (!p.moved && this.tool === 'pick' && p.button === 0) {
        const s = this.sampleAt(...this.toImage(p.x, p.y));
        if (s) this.onPick?.(s);
      }
    };
    st.addEventListener('pointerup', end);
    st.addEventListener('pointercancel', end);
    st.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse' && !this.pointers.size) this.readout.hidden = true; });

    st.addEventListener('keydown', e => {
      if (!this.image) return;
      const step = e.shiftKey ? 10 : 1;
      const keys = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
      if (keys[e.key]) {
        e.preventDefault();
        if (this.tool === 'pan') { this.pan(-keys[e.key][0] * 20, -keys[e.key][1] * 20); return; }
        const [cx, cy] = this.cursor || this.toImage(this.w / 2, this.h / 2);
        this.cursor = [Math.min(this.image.width - 1, Math.max(0, cx + keys[e.key][0])), Math.min(this.image.height - 1, Math.max(0, cy + keys[e.key][1]))];
        const sx = this.ox + (this.cursor[0] + 0.5) * this.zoom, sy = this.oy + (this.cursor[1] + 0.5) * this.zoom;
        if (sx < 20 || sx > this.w - 20 || sy < 20 || sy > this.h - 20) this.pan(this.w / 2 - sx, this.h / 2 - sy);
        this.draw(); this.showReadout(this.sampleAt(...this.cursor));
      } else if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        const s = this.sampleAt(...(this.cursor || this.toImage(this.w / 2, this.h / 2)));
        if (s) this.onPick?.(s);
      } else if (e.key === '+' || e.key === '=') { e.preventDefault(); this.zoomAtCursor(1.5); }
      else if (e.key === '-' || e.key === '_') { e.preventDefault(); this.zoomAtCursor(1 / 1.5); }
      else if (e.key === '0') { e.preventDefault(); this.fit(); }
      else if (e.key === '1') { e.preventDefault(); this.actual(); }
    });
    st.addEventListener('focus', () => this.draw());
    st.addEventListener('blur', () => this.draw());
  }
  zoomAtCursor(f) {
    if (this.cursor) this.zoomBy(f, this.ox + (this.cursor[0] + 0.5) * this.zoom, this.oy + (this.cursor[1] + 0.5) * this.zoom);
    else this.zoomBy(f);
  }
}
