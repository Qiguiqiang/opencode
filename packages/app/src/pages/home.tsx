import type { Session } from "@opencode-ai/sdk/v2/client"
import {
  type ComponentProps,
  createEffect,
  createMemo,
  createResource,
  For,
  Match,
  on,
  onCleanup,
  onMount,
  Show,
  startTransition,
  Switch,
} from "solid-js"
import { makeEventListener } from "@solid-primitives/event-listener"
import { createMediaQuery } from "@solid-primitives/media"
import { createStore, produce } from "solid-js/store"
import { useQuery } from "@tanstack/solid-query"
import { Button } from "@opencode-ai/ui/button"
import { Logo } from "@opencode-ai/ui/logo"
import { Spinner } from "@opencode-ai/ui/spinner"
import { ScrollView } from "@opencode-ai/ui/scroll-view"
import { ProjectAvatar } from "@opencode-ai/ui/v2/project-avatar-v2"
import { ButtonV2 } from "@opencode-ai/ui/v2/button-v2"
import { Icon as IconV2 } from "@opencode-ai/ui/v2/icon"
import { IconButtonV2 } from "@opencode-ai/ui/v2/icon-button-v2"
import { MenuV2 } from "@opencode-ai/ui/v2/menu-v2"
import { TooltipV2 } from "@opencode-ai/ui/v2/tooltip-v2"
import { getProjectAvatarVariant, useLayout, type HomeProjectSelection, type LocalProject } from "@/context/layout"
import { useLocation, useNavigate } from "@solidjs/router"
import { base64Encode } from "@opencode-ai/core/util/encode"
import { Icon } from "@opencode-ai/ui/icon"
import { usePlatform } from "@/context/platform"
import { DateTime } from "luxon"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import { useDirectoryPicker } from "@/components/directory-picker"
import { useSettingsDialog } from "@/components/settings-dialog"
import { DialogSelectServer, useServerManagementController } from "@/components/dialog-select-server"
import { DialogServerV2 } from "@/components/settings-v2/dialog-server-v2"
import { ServerConnection, serverName, useServer } from "@/context/server"
import { sessionHasOpenTab, useTabs } from "@/context/tabs"
import { useServerSync, type ServerSync } from "@/context/server-sync"
import { useLanguage } from "@/context/language"
import { useNotification } from "@/context/notification"
import {
  closeHomeProject,
  compactProjectPath,
  displayName,
  errorMessage,
  getProjectAvatarSource,
  homeProjectDirectories,
  projectForSession,
  sortedRootSessions,
  toggleHomeProjectSelection,
} from "@/pages/layout/helpers"
import { SessionTabAvatar } from "@/pages/layout/session-tab-avatar"
import { sessionTitle } from "@/utils/session-title"
import { pathKey } from "@/utils/path-key"
import { useGlobal } from "@/context/global"
import { useCommand } from "@/context/command"
import { Binary } from "@opencode-ai/core/util/binary"
import { ServerRowMenu } from "@/components/server/server-row-menu"
import { ServerHealthIndicator } from "@/components/server/server-row"
import { type ServerHealth } from "@/utils/server-health"
import { Persist, persisted } from "@/utils/persist"
import { archiveHomeSession } from "./home-session-archive"
import { shouldOpenSessionInBackground } from "./home-session-open"
import { homeProjectSwitchState } from "./home-project-switch"
import { showToast } from "@/utils/toast"
import { fileManagerApp } from "@/utils/file-manager"
import {
  projectUsageKey,
  rankProjectsByUsage,
  recordProjectUsage,
  shouldRecordProjectSwitch,
  type ProjectUsage,
} from "./home-project-ranking"
import {
  clampFloatingProjectPosition,
  blurFloatingProjectActiveElement,
  floatingProjectButtonVisualState,
  floatingProjectDestination,
  floatingProjectGestureIntent,
  floatingProjectPoint,
  floatingProjectPositionForMode,
  floatingProjectPositionState,
  floatingProjectSessionDestination,
  floatingProjectTextInputFocused,
  routedFloatingProjectSwitchVisible,
  snapFloatingProjectPosition,
  type FloatingProjectMode,
  type FloatingProjectPoint,
  type FloatingProjectPosition,
  type FloatingProjectRouteMode,
} from "./home-project-floating"

const HOME_SESSION_LIMIT = 64
const HOME_SESSION_HEADER_STICKY_TOP = 12
const HOME_SESSION_HEADER_TEXT_HEIGHT = 16
const HOME_SESSION_HEADER_FADE_DISTANCE = 16
const SHOW_HOME_SESSION_ARCHIVE = false
const HOME_ROW_LAYOUT =
  "flex min-w-0 w-full shrink-0 cursor-default items-center rounded-[6px] bg-transparent text-left transition-[background-color,color,box-shadow] duration-[120ms] ease-in-out focus-visible:outline-none"
const HOME_ROW_BASE = `${HOME_ROW_LAYOUT} border-0`
const HOME_ROW = `${HOME_ROW_BASE} [font-weight:530] text-v2-text-text-muted hover:bg-v2-overlay-simple-overlay-hover focus-visible:bg-v2-overlay-simple-overlay-hover`
const HOME_PROJECT_NAV_LABEL = "min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap"
const HOME_PROJECT_NAV_ROW = `${HOME_ROW_LAYOUT} h-7 gap-2 px-1.5 [font-weight:440] text-v2-text-text-muted hover:bg-v2-background-bg-layer-01 hover:text-v2-text-text-base hover:[box-shadow:inset_0_0_0_0.5px_var(--v2-border-border-muted)] data-[selected]:bg-v2-background-bg-layer-03 data-[selected]:text-v2-text-text-base data-[selected]:[font-weight:600] data-[selected]:[box-shadow:inset_3px_0_0_var(--v2-border-border-focus),inset_0_0_0_0.5px_var(--v2-border-border-strong)] data-[selected]:hover:bg-v2-background-bg-layer-03 focus-visible:bg-v2-background-bg-layer-01 focus-visible:text-v2-text-text-base focus-visible:[box-shadow:inset_0_0_0_0.5px_var(--v2-border-border-muted)]`
const HOME_SECTION_LABEL = "text-v2-text-text-muted [font-weight:440]"

type HomeSessionRecord = {
  session: Session
  project: LocalProject
  projectName: string
}

type HomeSessionGroup = {
  id: "today" | "yesterday" | "older"
  title: string
  sessions: HomeSessionRecord[]
}

const HOME_SESSION_SEARCH_RESULTS_ID = "home-session-search-results"
const HOME_SEARCH_RESULT_ROW =
  "flex h-10 w-full shrink-0 cursor-default items-center gap-2 border-0 py-3 pl-[18px] pr-6 text-left transition-[background-color] duration-[120ms] ease-in-out hover:bg-v2-overlay-simple-overlay-hover focus-visible:bg-v2-overlay-simple-overlay-hover focus-visible:outline-none"
const HOME_SEARCH_RESULT_TITLE =
  "min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-[13px] leading-4 tracking-[-0.04px] text-v2-text-text-base [font-weight:530]"
const HOME_SEARCH_RESULT_META =
  "min-w-0 flex-[1_1_auto] overflow-hidden text-ellipsis whitespace-nowrap text-[13px] leading-4 tracking-[-0.04px] text-v2-text-text-muted [font-weight:440]"

let pendingHomeNavigation: { server: ServerConnection.Key; href: string } | undefined

function buildHomeSessionRecords(input: {
  sync: Pick<ServerSync, "child">
  projectDirectories: () => string[]
  projects: () => LocalProject[]
  projectByID: () => Map<string, LocalProject>
}) {
  return [
    ...new Map(
      input
        .projectDirectories()
        .flatMap((directory) => sortedRootSessions(input.sync.child(directory, { bootstrap: false })[0], Date.now()))
        .map((session) => [`${pathKey(session.directory)}:${session.id}`, session] as const),
    ).values(),
  ]
    .sort((a, b) => (b.time.updated ?? b.time.created) - (a.time.updated ?? a.time.created))
    .flatMap((session) => {
      const project = projectForSession(session, input.projects(), input.projectByID())
      if (!project) return []
      return {
        session,
        project,
        projectName: displayName(project),
      }
    })
}

async function loadFloatingProjectSessions(
  global: ReturnType<typeof useGlobal>,
  server: ServerConnection.Any,
  directory: string,
) {
  const ctx = global.ensureServerCtx(server)
  const key = pathKey(directory)
  const project = ctx.projects.list().find((item) => pathKey(item.worktree) === key)
  const directories = project ? [project.worktree, ...(project.sandboxes ?? [])] : [directory]
  await Promise.all(
    directories.map((item) => ctx.sync.project.loadSessions(item, { limit: HOME_SESSION_LIMIT, exact: true })),
  )
  return [
    ...new Map(
      directories
        .flatMap((item) => sortedRootSessions(ctx.sync.child(item, { bootstrap: false })[0], Date.now()))
        .map((session) => [`${pathKey(session.directory)}:${session.id}`, session] as const),
    ).values(),
  ]
    .sort((a, b) => (b.time.updated ?? b.time.created) - (a.time.updated ?? a.time.created))
    .slice(0, HOME_SESSION_LIMIT)
}

function matchesHomeSessionSearch(record: HomeSessionRecord, query: string) {
  return `${record.session.title} ${record.projectName}`.toLowerCase().includes(query)
}

function homeSessionSearchKey(record: HomeSessionRecord) {
  return `${pathKey(record.session.directory)}:${record.session.id}`
}

function useHomeSessionHeaderOpacity(groups: () => HomeSessionGroup[]) {
  let viewport: HTMLDivElement | undefined
  let content: HTMLDivElement | undefined
  let positionFrame: number | undefined
  let resizeObserver: ResizeObserver | undefined
  const headerRefs = new Map<HomeSessionGroup["id"], HTMLDivElement>()
  const headerOffsets = new Map<HomeSessionGroup["id"], number>()
  const [state, setState] = createStore({
    titleOpacity: {} as Partial<Record<HomeSessionGroup["id"], number>>,
  })

  createEffect(() => {
    const items = groups()
    const ids = new Set(items.map((group) => group.id))
    headerRefs.forEach((_, id) => {
      if (!ids.has(id)) headerRefs.delete(id)
    })
    headerOffsets.forEach((_, id) => {
      if (!ids.has(id)) headerOffsets.delete(id)
    })
    if (items.length === 0) {
      content = undefined
      bindResizeObserver()
    }
    queuePositionUpdate()
  })

  onCleanup(() => {
    if (positionFrame !== undefined) cancelAnimationFrame(positionFrame)
    resizeObserver?.disconnect()
  })

  function setViewport(el: HTMLDivElement) {
    viewport = el
    bindResizeObserver()
    queuePositionUpdate()
  }

  function setContentRef(el: HTMLDivElement) {
    content = el
    bindResizeObserver()
    queuePositionUpdate()
  }

  function setHeaderRef(id: HomeSessionGroup["id"], el: HTMLDivElement) {
    headerRefs.set(id, el)
    queuePositionUpdate()
  }

  function queuePositionUpdate() {
    if (typeof requestAnimationFrame === "undefined") {
      updatePositionCache()
      return
    }
    if (positionFrame !== undefined) return
    positionFrame = requestAnimationFrame(() => {
      positionFrame = undefined
      updatePositionCache()
    })
  }

  function updatePositionCache() {
    if (!viewport) return
    groups().forEach((group) => {
      const el = headerRefs.get(group.id)
      if (!el) return
      headerOffsets.set(group.id, el.offsetTop)
    })
    update(viewport.scrollTop)
  }

  function update(scrollTop: number) {
    const items = groups()
    items.forEach((group, index) => {
      const nextOffset = items
        .slice(index + 1)
        .map((item) => headerOffsets.get(item.id))
        .find((offset) => offset !== undefined)
      const fadeEnd = HOME_SESSION_HEADER_STICKY_TOP + HOME_SESSION_HEADER_TEXT_HEIGHT
      const nextTop = nextOffset === undefined ? undefined : nextOffset - scrollTop
      const opacity =
        nextTop === undefined ? 1 : Math.max(0, Math.min(1, (nextTop - fadeEnd) / HOME_SESSION_HEADER_FADE_DISTANCE))
      setState("titleOpacity", group.id, Math.round(opacity * 1000) / 1000)
    })
  }

  function titleOpacity(id: HomeSessionGroup["id"]) {
    return state.titleOpacity[id] ?? 1
  }

  function bindResizeObserver() {
    resizeObserver?.disconnect()
    if (typeof ResizeObserver === "undefined") return
    resizeObserver = new ResizeObserver(() => queuePositionUpdate())
    if (viewport) resizeObserver.observe(viewport)
    if (content) resizeObserver.observe(content)
  }

  return { setViewport, setContentRef, setHeaderRef, update, titleOpacity }
}

