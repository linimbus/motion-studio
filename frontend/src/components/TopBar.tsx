import { useRef } from "react";
import { motion } from "motion/react";
import type { Project, ProjectSummary } from "../types";
import * as api from "../api";

export type SaveStatus = "loading" | "saved" | "saving" | "error";

interface TopBarProps {
  projects: ProjectSummary[];
  currentId: number | null;
  project: Project;
  status: SaveStatus;
  canUndo: boolean;
  canRedo: boolean;
  onOpen: (id: number) => void;
  onNew: () => void;
  onRename: () => void;
  onDelete: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onImported: (id: number) => void;
  onManualSave: () => void;
}

const STATUS_TEXT: Record<SaveStatus, string> = {
  loading: "加载中…",
  saved: "已保存",
  saving: "保存中…",
  error: "保存失败，可手动重试",
};

export default function TopBar(props: TopBarProps) {
  const {
    projects,
    currentId,
    project,
    status,
    canUndo,
    canRedo,
    onOpen,
    onNew,
    onRename,
    onDelete,
    onUndo,
    onRedo,
    onImported,
    onManualSave,
  } = props;
  const fileRef = useRef<HTMLInputElement>(null);

  const doExport = async () => {
    try {
      await api.saveProject({ ...project, id: currentId! });
      await api.downloadExport({ ...project, id: currentId! });
    } catch (err) {
      alert(err instanceof Error ? err.message : "导出失败");
    }
  };

  const doImport = async (file: File) => {
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      const p = await api.importProject(data);
      onImported(p.id!);
    } catch (err) {
      alert(err instanceof Error ? `导入失败：${err.message}` : "导入失败");
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <header className="topbar">
      <motion.div
        className="brand"
        initial={{ opacity: 0, x: -8 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.35 }}
      >
        <span className="brand-logo">✦</span> Motion Studio
        <span className="brand-sub">动效工坊</span>
      </motion.div>

      <div className="topbar-group">
        <select
          className="input select project-select"
          value={currentId ?? ""}
          onChange={(e) => onOpen(Number(e.target.value))}
        >
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <button className="btn" onClick={onNew}>
          新建
        </button>
        <button className="btn" onClick={onRename}>
          重命名
        </button>
        <button className="btn danger" onClick={onDelete}>
          删除
        </button>
      </div>

      <div className="topbar-group">
        <button className="btn icon" title="撤销 (⌘Z)" disabled={!canUndo} onClick={onUndo}>
          ↩
        </button>
        <button className="btn icon" title="重做 (⌘⇧Z)" disabled={!canRedo} onClick={onRedo}>
          ↪
        </button>
      </div>

      <div className="topbar-group">
        <button className="btn" onClick={onManualSave}>
          保存
        </button>
        <span className={"save-status " + status}>{STATUS_TEXT[status]}</span>
      </div>

      <div className="topbar-group right">
        <button className="btn" onClick={() => fileRef.current?.click()}>
          导入
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".json,application/json"
          style={{ display: "none" }}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) doImport(f);
          }}
        />
        <button className="btn primary" onClick={doExport} disabled={!currentId}>
          导出
        </button>
      </div>
    </header>
  );
}
