import { describe, expect, test } from "bun:test"
import type { PermissionRequest, Session } from "@opencode-ai/sdk/v2/client"
import { base64Encode } from "@opencode-ai/core/util/encode"
import * as PermissionAutoRespond from "./permission-auto-respond"

const session = (input: { id: string; parentID?: string }) =>
  ({
    id: input.id,
    parentID: input.parentID,
  }) as Session

const permission = (sessionID: string) =>
  ({
    sessionID,
  }) as Pick<PermissionRequest, "sessionID">

describe("permission auto-response", () => {
  test("persists approval for subsequent matching requests", () => {
    expect(PermissionAutoRespond.AUTO_ACCEPT_RESPONSE).toBe("always")
  })
})

describe("directory-scoped keys", () => {
  test("normalizes Windows separators and trailing separators", () => {
    expect(PermissionAutoRespond.acceptKey("ses_123", "F:\\augment\\project\\")).toBe(
      PermissionAutoRespond.acceptKey("ses_123", "F:/augment/project"),
    )
    expect(PermissionAutoRespond.directoryAcceptKey("F:/augment/project/")).toBe(
      PermissionAutoRespond.directoryAcceptKey("F:\\augment\\project"),
    )
  })

  test("keeps a Windows drive root intact", () => {
    expect(PermissionAutoRespond.directoryAcceptKey("F:\\")).toBe(
      PermissionAutoRespond.directoryAcceptKey("F:/"),
    )
  })
})

describe("autoRespondsPermission", () => {
  test("uses a parent session's directory-scoped auto-accept", () => {
    const directory = "/tmp/project"
    const sessions = [session({ id: "root" }), session({ id: "child", parentID: "root" })]
    const autoAccept = {
      [`${base64Encode(directory)}/root`]: true,
    }

    expect(PermissionAutoRespond.autoRespondsPermission(autoAccept, sessions, permission("child"), directory)).toBe(true)
  })

  test("uses a parent session's legacy auto-accept key", () => {
    const sessions = [session({ id: "root" }), session({ id: "child", parentID: "root" })]

    expect(
      PermissionAutoRespond.autoRespondsPermission({ root: true }, sessions, permission("child"), "/tmp/project"),
    ).toBe(true)
  })

  test("defaults to requiring approval when no lineage override exists", () => {
    const sessions = [session({ id: "root" }), session({ id: "child", parentID: "root" }), session({ id: "other" })]
    const autoAccept = {
      other: true,
    }

    expect(PermissionAutoRespond.autoRespondsPermission(autoAccept, sessions, permission("child"), "/tmp/project")).toBe(
      false,
    )
  })

  test("inherits a parent session's false override", () => {
    const directory = "/tmp/project"
    const sessions = [session({ id: "root" }), session({ id: "child", parentID: "root" })]
    const autoAccept = {
      [`${base64Encode(directory)}/root`]: false,
    }

    expect(PermissionAutoRespond.autoRespondsPermission(autoAccept, sessions, permission("child"), directory)).toBe(false)
  })

  test("prefers a child override over parent override", () => {
    const directory = "/tmp/project"
    const sessions = [session({ id: "root" }), session({ id: "child", parentID: "root" })]
    const autoAccept = {
      [`${base64Encode(directory)}/root`]: false,
      [`${base64Encode(directory)}/child`]: true,
    }

    expect(PermissionAutoRespond.autoRespondsPermission(autoAccept, sessions, permission("child"), directory)).toBe(true)
  })

  test("falls back to directory-level auto-accept", () => {
    const directory = "/tmp/project"
    const sessions = [session({ id: "root" })]
    const autoAccept = {
      [`${base64Encode(directory)}/*`]: true,
    }

    expect(PermissionAutoRespond.autoRespondsPermission(autoAccept, sessions, permission("root"), directory)).toBe(true)
  })

  test("session-level override takes precedence over directory-level", () => {
    const directory = "/tmp/project"
    const sessions = [session({ id: "root" })]
    const autoAccept = {
      [`${base64Encode(directory)}/*`]: true,
      [`${base64Encode(directory)}/root`]: false,
    }

    expect(PermissionAutoRespond.autoRespondsPermission(autoAccept, sessions, permission("root"), directory)).toBe(false)
  })
})

describe("isDirectoryAutoAccepting", () => {
  test("returns true when directory key is set", () => {
    const directory = "/tmp/project"
    const autoAccept = { [`${base64Encode(directory)}/*`]: true }
    expect(PermissionAutoRespond.isDirectoryAutoAccepting(autoAccept, directory)).toBe(true)
  })

  test("returns false when directory key is not set", () => {
    expect(PermissionAutoRespond.isDirectoryAutoAccepting({}, "/tmp/project")).toBe(false)
  })

  test("returns false when directory key is explicitly false", () => {
    const directory = "/tmp/project"
    const autoAccept = { [`${base64Encode(directory)}/*`]: false }
    expect(PermissionAutoRespond.isDirectoryAutoAccepting(autoAccept, directory)).toBe(false)
  })

  test("reads a historical backslash key through a forward-slash directory", () => {
    const autoAccept = { [`${base64Encode("F:\\augment\\project")}/*`]: true }
    expect(PermissionAutoRespond.isDirectoryAutoAccepting(autoAccept, "F:/augment/project")).toBe(true)
  })

  test("reads a historical trailing-slash key through a normalized directory", () => {
    const autoAccept = { [`${base64Encode("F:/augment/project/")}/*`]: true }
    expect(PermissionAutoRespond.isDirectoryAutoAccepting(autoAccept, "F:\\augment\\project")).toBe(true)
  })
})

describe("permissionSettingsTarget", () => {
  const resolve = (input: { sessionID?: string; sessionDirectory?: string; selectedDirectory?: string }) => {
    const target = Reflect.get(PermissionAutoRespond, "permissionSettingsTarget")
    expect(target).toBeFunction()
    if (typeof target !== "function") return
    return target(input)
  }

  test("uses the active session directory when a session is available", () => {
    expect(
      resolve({
        sessionID: "ses_123",
        sessionDirectory: "F:/augment/session-project",
        selectedDirectory: "F:/augment/home-project",
      }),
    ).toEqual({ sessionID: "ses_123", directory: "F:/augment/session-project" })
  })

  test("falls back to the selected project directory on the new home screen", () => {
    expect(resolve({ selectedDirectory: "F:/augment/home-project" })).toEqual({
      directory: "F:/augment/home-project",
    })
  })

  test("does not fall back to another project while an active session is still loading", () => {
    expect(resolve({ sessionID: "ses_123", selectedDirectory: "F:/augment/home-project" })).toBeUndefined()
  })
})
