import { useEditor } from "../store";
import { SHAPE_LIBRARY, createElement } from "../lib/anim";

interface LeftPanelProps {
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}

const TYPE_ICON: Record<string, string> = {
  rect: "▭",
  circle: "●",
  triangle: "▲",
  star: "★",
  text: "T",
};

export default function LeftPanel({ selectedId, onSelect }: LeftPanelProps) {
  const { state, dispatch } = useEditor();
  const { project } = state;

  const addElement = (type: (typeof SHAPE_LIBRARY)[number]["type"]) => {
    const el = createElement(type, project.elements.length, project.canvas);
    dispatch({ type: "addElement", element: el });
    onSelect(el.id);
  };

  return (
    <aside className="panel left-panel">
      <section className="panel-section">
        <h3 className="panel-title">形状库</h3>
        <div className="shape-grid">
          {SHAPE_LIBRARY.map((s) => (
            <button
              key={s.type}
              className="shape-btn"
              onClick={() => addElement(s.type)}
              title={`添加${s.label}`}
            >
              <span className="shape-icon">{s.icon}</span>
              <span>{s.label}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="panel-section layers">
        <h3 className="panel-title">图层（上层的元素在前）</h3>
        <div className="layer-list">
          {[...project.elements].reverse().map((el) => (
            <div
              key={el.id}
              className={"layer-item" + (selectedId === el.id ? " active" : "")}
              onClick={() => onSelect(el.id)}
            >
              <span className="layer-icon">{TYPE_ICON[el.type]}</span>
              <span className="layer-name" title={el.name}>
                {el.name}
              </span>
              <span className="layer-kfs">{el.keyframes.length}kf</span>
            </div>
          ))}
          {project.elements.length === 0 && (
            <div className="layer-empty">暂无图层</div>
          )}
        </div>
      </section>
    </aside>
  );
}
