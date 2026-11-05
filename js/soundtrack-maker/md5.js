// MD5 incremental (RFC 1321). Web Crypto no ofrece MD5 y el ACB guarda el MD5 del AWB (StreamAwbHash).

const S = [7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20,
  4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21];
const K = Int32Array.from({ length: 64 }, (_, i) => Math.floor(Math.abs(Math.sin(i + 1)) * 2 ** 32) | 0);

export class Md5 {
  constructor() {
    this.state = Int32Array.of(0x67452301, 0xefcdab89 | 0, 0x98badcfe | 0, 0x10325476);
    this.buffer = new Uint8Array(64);
    this.bufferLength = 0;
    this.bytes = 0;
    this.words = new Int32Array(16);
  }

  block(b, offset) {
    const w = this.words;
    for (let i = 0; i < 16; i++) {
      const p = offset + i * 4;
      w[i] = b[p] | (b[p + 1] << 8) | (b[p + 2] << 16) | (b[p + 3] << 24);
    }
    let [a, bb, c, d] = this.state;
    for (let i = 0; i < 64; i++) {
      let f, g;
      if (i < 16) { f = (bb & c) | (~bb & d); g = i; }
      else if (i < 32) { f = (d & bb) | (~d & c); g = (5 * i + 1) & 15; }
      else if (i < 48) { f = bb ^ c ^ d; g = (3 * i + 5) & 15; }
      else { f = c ^ (bb | ~d); g = (7 * i) & 15; }
      const tmp = d;
      d = c;
      c = bb;
      const x = (a + f + K[i] + w[g]) | 0;
      bb = (bb + ((x << S[i]) | (x >>> (32 - S[i])))) | 0;
      a = tmp;
    }
    const s = this.state;
    s[0] = (s[0] + a) | 0; s[1] = (s[1] + bb) | 0; s[2] = (s[2] + c) | 0; s[3] = (s[3] + d) | 0;
  }

  update(data) {
    let i = 0;
    this.bytes += data.length;
    if (this.bufferLength) {
      const take = Math.min(64 - this.bufferLength, data.length);
      this.buffer.set(data.subarray(0, take), this.bufferLength);
      this.bufferLength += take;
      i = take;
      if (this.bufferLength < 64) return this;
      this.block(this.buffer, 0);
      this.bufferLength = 0;
    }
    for (; i + 64 <= data.length; i += 64) this.block(data, i);
    if (i < data.length) {
      this.buffer.set(data.subarray(i), 0);
      this.bufferLength = data.length - i;
    }
    return this;
  }

  digest() {
    const bits = this.bytes * 8;
    const pad = new Uint8Array(((this.bufferLength < 56 ? 56 : 120) - this.bufferLength) + 8);
    pad[0] = 0x80;
    const view = new DataView(pad.buffer);
    view.setUint32(pad.length - 8, bits >>> 0, true);
    view.setUint32(pad.length - 4, Math.floor(bits / 2 ** 32), true);
    this.update(pad);
    const out = new Uint8Array(16);
    const ov = new DataView(out.buffer);
    this.state.forEach((v, k) => ov.setInt32(k * 4, v, true));
    return out;
  }
}
