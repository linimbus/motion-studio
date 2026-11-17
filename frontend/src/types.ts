export type ShapeType = "rect" | "circle" | "triangle" | "star" | "text";

export type EasingName =
  | "linear"
  | "easeIn"
  | "easeOut"
  | "easeInOut"
  | "circOut"
  | "backOut"
  | "anticipate";

export interface Keyframe {
  frame: number;
  x: number;
  y: number;
  scale: number;
  rotate: number;
  /** 3D 翻转（度），v2 新增 */
  rotateX?: number;
  rotateY?: number;
  /** 倾斜（度），v2 新增 */
  skewX?: number;
  skewY?: number;
  /** 高斯模糊（px），v2 新增 */
  blur?: number;
  opacity: number;
  color: string;
  /** 该帧显示的文字内容（覆盖元素默认文字，帧间阶梯切换），v3 新增 */
  text?: string;
  /** 进入该关键帧这一段过渡所使用的缓动 */
  easing: EasingName;
}

export interface ElementText {
  content: string;
  fontSize: number;
  color: string;
  bold: boolean;
}

export interface SceneElement {
  id: string;
  type: ShapeType;
  name: string;
  width: number;
  height: number;
  text: ElementText | null;
  keyframes: Keyframe[];
}

export interface Project {
  id?: number;
  name: string;
  frameCount: number;
  /** 每一帧持续的秒数，默认 1 秒 */
  frameDuration: number;
  canvas: { width: number; height: number; background: string };
  elements: SceneElement[];
}

export interface ProjectSummary {
  id: number;
  name: string;
  updated_at: string | null;
}

export interface SampledProps {
  x: number;
  y: number;
  scale: number;
  rotate: number;
  rotateX: number;
  rotateY: number;
  skewX: number;
  skewY: number;
  blur: number;
  opacity: number;
  color: string;
  /** 该时刻生效的文字内容（阶梯切换：取最近一个已过去的覆盖帧） */
  text: string;
}
