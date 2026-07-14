import { describe, expect, test } from "bun:test"
import {
  projectUsageKey,
  rankProjectsByUsage,
  recordProjectUsage,
  shouldRecordProjectSwitch,
  type ProjectUsageState,
} from "./home-project-ranking"

const projects = [
  { worktree: "F:\\augment\\alpha" },
  { worktree: "F:\\augment\\beta" },
  { worktree: "F:\\augment\\gamma" },
]

const emptyUsage = (): ProjectUsageState => ({ desktop: {}, mobile: {} })

describe("home project ranking", () => {
  test("ranks higher switch counts first", () => {
    const server = "https://opencode.example.com"
    const usage = {
      [projectUsageKey(server, projects[0].worktree)]: { count: 2, lastUsed: 30 },
      [projectUsageKey(server, projects[1].worktree)]: { count: 5, lastUsed: 10 },
    }

    expect(rankProjectsByUsage(projects, server, usage).map((project) => project.worktree)).toEqual([
      projects[1].worktree,
      projects[0].worktree,
      projects[2].worktree,
    ])
  })

  test("uses most recent switch to break count ties", () => {
    const server = "https://opencode.example.com"
    const usage = {
      [projectUsageKey(server, projects[0].worktree)]: { count: 3, lastUsed: 20 },
      [projectUsageKey(server, projects[2].worktree)]: { count: 3, lastUsed: 40 },
    }

    expect(rankProjectsByUsage(projects, server, usage).map((project) => project.worktree)).toEqual([
      projects[2].worktree,
      projects[0].worktree,
      projects[1].worktree,
    ])
  })

  test("preserves official order for unused projects and equal statistics", () => {
    const server = "sidecar"
    const usage = {
      [projectUsageKey(server, projects[0].worktree)]: { count: 1, lastUsed: 10 },
      [projectUsageKey(server, projects[1].worktree)]: { count: 1, lastUsed: 10 },
    }

    expect(rankProjectsByUsage(projects, server, usage)).toEqual(projects)
    expect(rankProjectsByUsage(projects, server, {})).toEqual(projects)
    expect(rankProjectsByUsage(projects, server, {})).not.toBe(projects)
  })

  test("normalizes server and Windows path identity", () => {
    expect(projectUsageKey("https://OPENCODE.example.com/", "F:\\Augment\\Demo\\")).toBe(
      projectUsageKey("https://opencode.example.com", "f:/augment/demo"),
    )
    expect(projectUsageKey("server-a", "/srv/demo")).not.toBe(projectUsageKey("server-b", "/srv/demo"))
  })

  test("records desktop and mobile usage independently", () => {
    const server = "https://opencode.example.com"
    const desktop = recordProjectUsage(emptyUsage(), "desktop", server, "F:\\augment\\alpha", 100)
    const mobile = recordProjectUsage(desktop, "mobile", server, "F:/augment/alpha", 200)
    const repeated = recordProjectUsage(mobile, "desktop", server, "F:/augment/alpha", 300)
    const key = projectUsageKey(server, "F:/augment/alpha")

    expect(repeated.desktop[key]).toEqual({ count: 2, lastUsed: 300 })
    expect(repeated.mobile[key]).toEqual({ count: 1, lastUsed: 200 })
  })

  test("records only switches to a different normalized project", () => {
    expect(
      shouldRecordProjectSwitch(
        { server: "https://OPENCODE.example.com/", directory: "F:\\Augment\\Demo\\" },
        "https://opencode.example.com",
        "f:/augment/demo",
      ),
    ).toBe(false)
    expect(
      shouldRecordProjectSwitch(
        { server: "https://opencode.example.com", directory: "F:/augment/other" },
        "https://opencode.example.com",
        "F:/augment/demo",
      ),
    ).toBe(true)
    expect(
      shouldRecordProjectSwitch(
        { server: "https://opencode.example.com" },
        "https://opencode.example.com",
        "F:/augment/demo",
      ),
    ).toBe(true)
  })
})
