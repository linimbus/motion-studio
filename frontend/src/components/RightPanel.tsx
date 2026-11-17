import { useState } from "react";
import { useEditor } from "../store";
import { EASING_OPTIONS, sampleElement } from "../lib/anim";
import { ACTION_CATALOG, DIRECTION_LABEL, buildActionKeyframes } from "../lib/actions";
import type { Keyframe } from "../types";

interface RightPanelProps {
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  frame: number;
}

function NumberField({
  label,
  value,
  step = 1,
  onChange,
}: {
  label: string;
  value: number;
  step?: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      <input
        className="input"
        type="number"
        step={step}
        value={Number.isFinite(value) ? Math.round(value * 100) / 100 : 0}
        onChange={(e) => {
          const v = parseFloat(e.target.value);
          if (!Number.isNaN(v)) onChange(v);
        }}
      />
    </label>
  );
}

function ColorField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      <span className="color-row">
        <input
          className="color-picker"
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
        <input
          className="input color-hex"
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      </span>
    </label>
  );
}

export default function RightPanel({ selectedId, onSelect, frame }: RightPanelProps) {
  const { state, dispatch } = useEditor();
  const { project } = state;
  const el = project.elements.find((e) => e.id === selectedId) ?? null;

  /* ---------------- 动作预设状态（须在条件返回前声明） ---------------- */
  const [actionId, setActionId] = useState("slideIn");
  const [actDuration, setActDuration] = useState(2);
  const [actDirection, setActDirection] = useState("left");
  const [actDistance, setActDistance] = useState(240);
  const [actColor, setActColor] = useState("#f472b6");
  const actionDef = ACTION_CATALOG.find((a) => a.id === actionId) ?? ACTION_CATALOG[0];

  const pickAction = (id: string) => {
    const def = ACTION_CATALOG.find((a) => a.id === id);
    setActionId(id);
    if (def) {
      setActDirection(def.directions?.[0] ?? "left");
      setActDistance(def.defaultDistance ?? 240);
      setActDuration(Math.max(def.minDuration ?? 1, 2));
    }
  };


  /* ---------------- 未选中元素：显示画布设置 ---------------- */
  if (!el) {
    return (
      <aside className="panel right-panel">
        <section className="panel-section">
          <h3 className="panel-title">画布设置</h3>
          <div className="field-grid">
            <NumberField
              label="宽度"
              value={project.canvas.width}
              onChange={(v) =>
                dispatch({
                  type: "setMeta",
                  patch: { canvas: { ...project.canvas, width: Math.max(120, Math.min(2000, v)) } },
                })
              }
            />
            <NumberField
              label="高度"
              value={project.canvas.height}
              onChange={(v) =>
                dispatch({
                  type: "setMeta",
                  patch: { canvas: { ...project.canvas, height: Math.max(120, Math.min(2000, v)) } },
                })
              }
            />
          </div>
          <ColorField
            label="背景色"
            value={project.canvas.background}
            onChange={(v) =>
              dispatch({ type: "setMeta", patch: { canvas: { ...project.canvas, background: v } } })
            }
          />
        </section>
        <section className="panel-section">
          <h3 className="panel-title">提示</h3>
          <ul className="hint-list">
            <li>点击左侧形状库可向画布添加元素</li>
            <li>在画布中拖动元素 = 修改其在当前帧的位置（自动记录关键帧）</li>
            <li>时间轴上点击帧编号可跳转；圆点是已记录的关键帧</li>
            <li>选中元素后可编辑位置 / 缩放 / 旋转 / 透明度 / 颜色及缓动</li>
            <li>空格键播放 / 暂停，⌘Z 撤销，⌘⇧Z 重做</li>
          </ul>
        </section>
      </aside>
    );
  }

  /* ---------------- 选中元素 ---------------- */
  const kf = el.keyframes.find((k) => k.frame === frame) ?? null;
  const sampled = sampleElement(el, frame);
  // 展示值：当前帧有关键帧则用关键帧，否则显示插值结果（编辑时自动创建关键帧）
  const v = kf ?? sampled;
  const hasKf = kf !== null;

  const patchKf = (
    patch: Omit<Partial<Keyframe>, "text"> & { text?: string | null },
    transient = false,
  ) =>
    dispatch({ type: "patchKeyframe", id: el.id, frame, patch, _transient: transient });

  const addKeyframeHere = () =>
    dispatch({
      type: "upsertKeyframe",
      id: el.id,
      kf: { ...(kf ?? { frame, ...sampled, easing: "easeInOut" as const }), frame },
    });

  return (
    <aside className="panel right-panel">
      <section className="panel-section">
        <h3 className="panel-title">
          元素属性
          <span className="type-badge">
            {el.type === "rect"
              ? "矩形"
              : el.type === "circle"
                ? "圆形"
                : el.type === "triangle"
                  ? "三角形"
                  : el.type === "star"
                    ? "星形"
                    : "文字"}
          </span>
        </h3>
        <label className="field">
          <span className="field-label">名称</span>
          <input
            className="input"
            type="text"
            value={el.name}
            onChange={(e) =>
              dispatch({ type: "updateElement", id: el.id, patch: { name: e.target.value } })
            }
          />
        </label>
        <div className="field-grid">
          <NumberField
            label="宽度"
            value={el.width}
            onChange={(w) =>
              dispatch({ type: "updateElement", id: el.id, patch: { width: Math.max(8, w) } })
            }
          />
          <NumberField
            label="高度"
            value={el.height}
            onChange={(h) =>
              dispatch({ type: "updateElement", id: el.id, patch: { height: Math.max(8, h) } })
            }
          />
        </div>
        <div className="btn-row">
          <button className="btn" onClick={() => dispatch({ type: "moveLayer", id: el.id, dir: 1 })}>
            图层上移
          </button>
          <button className="btn" onClick={() => dispatch({ type: "moveLayer", id: el.id, dir: -1 })}>
            图层下移
          </button>
        </div>
        <div className="btn-row">
          <button
            className="btn danger"
            onClick={() => {
              dispatch({ type: "deleteElement", id: el.id });
              onSelect(null);
            }}
          >
            删除元素
          </button>
        </div>
      </section>

      <section className="panel-section">
        <h3 className="panel-title">
          关键帧 · 第 {frame + 1} 帧
          <span className={"kf-state " + (hasKf ? "on" : "off")}>
            {hasKf ? "已记录" : "未记录"}
          </span>
        </h3>
        {!hasKf && (
          <p className="section-tip">当前显示的是插值预览，修改任意属性将自动创建关键帧</p>
        )}
        <div className="btn-row">
          <button className="btn primary" onClick={addKeyframeHere} disabled={hasKf}>
            在当前帧记录关键帧
          </button>
          <button
            className="btn"
            disabled={!hasKf || el.keyframes.length <= 1}
            onClick={() => dispatch({ type: "deleteKeyframe", id: el.id, frame })}
          >
            删除关键帧
          </button>
        </div>
        <div className="field-grid">
          <NumberField label="中心 X" value={v.x} onChange={(x) => patchKf({ x })} />
          <NumberField label="中心 Y" value={v.y} onChange={(y) => patchKf({ y })} />
        </div>
        <div className="field-grid">
          <NumberField
            label="缩放"
            step={0.05}
            value={v.scale}
            onChange={(scale) => patchKf({ scale })}
          />
          <NumberField label="旋转°" value={v.rotate} onChange={(rotate) => patchKf({ rotate })} />
        </div>
        <div className="field-grid">
          <NumberField
            label="3D旋转X°"
            value={v.rotateX ?? 0}
            onChange={(rotateX) => patchKf({ rotateX })}
          />
          <NumberField
            label="3D旋转Y°"
            value={v.rotateY ?? 0}
            onChange={(rotateY) => patchKf({ rotateY })}
          />
        </div>
        <div className="field-grid">
          <NumberField
            label="倾斜X°"
            value={v.skewX ?? 0}
            onChange={(skewX) => patchKf({ skewX })}
          />
          <NumberField
            label="倾斜Y°"
            value={v.skewY ?? 0}
            onChange={(skewY) => patchKf({ skewY })}
          />
        </div>
        <NumberField
          label="模糊 (px)"
          step={0.5}
          value={v.blur ?? 0}
          onChange={(blur) => patchKf({ blur: Math.max(0, Math.min(60, blur)) })}
        />
        <NumberField
          label="透明度 (0-1)"
          step={0.05}
          value={v.opacity}
          onChange={(opacity) => patchKf({ opacity: Math.max(0, Math.min(1, opacity)) })}
        />
        <ColorField label="颜色（随帧变化）" value={v.color} onChange={(color) => patchKf({ color })} />
        <label className="field">
          <span className="field-label">进入该帧的缓动</span>
          <select
            className="input select"
            value={kf?.easing ?? "easeInOut"}
            disabled={!hasKf}
            onChange={(e) => patchKf({ easing: e.target.value as Keyframe["easing"] })}
          >
            {EASING_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
      </section>

      <section className="panel-section">
        <h3 className="panel-title">动作预设</h3>
        <p className="section-tip">
          将从当前帧（第 {frame + 1} 帧）开始，自动生成该动作的关键帧
        </p>
        <label className="field">
          <span className="field-label">动作</span>
          <select
            className="input select"
            value={actionId}
            onChange={(e) => pickAction(e.target.value)}
          >
            {ACTION_CATALOG.map((a) => (
              <option key={a.id} value={a.id}>
                {a.label} · {a.description}
              </option>
            ))}
          </select>
        </label>
        <div className="field-grid">
          <NumberField
            label="时长（帧）"
            value={actDuration}
            onChange={(d) => setActDuration(Math.max(1, Math.min(10, Math.round(d))))}
          />
          {actionDef.directions ? (
            <label className="field">
              <span className="field-label">方向</span>
              <select
                className="input select"
                value={actDirection}
                onChange={(e) => setActDirection(e.target.value)}
              >
                {actionDef.directions.map((d) => (
                  <option key={d} value={d}>
                    {DIRECTION_LABEL[d] ?? d}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <span />
          )}
        </div>
        {actionDef.defaultDistance != null && (
          <NumberField
            label="位移距离"
            value={actDistance}
            onChange={(d) => setActDistance(Math.max(10, Math.min(800, Math.round(d))))}
          />
        )}
        {actionDef.usesColor && (
          <ColorField label="闪变目标色" value={actColor} onChange={setActColor} />
        )}
        <div className="btn-row">
          <button
            className="btn primary"
            onClick={() => {
              try {
                const kfs = buildActionKeyframes(el, {
                  action: actionId,
                  startFrame: frame,
                  duration: actDuration,
                  direction: actDirection,
                  distance: actDistance,
                  color: actColor,
                });
                dispatch({ type: "applyKeyframes", id: el.id, kfs });
              } catch (err) {
                alert(err instanceof Error ? err.message : "应用失败");
              }
            }}
          >
            应用到当前帧
          </button>
        </div>
      </section>

      <section className="panel-section">
        <h3 className="panel-title">
          文字
          {el.type !== "text" && (
            <label className="mini-toggle">
              <input
                type="checkbox"
                checked={el.text !== null}
                onChange={(e) =>
                  dispatch({
                    type: "updateElement",
                    id: el.id,
                    patch: {
                      text: e.target.checked
                        ? { content: "绑定文字", fontSize: 18, color: "#ffffff", bold: false }
                        : null,
                    },
                  })
                }
              />
              绑定到元素
            </label>
          )}
        </h3>
        {el.text ? (
          <>
            <label className="field">
              <span className="field-label">
                当前帧文字内容
                <span className={"kf-state " + (kf?.text != null ? "on" : "off")}>
                  {kf?.text != null ? "本帧覆盖" : "继承默认"}
                </span>
              </span>
              <textarea
                className="input textarea"
                rows={2}
                value={kf?.text != null ? kf.text : el.text.content}
                onChange={(e) => patchKf({ text: e.target.value })}
              />
            </label>
            {kf?.text != null && (
              <div className="btn-row">
                <button className="btn" onClick={() => patchKf({ text: null })}>
                  恢复继承默认文字
                </button>
              </div>
            )}
            <label className="field">
              <span className="field-label">默认文字（无覆盖的帧使用）</span>
              <textarea
                className="input textarea"
                rows={2}
                value={el.text.content}
                onChange={(e) =>
                  dispatch({
                    type: "updateElement",
                    id: el.id,
                    patch: { text: { ...el.text!, content: e.target.value } },
                  })
                }
              />
            </label>
            <div className="field-grid">
              <NumberField
                label="字号"
                value={el.text.fontSize}
                onChange={(fontSize) =>
                  dispatch({
                    type: "updateElement",
                    id: el.id,
                    patch: { text: { ...el.text!, fontSize: Math.max(8, fontSize) } },
                  })
                }
              />
              <label className="field">
                <span className="field-label">加粗</span>
                <label className="mini-toggle alone">
                  <input
                    type="checkbox"
                    checked={el.text.bold}
                    onChange={(e) =>
                      dispatch({
                        type: "updateElement",
                        id: el.id,
                        patch: { text: { ...el.text!, bold: e.target.checked } },
                      })
                    }
                  />
                  Bold
                </label>
              </label>
            </div>
            {el.type !== "text" && (
              <ColorField
                label="文字颜色"
                value={el.text.color}
                onChange={(color) =>
                  dispatch({
                    type: "updateElement",
                    id: el.id,
                    patch: { text: { ...el.text!, color } },
                  })
                }
              />
            )}
            {el.type === "text" && (
              <p className="section-tip">文字元素的文字颜色使用上方可动画的「颜色」属性</p>
            )}
          </>
        ) : (
          <p className="section-tip">勾选「绑定到元素」后，文字将跟随元素一起移动与变换</p>
        )}
      </section>
    </aside>
  );
}