// Cmd+click on macOS (Ctrl+click elsewhere) opens a session tab in the
// background without navigating, matching browser conventions.
function isBackgroundOpen(event: MouseEvent) {
  return shouldOpenSessionInBackground({
    mac: typeof navigator === "object" && /(Mac|iPod|iPhone|iPad)/.test(navigator.platform),
    meta: event.metaKey,
    ctrl: event.ctrlKey,
    shift: event.shiftKey,
    alt: event.altKey,
  })
}

type OpenSessionOptions = { background?: boolean }

export function NewHome() {
  const sync = useServerSync()
  const layout = useLayout()
  const platform = usePlatform()
  const pickDirectory = useDirectoryPicker()
  const dialog = useDialog()
  const navigate = useNavigate()
  const server = useServer()
  const language = useLanguage()
  const global = useGlobal()
  const tabs = useTabs()
  const command = useCommand()
  const notification = useNotification()
  const openSettings = useSettingsDialog()
  const mobile = createMediaQuery("(max-width: 767px)")
  let focusSessionSearch: (() => void) | undefined
  const [state, setState] = createStore({
    search: "",
    searchFocused: false,
  })
  const selection = layout.home.selection
  const [projectUsage, setProjectUsage] = persisted(
    Persist.global("home.project-usage.v1"),
    createStore({
      desktop: {} as Record<string, ProjectUsage>,
      mobile: {} as Record<string, ProjectUsage>,
    }),
  )
  const [floatingProjectPosition, setFloatingProjectPosition] = persisted(
    Persist.global("home.project-floating.v1"),
    createStore(floatingProjectPositionState({})),
  )

  const focusedServer = createMemo(
    () => global.servers.list().find((conn) => ServerConnection.key(conn) === selection().server) ?? server.current,
  )
  const focusedServerCtx = createMemo(() => {
    const conn = focusedServer()
    if (!conn) return
    return global.ensureServerCtx(conn)
  })
  const focusedSync = () => focusedServerCtx()?.sync ?? sync()
  const projects = createMemo(() => focusedServerCtx()?.projects.list() ?? layout.projects.list())
  const recentlyClosed = createMemo(
    () => focusedServerCtx()?.projects.recentlyClosed() ?? layout.projects.recentlyClosed(),
  )
  const homedir = createMemo(() => focusedSync().data.path.home ?? "")
  const selectedProject = createMemo(() => projects().find((project) => project.worktree === selection().directory))
  const newSessionProject = createMemo(
    () =>
      selectedProject() ??
      projects().find((project) => project.worktree === focusedServerCtx()?.projects.last()) ??
      projects()[0],
  )
  const directories = (project: LocalProject) => [project.worktree, ...(project.sandboxes ?? [])]
  const projectDirectories = createMemo(() => {
    const project = selectedProject()
    if (!project) return projects().flatMap(directories)
    return directories(project)
  })
  const search = createMemo(() => state.search.trim())
  const searchPlaceholder = createMemo(() => {
    const project = selectedProject()
    if (project) {
      return language.t("home.sessions.search.placeholder.scoped", { scope: displayName(project) })
    }
    if (global.servers.list().length > 1) {
      const conn = focusedServer()
      if (conn) {
        return language.t("home.sessions.search.placeholder.scoped", { scope: serverName(conn) })
      }
    }
    return language.t("home.sessions.search.placeholder")
  })
  const sessionLoad = useQuery(() => ({
    queryKey: ["home", "sessions", selection().server, ...projectDirectories()] as const,
    queryFn: async () => {
      await Promise.all(
        projectDirectories().map((directory) =>
          focusedSync().project.loadSessions(directory, { limit: HOME_SESSION_LIMIT, exact: true }),
        ),
      )
      return null
    },
  }))

  const projectByID = createMemo(
    () => new Map(projects().flatMap((project) => (project.id ? [[project.id, project] as const] : []))),
  )
  const allRecords = createMemo(() =>
    buildHomeSessionRecords({
      sync: focusedSync(),
      projectDirectories,
      projects,
      projectByID,
    }),
  )
  const records = createMemo(() => allRecords().slice(0, HOME_SESSION_LIMIT))
  const searchResults = createMemo(() => {
    const query = search().toLowerCase()
    if (!query) return []
    return allRecords().filter((record) => matchesHomeSessionSearch(record, query))
  })
  const searchOpen = createMemo(() => state.searchFocused && search().length > 0)
  const groups = createMemo(() => groupSessions(records(), language))
  const sessionView = createMemo(() => {
    const project = selectedProject()
    return homeProjectSwitchState({
      projectName: project ? displayName(project) : undefined,
      fallbackTitle: language.t("sidebar.project.recentSessions"),
      loading: sessionLoad.isFetching,
      content: groups(),
    })
  })
  const sessionHeaderOpacity = useHomeSessionHeaderOpacity(groups)
  function setSelection(next: HomeProjectSelection) {
    layout.home.setSelection(next)
  }

  function closeSearch() {
    setState("search", "")
    setState("searchFocused", false)
  }

  function selectSearchSession(session: Session, options?: OpenSessionOptions) {
    openSession(session, options)
    // Background opens keep the search visible so several results can be
    // opened in a row.
    if (!options?.background) closeSearch()
  }

  command.register("home", () => [
    {
      id: "home.sessions.search.focus",
      title: searchPlaceholder(),
      keybind: "mod+f",
      hidden: true,
      onSelect: () => focusSessionSearch?.(),
    },
  ])

  createEffect(() => {
    const list = global.servers.list()
    if (list.some((conn) => ServerConnection.key(conn) === selection().server)) return
    const conn = list.find((conn) => ServerConnection.key(conn) === server.key) ?? list[0]
    if (conn) setSelection({ server: ServerConnection.key(conn) })
  })

  createEffect(() => {
    const pending = pendingHomeNavigation
    if (!pending || pending.server !== server.key) return
    pendingHomeNavigation = undefined
    navigate(pending.href)
  })

  function focusServer(conn: ServerConnection.Any) {
    setSelection({ server: ServerConnection.key(conn) })
  }

  function selectProject(conn: ServerConnection.Any, directory: string) {
    const key = ServerConnection.key(conn)
    if (global.servers.health[key]?.healthy === false) return
    if (
      !global
        .ensureServerCtx(conn)
        .projects.list()
        .some((project) => project.worktree === directory)
    )
      return
    if (shouldRecordProjectSwitch(selection(), key, directory)) {
      const mode = mobile() ? "mobile" : "desktop"
      const usageKey = projectUsageKey(key, directory)
      const next = recordProjectUsage(projectUsage, mode, key, directory, Date.now())
      setProjectUsage(mode, usageKey, next[mode][usageKey])
    }
    setSelection(toggleHomeProjectSelection(selection(), key, directory))
  }

  function addProjects(conn: ServerConnection.Any, directories: string[]) {
    const directory = directories[0]
    if (!directory) return
    const ctx = global.ensureServerCtx(conn)
    directories.forEach(ctx.projects.open)
    ctx.projects.touch(directory)
    setSelection({ server: ServerConnection.key(conn), directory })
  }

  function openNewSession() {
    const conn = focusedServer()
    const project = newSessionProject()
    if (!conn || !project) return
    openProjectNewSession(conn, project.worktree)
  }

  function openProjectNewSession(conn: ServerConnection.Any, directory: string) {
    const ctx = global.ensureServerCtx(conn)
    ctx.projects.open(directory)
    ctx.projects.touch(directory)
    tabs.newDraft({ server: ServerConnection.key(conn), directory })
  }

  function editProject(conn: ServerConnection.Any, project: LocalProject) {
    void import("@/components/dialog-edit-project").then((x) => {
      dialog.show(() => <x.DialogEditProject server={conn} project={project} />)
    })
  }

  function unseenCount(conn: ServerConnection.Any, project: LocalProject) {
    const state = notification.ensureServerState(ServerConnection.key(conn))
    return directories(project).reduce((total, directory) => total + state.project.unseenCount(directory), 0)
  }

  function clearNotifications(conn: ServerConnection.Any, project: LocalProject) {
    const state = notification.ensureServerState(ServerConnection.key(conn))
    directories(project)
      .filter((directory) => state.project.unseenCount(directory) > 0)
      .forEach((directory) => state.project.markViewed(directory))
  }

  function openSession(session: Session, options?: OpenSessionOptions) {
    const project = projectForSession(session, projects(), projectByID())
    const conn = focusedServer()
    if (!conn) return
    const directory = project?.worktree ?? session.directory
    const ctx = global.ensureServerCtx(conn)
    ctx.projects.open(directory)
    if (options?.background) {
      tabs.addSessionTab({ server: ServerConnection.key(conn), sessionId: session.id })
      return
    }
    ctx.projects.touch(directory)
    startTransition(() => {
      const tab = tabs.addSessionTab({ server: ServerConnection.key(conn), sessionId: session.id })
      tabs.select(tab)
    })
  }

  function openFloatingSession(conn: ServerConnection.Any, directory: string, session: Session) {
    const key = ServerConnection.key(conn)
    const ctx = global.ensureServerCtx(conn)
    ctx.projects.open(directory)
    ctx.projects.touch(directory)
    if (shouldRecordProjectSwitch(selection(), key, directory)) {
      const usageKey = projectUsageKey(key, directory)
      const next = recordProjectUsage(projectUsage, mode(), key, directory, Date.now())
      setProjectUsage(mode(), usageKey, next[mode()][usageKey])
    }
    setSelection({ server: key, directory })
    startTransition(() => {
      const tab = tabs.addSessionTab({ server: key, sessionId: session.id })
      tabs.select(tab)
    })
  }

  async function archiveSession(session: Session) {
    const conn = focusedServer()
    const ctx = focusedServerCtx()
    if (!conn || !ctx) return
    const [, setStore] = ctx.sync.child(session.directory)
    await archiveHomeSession({
      server: ServerConnection.key(conn),
      session,
      update: (value) => ctx.sdk.client.session.update(value),
      remove: () =>
        setStore(
          produce((draft) => {
            const match = Binary.search(draft.session, session.id, (s) => s.id)
            if (match.found) draft.session.splice(match.index, 1)
          }),
        ),
      onError: (error) =>
        showToast({
          title: language.t("common.requestFailed"),
          description: errorMessage(error, language.t("common.requestFailed")),
        }),
    })
  }

  function chooseProject(conn: ServerConnection.Any) {
    if (global.servers.health[ServerConnection.key(conn)]?.healthy === false) return

    function resolve(result: string | string[] | null) {
      addProjects(conn, homeProjectDirectories(result))
    }

    pickDirectory({
      server: conn,
      title: language.t("command.project.open"),
      multiple: true,
      onSelect: resolve,
    })
  }

  const mode = createMemo<FloatingProjectMode>(() => (mobile() ? "mobile" : "desktop"))
  const closeProject = (conn: ServerConnection.Any, directory: string) => {
    const next = closeHomeProject(selection(), ServerConnection.key(conn), global.ensureServerCtx(conn).projects, directory)
    if (next) setSelection(next)
  }
  const projectColumnProps = () => ({
    projects: projects(),
    recentlyClosed: recentlyClosed(),
    homedir: homedir(),
    selected: selection(),
    usage: projectUsage[mode()],
    focusServer,
    selectProject,
    openNewSession: openProjectNewSession,
    openRecentProject: (conn: ServerConnection.Any, directory: string) => addProjects(conn, [directory]),
    chooseProject: (conn: ServerConnection.Any) => void chooseProject(conn),
    editProject,
    closeProject,
    clearNotifications,
    unseenCount,
    openSettings,
    openHelp: () => platform.openLink("https://opencode.ai/desktop-feedback"),
    loadProjectSessions: (conn: ServerConnection.Any, directory: string) =>
      loadFloatingProjectSessions(global, conn, directory),
    openSession: openFloatingSession,
    language,
  })

  return (
    <>
      <div class="rounded-[10px] shadow-[var(--v2-elevation-raised)] m-2 min-h-0 overflow-hidden bg-v2-background-bg-base self-stretch flex-1">
        <div class="mx-auto grid h-full w-full max-w-[1080px] grid-rows-[minmax(180px,36dvh)_minmax(0,1fr)_auto] gap-4 px-3 lg:grid-cols-[280px_minmax(0,720px)] lg:grid-rows-1 lg:gap-8 lg:px-6">
          <HomeProjectColumn {...projectColumnProps()} />

          <section
            class="min-h-0 min-w-0 flex-1 flex flex-col pt-6 lg:pt-12 relative"
            aria-label={language.t("sidebar.project.recentSessions")}
            aria-busy={sessionView().loading ? "true" : undefined}
          >
          <div
            data-component="home-session-scope"
            class="mb-3 flex h-10 min-w-0 shrink-0 items-center justify-between gap-3"
            aria-live="polite"
          >
            <div class="flex min-w-0 items-center gap-2.5">
              <Show
                when={selectedProject()}
                fallback={
                  <div class="flex size-6 shrink-0 items-center justify-center rounded-[6px] bg-v2-background-bg-layer-02 text-v2-icon-icon-muted">
                    <IconV2 name="folder-add-left" size="small" />
                  </div>
                }
              >
                {(project) => <HomeProjectAvatar project={project()} />}
              </Show>
              <Show
                when={selectedProject()}
                fallback={
                  <div class="min-w-0">
                    <div class="text-[11px] leading-4 text-v2-text-text-muted [font-weight:440]">
                      {language.t("home.projects")}
                    </div>
                    <div
                      class="overflow-hidden text-ellipsis whitespace-nowrap text-[14px] leading-5 text-v2-text-text-base [font-weight:600]"
                      title={sessionView().title}
                    >
                      {sessionView().title}
                    </div>
                  </div>
                }
              >
                {(project) => (
                  <div class="min-w-0">
                    <div
                      class="overflow-hidden text-ellipsis whitespace-nowrap text-[14px] leading-5 text-v2-text-text-base [font-weight:600]"
                      title={displayName(project())}
                    >
                      {displayName(project())}
                    </div>
                    <div
                      class="overflow-hidden text-ellipsis whitespace-nowrap text-[11px] leading-4 text-v2-text-text-muted [font-weight:440]"
                      title={project().worktree}
                    >
                      {compactProjectPath(project().worktree)}
                    </div>
                  </div>
                )}
              </Show>
            </div>
            <Show when={sessionView().loading}>
              <div
                role="status"
                aria-label={language.t("common.loading")}
                class="flex size-7 shrink-0 items-center justify-center text-v2-icon-icon-muted"
              >
                <Spinner class="size-3.5" />
              </div>
            </Show>
          </div>
          <HomeSessionSearch
            value={state.search}
            placeholder={searchPlaceholder()}
            open={searchOpen()}
            loading={sessionView().loading}
            results={searchResults()}
            showProjectName={!selectedProject()}
            server={selection().server}
            noResultsLabel={language.t("home.sessions.search.noResults", { query: search() })}
            bindFocus={(focus) => {
              focusSessionSearch = focus
            }}
            onInput={(value) => setState("search", value)}
            onFocus={() => setState("searchFocused", true)}
            onClose={closeSearch}
            onSelect={selectSearchSession}
          />
          <ScrollView
            class="mt-3 -mr-3 min-h-0 flex-1 relative"
            viewportRef={sessionHeaderOpacity.setViewport}
            onScroll={(event) => sessionHeaderOpacity.update(event.currentTarget.scrollTop)}
          >
            <Show when={groups().length > 0 && newSessionProject()}>
              <div class="pointer-events-none absolute top-3 right-3 z-20 flex">
                <ButtonV2
                  data-action="home-new-session"
                  variant="ghost-muted"
                  size="normal"
                  icon="edit"
                  class="pointer-events-auto h-7 px-2 [font-weight:530]"
                  onClick={openNewSession}
                >
                  {language.t("command.session.new")}
                </ButtonV2>
              </div>
            </Show>
            <Show
              when={!sessionView().loading}
              fallback={
                <div class="pt-3">
                  <HomeSessionSkeleton label={language.t("common.loading")} />
                </div>
              }
            >
              <Show
                when={sessionView().content.length > 0}
                fallback={<HomeSessionsEmpty onNewSession={newSessionProject() ? openNewSession : undefined} />}
              >
                <div
                  ref={sessionHeaderOpacity.setContentRef}
                  data-component="home-session-content"
                  data-project={selection().directory}
                  class="animate-in fade-in flex flex-col pt-3 pr-3 pb-16 duration-150"
                >
                  <For each={sessionView().content}>
                    {(group, index) => (
                      <>
                        <HomeSessionGroupHeader
                          title={group.title}
                          titleOpacity={sessionHeaderOpacity.titleOpacity(group.id)}
                          ref={(el) => sessionHeaderOpacity.setHeaderRef(group.id, el)}
                          elevated={index() === 0}
                        />
                        <div
                          class={`flex min-w-0 flex-col gap-px pt-4 ${index() === sessionView().content.length - 1 ? "" : "mb-6"}`}
                        >
                          <For each={group.sessions}>
                            {(record) => (
                              <HomeSessionRow
                                record={record}
                                showProjectName={!selectedProject()}
                                server={selection().server}
                                openSession={openSession}
                                archiveSession={archiveSession}
                              />
                            )}
                          </For>
                        </div>
                      </>
                    )}
                  </For>
                </div>
              </Show>
            </Show>
          </ScrollView>
          </section>
          <HomeUtilityNav
            class="flex lg:hidden"
            openSettings={openSettings}
            openHelp={() => platform.openLink("https://opencode.ai/desktop-feedback")}
            language={language}
          />
        </div>
      </div>
      <HomeFloatingProjectSwitch
        {...projectColumnProps()}
        mode={mode()}
        position={floatingProjectPositionForMode(floatingProjectPosition, mode())}
        selectedProject={selectedProject()}
        setPosition={(next) => setFloatingProjectPosition(mode(), next)}
      />
    </>
  )
}

