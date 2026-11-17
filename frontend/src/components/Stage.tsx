import { useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import { useEditor } from "../store";
import { sampleElement } from "../lib/anim";
import type { SampledProps, SceneElement } from "../types";

interface StageProps {
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  playhead: number;
  playing: boolean;
}

const STAR_POINTS = "50,4 61,36 96,36 68,57 79,91 50,70 21,91 32,57 4,36 39,36";

function ElementBody({
  el,
  p,
}: {
  el: SceneElement;
  p: SampledProps;
}) {
  switch (el.type) {
    case "circle":
      return (
        <div style={{ width: "100%", height: "100%", borderRadius: "50%", background: p.color }} />
      );
    case "triangle":
      return (
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ width: "100%", height: "100%" }}>
          <polygon points="50,3 98,97 2,97" fill={p.color} />
        </svg>
      );
    case "star":
      return (
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ width: "100%", height: "100%" }}>
          <polygon points={STAR_POINTS} fill={p.color} />
        </svg>
      );
    case "text":
      return (
        <div
          style={{
            width: "100%",
            height: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: p.color,
            fontSize: el.text?.fontSize ?? 24,
            fontWeight: el.text?.bold ? 700 : 400,
            whiteSpace: "pre-wrap",
            textAlign: "center",
          }}
        >
          {p.text}
        </div>
      );
    case "rect":
    default:
      return (
        <div style={{ width: "100%", height: "100%", borderRadius: 12, background: p.color }} />
      );
  }
}

export default function Stage({ selectedId, onSelect, playhead, playing }: StageProps) {
  const { state, dispatch } = useEditor();
  const { project } = state;
  const wrapRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const scaleRef = useRef(1);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const update = () => {
      const pad = 48;
      const w = Math.max(80, el.clientWidth - pad);
      const h = Math.max(60, el.clientHeight - pad);
      const s = Math.max(0.08, Math.min(w / project.canvas.width, h / project.canvas.height));
      setScale(s);
      scaleRef.current = s;
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [project.canvas.width, project.canvas.height]);

  const frame = Math.round(playhead);

  const startDrag = (e: React.PointerEvent, el: SceneElement) => {
    if (playing) return;
    e.preventDefault();
    e.stopPropagation();
    onSelect(el.id);
    const startX = e.clientX;
    const startY = e.clientY;
    const s0 = sampleElement(el, frame);
    let pushed = false;
    const onMove = (ev: PointerEvent) => {
      const dx = (ev.clientX - startX) / scaleRef.current;
      const dy = (ev.clientY - startY) / scaleRef.current;
      if (!pushed) {
        dispatch({ type: "beginDrag" });
        pushed = true;
      }
      dispatch({
        type: "patchKeyframe",
        id: el.id,
        frame,
        patch: { x: Math.round(s0.x + dx), y: Math.round(s0.y + dy) },
        _transient: true,
      });
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  const cw = project.canvas.width;
  const ch = project.canvas.height;

  return (
    <div className="stage" ref={wrapRef}>
      <div
        className="stage-inner"
        style={{ width: cw * scale, height: ch * scale }}
        onPointerDown={() => onSelect(null)}
      >
        <div
          className="canvas"
          style={{
            width: cw,
            height: ch,
            transform: `scale(${scale})`,
            transformOrigin: "0 0",
            background: project.canvas.background,
          }}
        >
          {project.elements.length === 0 && (
            <div className="canvas-empty">画布为空 · 从左侧添加形状或文字</div>
          )}
          {project.elements.map((el) => {
            const p = sampleElement(el, playhead);
            return (
              <div
                key={el.id}
                className={"scene-el" + (selectedId === el.id ? " selected" : "")}
                style={{
                  position: "absolute",
                  left: p.x - el.width / 2,
                  top: p.y - el.height / 2,
                  width: el.width,
                  height: el.height,
                  transform: `perspective(900px) rotateX(${p.rotateX}deg) rotateY(${p.rotateY}deg) rotate(${p.rotate}deg) scale(${p.scale}) skewX(${p.skewX}deg) skewY(${p.skewY}deg)`,
                  filter: p.blur > 0.05 ? `blur(${p.blur.toFixed(2)}px)` : undefined,
                  opacity: p.opacity,
                  cursor: playing ? "default" : "move",
                }}
                onPointerDown={(e) => startDrag(e, el)}
              >
                <ElementBody el={el} p={p} />
                {el.type !== "text" && el.text ? (
                  <div
                    className="el-label"
                    style={{
                      color: el.text.color,
                      fontSize: el.text.fontSize,
                      fontWeight: el.text.bold ? 700 : 400,
                    }}
                  >
                    {p.text}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>
      <motion.div
        className="stage-badge"
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        {cw} × {ch} · 缩放 {(scale * 100).toFixed(0)}%
      </motion.div>
    </div>
  );
}
