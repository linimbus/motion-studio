import type { Keyframe, SceneElement } from "../types";
import { sampleElement } from "./anim";

/** 动作预设定义（与后端 actions.py 的 ACTION_CATALOG 保持一致） */
export interface ActionDef {
  id: string;
  label: string;
  description: string;
  /** 可选方向参数：slideIn/bounceIn 用 top/bottom/left/right，flipIn 用 x/y */
  directions?: string[];
  /** 默认位移距离 */
  defaultDistance?: number;
  /** colorShift 需要 target color */
  usesColor?: boolean;
  minDuration?: number;
}

export const ACTION_CATALOG: ActionDef[] = [
  { id: "fadeIn", label: "淡入", description: "透明度 0 → 1", minDuration: 1 },
  { id: "fadeOut", label: "淡出", description: "透明度 1 → 0", minDuration: 1 },
  { id: "zoomIn", label: "放大入场", description: "从 0 放大到 1 并淡入（回弹）", minDuration: 1 },
  { id: "zoomOut", label: "缩小入场", description: "从 2 倍缩小到 1 并淡入", minDuration: 1 },
  { id: "bounceIn", label: "弹跳入场", description: "从指定方向弹入并带回弹", directions: ["top", "bottom", "left", "right"], defaultDistance: 240, minDuration: 1 },
  { id: "slideIn", label: "滑入", description: "从指定方向滑入并淡入", directions: ["left", "right", "top", "bottom"], defaultDistance: 240, minDuration: 1 },
  { id: "rotateIn", label: "旋转入场", description: "旋转 360° 从 0 放大入场", minDuration: 1 },
  { id: "flipIn", label: "翻转入场", description: "绕 X 或 Y 轴 3D 翻转入场", directions: ["x", "y"], minDuration: 1 },
  { id: "pulse", label: "脉冲缩放", description: "放大再回落的脉冲效果", minDuration: 2 },
  { id: "float", label: "上下漂浮", description: "上浮再回落", defaultDistance: 60, minDuration: 2 },
  { id: "shake", label: "抖动", description: "带衰减的左右抖动", minDuration: 1 },
  { id: "spin", label: "旋转一周", description: "原地旋转 360°", minDuration: 1 },
  { id: "colorShift", label: "颜色闪变", description: "闪变到目标色再回来", usesColor: true, minDuration: 2 },
];

export const DIRECTION_LABEL: Record<string, string> = {
  left: "从左侧",
  right: "从右侧",
  top: "从上方",
  bottom: "从下方",
  x: "绕 X 轴",
  y: "绕 Y 轴",
};

export interface ActionOptions {
  action: string;
  startFrame: number;
  duration: number;
  direction?: string;
  distance?: number;
  color?: string;
}

/** 该帧现值（有关键帧用关键帧，否则插值），补全 v2 字段 */
function baseKeyframe(el: SceneElement, frame: number): Keyframe {
  const existing = el.keyframes.find((k) => k.frame === frame);
  const s = sampleElement(el, frame);
  const base: Keyframe = {
    frame,
    x: s.x, y: s.y, scale: s.scale, rotate: s.rotate,
    rotateX: s.rotateX, rotateY: s.rotateY,
    skewX: s.skewX, skewY: s.skewY, blur: s.blur,
    opacity: s.opacity, color: s.color,
    easing: "easeInOut",
  };
  if (existing) return { ...base, ...existing, frame };
  // 无现有关键帧时不固化 text，保持「继承元素默认文字」语义
  return base;
}

function dirOffset(direction: string, distance: number): { dx: number; dy: number } {
  switch (direction) {
    case "right": return { dx: distance, dy: 0 };
    case "top": return { dx: 0, dy: -distance };
    case "bottom": return { dx: 0, dy: distance };
    case "left":
    default: return { dx: -distance, dy: 0 };
  }
}