export function RoutedFloatingProjectSwitch(props: {
  routeMode?: FloatingProjectRouteMode
  directory?: string
}) {
  const location = useLocation()
  const routeMode = () => props.routeMode ?? "new"

  return (
    <Show when={routedFloatingProjectSwitchVisible(routeMode(), location.pathname)}>
      <RoutedFloatingProjectSwitchContent routeMode={routeMode()} directory={props.directory} />
    </Show>
  )
}

function RoutedFloatingProjectSwitchContent(props: {
  routeMode: FloatingProjectRouteMode
  directory?: string
}) {
  const sync = useServerSync()
  const layout = useLayout()
  const platform = usePlatform()
  const pickDirectory = useDirectoryPicker()
  const dialog = useDialog()
  const navigate = useNavigate()
  const server = useServer()
  const language = useLanguage()
  const global = useGlobal()
  const tabs = useTabs()
  const notification = useNotification()
  const openSettings = useSettingsDialog()
  const mobile = createMediaQuery("(max-width: 767px)")
  const selection = () =>
    props.routeMode === "legacy"
      ? { server: server.key, directory: props.directory }
      : layout.home.selection()
  const [projectUsage, setProjectUsage] = persisted(
    Persist.global("home.project-usage.v1"),
    createStore({
      desktop: {} as Record<string, ProjectUsage>,
      mobile: {} as Record<string, ProjectUsage>,
    }),
  )
  const [floatingProjectPosition, setFloatingProjectPosition] = persisted(
    Persist.global("home.project-floating.v1"),
    createStore(floatingProjectPositionState({})),
  )
  const focusedServer = createMemo(
    () => global.servers.list().find((conn) => ServerConnection.key(conn) === selection().server) ?? server.current,
  )
  const focusedServerCtx = createMemo(() => {
    const conn = focusedServer()
    if (!conn) return
    return global.ensureServerCtx(conn)
  })
  const focusedSync = () => focusedServerCtx()?.sync ?? sync()
  const projects = createMemo(() => focusedServerCtx()?.projects.list() ?? layout.projects.list())
  const recentlyClosed = createMemo(
    () => focusedServerCtx()?.projects.recentlyClosed() ?? layout.projects.recentlyClosed(),
  )
  const homedir = createMemo(() => focusedSync().data.path.home ?? "")
  const selectedProject = createMemo(() => projects().find((project) => project.worktree === selection().directory))
  const mode = createMemo<FloatingProjectMode>(() => (mobile() ? "mobile" : "desktop"))

  function setSelection(next: HomeProjectSelection) {
    layout.home.setSelection(next)
  }

  createEffect(() => {
    const list = global.servers.list()
    if (list.some((conn) => ServerConnection.key(conn) === selection().server)) return
    const conn = list.find((conn) => ServerConnection.key(conn) === server.key) ?? list[0]
    if (conn) setSelection({ server: ServerConnection.key(conn) })
  })

  function focusServer(conn: ServerConnection.Any) {
    const key = ServerConnection.key(conn)
    setSelection({ server: key })
    if (props.routeMode === "legacy") server.setActive(key)
  }

  function selectProject(conn: ServerConnection.Any, directory: string) {
    const key = ServerConnection.key(conn)
    if (global.servers.health[key]?.healthy === false) return
    if (!global.ensureServerCtx(conn).projects.list().some((project) => project.worktree === directory)) return
    if (shouldRecordProjectSwitch(selection(), key, directory)) {
      const usageKey = projectUsageKey(key, directory)
      const next = recordProjectUsage(projectUsage, mode(), key, directory, Date.now())
      setProjectUsage(mode(), usageKey, next[mode()][usageKey])
    }
    if (props.routeMode === "legacy") {
      const ctx = global.ensureServerCtx(conn)
      ctx.projects.open(directory)
      ctx.projects.touch(directory)
      server.setActive(key)
      setSelection({ server: key, directory })
      navigate(floatingProjectDestination(props.routeMode, directory))
      return
    }
    setSelection(toggleHomeProjectSelection(selection(), key, directory))
    navigate(floatingProjectDestination(props.routeMode, directory))
  }

  function addProjects(conn: ServerConnection.Any, directories: string[]) {
    const directory = directories[0]
    if (!directory) return
    const ctx = global.ensureServerCtx(conn)
    directories.forEach(ctx.projects.open)
    ctx.projects.touch(directory)
    const key = ServerConnection.key(conn)
    setSelection({ server: key, directory })
    if (props.routeMode === "legacy") server.setActive(key)
    navigate(floatingProjectDestination(props.routeMode, directory))
  }

  function openProjectNewSession(conn: ServerConnection.Any, directory: string) {
    const ctx = global.ensureServerCtx(conn)
    ctx.projects.open(directory)
    ctx.projects.touch(directory)
    if (props.routeMode === "legacy") {
      const key = ServerConnection.key(conn)
      server.setActive(key)
      setSelection({ server: key, directory })
      navigate(floatingProjectDestination(props.routeMode, directory))
      return
    }
    tabs.newDraft({ server: ServerConnection.key(conn), directory })
  }

  function editProject(conn: ServerConnection.Any, project: LocalProject) {
    void import("@/components/dialog-edit-project").then((component) => {
      dialog.show(() => <component.DialogEditProject server={conn} project={project} />)
    })
  }

  function unseenCount(conn: ServerConnection.Any, project: LocalProject) {
    const state = notification.ensureServerState(ServerConnection.key(conn))
    return [project.worktree, ...(project.sandboxes ?? [])].reduce(
      (total, directory) => total + state.project.unseenCount(directory),
      0,
    )
  }

  function clearNotifications(conn: ServerConnection.Any, project: LocalProject) {
    const state = notification.ensureServerState(ServerConnection.key(conn))
    ;[project.worktree, ...(project.sandboxes ?? [])]
      .filter((directory) => state.project.unseenCount(directory) > 0)
      .forEach((directory) => state.project.markViewed(directory))
  }

  function openFloatingSession(conn: ServerConnection.Any, directory: string, session: Session) {
    const key = ServerConnection.key(conn)
    const ctx = global.ensureServerCtx(conn)
    ctx.projects.open(directory)
    ctx.projects.touch(directory)
    if (shouldRecordProjectSwitch(selection(), key, directory)) {
      const usageKey = projectUsageKey(key, directory)
      const next = recordProjectUsage(projectUsage, mode(), key, directory, Date.now())
      setProjectUsage(mode(), usageKey, next[mode()][usageKey])
    }
    setSelection({ server: key, directory })
    if (props.routeMode === "legacy") {
      server.setActive(key)
      navigate(floatingProjectSessionDestination(props.routeMode, session.directory, session.id))
      return
    }
    startTransition(() => {
      const tab = tabs.addSessionTab({ server: key, sessionId: session.id })
      tabs.select(tab)
    })
  }

  function chooseProject(conn: ServerConnection.Any) {
    if (global.servers.health[ServerConnection.key(conn)]?.healthy === false) return

    pickDirectory({
      server: conn,
      title: language.t("command.project.open"),
      multiple: true,
      onSelect: (result) => addProjects(conn, homeProjectDirectories(result)),
    })
  }

  function closeProject(conn: ServerConnection.Any, directory: string) {
    const next = closeHomeProject(selection(), ServerConnection.key(conn), global.ensureServerCtx(conn).projects, directory)
    if (next) setSelection(next)
  }

  const projectColumnProps = () => ({
    projects: projects(),
    recentlyClosed: recentlyClosed(),
    homedir: homedir(),
    selected: selection(),
    usage: projectUsage[mode()],
    focusServer,
    selectProject,
    openNewSession: openProjectNewSession,
    openRecentProject: (conn: ServerConnection.Any, directory: string) => addProjects(conn, [directory]),
    chooseProject: (conn: ServerConnection.Any) => void chooseProject(conn),
    editProject,
    closeProject,
    clearNotifications,
    unseenCount,
    openSettings,
    openHelp: () => platform.openLink("https://opencode.ai/desktop-feedback"),
    loadProjectSessions: (conn: ServerConnection.Any, directory: string) =>
      loadFloatingProjectSessions(global, conn, directory),
    openSession: openFloatingSession,
    language,
  })

  return (
    <HomeFloatingProjectSwitch
      {...projectColumnProps()}
      mode={mode()}
      position={floatingProjectPositionForMode(floatingProjectPosition, mode())}
      selectedProject={selectedProject()}
      setPosition={(next) => setFloatingProjectPosition(mode(), next)}
    />
  )
}

