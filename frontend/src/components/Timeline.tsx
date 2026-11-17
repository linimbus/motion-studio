import { useEditor } from "../store";

interface TimelineProps {
  playhead: number;
  setPlayhead: (v: number) => void;
  playing: boolean;
  setPlaying: (v: boolean) => void;
  loop: boolean;
  setLoop: (v: boolean) => void;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}

const CELL = 64;
const TYPE_ICON: Record<string, string> = {
  rect: "▭",
  circle: "●",
  triangle: "▲",
  star: "★",
  text: "T",
};

export default function Timeline({
  playhead,
  setPlayhead,
  playing,
  setPlaying,
  loop,
  setLoop,
  selectedId,
  onSelect,
}: TimelineProps) {
  const { state, dispatch } = useEditor();
  const { project } = state;
  const frames = Array.from({ length: project.frameCount }, (_, i) => i);
  const current = Math.round(playhead);
  const seconds = (playhead * project.frameDuration).toFixed(2);

  const setFrameCount = (n: number) => {
    const next = Math.max(2, Math.min(60, n));
    dispatch({ type: "setMeta", patch: { frameCount: next } });
    if (playhead > next - 1) setPlayhead(next - 1);
  };

  const tracksWidth = project.frameCount * CELL;

  return (
    <div className="timeline">
      <div className="tl-toolbar">
        <button
          className="btn icon"
          title="回到第 1 帧"
          onClick={() => {
            setPlayhead(0);
          }}
        >
          ⏮
        </button>
        <button
          className="btn icon primary"
          title={playing ? "暂停" : "播放"}
          onClick={() => setPlaying(!playing)}
        >
          {playing ? "⏸" : "▶"}
        </button>
        <button
          className="btn icon"
          title="跳到最后一帧"
          onClick={() => {
            setPlaying(false);
            setPlayhead(project.frameCount - 1);
          }}
        >
          ⏭
        </button>
        <label className="loop-toggle">
          <input
            type="checkbox"
            checked={loop}
            onChange={(e) => setLoop(e.target.checked)}
          />
          循环
        </label>
        <span className="tl-time">
          第 {Math.min(current + 1, project.frameCount)} / {project.frameCount} 帧 ·{" "}
          {seconds}s
        </span>
        <div className="tl-spacer" />
        <label className="tl-label">每帧时长</label>
        <select
          className="input select"
          value={project.frameDuration}
          onChange={(e) =>
            dispatch({
              type: "setMeta",
              patch: { frameDuration: Number(e.target.value) },
            })
          }
        >
          <option value={0.25}>0.25 秒</option>
          <option value={0.5}>0.5 秒</option>
          <option value={1}>1 秒</option>
          <option value={2}>2 秒</option>
        </select>
        <button className="btn" onClick={() => setFrameCount(project.frameCount + 1)}>
          ＋帧
        </button>
        <button className="btn" onClick={() => setFrameCount(project.frameCount - 1)}>
          －帧
        </button>
      </div>

      <div className="tl-body">
        <div className="tl-names">
          <div className="tl-row tl-head">帧</div>
          {project.elements.map((el) => (
            <div
              key={el.id}
              className={"tl-row tl-name" + (selectedId === el.id ? " active" : "")}
              onClick={() => onSelect(el.id)}
              title={el.name}
            >
              <span className="layer-icon">{TYPE_ICON[el.type]}</span>
              <span className="layer-name">{el.name}</span>
            </div>
          ))}
        </div>
        <div className="tl-tracks">
          <div style={{ width: tracksWidth, position: "relative" }}>
            {/* 帧标尺 */}
            <div className="tl-row tl-ruler">
              {frames.map((f) => (
                <div
                  key={f}
                  className={"tl-cell" + (current === f ? " current" : "")}
                  style={{ width: CELL }}
                  onClick={() => {
                    setPlaying(false);
                    setPlayhead(f);
                  }}
                >
                  {f + 1}
                </div>
              ))}
            </div>
            {/* 每个元素的关键帧轨道 */}
            {project.elements.map((el) => (
              <div
                key={el.id}
                className={"tl-row tl-track" + (selectedId === el.id ? " active" : "")}
                onClick={() => onSelect(el.id)}
              >
                {frames.map((f) => (
                  <div key={f} className="tl-cell" style={{ width: CELL }} />
                ))}
                {el.keyframes.map((kf) => (
                  <button
                    key={kf.frame}
                    className={"tl-dot" + (current === kf.frame ? " current" : "")}
                    title={`${el.name} · 第 ${kf.frame + 1} 帧关键帧`}
                    style={{ left: (kf.frame + 0.5) * CELL - 7 }}
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelect(el.id);
                      setPlaying(false);
                      setPlayhead(kf.frame);
                    }}
                  />
                ))}
              </div>
            ))}
            {/* 播放头 */}
            <div
              className="tl-playhead"
              style={{ left: (playhead + 0.5) * CELL - 1 }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
