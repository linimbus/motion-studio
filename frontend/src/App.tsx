import { useCallback, useEffect, useRef, useState } from "react";
import { animate } from "motion";
import { EditorProvider, useEditor } from "./store";
import * as api from "./api";
import type { ProjectSummary } from "./types";
import TopBar, { type SaveStatus } from "./components/TopBar";
import LeftPanel from "./components/LeftPanel";
import Stage from "./components/Stage";
import RightPanel from "./components/RightPanel";
import Timeline from "./components/Timeline";

function Editor() {
  const { state, dispatch } = useEditor();
  const { project } = state;

  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [currentId, setCurrentId] = useState<number | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [playhead, setPlayheadRaw] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [loop, setLoop] = useState(false);
  const [status, setStatus] = useState<SaveStatus>("loading");

  const playheadRef = useRef(0);
  const setPlayhead = (v: number) => {
    playheadRef.current = v;
    setPlayheadRaw(v);
  };

  /* ---------------- 工程加载 ---------------- */
  const refreshList = useCallback(async () => {
    const list = await api.listProjects();
    setProjects(list);
    return list;
  }, []);

  const openProject = useCallback(async (id: number) => {
    const p = await api.getProject(id);
    skipAutosave.current = true;
    dispatch({ type: "load", project: p });
    setCurrentId(id);
    setSelectedId(null);
    setPlaying(false);
    setPlayhead(0);
    setStatus("saved");
  }, [dispatch]);

  useEffect(() => {
    (async () => {
      try {
        let list = await api.listProjects();
        if (!list.length) {
          await api.createProject("示例项目");
          list = await api.listProjects();
        }
        setProjects(list);
        if (list.length) await openProject(list[0].id);
        else setStatus("error");
      } catch (err) {
        alert(err instanceof Error ? `加载失败：${err.message}` : "加载失败");
        setStatus("error");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ---------------- 自动保存 ---------------- */
  const skipAutosave = useRef(false);
  const loadedOnce = useRef(false);
  useEffect(() => {
    if (!currentId) return;
    if (skipAutosave.current) {
      skipAutosave.current = false;
      return;
    }
    if (!loadedOnce.current) {
      loadedOnce.current = true;
      return;
    }
    setStatus("saving");
    const t = setTimeout(async () => {
      try {
        await api.saveProject({ ...state.project, id: currentId });
        setStatus("saved");
        setProjects((list) =>
          list.map((p) => (p.id === currentId ? { ...p, name: state.project.name } : p)),
        );
      } catch {
        setStatus("error");
      }
    }, 900);
    return () => clearTimeout(t);
  }, [state.project, currentId]);

  /* ---------------- 播放（Motion animate 驱动，每帧 frameDuration 秒） ---------------- */
  const frameCount = project.frameCount;
  const frameDuration = project.frameDuration;
  useEffect(() => {
    if (!playing) return;
    const target = Math.max(0, frameCount - 1);
    const duration = Math.max(0.05, target * frameDuration);
    const controls = animate(0, target, {
      duration,
      ease: (t: number) => t,
      repeat: loop ? Infinity : 0,
      onUpdate: (v) => setPlayhead(v),
    });
    return () => controls.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, loop, frameCount, frameDuration]);

  /* ---------------- 帧数收缩时钳制播放头 ---------------- */
  useEffect(() => {
    if (playheadRef.current > frameCount - 1) setPlayhead(frameCount - 1);
  }, [frameCount]);

  /* ---------------- 快捷键 ---------------- */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      const typing = tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        dispatch({ type: e.shiftKey ? "redo" : "undo" });
        return;
      }
      if (typing) return;
      if (e.code === "Space") {
        e.preventDefault();
        setPlaying((p) => !p);
      } else if (e.code === "ArrowLeft") {
        setPlaying(false);
        setPlayhead(Math.max(0, Math.round(playheadRef.current) - 1));
      } else if (e.code === "ArrowRight") {
        setPlaying(false);
        setPlayhead(Math.min(frameCount - 1, Math.round(playheadRef.current) + 1));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dispatch, frameCount]);

  /* ---------------- 工程管理操作 ---------------- */
  const handleNew = async () => {
    const name = prompt("新工程名称：", "未命名项目");
    if (name === null) return;
    const p = await api.createProject(name.trim() || "未命名项目");
    await refreshList();
    await openProject(p.id!);
  };

  const handleRename = () => {
    const name = prompt("重命名工程：", project.name);
    if (name === null || !name.trim()) return;
    dispatch({ type: "setMeta", patch: { name: name.trim() } });
  };

  const handleDelete = async () => {
    if (!currentId) return;
    if (!confirm(`确定删除工程「${project.name}」？此操作不可恢复。`)) return;
    await api.deleteProject(currentId);
    let list = await refreshList();
    if (!list.length) {
      await api.createProject("未命名项目");
      list = await refreshList();
    }
    await openProject(list[0].id);
  };

  const handleManualSave = async () => {
    if (!currentId) return;
    setStatus("saving");
    try {
      await api.saveProject({ ...project, id: currentId });
      setStatus("saved");
    } catch {
      setStatus("error");
    }
  };

  const currentFrame = Math.min(Math.round(playhead), frameCount - 1);

  return (
    <div className="app">
      <TopBar
        projects={projects}
        currentId={currentId}
        project={project}
        status={status}
        canUndo={state.past.length > 0}
        canRedo={state.future.length > 0}
        onOpen={(id) => openProject(id)}
        onNew={handleNew}
        onRename={handleRename}
        onDelete={handleDelete}
        onUndo={() => dispatch({ type: "undo" })}
        onRedo={() => dispatch({ type: "redo" })}
        onImported={async (id) => {
          await refreshList();
          await openProject(id);
        }}
        onManualSave={handleManualSave}
      />
      <div className="workspace">
        <LeftPanel selectedId={selectedId} onSelect={setSelectedId} />
        <div className="stage-col">
          <Stage
            selectedId={selectedId}
            onSelect={setSelectedId}
            playhead={playhead}
            playing={playing}
          />
        </div>
        <RightPanel selectedId={selectedId} onSelect={setSelectedId} frame={currentFrame} />
      </div>
      <Timeline
        playhead={playhead}
        setPlayhead={setPlayhead}
        playing={playing}
        setPlaying={setPlaying}
        loop={loop}
        setLoop={setLoop}
        selectedId={selectedId}
        onSelect={setSelectedId}
      />
    </div>
  );
}

export default function App() {
  return (
    <EditorProvider>
      <Editor />
    </EditorProvider>
  );
}
