import type { Project, ProjectSummary } from "./types";

const BASE = "/api";

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let detail = `请求失败 (${res.status})`;
    try {
      const body = await res.json();
      if (body?.detail) detail = body.detail;
    } catch {
      /* ignore */
    }
    throw new Error(detail);
  }
  return res.json() as Promise<T>;
}

export async function listProjects(): Promise<ProjectSummary[]> {
  return json(await fetch(`${BASE}/projects`));
}

export async function getProject(id: number): Promise<Project> {
  return json(await fetch(`${BASE}/projects/${id}`));
}

export async function createProject(name: string): Promise<Project> {
  return json(
    await fetch(`${BASE}/projects`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    }),
  );
}

export async function saveProject(project: Project): Promise<void> {
  await json(
    await fetch(`${BASE}/projects/${project.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(project),
    }),
  );
}

export async function deleteProject(id: number): Promise<void> {
  await json(await fetch(`${BASE}/projects/${id}`, { method: "DELETE" }));
}

export async function importProject(data: unknown): Promise<Project> {
  return json(
    await fetch(`${BASE}/projects/import`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }),
  );
}

/** 下载当前工程为 .motion.json 文件（内容取自后端导出接口） */
export async function downloadExport(project: Project): Promise<void> {
  const res = await fetch(`${BASE}/projects/${project.id}/export`);
  if (!res.ok) throw new Error("导出失败");
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${project.name || "工程"}.motion.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