type FloatingProjectItem = {
  server: ServerConnection.Any
  project: LocalProject
}

type FloatingProjectGestureState = "idle" | "pending" | "moving"
type FloatingProjectPanelState = "closed" | "projects" | "sessions"

function HomeFloatingProjectSwitch(props: {
  projects: LocalProject[]
  recentlyClosed: LocalProject[]
  homedir: string
  selected: HomeProjectSelection
  usage: Record<string, ProjectUsage>
  focusServer: (server: ServerConnection.Any) => void
  selectProject: (server: ServerConnection.Any, directory: string) => void
  openNewSession: (server: ServerConnection.Any, directory: string) => void
  openRecentProject: (server: ServerConnection.Any, directory: string) => void
  chooseProject: (server: ServerConnection.Any) => void
  editProject: (server: ServerConnection.Any, project: LocalProject) => void
  closeProject: (server: ServerConnection.Any, directory: string) => void
  clearNotifications: (server: ServerConnection.Any, project: LocalProject) => void
  unseenCount: (server: ServerConnection.Any, project: LocalProject) => number
  openSettings: () => void
  openHelp: () => void
  loadProjectSessions: (server: ServerConnection.Any, directory: string) => Promise<Session[]>
  openSession: (server: ServerConnection.Any, directory: string, session: Session) => void
  language: ReturnType<typeof useLanguage>
  mode: FloatingProjectMode
  position: FloatingProjectPosition
  selectedProject: LocalProject | undefined
  setPosition: (position: FloatingProjectPosition) => void
}) {
  let root: HTMLDivElement | undefined
  let requestSequence = 0
  const global = useGlobal()
  const [state, setState] = createStore({
    panel: "closed" as FloatingProjectPanelState,
    gesture: "idle" as FloatingProjectGestureState,
    pointerID: undefined as number | undefined,
    origin: undefined as FloatingProjectPoint | undefined,
    start: undefined as FloatingProjectPoint | undefined,
    selectedProject: undefined as FloatingProjectItem | undefined,
    sessions: [] as Session[],
    loading: false,
    failed: false,
    inputFocused: false,
    viewport: { width: 1024, height: 768 },
  })
  const projectItems = createMemo(() =>
    global.servers.list().flatMap((server) => {
      const key = ServerConnection.key(server)
      if (global.servers.health[key]?.healthy === false) return []
      return rankProjectsByUsage(global.ensureServerCtx(server).projects.list(), key, props.usage).map((project) => ({
        server,
        project,
      }))
    }),
  )
  const position = createMemo(() => clampFloatingProjectPosition(props.position, state.viewport))
  const point = createMemo(() => floatingProjectPoint(position(), state.viewport))
  const panelTop = createMemo(() => {
    const maxHeight = Math.min(560, state.viewport.height - 32)
    return Math.min(Math.max(16, point().y + 52), state.viewport.height - 16 - maxHeight)
  })
  const style = createMemo(() => ({
    left: `${point().x}px`,
    top: `${point().y}px`,
  }))
  const buttonVisual = createMemo(() => floatingProjectButtonVisualState({ inputFocused: state.inputFocused }))
  const panelStyle = createMemo(() => ({
    top: `${panelTop()}px`,
    left: position().edge === "left" ? "16px" : undefined,
    right: position().edge === "right" ? "16px" : undefined,
  }))
  const label = createMemo(() => {
    const project = props.selectedProject
    if (!project) return props.language.t("home.projects")
    return `${displayName(project)}, ${compactProjectPath(project.worktree)}`
  })
  const syncViewport = () => {
    const viewport = { width: window.innerWidth, height: window.innerHeight }
    setState("viewport", viewport)
    props.setPosition(clampFloatingProjectPosition(props.position, viewport))
  }

  function closePanel() {
    requestSequence++
    setState({
      panel: "closed",
      selectedProject: undefined,
      sessions: [],
      loading: false,
      failed: false,
    })
  }

  function openProjectPanel() {
    blurFloatingProjectActiveElement()
    if (state.panel !== "closed") {
      closePanel()
      return
    }
    setState({ panel: "projects", selectedProject: undefined, sessions: [], loading: false, failed: false })
  }

  function resetGesture() {
    requestSequence++
    setState({
      gesture: "idle",
      pointerID: undefined,
      origin: undefined,
      start: undefined,
      selectedProject: undefined,
      sessions: [],
      loading: false,
      failed: false,
    })
  }

  async function loadSessions(item: FloatingProjectItem) {
    const sequence = ++requestSequence
    setState({ selectedProject: item, sessions: [], loading: true, failed: false })
    const result = await props.loadProjectSessions(item.server, item.project.worktree).then(
      (sessions) => ({ ok: true as const, sessions }),
      () => ({ ok: false as const, sessions: [] as Session[] }),
    )
    if (sequence !== requestSequence) return
    if (state.panel !== "sessions") return
    if (!result.ok) {
      setState({ sessions: [], loading: false, failed: true })
      return
    }
    setState({ sessions: result.sessions, loading: false, failed: false })
  }

  function openPanelProject(server: ServerConnection.Any, directory: string) {
    blurFloatingProjectActiveElement()
    const key = ServerConnection.key(server)
    const item = projectItems().find(
      (candidate) =>
        ServerConnection.key(candidate.server) === key && pathKey(candidate.project.worktree) === pathKey(directory),
    )
    if (!item) return
    setState("panel", "sessions")
    void loadSessions(item)
  }

  function backToProjects() {
    blurFloatingProjectActiveElement()
    requestSequence++
    setState({
      panel: "projects",
      selectedProject: undefined,
      sessions: [],
      loading: false,
      failed: false,
    })
  }

  function openPanelSession(session: Session) {
    blurFloatingProjectActiveElement()
    const item = state.selectedProject
    if (!item) return
    props.openSession(item.server, item.project.worktree, session)
    closePanel()
  }

  function dismissPanelForGesture() {
    if (state.panel === "closed") return
    requestSequence++
    setState({ panel: "closed", selectedProject: undefined, sessions: [], loading: false, failed: false })
  }

  onMount(() => {
    const syncInputFocused = () => setState("inputFocused", floatingProjectTextInputFocused())
    syncViewport()
    syncInputFocused()
    makeEventListener(window, "resize", syncViewport)
    makeEventListener(document, "focusin", syncInputFocused)
    makeEventListener(document, "focusout", () => requestAnimationFrame(syncInputFocused))
    makeEventListener(document, "pointerdown", (event) => {
      if (state.panel === "closed") return
      const target = event.target
      if (target instanceof Node && root?.contains(target)) return
      closePanel()
    })
  })
  onCleanup(() => {
    requestSequence++
  })

  function dragPoint(event: PointerEvent) {
    if (!state.origin || !state.start) return point()
    return {
      x: state.origin.x + event.clientX - state.start.x,
      y: state.origin.y + event.clientY - state.start.y,
    }
  }

  function startPointer(event: PointerEvent & { currentTarget: HTMLButtonElement }) {
    if (event.button !== 0 || !event.isPrimary || state.gesture !== "idle") return
    event.preventDefault()
    blurFloatingProjectActiveElement()
    event.currentTarget.setPointerCapture(event.pointerId)
    setState({
      gesture: "pending",
      pointerID: event.pointerId,
      origin: point(),
      start: { x: event.clientX, y: event.clientY },
    })
  }

  function movePointer(event: PointerEvent) {
    if (state.pointerID !== event.pointerId || !state.start) return
    const horizontal = event.clientX - state.start.x
    const vertical = event.clientY - state.start.y
    if (state.gesture === "pending") {
      const intent = floatingProjectGestureIntent({
        x: horizontal,
        y: vertical,
      })
      if (intent === "pending") return
      dismissPanelForGesture()
      setState("gesture", "moving")
    }
    if (state.gesture === "moving") {
      props.setPosition(snapFloatingProjectPosition(dragPoint(event), state.viewport))
    }
  }

  function releasePointer(event: PointerEvent & { currentTarget: HTMLButtonElement }) {
    if (state.pointerID !== event.pointerId) return
    const gesture = state.gesture
    const start = state.start
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
    if (gesture === "moving") props.setPosition(snapFloatingProjectPosition(dragPoint(event), state.viewport))
    const intent = start
      ? floatingProjectGestureIntent({
          x: event.clientX - start.x,
          y: event.clientY - start.y,
          released: true,
        })
      : "pending"
    resetGesture()
    if (gesture === "pending" && intent === "tap") {
      openProjectPanel()
    }
  }

  function cancelPointer(event: PointerEvent & { currentTarget: HTMLButtonElement }) {
    if (state.pointerID !== event.pointerId) return
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
    resetGesture()
  }

  const panelProps = () => ({
    ...props,
    focusServer: (server: ServerConnection.Any) => {
      props.focusServer(server)
      closePanel()
    },
    selectProject: (server: ServerConnection.Any, directory: string) => {
      openPanelProject(server, directory)
    },
    openNewSession: (server: ServerConnection.Any, directory: string) => {
      props.openNewSession(server, directory)
      closePanel()
    },
    openRecentProject: (server: ServerConnection.Any, directory: string) => {
      props.openRecentProject(server, directory)
      closePanel()
    },
    chooseProject: (server: ServerConnection.Any) => {
      props.chooseProject(server)
      closePanel()
    },
    panelProject: state.panel === "sessions" ? state.selectedProject : undefined,
    sessions: state.sessions,
    sessionsLoading: state.loading,
    sessionsFailed: state.failed,
    backToProjects,
    openPanelSession,
  })

  return (
    <div
      ref={root}
      data-component="home-floating-project-switch"
      data-gesture={state.gesture}
      data-edge={position().edge}
      data-input-focused={state.inputFocused ? "" : undefined}
      class="fixed inset-0 z-50 pointer-events-none"
    >
      <TooltipV2 placement={position().edge === "left" ? "right" : "left"} value={label()}>
        <button
          type="button"
          data-action="home-floating-project-switch"
          class={`pointer-events-auto fixed z-[1] flex size-11 touch-none select-none items-center justify-center border border-v2-border-border-base bg-v2-background-bg-layer-01 text-v2-icon-icon-base shadow-[var(--v2-elevation-floating)] transition-[background-color,box-shadow,border-radius,opacity] duration-150 ease-in-out hover:bg-v2-background-bg-layer-02 focus-visible:outline-none focus-visible:[box-shadow:0_0_0_2px_var(--v2-border-border-focus),var(--v2-elevation-floating)] ${buttonVisual().shape} ${buttonVisual().opacity}`}
          classList={{
            "cursor-grabbing": state.gesture === "moving",
            "cursor-grab": state.gesture !== "moving",
          }}
          style={style()}
          aria-label={label()}
          aria-expanded={state.panel !== "closed"}
          onPointerDown={startPointer}
          onPointerMove={movePointer}
          onPointerUp={releasePointer}
          onPointerCancel={cancelPointer}
          onKeyDown={(event) => {
            if (event.key !== "Enter" && event.key !== " ") return
            event.preventDefault()
            openProjectPanel()
          }}
        >
          <Show when={props.selectedProject} fallback={<IconV2 name="folder-add-left" />}>
            {(project) => <HomeProjectAvatar project={project()} class="!size-7" />}
          </Show>
        </button>
      </TooltipV2>
      <Show when={state.panel !== "closed"}>
        <div
          data-floating-project-panel
          class="pointer-events-auto fixed flex max-h-[min(560px,calc(100dvh-32px))] w-[min(calc(100vw-32px),340px)] min-w-0 overflow-hidden rounded-[10px] border border-v2-border-border-base bg-v2-background-bg-base shadow-[var(--v2-elevation-floating)]"
          style={panelStyle()}
        >
          <HomeFloatingProjectPanel {...panelProps()} />
        </div>
      </Show>
    </div>
  )
}

