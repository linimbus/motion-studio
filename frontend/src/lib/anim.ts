import type {
  EasingName,
  Keyframe,
  SampledProps,
  SceneElement,
  ShapeType,
} from "../types";

/* ------------------------------------------------------------------ 缓动函数
 * 与 Motion 内置缓动曲线一致的实现（本地实现以保证数值采样可用）
 */
type EaseFn = (t: number) => number;

const clamp01 = (t: number) => Math.min(1, Math.max(0, t));

export const EASINGS: Record<EasingName, EaseFn> = {
  linear: (t) => t,
  easeIn: (t) => t * t,
  easeOut: (t) => -(t * (t - 2)),
  easeInOut: (t) =>
    t < 0.5 ? 2 * t * t : -2 * t * t + 4 * t - 1,
  circOut: (t) => Math.sqrt(1 - (t - 1) * (t - 1)),
  backOut: (t) => {
    const s = 1.70158;
    t = clamp01(t);
    return (t - 1) * (t - 1) * ((s + 1) * (t - 1) + s) + 1;
  },
  anticipate: (t) =>
    (t *= 2) < 1
      ? 0.5 * t * t * t
      : 0.5 * ((t -= 2) * t * t + 2),
};

export const EASING_OPTIONS: { value: EasingName; label: string }[] = [
  { value: "linear", label: "线性 linear" },
  { value: "easeIn", label: "缓入 easeIn" },
  { value: "easeOut", label: "缓出 easeOut" },
  { value: "easeInOut", label: "缓入缓出 easeInOut" },
  { value: "circOut", label: "圆形缓出 circOut" },
  { value: "backOut", label: "回弹 backOut" },
  { value: "anticipate", label: "预备 anticipate" },
];

