// OKLCH -> sRGB, gamut check, WCAG contrast. Usage: import { hex, contrast } from './color.mjs'
export function oklchToLinear(L, C, h) {
  const a = C * Math.cos((h * Math.PI) / 180),
    b = C * Math.sin((h * Math.PI) / 180);
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.291485548 * b;
  const l = l_ ** 3,
    m = m_ ** 3,
    s = s_ ** 3;
  return [
    +4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}
const enc = (x) => (x <= 0.0031308 ? 12.92 * x : 1.055 * Math.pow(x, 1 / 2.4) - 0.055);
export function inGamut(L, C, h) {
  return oklchToLinear(L, C, h).every((v) => v >= -0.0005 && v <= 1.0005);
}
export function maxChroma(L, h) {
  let lo = 0,
    hi = 0.4;
  for (let i = 0; i < 30; i++) {
    const m = (lo + hi) / 2;
    if (inGamut(L, m, h)) lo = m;
    else hi = m;
  }
  return lo;
}
export function hex(L, C, h) {
  const lin = oklchToLinear(L, C, h).map((v) => Math.min(1, Math.max(0, v)));
  return (
    "#" +
    lin
      .map((v) =>
        Math.round(enc(v) * 255)
          .toString(16)
          .padStart(2, "0"),
      )
      .join("")
  );
}
export function lum(hexstr) {
  const n = hexstr.replace("#", "");
  const rgb = [0, 2, 4].map((i) => parseInt(n.slice(i, i + 2), 16) / 255);
  const lin = rgb.map((c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)));
  return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
}
export function contrast(a, b) {
  const la = lum(a),
    lb = lum(b);
  const [x, y] = la > lb ? [la, lb] : [lb, la];
  return (x + 0.05) / (y + 0.05);
}
export function mix(hexA, hexB, t) {
  const pa = hexA
      .slice(1)
      .match(/../g)
      .map((x) => parseInt(x, 16)),
    pb = hexB
      .slice(1)
      .match(/../g)
      .map((x) => parseInt(x, 16));
  return (
    "#" +
    pa
      .map((v, i) =>
        Math.round(v + (pb[i] - v) * t)
          .toString(16)
          .padStart(2, "0"),
      )
      .join("")
  );
}
