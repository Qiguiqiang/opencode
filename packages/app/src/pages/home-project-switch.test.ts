import { describe, expect, test } from "bun:test"
import { homeProjectSwitchState } from "./home-project-switch"

describe("home project switching", () => {
  test("keeps the selected project visible while hiding stale sessions during loading", () => {
    const state = homeProjectSwitchState({
      projectName: "MAYADEV",
      fallbackTitle: "Recent sessions",
      loading: true,
      content: ["previous project session"],
    })

    expect(state).toEqual({
      title: "MAYADEV",
      selected: true,
      loading: true,
      content: [],
    })
  })

  test("shows the global list label and content when no project is selected", () => {
    const state = homeProjectSwitchState({
      fallbackTitle: "Recent sessions",
      loading: false,
      content: ["session"],
    })

    expect(state).toEqual({
      title: "Recent sessions",
      selected: false,
      loading: false,
      content: ["session"],
    })
  })
})
