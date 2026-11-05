// Estado no destructivo del editor: la imagen original nunca se modifica,
// solo se guarda su posición (centro, en coordenadas de la plantilla) y su escala.

import { TEMPLATE } from './template.js';

export const MIN_ZOOM = 0.1;
export const MAX_ZOOM = 30; // cabezas chicas en siluetas de cuerpo completo pueden necesitar mucho zoom

export class EditorState {
  constructor() {
    this.source = null; // { image: CanvasImageSource, width, height, name, type }
    this.x = TEMPLATE.size / 2;
    this.y = TEMPLATE.size / 2;
    this.scale = 1;
    this.listeners = new Set();
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  emit(reason) {
    for (const listener of this.listeners) listener(this, reason);
  }

  get hasImage() { return Boolean(this.source); }

  /** Escala que encaja la imagen completa en el área cuadrada (posición inicial). */
  get fitScale() {
    if (!this.source) return 1;
    return Math.min(TEMPLATE.size / this.source.width, TEMPLATE.size / this.source.height);
  }

  get zoom() { return this.scale / this.fitScale; }

  // La imagen pertenece a la colección: el editor no la libera al cambiar de elemento.
  setSource(source) {
    this.source = source;
    this.reset('source');
  }

  /** Carga una imagen con su transformación guardada (o la encaja si todavía no tiene). */
  load(source, transform = null) {
    this.source = source;
    if (!source || transform?.scale == null) { this.reset('load'); return; }
    this.x = transform.x;
    this.y = transform.y;
    this.scale = transform.scale;
    this.emit('load');
  }

  reset(reason = 'reset') {
    this.scale = this.fitScale;
    this.x = TEMPLATE.size / 2;
    this.y = TEMPLATE.size / 2;
    this.emit(reason);
  }

  center() {
    this.x = TEMPLATE.size / 2;
    this.y = TEMPLATE.size / 2;
    this.emit('center');
  }

  moveBy(dx, dy) {
    if (!this.source) return;
    this.x += dx;
    this.y += dy;
    this.emit('move');
  }

  /** Cambia el zoom (relativo al encaje) manteniendo fijo el punto (px, py) de la plantilla. */
  setZoom(zoom, px = TEMPLATE.size / 2, py = TEMPLATE.size / 2) {
    if (!this.source) return;
    const clamped = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));
    const nextScale = clamped * this.fitScale;
    const ratio = nextScale / this.scale;
    this.x = px + (this.x - px) * ratio;
    this.y = py + (this.y - py) * ratio;
    this.scale = nextScale;
    this.emit('zoom');
  }

  /** Datos serializables de la transformación (base para guardar proyectos más adelante). */
  toJSON() {
    return { x: this.x, y: this.y, scale: this.scale, templateSize: TEMPLATE.size };
  }
}
