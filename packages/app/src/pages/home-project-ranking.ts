import { pathKey } from "@/utils/path-key"

export type ProjectUsageMode = "desktop" | "mobile"
export type ProjectUsage = { count: number; lastUsed: number }
export type ProjectUsageState = Record<ProjectUsageMode, Record<string, ProjectUsage>>

function normalizedServerKey(server: string) {
  return server.trim().replace(/\/+$/, "").toLowerCase()
}

function normalizedProjectPath(directory: string) {
  const key = pathKey(directory)
  if (/^[a-z]:\//i.test(key) || key.startsWith("//")) return key.toLowerCase()
  return key
}

export function projectUsageKey(server: string, directory: string) {
  return JSON.stringify([normalizedServerKey(server), normalizedProjectPath(directory)])
}

export function rankProjectsByUsage<T extends { worktree: string }>(
  projects: T[],
  server: string,
  usage: Record<string, ProjectUsage>,
) {
  return projects
    .map((project, index) => ({ project, index, usage: usage[projectUsageKey(server, project.worktree)] }))
    .sort((a, b) => {
      if (!a.usage && !b.usage) return a.index - b.index
      if (!a.usage) return 1
      if (!b.usage) return -1
      if (a.usage.count !== b.usage.count) return b.usage.count - a.usage.count
      if (a.usage.lastUsed !== b.usage.lastUsed) return b.usage.lastUsed - a.usage.lastUsed
      return a.index - b.index
    })
    .map((item) => item.project)
}

export function shouldRecordProjectSwitch(
  current: { server: string; directory?: string },
  server: string,
  directory: string,
) {
  if (!current.directory) return true
  return projectUsageKey(current.server, current.directory) !== projectUsageKey(server, directory)
}

export function recordProjectUsage(
  state: ProjectUsageState,
  mode: ProjectUsageMode,
  server: string,
  directory: string,
  now: number,
): ProjectUsageState {
  const key = projectUsageKey(server, directory)
  const current = state[mode][key]
  return {
    ...state,
    [mode]: {
      ...state[mode],
      [key]: {
        count: (current?.count ?? 0) + 1,
        lastUsed: now,
      },
    },
  }
}
