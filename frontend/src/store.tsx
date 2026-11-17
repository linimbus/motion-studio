import React, { createContext, useContext, useReducer } from "react";
import type { Keyframe, Project, SceneElement } from "./types";
import { sampleElement } from "./lib/anim";

export interface EditorState {
  project: Project;
  past: Project[];
  future: Project[];
}

export type EditorAction =
  | { type: "load"; project: Project }
  | { type: "setMeta"; patch: Partial<Omit<Project, "elements" | "canvas">> & { canvas?: Project["canvas"] } }
  | { type: "addElement"; element: SceneElement }
  | { type: "updateElement"; id: string; patch: Partial<SceneElement> }
  | { type: "deleteElement"; id: string }
  | { type: "moveLayer"; id: string; dir: 1 | -1 }
  | { type: "upsertKeyframe"; id: string; kf: Keyframe }
  | { type: "applyKeyframes"; id: string; kfs: Keyframe[] }
  | {
      type: "patchKeyframe";
      id: string;
      frame: number;
      /** text 传 null 表示清除该帧的文字覆盖 */
      patch: Omit<Partial<Keyframe>, "text"> & { text?: string | null };
    }
  | { type: "deleteKeyframe"; id: string; frame: number }
  | { type: "beginDrag" }
  | { type: "undo" }
  | { type: "redo" };

interface ActionOpts {
  /** 临时性修改（如拖拽过程）不计入历史 */
  _transient?: boolean;
}

export const EMPTY_PROJECT: Project = {
  name: "未命名项目",
  frameCount: 6,
  frameDuration: 1,
  canvas: { width: 960, height: 540, background: "#0f172a" },
  elements: [],
};

const HISTORY_LIMIT = 80;

function pushHistory(state: EditorState, project: Project): EditorState {
  return {
    project,
    past: [...state.past, state.project].slice(-HISTORY_LIMIT),
    future: [],
  };
}

function mapElement(
  project: Project,
  id: string,
  fn: (el: SceneElement) => SceneElement,
): Project {
  return { ...project, elements: project.elements.map((e) => (e.id === id ? fn(e) : e)) };
}

function reducer(
  state: EditorState,
  action: EditorAction & ActionOpts,
): EditorState {
  const { project } = state;
  const keep = state;

  switch (action.type) {
    case "load":
      return { project: action.project, past: [], future: [] };

    case "setMeta": {
      const next = { ...project, ...action.patch } as Project;
      return action._transient ? { ...keep, project: next } : pushHistory(state, next);
    }

    case "addElement":
      return pushHistory(state, {
        ...project,
        elements: [...project.elements, action.element],
      });

    case "updateElement":
      return pushHistory(
        state,
        mapElement(project, action.id, (el) => ({ ...el, ...action.patch })),
      );

    case "deleteElement":
      return pushHistory(state, {
        ...project,
        elements: project.elements.filter((e) => e.id !== action.id),
      });

    case "moveLayer": {
      const idx = project.elements.findIndex((e) => e.id === action.id);
      const to = idx + action.dir;
      if (idx < 0 || to < 0 || to >= project.elements.length) return state;
      const els = [...project.elements];
      const [item] = els.splice(idx, 1);
      els.splice(to, 0, item);
      return pushHistory(state, { ...project, elements: els });
    }

    case "upsertKeyframe":
      return pushHistory(
        state,
        mapElement(project, action.id, (el) => {
          const kfs = el.keyframes.filter((k) => k.frame !== action.kf.frame);
          return { ...el, keyframes: [...kfs, action.kf].sort((a, b) => a.frame - b.frame) };
        }),
      );

    case "patchKeyframe":
      // 由 rootReducer 拦截处理（需要按帧 upsert），不会走到这里
      return state;

    case "applyKeyframes":
      return pushHistory(
        state,
        mapElement(project, action.id, (el) => {
          const kfMap = new Map(el.keyframes.map((k) => [k.frame, k]));
          for (const k of action.kfs) kfMap.set(k.frame, k);
          return {
            ...el,
            keyframes: [...kfMap.values()].sort((a, b) => a.frame - b.frame),
          };
        }),
      );

    case "deleteKeyframe":
      return pushHistory(
        state,
        mapElement(project, action.id, (el) => {
          if (el.keyframes.length <= 1) return el;
          return {
            ...el,
            keyframes: el.keyframes.filter((k) => k.frame !== action.frame),
          };
        }),
      );

    case "beginDrag":
      return { ...state, past: [...state.past, project].slice(-HISTORY_LIMIT), future: [] };

    case "undo": {
      if (!state.past.length) return state;
      const prev = state.past[state.past.length - 1];
      return {
        project: prev,
        past: state.past.slice(0, -1),
        future: [state.project, ...state.future].slice(0, HISTORY_LIMIT),
      };
    }

    case "redo": {
      if (!state.future.length) return state;
      const next = state.future[0];
      return {
        project: next,
        past: [...state.past, state.project].slice(-HISTORY_LIMIT),
        future: state.future.slice(1),
      };
    }

    default:
      return state;
  }
}

/** patchKeyframe 需要按帧 upsert（不存在则基于当前采样值创建），单独实现 */
function applyPatchKeyframe(
  state: EditorState,
  action: Extract<EditorAction, { type: "patchKeyframe" }> & ActionOpts,
): EditorState {
  const { project } = state;
  const el = project.elements.find((e) => e.id === action.id);
  if (!el) return state;
  const frame = Math.round(action.frame);
  const kfs = [...el.keyframes];
  const { text: patchText, ...patchRest } = action.patch;
  const i = kfs.findIndex((k) => k.frame === frame);
  if (i >= 0) {
    const merged: Keyframe = { ...kfs[i], ...patchRest };
    if (patchText === null) delete merged.text;
    else if (patchText !== undefined) merged.text = patchText;
    kfs[i] = merged;
  } else {
    const s = sampleElement(el, frame);
    const created: Keyframe = {
      frame,
      x: s.x,
      y: s.y,
      scale: s.scale,
      rotate: s.rotate,
      rotateX: s.rotateX,
      rotateY: s.rotateY,
      skewX: s.skewX,
      skewY: s.skewY,
      blur: s.blur,
      opacity: s.opacity,
      color: s.color,
      easing: "easeInOut",
      ...patchRest,
    };
    if (patchText !== null && patchText !== undefined) created.text = patchText;
    kfs.push(created);
    kfs.sort((a, b) => a.frame - b.frame);
  }
  const nextProject = mapElement(project, action.id, (e) => ({ ...e, keyframes: kfs }));
  return action._transient
    ? { ...state, project: nextProject }
    : pushHistory(state, nextProject);
}

// 用包装 reducer 处理 patchKeyframe 的特殊逻辑
function rootReducer(state: EditorState, action: EditorAction & ActionOpts): EditorState {
  if (action.type === "patchKeyframe") return applyPatchKeyframe(state, action);
  return reducer(state, action);
}

interface EditorContextValue {
  state: EditorState;
  dispatch: React.Dispatch<EditorAction & ActionOpts>;
}

const EditorContext = createContext<EditorContextValue | null>(null);

export function EditorProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(rootReducer, {
    project: EMPTY_PROJECT,
    past: [],
    future: [],
  });
  return (
    <EditorContext.Provider value={{ state, dispatch }}>
      {children}
    </EditorContext.Provider>
  );
}

export function useEditor(): EditorContextValue {
  const ctx = useContext(EditorContext);
  if (!ctx) throw new Error("useEditor 必须在 EditorProvider 内使用");
  return ctx;
}