/* ------------------------------------------------------------------ 颜色插值 */
function hexToRgb(hex: string): [number, number, number] {
  let h = (hex || "#888888").replace("#", "").trim();
  if (h.length === 3)
    h = h
      .split("")
      .map((c) => c + c)
      .join("");
  const n = parseInt(h.slice(0, 6) || "888888", 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgbToHex(r: number, g: number, b: number): string {
  const c = (v: number) =>
    Math.round(Math.min(255, Math.max(0, v)))
      .toString(16)
      .padStart(2, "0");
  return `#${c(r)}${c(g)}${c(b)}`;
}

export function lerpColor(a: string, b: string, t: number): string {
  const ca = hexToRgb(a);
  const cb = hexToRgb(b);
  return rgbToHex(
    ca[0] + (cb[0] - ca[0]) * t,
    ca[1] + (cb[1] - ca[1]) * t,
    ca[2] + (cb[2] - ca[2]) * t,
  );
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/* ------------------------------------------------------------------ 关键帧采样
 * 在任意时刻（以帧为单位的浮点时间轴）对元素属性做插值，
 * 段内缓动取「目标关键帧」上记录的 easing。
 */
/** 文字内容阶梯切换：取「当前时刻之前最近一个覆盖帧」的文字，否则用元素默认 */
function effectiveText(el: SceneElement, frame: number): string {
  let current: string | undefined;
  for (const k of el.keyframes) {
    if (k.frame > frame) break;
    if (k.text != null) current = k.text;
  }
  return current ?? el.text?.content ?? "";
}

export function sampleElement(
  el: SceneElement,
  frame: number,
): SampledProps {
  const kfs = el.keyframes;
  const text = effectiveText(el, frame);
  if (!kfs.length)
    return {
      x: 0, y: 0, scale: 1, rotate: 0,
      rotateX: 0, rotateY: 0, skewX: 0, skewY: 0, blur: 0,
      opacity: 1, color: "#6366f1", text,
    };
  if (frame <= kfs[0].frame) return { ...fillSampled(kfs[0]), text };
  const last = kfs[kfs.length - 1];
  if (frame >= last.frame) return { ...fillSampled(last), text };

  let i = 0;
  for (let k = 0; k < kfs.length - 1; k++) {
    if (kfs[k].frame <= frame && frame < kfs[k + 1].frame) {
      i = k;
      break;
    }
  }
  const a = kfs[i];
  const b = kfs[i + 1];
  const raw = (frame - a.frame) / Math.max(1e-6, b.frame - a.frame);
  const ease = EASINGS[b.easing] ?? EASINGS.linear;
  const t = ease(raw);
  return {
    x: lerp(a.x, b.x, t),
    y: lerp(a.y, b.y, t),
    scale: lerp(a.scale, b.scale, t),
    rotate: lerp(a.rotate, b.rotate, t),
    rotateX: lerp(a.rotateX ?? 0, b.rotateX ?? 0, t),
    rotateY: lerp(a.rotateY ?? 0, b.rotateY ?? 0, t),
    skewX: lerp(a.skewX ?? 0, b.skewX ?? 0, t),
    skewY: lerp(a.skewY ?? 0, b.skewY ?? 0, t),
    blur: lerp(a.blur ?? 0, b.blur ?? 0, t),
    opacity: lerp(a.opacity, b.opacity, t),
    color: lerpColor(a.color, b.color, t),
    text,
  };
}

/** 补全旧版本关键帧中缺失的 v2 字段（text 由 effectiveText 单独处理） */
function fillSampled(kf: Keyframe): Omit<SampledProps, "text"> {
  return {
    x: kf.x, y: kf.y, scale: kf.scale, rotate: kf.rotate,
    rotateX: kf.rotateX ?? 0, rotateY: kf.rotateY ?? 0,
    skewX: kf.skewX ?? 0, skewY: kf.skewY ?? 0, blur: kf.blur ?? 0,
    opacity: kf.opacity, color: kf.color,
  };
}

/* ------------------------------------------------------------------ 工厂函数 */
let uid = 0;
export function makeId(prefix = "el"): string {
  return `${prefix}-${Date.now().toString(36)}-${(uid++).toString(36)}`;
}

export const SHAPE_DEFAULT_SIZE: Record<ShapeType, { w: number; h: number }> = {
  rect: { w: 160, h: 100 },
  circle: { w: 110, h: 110 },
  triangle: { w: 120, h: 110 },
  star: { w: 120, h: 120 },
  text: { w: 240, h: 64 },
};

const TYPE_LABEL: Record<ShapeType, string> = {
  rect: "矩形",
  circle: "圆形",
  triangle: "三角形",
  star: "星形",
  text: "文字",
};

const PALETTE = [
  "#6366f1",
  "#38bdf8",
  "#34d399",
  "#fbbf24",
  "#f472b6",
  "#a78bfa",
];

export function defaultKeyframe(partial: Partial<Keyframe> = {}): Keyframe {
  return {
    frame: 0,
    x: 0,
    y: 0,
    scale: 1,
    rotate: 0,
    opacity: 1,
    color: "#6366f1",
    easing: "easeInOut",
    ...partial,
  };
}

export function createElement(
  type: ShapeType,
  index: number,
  canvas: { width: number; height: number },
): SceneElement {
  const size = SHAPE_DEFAULT_SIZE[type];
  return {
    id: makeId(),
    type,
    name: `${TYPE_LABEL[type]} ${index + 1}`,
    width: size.w,
    height: size.h,
    text:
      type === "text"
        ? { content: "双击右侧面板编辑文字", fontSize: 26, color: "#e2e8f0", bold: false }
        : null,
    keyframes: [
      defaultKeyframe({
        frame: 0,
        x: canvas.width / 2,
        y: canvas.height / 2,
        color: PALETTE[index % PALETTE.length],
      }),
    ],
  };
}

export const SHAPE_LIBRARY: { type: ShapeType; label: string; icon: string }[] = [
  { type: "rect", label: "矩形", icon: "▭" },
  { type: "circle", label: "圆形", icon: "●" },
  { type: "triangle", label: "三角形", icon: "▲" },
  { type: "star", label: "星形", icon: "★" },
  { type: "text", label: "文字", icon: "T" },
];