/** 生成动作预设需要 upsert 的关键帧（同帧覆盖、保留其他属性） */
export function buildActionKeyframes(el: SceneElement, opts: ActionOptions): Keyframe[] {
  const action = opts.action;
  const def = ACTION_CATALOG.find((a) => a.id === action);
  if (!def) throw new Error(`未知动作: ${action}`);

  const duration = Math.max(def.minDuration ?? 1, Math.round(opts.duration));
  const start = Math.round(opts.startFrame);
  const end = start + duration;
  const direction = opts.direction ?? def.directions?.[0] ?? "left";
  const distance = opts.distance ?? def.defaultDistance ?? 240;
  const color = opts.color ?? "#f472b6";

  const b = (frame: number, patch: Partial<Keyframe>): Keyframe => ({
    ...baseKeyframe(el, frame),
    ...patch,
    frame,
  });

  const base = sampleElement(el, start);
  const mid = start + Math.round(duration / 2);
  const hasMid = mid !== start && mid !== end;

  switch (action) {
    case "fadeIn":
      return [b(start, { opacity: 0 }), b(end, { opacity: 1, easing: "easeOut" })];
    case "fadeOut":
      return [b(start, { opacity: 1 }), b(end, { opacity: 0, easing: "easeIn" })];
    case "zoomIn":
      return [b(start, { scale: 0, opacity: 0 }), b(end, { scale: 1, opacity: 1, easing: "backOut" })];
    case "zoomOut":
      return [b(start, { scale: 2, opacity: 0 }), b(end, { scale: 1, opacity: 1, easing: "easeOut" })];
    case "bounceIn": {
      const { dx, dy } = dirOffset(direction, distance);
      return [
        b(start, { x: base.x + dx, y: base.y + dy, scale: 0.6, opacity: 0 }),
        b(end, { x: base.x, y: base.y, scale: 1, opacity: 1, easing: "backOut" }),
      ];
    }
    case "slideIn": {
      const { dx, dy } = dirOffset(direction, distance);
      return [
        b(start, { x: base.x + dx, y: base.y + dy, opacity: 0 }),
        b(end, { x: base.x, y: base.y, opacity: 1, easing: "easeOut" }),
      ];
    }
    case "rotateIn":
      return [
        b(start, { rotate: base.rotate - 360, scale: 0, opacity: 0 }),
        b(end, { rotate: base.rotate, scale: 1, opacity: 1, easing: "circOut" }),
      ];
    case "flipIn":
      if (direction === "y")
        return [
          b(start, { rotateY: base.rotateY - 180, opacity: 0 }),
          b(end, { rotateY: 0, opacity: 1, easing: "easeInOut" }),
        ];
      return [
        b(start, { rotateX: base.rotateX - 180, opacity: 0 }),
        b(end, { rotateX: 0, opacity: 1, easing: "easeInOut" }),
      ];
    case "pulse": {
      const kfs = [b(start, { scale: base.scale })];
      if (hasMid) kfs.push(b(mid, { scale: base.scale * 1.35, easing: "easeInOut" }));
      kfs.push(b(end, { scale: base.scale, easing: "easeInOut" }));
      return kfs;
    }
    case "float": {
      const kfs = [b(start, { y: base.y })];
      if (hasMid) kfs.push(b(mid, { y: base.y - distance, easing: "easeInOut" }));
      kfs.push(b(end, { y: base.y, easing: "easeInOut" }));
      return kfs;
    }
    case "shake": {
      const n = end - start;
      const kfs: Keyframe[] = [];
      for (let i = 0; i <= n; i++) {
        const decay = 1 - i / Math.max(1, n);
        const off = 14 * (i % 2 === 0 ? 1 : -1) * decay;
        kfs.push(
          b(start + i, {
            rotate: base.rotate + off,
            skewX: base.skewX + off * 0.6,
            easing: "linear",
          }),
        );
      }
      return kfs;
    }
    case "spin":
      return [
        b(start, { rotate: base.rotate }),
        b(end, { rotate: base.rotate + 360, easing: "easeInOut" }),
      ];
    case "colorShift": {
      const kfs = [b(start, { color: base.color })];
      if (hasMid) kfs.push(b(mid, { color, easing: "easeInOut" }));
      kfs.push(b(end, { color: base.color, easing: "easeInOut" }));
      return kfs;
    }
    default:
      throw new Error(`动作 ${action} 未实现`);
  }
}