function HomeFloatingProjectPanel(props: {
  projects: LocalProject[]
  recentlyClosed: LocalProject[]
  homedir: string
  selected: HomeProjectSelection
  usage: Record<string, ProjectUsage>
  focusServer: (server: ServerConnection.Any) => void
  selectProject: (server: ServerConnection.Any, directory: string) => void
  openNewSession: (server: ServerConnection.Any, directory: string) => void
  openRecentProject: (server: ServerConnection.Any, directory: string) => void
  chooseProject: (server: ServerConnection.Any) => void
  editProject: (server: ServerConnection.Any, project: LocalProject) => void
  closeProject: (server: ServerConnection.Any, directory: string) => void
  clearNotifications: (server: ServerConnection.Any, project: LocalProject) => void
  unseenCount: (server: ServerConnection.Any, project: LocalProject) => number
  panelProject: FloatingProjectItem | undefined
  sessions: Session[]
  sessionsLoading: boolean
  sessionsFailed: boolean
  backToProjects: () => void
  openPanelSession: (session: Session) => void
  language: ReturnType<typeof useLanguage>
}) {
  const global = useGlobal()
  const dialog = useDialog()
  const controller = useServerManagementController({ navigateOnAdd: false })
  const [_state, setState, _, ready] = persisted(
    Persist.global("home.servers", ["home.servers.v1"]),
    createStore({ collapsed: {} as Record<string, boolean> }),
  )
  const [state] = createResource(
    () => ready.promise ?? Promise.resolve(),
    (p) => p.then(() => _state),
    { initialValue: _state },
  )

  return (
    <Show
      when={props.panelProject}
      fallback={
        <div class="flex min-h-0 min-w-0 flex-1 flex-col gap-3 p-3" aria-label={props.language.t("home.projects")}>
          <div class="flex h-8 min-w-0 shrink-0 items-center justify-between gap-2 pl-1">
            <div class="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-v2-text-text-base [font-weight:600]">
              {props.language.t("home.projects")}
            </div>
            <Show
              when={
                global.servers.list().length === 1 && !(props.projects.length === 0 && props.recentlyClosed.length > 0)
              }
            >
              <TooltipV2 placement="bottom" value={props.language.t("home.project.add")}>
                <IconButtonV2
                  data-action="home-floating-add-project"
                  variant="ghost-muted"
                  size="large"
                  icon={<IconV2 name="folder-add-left" />}
                  disabled={global.servers.health[ServerConnection.key(global.servers.list()[0]!)]?.healthy === false}
                  onClick={() => props.chooseProject(global.servers.list()[0]!)}
                  aria-label={props.language.t("home.project.add")}
                />
              </TooltipV2>
            </Show>
          </div>
          <ScrollView data-slot="home-floating-projects-scroll" class="min-h-0 min-w-0">
            <Show
              when={global.servers.list().length > 1}
              fallback={
                <Show
                  when={props.projects.length > 0}
                  fallback={
                    <HomeProjectEmpty
                      server={global.servers.list()[0]!}
                      recentlyClosed={props.recentlyClosed}
                      homedir={props.homedir}
                      chooseProject={props.chooseProject}
                      openRecentProject={props.openRecentProject}
                      language={props.language}
                    />
                  }
                >
                  <HomeProjectList {...props} server={global.servers.list()[0]!} />
                </Show>
              }
            >
              <div class="flex min-w-0 flex-col gap-4">
                <For each={global.servers.list()}>
                  {(item) => {
                    const key = ServerConnection.key(item)
                    const healthy = () => !!global.servers.health[key]?.healthy
                    const serverCtx = global.ensureServerCtx(item)
                    const projects = () => serverCtx.projects.list()
                    const hasProjects = () => projects().length > 0
                    const collapsed = () => !!state().collapsed[key]
                    return (
                      <div class="flex min-w-0 flex-col gap-1">
                        <HomeServerRow
                          server={item}
                          selected={props.selected.server === key && !props.selected.directory}
                          collapsed={collapsed()}
                          health={global.servers.health[key]}
                          controller={controller}
                          focusServer={props.focusServer}
                          chooseProject={props.chooseProject}
                          openEdit={(server) => dialog.show(() => <DialogServerV2 mode="edit" server={server} />)}
                          toggleCollapsed={() => setState("collapsed", key, !state().collapsed[key])}
                          language={props.language}
                        />
                        <Show when={healthy() && hasProjects() && !collapsed()}>
                          <div class="mx-3 h-px bg-v2-border-border-base" />
                          <HomeProjectList {...props} server={item} projects={projects()} />
                        </Show>
                      </div>
                    )
                  }}
                </For>
              </div>
            </Show>
          </ScrollView>
        </div>
      }
    >
      {(item) => (
        <div
          data-floating-project-sessions
          class="flex min-h-0 min-w-0 flex-1 flex-col gap-3 p-3"
          aria-label={displayName(item().project)}
        >
          <div class="flex min-h-10 min-w-0 shrink-0 items-center gap-2">
            <TooltipV2 placement="bottom" value={props.language.t("home.projects")}>
              <IconButtonV2
                data-action="home-floating-session-back"
                variant="ghost-muted"
                size="large"
                icon={<Icon name="arrow-left" size="small" />}
                aria-label={props.language.t("home.projects")}
                onClick={props.backToProjects}
              />
            </TooltipV2>
            <HomeProjectAvatar project={item().project} class="!size-7 shrink-0" />
            <div class="flex min-w-0 flex-1 flex-col">
              <div class="overflow-hidden text-ellipsis whitespace-nowrap text-[13px] leading-5 text-v2-text-text-base [font-weight:600]">
                {displayName(item().project)}
              </div>
              <div
                class="overflow-hidden text-ellipsis whitespace-nowrap text-[10px] leading-3 text-v2-text-text-muted [font-weight:440]"
                title={item().project.worktree}
              >
                {compactProjectPath(item().project.worktree)}
              </div>
            </div>
          </div>
          <ScrollView data-slot="home-floating-sessions-scroll" class="min-h-0 min-w-0">
            <Show
              when={!props.sessionsLoading}
              fallback={
                <div role="status" class="flex h-20 items-center justify-center gap-2 text-v2-text-text-muted">
                  <Spinner class="size-3.5" />
                  <span class="text-[12px]">{props.language.t("common.loading")}</span>
                </div>
              }
            >
              <Show
                when={!props.sessionsFailed}
                fallback={
                  <div class="flex h-20 items-center justify-center px-4 text-center text-[12px] text-v2-text-text-muted">
                    {props.language.t("common.requestFailed")}
                  </div>
                }
              >
                <Show
                  when={props.sessions.length > 0}
                  fallback={
                    <div class="flex h-20 items-center justify-center px-4 text-center text-[12px] text-v2-text-text-muted">
                      {props.language.t("home.sessions.empty")}
                    </div>
                  }
                >
                  <div class="flex min-w-0 flex-col gap-1 pb-1">
                    <For each={props.sessions}>
                      {(session) => {
                        const title = () => {
                          const value = sessionTitle(session.title)
                          if (!value || value.length > 240) return props.language.t("command.session.new")
                          return value
                        }
                        return (
                          <button
                            type="button"
                            data-component="home-floating-session-row"
                            class={`${HOME_PROJECT_NAV_ROW} !h-12 !gap-2 !px-2.5`}
                            aria-label={title()}
                            onClick={() => props.openPanelSession(session)}
                          >
                            <IconV2 name="speech-bubble" size="small" class="shrink-0 text-v2-icon-icon-muted" />
                            <span class="flex min-w-0 flex-1 flex-col text-left">
                              <span class="overflow-hidden text-ellipsis whitespace-nowrap text-[12px] leading-5 text-v2-text-text-base [font-weight:530]">
                                {title()}
                              </span>
                              <span class="overflow-hidden text-ellipsis whitespace-nowrap text-[10px] leading-3 text-v2-text-text-muted [font-weight:440]">
                                {DateTime.fromMillis(session.time.updated ?? session.time.created).toLocaleString(
                                  DateTime.DATETIME_SHORT,
                                )}
                              </span>
                            </span>
                          </button>
                        )
                      }}
                    </For>
                  </div>
                </Show>
              </Show>
            </Show>
          </ScrollView>
        </div>
      )}
    </Show>
  )
}

