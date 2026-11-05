// Sistema de referencia extraído de 0-BASE.psd (360 × 360 px).
// Capa 11: rostro genérico (oculta en el PSD; recurso convertido a PNG con fondo transparente).
// Capa 3 / Capa 3 copia: líneas verdes #2AFF00 de 3 px de alto en Y = 28–30 y Y = 312–314.

export const TEMPLATE = Object.freeze({
  size: 360,
  face: Object.freeze({ src: '/img/miniface-studio/rostro-referencia.png', x: 0, y: 0, width: 360, height: 360, opacity: 0.5 }),
  guides: Object.freeze([
    Object.freeze({ id: 'top', y: 28, height: 3 }),
    Object.freeze({ id: 'bottom', y: 312, height: 3 }),
  ]),
  guideColor: '#2aff00',
  // Línea central vertical (ayuda de LAqP, no forma parte del PSD): x = 180, mitad exacta del lienzo.
  centerLine: Object.freeze({ x: 180 }),
});

/** Posiciones en porcentaje para superponer las referencias sobre el área de edición. */
export function templatePercent(value) {
  return (value / TEMPLATE.size) * 100 + '%';
}
