import { base64Encode } from "@opencode-ai/core/util/encode"

export const AUTO_ACCEPT_RESPONSE = "always"

function normalizeDirectory(directory: string) {
  const windows = /^[A-Za-z]:[\\/]/.test(directory) || /^(?:\\\\|\/\/)/.test(directory)
  if (!windows) return directory === "/" ? directory : directory.replace(/\/+$/, "")

  const value = directory.replaceAll("\\", "/").replace(/^([a-z]):/, (_, drive: string) => `${drive.toUpperCase()}:`)
  if (/^[A-Z]:\/+$/i.test(value)) return `${value.slice(0, 2)}/`
  return value.replace(/\/+$/, "")
}

function directoryVariants(directory: string) {
  const normalized = normalizeDirectory(directory)
  const windows = /^[A-Za-z]:[\\/]/.test(directory) || /^(?:\\\\|\/\/)/.test(directory)
  if (!windows) return [...new Set([normalized, directory, normalized === "/" ? normalized : `${normalized}/`])]

  const backslash = normalized.replaceAll("/", "\\")
  const variants = [normalized, directory, backslash]
  if (!normalized.endsWith("/")) variants.push(`${normalized}/`)
  if (!backslash.endsWith("\\")) variants.push(`${backslash}\\`)

  if (/^[A-Z]:/.test(normalized)) {
    variants.push(`${normalized[0].toLowerCase()}${normalized.slice(1)}`)
    variants.push(`${backslash[0].toLowerCase()}${backslash.slice(1)}`)
  }

  return [...new Set(variants)]
}

function directoryKeys(directory: string, suffix: string) {
  return directoryVariants(directory).map((value) => `${base64Encode(value)}/${suffix}`)
}

export function acceptKey(sessionID: string, directory?: string) {
  if (!directory) return sessionID
  return `${base64Encode(normalizeDirectory(directory))}/${sessionID}`
}

export function directoryAcceptKey(directory: string) {
  return `${base64Encode(normalizeDirectory(directory))}/*`
}

function accepted(autoAccept: Record<string, boolean>, sessionID: string, directory?: string) {
  const sessionValue = directory
    ? directoryKeys(directory, sessionID)
        .map((key) => autoAccept[key])
        .find((value): value is boolean => value !== undefined)
    : autoAccept[sessionID]
  const directoryValue = directory
    ? directoryKeys(directory, "*")
        .map((key) => autoAccept[key])
        .find((value): value is boolean => value !== undefined)
    : undefined
  return sessionValue ?? autoAccept[sessionID] ?? directoryValue
}

export function isDirectoryAutoAccepting(autoAccept: Record<string, boolean>, directory: string) {
  return (
    directoryKeys(directory, "*")
      .map((key) => autoAccept[key])
      .find((value): value is boolean => value !== undefined) ?? false
  )
}

export function permissionSettingsTarget(input: {
  sessionID?: string
  sessionDirectory?: string
  selectedDirectory?: string
}) {
  if (input.sessionID) {
    if (!input.sessionDirectory) return
    return { sessionID: input.sessionID, directory: input.sessionDirectory }
  }
  if (!input.selectedDirectory) return
  return { directory: input.selectedDirectory }
}

function sessionLineage(session: { id: string; parentID?: string }[], sessionID: string) {
  const parent = session.reduce((acc, item) => {
    if (item.parentID) acc.set(item.id, item.parentID)
    return acc
  }, new Map<string, string>())
  const seen = new Set([sessionID])
  const ids = [sessionID]

  for (const id of ids) {
    const parentID = parent.get(id)
    if (!parentID || seen.has(parentID)) continue
    seen.add(parentID)
    ids.push(parentID)
  }

  return ids
}

export function autoRespondsPermission(
  autoAccept: Record<string, boolean>,
  session: { id: string; parentID?: string }[],
  permission: { sessionID: string },
  directory?: string,
) {
  const value = sessionLineage(session, permission.sessionID)
    .map((id) => accepted(autoAccept, id, directory))
    .find((item): item is boolean => item !== undefined)
  return value ?? false
}