function HomeProjectColumn(props: {
  projects: LocalProject[]
  recentlyClosed: LocalProject[]
  homedir: string
  selected: HomeProjectSelection
  usage: Record<string, ProjectUsage>
  focusServer: (server: ServerConnection.Any) => void
  selectProject: (server: ServerConnection.Any, directory: string) => void
  openNewSession: (server: ServerConnection.Any, directory: string) => void
  openRecentProject: (server: ServerConnection.Any, directory: string) => void
  chooseProject: (server: ServerConnection.Any) => void
  editProject: (server: ServerConnection.Any, project: LocalProject) => void
  closeProject: (server: ServerConnection.Any, directory: string) => void
  clearNotifications: (server: ServerConnection.Any, project: LocalProject) => void
  unseenCount: (server: ServerConnection.Any, project: LocalProject) => number
  openSettings: () => void
  openHelp: () => void
  language: ReturnType<typeof useLanguage>
}) {
  const global = useGlobal()
  const dialog = useDialog()
  const controller = useServerManagementController({ navigateOnAdd: false })
  const [_state, setState, _, ready] = persisted(
    Persist.global("home.servers", ["home.servers.v1"]),
    createStore({ collapsed: {} as Record<string, boolean> }),
  )
  const [state] = createResource(
    () => ready.promise ?? Promise.resolve(),
    (p) => p.then(() => _state),
    { initialValue: _state },
  )

  return (
    <aside
      class="mt-6 flex min-h-0 min-w-0 flex-col gap-4 overflow-hidden lg:mt-14 lg:pt-[52px]"
      aria-label={props.language.t("home.projects")}
    >
      <div class="flex h-7 min-w-0 shrink-0 items-center justify-between pl-1.5 pr-3">
        <div class="text-v2-text-text-muted [font-weight:530]">{props.language.t("home.projects")}</div>
        <Show
          when={global.servers.list().length === 1 && !(props.projects.length === 0 && props.recentlyClosed.length > 0)}
        >
          <TooltipV2 placement="bottom" value={props.language.t("home.project.add")}>
            <IconButtonV2
              data-action="home-add-project"
              variant="ghost-muted"
              size="large"
              class="titlebar-icon [&_[data-slot=icon-svg]]:text-v2-icon-icon-muted"
              icon={<IconV2 name="folder-add-left" />}
              disabled={global.servers.health[ServerConnection.key(global.servers.list()[0]!)]?.healthy === false}
              onClick={() => props.chooseProject(global.servers.list()[0]!)}
              aria-label={props.language.t("home.project.add")}
            />
          </TooltipV2>
        </Show>
      </div>
      <ScrollView data-slot="home-projects-scroll" class="min-h-0 min-w-0 shrink">
        <Show
          when={global.servers.list().length > 1}
          fallback={
            <div class="pr-3">
              <Show
                when={props.projects.length > 0}
                fallback={
                  <HomeProjectEmpty
                    server={global.servers.list()[0]!}
                    recentlyClosed={props.recentlyClosed}
                    homedir={props.homedir}
                    chooseProject={props.chooseProject}
                    openRecentProject={props.openRecentProject}
                    language={props.language}
                  />
                }
              >
                <HomeProjectList {...props} server={global.servers.list()[0]!} />
              </Show>
            </div>
          }
        >
          <div class="flex min-w-0 flex-col gap-4 pr-3">
            <For each={global.servers.list()}>
              {(item) => {
                const key = ServerConnection.key(item)
                const healthy = () => !!global.servers.health[key]?.healthy
                const serverCtx = global.ensureServerCtx(item)
                const projects = () => serverCtx.projects.list()
                const hasProjects = () => projects().length > 0
                const collapsed = () => !!state().collapsed[key]
                return (
                  <div class="flex min-w-0 flex-col gap-1">
                    <HomeServerRow
                      server={item}
                      selected={props.selected.server === key && !props.selected.directory}
                      collapsed={collapsed()}
                      health={global.servers.health[key]}
                      controller={controller}
                      focusServer={props.focusServer}
                      chooseProject={props.chooseProject}
                      openEdit={(server) => dialog.show(() => <DialogServerV2 mode="edit" server={server} />)}
                      toggleCollapsed={() => setState("collapsed", key, !state().collapsed[key])}
                      language={props.language}
                    />
                    <Show when={healthy() && hasProjects() && !collapsed()}>
                      <div class="mx-3 h-px bg-v2-border-border-base" />
                      <HomeProjectList {...props} server={item} projects={projects()} />
                    </Show>
                  </div>
                )
              }}
            </For>
          </div>
        </Show>
      </ScrollView>
      <HomeUtilityNav
        class="mb-8 mt-4 hidden shrink-0 lg:flex"
        openSettings={props.openSettings}
        openHelp={props.openHelp}
        language={props.language}
      />
    </aside>
  )
}

function HomeUtilityNav(props: {
  class?: string
  openSettings: () => void
  openHelp: () => void
  language: ReturnType<typeof useLanguage>
}) {
  return (
    <div class={`${props.class ?? ""} min-w-0 flex-col gap-1`}>
      <button
        type="button"
        class={`${HOME_PROJECT_NAV_ROW} text-v2-text-text-faint [&>[data-slot=icon-svg]]:text-v2-icon-icon-muted`}
        onClick={props.openSettings}
      >
        <IconV2 name="settings-gear" size="small" />
        <span class={HOME_PROJECT_NAV_LABEL}>{props.language.t("sidebar.settings")}</span>
      </button>
      <button
        type="button"
        class={`${HOME_PROJECT_NAV_ROW} text-v2-text-text-faint [&>[data-slot=icon-svg]]:text-v2-icon-icon-muted`}
        onClick={props.openHelp}
      >
        <IconV2 name="help" size="small" />
        <span class={HOME_PROJECT_NAV_LABEL}>{props.language.t("sidebar.help")}</span>
      </button>
    </div>
  )
}

function HomeServerRow(props: {
  server: ServerConnection.Any
  selected: boolean
  collapsed: boolean
  health: ServerHealth | undefined
  controller: ReturnType<typeof useServerManagementController>
  focusServer: (server: ServerConnection.Any) => void
  chooseProject: (server: ServerConnection.Any) => void
  openEdit: (server: ServerConnection.Http) => void
  toggleCollapsed: () => void
  language: ReturnType<typeof useLanguage>
}) {
  const global = useGlobal()
  const [state, setState] = createStore({ menuOpen: false })
  const healthy = () => !!props.health?.healthy
  const canToggle = () => healthy() && global.ensureServerCtx(props.server).projects.list().length > 0
  return (
    <div class="group/server relative flex h-7 min-w-0 items-center rounded-[6px]">
      <button
        type="button"
        class={`${HOME_PROJECT_NAV_ROW} pr-16 disabled:opacity-60`}
        data-selected={props.selected ? "" : undefined}
        disabled={!healthy()}
        onClick={() => props.focusServer(props.server)}
      >
        <span
          data-action="home-server-collapse"
          class="inline-flex -ml-0.5 -mr-1.5 size-5 shrink-0 items-center justify-center rounded-[4px] text-v2-icon-icon-muted"
          classList={{
            "hover:bg-v2-overlay-simple-overlay-hover": canToggle(),
            "cursor-default opacity-40": !canToggle(),
          }}
          aria-label={
            props.collapsed ? props.language.t("home.server.expand") : props.language.t("home.server.collapse")
          }
          aria-disabled={!canToggle()}
          aria-expanded={canToggle() ? !props.collapsed : undefined}
          onClick={(event) => {
            event.preventDefault()
            event.stopPropagation()
            if (!canToggle()) return
            props.toggleCollapsed()
          }}
          onPointerDown={(event) => event.preventDefault()}
        >
          <IconV2
            name="chevron-down"
            size="small"
            class="transition-transform duration-150 ease-in-out"
            style={{ transform: `rotate(${props.collapsed ? -90 : 0}deg)` }}
          />
        </span>
        <div class="flex size-4 shrink-0 items-center justify-center -mr-0.5">
          <ServerHealthIndicator health={props.health} />
        </div>
        <span class="flex min-w-0 items-center gap-1">
          <span class={HOME_PROJECT_NAV_LABEL}>{props.server.displayName ?? new URL(props.server.http.url).host}</span>
          <Show when={props.server.label}>
            {(label) => (
              <span class="shrink-0 rounded-[3px] border border-v2-border-border-base px-1 py-0.5 text-[9px] leading-none text-v2-text-text-muted">
                {label()}
              </span>
            )}
          </Show>
        </span>
      </button>
      <div
        class="hover-reveal absolute right-1 top-1/2 flex -translate-y-1/2 items-center gap-1 group-hover/server:opacity-100 focus-within:opacity-100 data-[menu=true]:opacity-100"
        data-menu={state.menuOpen}
      >
        <ServerRowMenu
          server={props.server}
          controller={props.controller}
          onEdit={props.openEdit}
          open={state.menuOpen}
          onOpenChange={(open) => setState("menuOpen", open)}
        />
        <TooltipV2 class="flex shrink-0 items-center" placement="bottom" value={props.language.t("home.project.add")}>
          <IconButtonV2
            data-action="home-add-project"
            variant="ghost-muted"
            size="small"
            icon={<IconV2 name="folder-add-left" />}
            aria-label={props.language.t("home.project.add")}
            disabled={props.health?.healthy === false}
            onClick={() => props.chooseProject(props.server)}
          />
        </TooltipV2>
      </div>
    </div>
  )
}

function HomeProjectList(props: {
  server: ServerConnection.Any
  projects: LocalProject[]
  selected: HomeProjectSelection
  usage: Record<string, ProjectUsage>
  selectProject: (server: ServerConnection.Any, directory: string) => void
  openNewSession: (server: ServerConnection.Any, directory: string) => void
  editProject: (server: ServerConnection.Any, project: LocalProject) => void
  closeProject: (server: ServerConnection.Any, directory: string) => void
  clearNotifications: (server: ServerConnection.Any, project: LocalProject) => void
  unseenCount: (server: ServerConnection.Any, project: LocalProject) => number
  language: ReturnType<typeof useLanguage>
}) {
  const projects = createMemo(() =>
    rankProjectsByUsage(props.projects, ServerConnection.key(props.server), props.usage),
  )
  return (
    <div class="flex min-w-0 flex-col gap-1">
      <For each={projects()}>
        {(project) => (
          <HomeProjectRow
            project={project}
            server={props.server}
            selected={
              props.selected.server === ServerConnection.key(props.server) &&
              props.selected.directory === project.worktree
            }
            unseenCount={props.unseenCount(props.server, project)}
            selectProject={props.selectProject}
            openNewSession={props.openNewSession}
            editProject={props.editProject}
            closeProject={props.closeProject}
            clearNotifications={props.clearNotifications}
            language={props.language}
          />
        )}
      </For>
    </div>
  )
}

function HomeProjectEmpty(props: {
  server: ServerConnection.Any
  recentlyClosed: LocalProject[]
  homedir: string
  chooseProject: (server: ServerConnection.Any) => void
  openRecentProject: (server: ServerConnection.Any, directory: string) => void
  language: ReturnType<typeof useLanguage>
}) {
  const global = useGlobal()
  const unreachable = () => global.servers.health[ServerConnection.key(props.server)]?.healthy === false
  return (
    <div class="flex min-w-0 flex-col gap-1">
      <button
        type="button"
        data-action="home-add-project-row"
        class={`${HOME_PROJECT_NAV_ROW} disabled:opacity-60 [&>[data-slot=icon-svg]]:text-v2-icon-icon-muted`}
        disabled={unreachable()}
        onClick={() => props.chooseProject(props.server)}
      >
        <IconV2 name="folder-add-left" size="small" />
        <span class={HOME_PROJECT_NAV_LABEL}>{props.language.t("home.project.add")}</span>
      </button>
      <Show when={props.recentlyClosed.length > 0}>
        <div class="mt-3 flex h-7 min-w-0 shrink-0 items-center pl-1.5 pr-3">
          <div class="text-v2-text-text-faint [font-weight:530]">{props.language.t("home.recentlyClosed")}</div>
        </div>
        <For each={props.recentlyClosed}>
          {(project) => (
            <HomeRecentlyClosedRow
              project={project}
              server={props.server}
              homedir={props.homedir}
              openRecentProject={props.openRecentProject}
              language={props.language}
            />
          )}
        </For>
      </Show>
    </div>
  )
}

function HomeRecentlyClosedRow(props: {
  project: LocalProject
  server: ServerConnection.Any
  homedir: string
  openRecentProject: (server: ServerConnection.Any, directory: string) => void
  language: ReturnType<typeof useLanguage>
}) {
  const global = useGlobal()
  const unreachable = () => global.servers.health[ServerConnection.key(props.server)]?.healthy === false
  const path = () => {
    const home = props.homedir
    const worktree = props.project.worktree
    if (home && (worktree === home || worktree.startsWith(`${home}/`))) return `~${worktree.slice(home.length)}`
    return worktree
  }
  return (
    <TooltipV2 placement="right" value={path()}>
      <button
        type="button"
        data-component="home-recently-closed-row"
        class={`${HOME_PROJECT_NAV_ROW} disabled:opacity-60`}
        disabled={unreachable()}
        onClick={() => props.openRecentProject(props.server, props.project.worktree)}
      >
        <HomeProjectAvatar project={props.project} outline />
        <span class={HOME_PROJECT_NAV_LABEL}>{displayName(props.project)}</span>
      </button>
    </TooltipV2>
  )
}

function HomeProjectRow(props: {
  project: LocalProject
  server: ServerConnection.Any
  selected: boolean
  unseenCount: number
  selectProject: (server: ServerConnection.Any, directory: string) => void
  openNewSession: (server: ServerConnection.Any, directory: string) => void
  editProject: (server: ServerConnection.Any, project: LocalProject) => void
  closeProject: (server: ServerConnection.Any, directory: string) => void
  clearNotifications: (server: ServerConnection.Any, project: LocalProject) => void
  language: ReturnType<typeof useLanguage>
}) {
  const global = useGlobal()
  const platform = usePlatform()
  const serverUnreachable = () => global.servers.health[ServerConnection.key(props.server)]?.healthy === false
  const [state, setState] = createStore({ menuOpen: false })
  const canRevealInFileManager = () =>
    platform.platform === "desktop" && !!platform.openPath && ServerConnection.local(props.server)
  const fileManagerActionLabel = () =>
    props.language.t(
      fileManagerApp(platform.platform === "desktop" ? (platform.os ?? "unknown") : "unknown").actionLabel,
    )
  const revealInFileManager = () => {
    if (!platform.openPath) return
    platform.openPath(props.project.worktree).catch((err: unknown) =>
      showToast({
        title: props.language.t("common.requestFailed"),
        description: errorMessage(err, props.language.t("common.requestFailed")),
      }),
    )
  }
  return (
    <div class="group/project relative flex min-h-14 min-w-0 items-center rounded-[6px]">
      <button
        type="button"
        data-component="home-project-row"
        class={`${HOME_PROJECT_NAV_ROW} !h-14 !gap-3 !pl-2.5 !pr-16 disabled:opacity-60`}
        data-selected={props.selected ? "" : undefined}
        aria-current={props.selected ? "page" : undefined}
        aria-label={`${displayName(props.project)}, ${compactProjectPath(props.project.worktree)}`}
        disabled={serverUnreachable()}
        onClick={() => props.selectProject(props.server, props.project.worktree)}
      >
        <HomeProjectAvatar project={props.project} class="!size-7" />
        <span class="min-w-0 flex-1 flex flex-col gap-0.5">
          <span class="overflow-hidden text-ellipsis whitespace-nowrap text-[13px] leading-5 text-v2-text-text-base [font-weight:600]">
            {displayName(props.project)}
          </span>
          <span
            class="overflow-hidden text-ellipsis whitespace-nowrap text-[11px] leading-4 text-v2-text-text-muted [font-weight:440]"
            title={props.project.worktree}
          >
            {compactProjectPath(props.project.worktree)}
          </span>
        </span>
        <Show when={props.selected}>
          <IconV2 name="check" size="small" class="shrink-0 text-v2-icon-icon-base" />
        </Show>
      </button>
      <div
        class="hover-reveal absolute right-1 top-1/2 flex -translate-y-1/2 items-center gap-1 group-hover/project:opacity-100 focus-within:opacity-100 data-[menu=true]:opacity-100"
        data-menu={state.menuOpen}
      >
        <MenuV2
          gutter={6}
          modal={false}
          placement="bottom-end"
          open={state.menuOpen}
          onOpenChange={(open) => setState("menuOpen", open)}
        >
          <MenuV2.Trigger
            as={IconButtonV2}
            data-action="home-project-menu"
            variant="ghost-muted"
            size="small"
            icon={<IconV2 name="outline-dots" />}
            aria-label={props.language.t("common.moreOptions")}
          />
          <MenuV2.Portal>
            <MenuV2.Content>
              <MenuV2.Item onSelect={() => props.openNewSession(props.server, props.project.worktree)}>
                {props.language.t("command.session.new")}
              </MenuV2.Item>
              <MenuV2.Item onSelect={() => props.editProject(props.server, props.project)}>
                {props.language.t("dialog.project.edit.title")}
              </MenuV2.Item>
              <Show when={canRevealInFileManager()}>
                <MenuV2.Item onSelect={revealInFileManager}>{fileManagerActionLabel()}</MenuV2.Item>
              </Show>
              <MenuV2.Item
                disabled={props.unseenCount === 0}
                onSelect={() => props.clearNotifications(props.server, props.project)}
              >
                {props.language.t("sidebar.project.clearNotifications")}
              </MenuV2.Item>
              <MenuV2.Separator />
              <MenuV2.Item onSelect={() => props.closeProject(props.server, props.project.worktree)}>
                {props.language.t("common.close")}
              </MenuV2.Item>
            </MenuV2.Content>
          </MenuV2.Portal>
        </MenuV2>
        <IconButtonV2
          data-action="home-project-new-session"
          variant="ghost-muted"
          size="small"
          icon={<IconV2 name="edit" />}
          aria-label={props.language.t("command.session.new")}
          onClick={() => props.openNewSession(props.server, props.project.worktree)}
        />
      </div>
    </div>
  )
}

function HomeProjectAvatar(props: { project: LocalProject; outline?: boolean; class?: string }) {
  const name = createMemo(() => displayName(props.project))
  return (
    <ProjectAvatar
      fallback={name()}
      src={props.outline ? undefined : getProjectAvatarSource(props.project.id, props.project.icon)}
      variant={props.outline ? "outline" : getProjectAvatarVariant(props.project.icon?.color)}
      class={props.class}
    />
  )
}

function HomeSessionLeading(props: {
  project: LocalProject
  session: Session
  server: ServerConnection.Key
  revealProjectOnHover: boolean
}) {
  const tabs = useTabs()
  const hasOpenTab = createMemo(() => sessionHasOpenTab(tabs.store, props.server, props.session))
  return (
    <div class="relative shrink-0">
      <Show when={hasOpenTab()}>
        <span
          aria-hidden="true"
          class="pointer-events-none absolute top-1/2 h-3 w-0.5 -translate-y-1/2 rounded-[2px] bg-v2-background-bg-layer-04"
          style={{ right: "calc(100% + 4px)" }}
        />
      </Show>
      <SessionTabAvatar
        project={props.project}
        directory={props.session.directory}
        sessionId={props.session.id}
        server={props.server}
        revealProjectOnHover={props.revealProjectOnHover}
      />
    </div>
  )
}

function HomeSessionSearch(props: {
  value: string
  placeholder: string
  open: boolean
  loading: boolean
  results: HomeSessionRecord[]
  showProjectName: boolean
  server: ServerConnection.Key
  noResultsLabel: string
  bindFocus: (focus: () => void) => void
  onInput: (value: string) => void
  onFocus: () => void
  onClose: () => void
  onSelect: (session: Session, options?: OpenSessionOptions) => void
}) {
  const language = useLanguage()
  const [store, setStore] = createStore({ active: "" })
  let root: HTMLDivElement | undefined
  let input: HTMLInputElement | undefined
  let listRef: HTMLDivElement | undefined

  const focusInput = () => {
    input?.focus()
    props.onFocus()
  }

  onMount(() => {
    props.bindFocus(focusInput)
  })

  const syncActive = (results: HomeSessionRecord[]) => {
    if (results.length === 0) {
      setStore("active", "")
      return
    }
    if (!results.some((record) => homeSessionSearchKey(record) === store.active)) {
      setStore("active", homeSessionSearchKey(results[0]))
    }
  }

  createEffect(() => syncActive(props.results))

  createEffect(
    on(
      () => props.value,
      () => syncActive(props.results),
    ),
  )

  const scrollActiveIntoView = () => {
    const key = store.active
    if (!key || !listRef) return
    const element = listRef.querySelector<HTMLElement>(`[data-key="${key}"]`)
    element?.scrollIntoView({ block: "nearest" })
  }

  const moveActive = (delta: number) => {
    const results = props.results
    if (results.length === 0) return
    const index = results.findIndex((record) => homeSessionSearchKey(record) === store.active)
    const start = index === -1 ? 0 : index
    const next = (start + delta + results.length) % results.length
    setStore("active", homeSessionSearchKey(results[next]))
    scrollActiveIntoView()
  }

  const selectActive = () => {
    const record = props.results.find((item) => homeSessionSearchKey(item) === store.active)
    if (!record) return
    props.onSelect(record.session)
  }

  onCleanup(
    makeEventListener(document, "pointerdown", (event) => {
      if (!props.open) return
      const target = event.target
      if (!(target instanceof Node)) return
      if (root?.contains(target)) return
      props.onClose()
    }),
  )

  return (
    <div class="w-full">
      <div ref={root} data-component="home-session-search" class="relative z-30 w-full">
        <Show when={props.open}>
          <div
            data-component="home-session-search-panel"
            class="absolute flex flex-col overflow-hidden rounded-[12px] bg-v2-background-bg-base shadow-[var(--v2-elevation-floating)]"
            style={{
              top: "-6px",
              left: "-6px",
              width: "calc(100% + 12px)",
            }}
          >
            <div class="flex flex-col pt-9">
              <div id={HOME_SESSION_SEARCH_RESULTS_ID} role="listbox" class="flex flex-col gap-4 pt-4">
                <Show
                  when={!props.loading}
                  fallback={
                    <div class="flex items-center justify-center px-4 py-3 text-v2-text-text-muted [font-weight:440]">
                      <Spinner class="size-4" />
                    </div>
                  }
                >
                  <Show
                    when={props.results.length > 0}
                    fallback={
                      <p class="my-1.5 px-4 pb-2 text-[13px] leading-4 tracking-[-0.04px] text-v2-text-text-muted [font-weight:440]">
                        {props.noResultsLabel}
                      </p>
                    }
                  >
                    <div class="flex flex-col">
                      <p class="my-1.5 pl-[18px] pr-6 text-[13px] leading-4 tracking-[-0.04px] text-v2-text-text-muted [font-weight:440]">
                        {language.t("home.sessions.search.sessions")}
                      </p>
                      <ScrollView class="max-h-80" viewportRef={(el) => (listRef = el)}>
                        <div class="flex flex-col gap-px pb-2">
                          <For each={props.results}>
                            {(record) => (
                              <HomeSessionSearchResultRow
                                record={record}
                                showProjectName={props.showProjectName}
                                server={props.server}
                                selected={store.active === homeSessionSearchKey(record)}
                                onHighlight={() => setStore("active", homeSessionSearchKey(record))}
                                onSelect={(session, options) => props.onSelect(session, options)}
                              />
                            )}
                          </For>
                        </div>
                      </ScrollView>
                    </div>
                  </Show>
                </Show>
              </div>
            </div>
          </div>
        </Show>
        <label class="relative z-20 flex h-9 w-full items-center gap-2 rounded-[6px] bg-v2-background-bg-layer-02/60 py-1 pl-3 pr-2 text-v2-icon-icon-muted transition-[background-color,box-shadow] duration-[120ms] ease-in-out hover:bg-v2-background-bg-layer-02 focus-within:bg-v2-background-bg-layer-02">
          <IconV2 name="magnifying-glass" />
          <input
            ref={input}
            class="relative z-20 min-w-0 flex-1 border-0 bg-transparent text-v2-text-text-base outline-0 [font-weight:440] placeholder:text-v2-text-text-faint"
            value={props.value}
            placeholder={props.placeholder}
            aria-label={props.placeholder}
            aria-expanded={props.open}
            aria-controls={HOME_SESSION_SEARCH_RESULTS_ID}
            aria-autocomplete="list"
            aria-activedescendant={
              store.active && props.open ? `home-session-search-option-${store.active}` : undefined
            }
            onFocus={() => props.onFocus()}
            onInput={(event) => props.onInput(event.currentTarget.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.preventDefault()
                props.onClose()
                input?.blur()
                return
              }
              if (!props.open || props.results.length === 0) return
              if (event.altKey || event.metaKey) return
              if (event.key === "ArrowDown") {
                event.preventDefault()
                moveActive(1)
                return
              }
              if (event.key === "ArrowUp") {
                event.preventDefault()
                moveActive(-1)
                return
              }
              if (event.key === "Enter" && !event.isComposing) {
                event.preventDefault()
                selectActive()
              }
            }}
          />
          <Show when={props.value}>
            <IconButtonV2
              type="button"
              variant="ghost-muted"
              size="small"
              class="relative z-20 shrink-0"
              icon={<IconV2 name="close" size="large" class="text-v2-icon-icon-muted" />}
              aria-label={props.placeholder}
              onClick={() => {
                props.onClose()
                input?.focus()
              }}
            />
          </Show>
        </label>
      </div>
    </div>
  )
}

function HomeSessionSearchResultRow(props: {
  record: HomeSessionRecord
  showProjectName: boolean
  server: ServerConnection.Key
  selected: boolean
  onHighlight: () => void
  onSelect: (session: Session, options?: OpenSessionOptions) => void
}) {
  const title = createMemo(() => sessionTitle(props.record.session.title) || props.record.session.id)
  const showProjectName = () => props.showProjectName && props.record.projectName

  const key = () => homeSessionSearchKey(props.record)

  return (
    <button
      type="button"
      id={`home-session-search-option-${key()}`}
      data-key={key()}
      data-component="home-session-search-row"
      role="option"
      aria-selected={props.selected}
      classList={{
        [HOME_SEARCH_RESULT_ROW]: true,
        "bg-v2-overlay-simple-overlay-hover": props.selected,
        group: !!showProjectName(),
      }}
      onMouseEnter={() => props.onHighlight()}
      onClick={(event) => props.onSelect(props.record.session, { background: isBackgroundOpen(event) })}
    >
      <HomeSessionLeading
        project={props.record.project}
        session={props.record.session}
        server={props.server}
        revealProjectOnHover={!!showProjectName()}
      />
      <div class="flex min-w-0 flex-1 items-center gap-1.5">
        <span
          class={`${HOME_SEARCH_RESULT_TITLE} ${showProjectName() ? "max-w-[min(70%,480px)] flex-[0_1_auto]" : "flex-[1_1_auto]"}`}
        >
          {title()}
        </span>
        <Show when={showProjectName()}>
          <span class={HOME_SEARCH_RESULT_META}>{props.record.projectName}</span>
        </Show>
      </div>
    </button>
  )
}

function HomeSessionGroupHeader(props: {
  title: string
  titleOpacity: number
  ref: ComponentProps<"div">["ref"]
  elevated?: boolean
}) {
  return (
    <div
      ref={props.ref}
      class={`pointer-events-none sticky top-3 flex h-7 min-w-0 items-center justify-between pl-3 bg-v2-background-bg-base ${props.elevated ? "home-session-group-header z-[5]" : "z-10"}`}
    >
      <div class={HOME_SECTION_LABEL} style={{ opacity: props.titleOpacity }}>
        {props.title}
      </div>
    </div>
  )
}

function HomeSessionRow(props: {
  record: HomeSessionRecord
  showProjectName: boolean
  server: ServerConnection.Key
  openSession: (session: Session, options?: OpenSessionOptions) => void
  archiveSession: (session: Session) => Promise<void>
}) {
  const language = useLanguage()
  const title = createMemo(() => sessionTitle(props.record.session.title) || props.record.session.id)
  const showProjectName = () => props.showProjectName && props.record.projectName

  return (
    <div
      class="group/session relative flex h-10 min-w-0 items-center rounded-[6px]"
      classList={{ group: !!showProjectName() }}
    >
      <button
        type="button"
        data-component="home-session-row"
        class={`${HOME_ROW} h-10 min-w-0 flex-1 gap-2 py-3 pl-3 pr-10`}
        onClick={(event) => props.openSession(props.record.session, { background: isBackgroundOpen(event) })}
      >
        <HomeSessionLeading
          project={props.record.project}
          session={props.record.session}
          server={props.server}
          revealProjectOnHover={!!showProjectName()}
        />
        <span
          class={`min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-v2-text-text-base [font-weight:530] ${showProjectName() ? "max-w-[min(70%,480px)] flex-[0_1_auto]" : "flex-[1_1_auto]"}`}
        >
          {title()}
        </span>
        <Show when={showProjectName()}>
          <span class="min-w-0 flex-[1_1_auto] overflow-hidden text-ellipsis whitespace-nowrap text-v2-text-text-muted [font-weight:440]">
            {props.record.projectName}
          </span>
        </Show>
      </button>
      <Show when={SHOW_HOME_SESSION_ARCHIVE}>
        <div class="hover-reveal absolute right-1.5 top-1/2 flex -translate-y-1/2 items-center gap-1 group-hover/session:opacity-100 focus-within:opacity-100">
          <TooltipV2 class="flex shrink-0 items-center" placement="bottom" value={language.t("common.archive")}>
            <IconButtonV2
              data-action="home-session-archive"
              variant="ghost-muted"
              size="large"
              icon={<IconV2 name="archive" />}
              aria-label={language.t("common.archive")}
              onClick={(event) => {
                event.preventDefault()
                event.stopPropagation()
                void props.archiveSession(props.record.session)
              }}
            />
          </TooltipV2>
        </div>
      </Show>
    </div>
  )
}

function HomeSessionsEmpty(props: { onNewSession?: () => void }) {
  const language = useLanguage()
  return (
    <div class="flex min-h-full flex-col items-center gap-4 px-6 pt-[52px] text-center">
      <div class="shrink-0 text-[13px] leading-[13px] tracking-[-0.04px] text-v2-text-text-base [font-weight:530]">
        {language.t("home.sessions.empty")}
      </div>
      <p class="mb-1 text-center text-[13px] leading-5 tracking-[-0.04px] text-v2-text-text-muted [font-weight:440]">
        {language.t("home.sessions.empty.description")}
      </p>
      <Show when={props.onNewSession}>
        {(onNewSession) => (
          <ButtonV2 data-action="home-new-session" variant="neutral" size="normal" icon="edit" onClick={onNewSession()}>
            {language.t("command.session.new")}
          </ButtonV2>
        )}
      </Show>
    </div>
  )
}

function HomeSessionSkeleton(props: { label: string }) {
  return (
    <div class="flex min-w-0 flex-col gap-4">
      <div class="flex h-7 min-w-0 items-center justify-between px-4">
        <div class={HOME_SECTION_LABEL}>{props.label}</div>
      </div>
      <div class="flex min-w-0 flex-col gap-px" aria-hidden="true">
        <For each={[0, 1, 2, 3]}>{() => <div class="h-10 rounded-[6px] bg-v2-background-bg-deep opacity-70" />}</For>
      </div>
    </div>
  )
}

function groupSessions(records: HomeSessionRecord[], language: ReturnType<typeof useLanguage>): HomeSessionGroup[] {
  const now = DateTime.local()
  const yesterday = now.minus({ days: 1 })
  const todaySessions = records.filter((record) =>
    DateTime.fromMillis(record.session.time.updated ?? record.session.time.created).hasSame(now, "day"),
  )
  const yesterdaySessions = records.filter((record) =>
    DateTime.fromMillis(record.session.time.updated ?? record.session.time.created).hasSame(yesterday, "day"),
  )
  const olderSessions = records.filter((record) => {
    const time = DateTime.fromMillis(record.session.time.updated ?? record.session.time.created)
    return !time.hasSame(now, "day") && !time.hasSame(yesterday, "day")
  })
  const olderTitle =
    todaySessions.length === 0 && yesterdaySessions.length === 0
      ? language.t("sidebar.project.recentSessions")
      : language.t("home.sessions.group.older")

  return [
    { id: "today" as const, title: language.t("home.sessions.group.today"), sessions: todaySessions },
    { id: "yesterday" as const, title: language.t("home.sessions.group.yesterday"), sessions: yesterdaySessions },
    { id: "older" as const, title: olderTitle, sessions: olderSessions },
  ].filter((group) => group.sessions.length > 0)
}

export function LegacyHome() {
  const sync = useServerSync()
  const platform = usePlatform()
  const pickDirectory = useDirectoryPicker()
  const dialog = useDialog()
  const navigate = useNavigate()
  const global = useGlobal()
  const server = useServer()
  const language = useLanguage()
  const homedir = createMemo(() => sync().data.path.home)
  const serverUnreachable = createMemo(() => global.servers.health[server.key]?.healthy === false)
  const recent = createMemo(() => {
    return sync()
      .data.project.slice()
      .sort((a, b) => (b.time.updated ?? b.time.created) - (a.time.updated ?? a.time.created))
      .slice(0, 5)
  })

  const serverDotClass = createMemo(() => {
    const healthy = global.servers.health[server.key]?.healthy
    if (healthy === true) return "bg-icon-success-base"
    if (healthy === false) return "bg-icon-critical-base"
    return "bg-border-weak-base"
  })

  function openProject(server: ServerConnection.Any, directory: string) {
    const serverCtx = global.ensureServerCtx(server)
    serverCtx.projects.open(directory)
    serverCtx.projects.touch(directory)
    navigate(`/${base64Encode(directory)}`)
  }

  function chooseProject() {
    if (serverUnreachable()) return
    const s = server.current
    if (!s) return

    const resolve = (result: string | string[] | null) => {
      if (Array.isArray(result)) {
        for (const directory of result) {
          openProject(s, directory)
        }
      } else if (result) {
        openProject(s, result)
      }
    }

    pickDirectory({
      server: s,
      title: language.t("command.project.open"),
      multiple: true,
      onSelect: resolve,
    })
  }

  return (
    <div class="mx-auto mt-55 w-full md:w-auto px-4">
      <Logo class="md:w-xl opacity-12" />
      <Button
        size="large"
        variant="ghost"
        class="mt-4 mx-auto text-14-regular text-text-weak"
        onClick={() => dialog.show(() => <DialogSelectServer />)}
      >
        <div
          classList={{
            "size-2 rounded-full": true,
            [serverDotClass()]: true,
          }}
        />
        {server.name}
      </Button>
      <Switch>
        <Match when={sync().data.project.length > 0}>
          <div class="mt-20 w-full flex flex-col gap-4">
            <div class="flex gap-2 items-center justify-between pl-3">
              <div class="text-14-medium text-text-strong">{language.t("home.recentProjects")}</div>
              <Button
                icon="folder-add-left"
                size="normal"
                class="pl-2 pr-3"
                disabled={serverUnreachable()}
                onClick={chooseProject}
              >
                {language.t("command.project.open")}
              </Button>
            </div>
            <ul class="flex flex-col gap-2">
              <For each={recent()}>
                {(project) => (
                  <Button
                    size="large"
                    variant="ghost"
                    class="text-14-mono text-left justify-between px-3"
                    onClick={() => openProject(server.current!, project.worktree)}
                  >
                    {project.worktree.replace(homedir(), "~")}
                    <div class="text-14-regular text-text-weak">
                      {DateTime.fromMillis(project.time.updated ?? project.time.created).toRelative()}
                    </div>
                  </Button>
                )}
              </For>
            </ul>
          </div>
        </Match>
        <Match when={!sync().ready}>
          <div class="mt-30 mx-auto flex flex-col items-center gap-3">
            <div class="text-12-regular text-text-weak">{language.t("common.loading")}</div>
            <Button class="px-3" disabled={serverUnreachable()} onClick={chooseProject}>
              {language.t("command.project.open")}
            </Button>
          </div>
        </Match>
        <Match when={true}>
          <div class="mt-30 mx-auto flex flex-col items-center gap-3">
            <Icon name="folder-add-left" size="large" />
            <div class="flex flex-col gap-1 items-center justify-center">
              <div class="text-14-medium text-text-strong">{language.t("home.empty.title")}</div>
              <div class="text-12-regular text-text-weak">{language.t("home.empty.description")}</div>
            </div>
            <Button class="px-3 mt-1" disabled={serverUnreachable()} onClick={chooseProject}>
              {language.t("command.project.open")}
            </Button>
          </div>
        </Match>
      </Switch>
    </div>
  )
}
