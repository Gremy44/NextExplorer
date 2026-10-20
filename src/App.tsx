import {
  useCallback,
  useEffect,
  useRef,
  Fragment,
  useState,
  lazy,
  Suspense,
  type CSSProperties,
  type ReactNode,
} from "react";
import {
  ArrowDownToLine,
  ArrowRight,
  ArrowRightLeft,
  Archive,
  ArchiveRestore,
  Check,
  ChevronDown,
  Command,
  Copy,
  ExternalLink,
  FileCog,
  Files,
  Folder,
  HardDrive,
  History,
  Layers,
  LayoutPanelLeft,
  Link,
  LoaderCircle,
  Monitor,
  MoreHorizontal,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightOpen,
  Pause,
  Play,
  Plus,
  RefreshCw,
  Search,
  Settings2,
  ShieldCheck,
  Star,
  Sun,
  Trash2,
  WandSparkles,
  Workflow,
  X,
} from "lucide-react";
import {
  bridge,
  storageGet,
  storageSet,
  storageUpdate,
  storageSubscribe,
} from "./bridge";
import { BrowserCompanion } from "./BrowserCompanion";
import { ConnectionSetup } from "./ConnectionSetup";
import { FolderPicker } from "./FolderPicker";
import { restoreViewMode, type ViewMode } from "./FileView";
import { saveCapturedImage } from "./image-capture";
import {
  capturedText,
  mergeCollection,
  saveCollection,
  type PendingCapture,
  type SavedCollection,
} from "./collection";
import { PROTOCOL_VERSION } from "./protocol";
import {
  connectCompanion,
  CONNECTION_ATTEMPTS,
  HELLO_TIMEOUT_MS,
} from "./connection";
import { Pane, type PaneState } from "./Pane";
import { Preview, FileIcon, FolderIcon } from "./Preview";
import { DetailsPane } from "./DetailsPane";
import {
  basename,
  collectedLink,
  fuzzy,
  join,
  safeURL,
  size,
  type Entry,
  type CollectionEntry,
  type Hello,
  type Job,
  type UndoReport,
  type Quicklink,
  type RenameOptions,
} from "./types";
import {
  currentBrowserPage,
  saveSession,
  restoreSession,
  sendFiles,
  openFullExplorer,
  webCapture,
  writeChunks,
} from "./web";
import { capturePagePDF } from "./page-capture";
import { DownloadDestination, DownloadList } from "./DownloadList";
import { SpacesDialog } from "./SpacesDialog";
import { FileGroupsDialog } from "./FileGroupsDialog";
import { verifyGroupOrigins, verifyGroupTransfer } from "./file-destinations";
import { readProvenance } from "./provenance";
import { restoreSpaces, spacesKey, type HybridSpace } from "./spaces";
import { CollectionCheck } from "./CollectionCheck";
import { InsertionHistory } from "./InsertionHistory";
import { PrepareImagesDialog } from "./PrepareImagesDialog";
import { ConversionDialog } from "./ConversionDialog";
import { conversionKind } from "./media-conversion";
import {
  downloadSuggestion,
  rememberDownloadDestination,
  verifyDownload,
} from "./downloads";

import { OrganizationContext, type FolderSize } from "./OrganizationContext";
import { SearchDialog } from "./SearchDialog";
import { TagsDialog } from "./TagsDialog";
import { TagPicker } from "./TagPicker";
import { TaggedFilesDialog } from "./TaggedFilesDialog";
import { PreferencesDialog } from "./PreferencesDialog";
import { EngineStatus } from "./EngineStatus";
import { HomeDialog } from "./HomeDialog";
import {
  defaultPreferences,
  restorePreferences,
  preferencesKey,
  commandList,
  shortcutKey,
  type Preferences,
} from "./preferences";
import { emptyTags, restoreTags, tagsKey, type TagStore } from "./tags";
import {
  folderAppearanceKey,
  restoreFolderAppearances,
  type FolderAppearances,
} from "./folder-appearance";
import { FolderAppearanceDialog } from "./FolderAppearanceDialog";
import {
  DRIVES_PATH,
  type Volume,
  type SpaceAnalysis as Analysis,
} from "./disk-space";
import { SpaceAnalysis } from "./SpaceAnalysis";
import { DriveCapacity } from "./DrivesView";
import { QuickActions } from "./QuickActions";
import { quickActions, type QuickAction } from "./quick-actions";
const QuickActionDialog = lazy(() =>
  import("./QuickActionDialog").then((module) => ({
    default: module.QuickActionDialog,
  })),
);
import { fileKey } from "./file-families";

const jobIcons: Record<string, ReactNode> = {
  transfer: <ArrowRightLeft size={18} />,
  convert: <RefreshCw size={18} />,
  recipe: <Workflow size={18} />,
  zip: <Archive size={18} />,
  extract: <ArchiveRestore size={18} />,
  scan: <HardDrive size={18} />,
  quick: <WandSparkles size={18} />,
  duplicates: <Files size={18} />,
  metadata: <FileCog size={18} />,
  download: <ArrowDownToLine size={18} />,
};

const fresh = (viewMode: ViewMode = "details"): PaneState => ({
  path: "",
  history: [],
  listing: null,
  selected: [],
  filter: "",
  sortBy: "name",
  sortOrder: "asc",
  viewMode,
  loading: false,
});
type WorkspaceTab = {
  panes: PaneState[];
  active: number;
  dual: boolean;
  split: number;
};
type Workspace = { tabs: WorkspaceTab[]; current: number };
const workspaceKey = (panel: boolean) =>
  `nextexplorer:tabs:${panel ? "panel" : "page"}`;
const newTab = (path = "", viewMode: ViewMode = "details"): WorkspaceTab => ({
  panes: [
    { ...fresh(viewMode), path },
    { ...fresh(viewMode), path },
  ],
  active: 0,
  dual: false,
  split: 50,
});
function restoreWorkspace(panel: boolean): Workspace {
  const defaultMode = panel ? "tiles" : "details";
  const requestedPath = !panel
    ? new URLSearchParams(location.search).get("path")
    : null;
  try {
    const saved = JSON.parse(
      localStorage.getItem(workspaceKey(panel)) || "null",
    );
    if (Array.isArray(saved?.tabs) && saved.tabs.length) {
      const tabs = saved.tabs.map(
        (tab: any): WorkspaceTab => ({
          panes: [0, 1].map((i) => {
            const pane = tab?.panes?.[i];
            return {
              ...fresh(defaultMode),
              path: typeof pane?.path === "string" ? pane.path : "",
              history: Array.isArray(pane?.history)
                ? pane.history
                    .filter((p: unknown) => typeof p === "string")
                    .slice(-50)
                : [],
              filter: typeof pane?.filter === "string" ? pane.filter : "",
              selectionPaths: Array.isArray(pane?.selectionPaths)
                ? pane.selectionPaths
                    .filter(
                      (path: unknown) =>
                        typeof path === "string" && path.length <= 4096,
                    )
                    .slice(0, 1000)
                : [],
              scrollTop:
                typeof pane?.scrollTop === "number" &&
                Number.isFinite(pane.scrollTop)
                  ? Math.max(0, pane.scrollTop)
                  : 0,
              sortBy: ["name", "mtime", "size", "type", "tags"].includes(
                pane?.sortBy,
              )
                ? pane.sortBy
                : "name",
              sortOrder: pane?.sortOrder === "desc" ? "desc" : "asc",
              viewMode: restoreViewMode(
                pane?.viewMode,
                pane?.grid,
                defaultMode,
              ),
            };
          }),
          active: tab?.active === 1 ? 1 : 0,
          dual: tab?.dual === true,
          split:
            typeof tab?.split === "number" && Number.isFinite(tab.split)
              ? Math.max(30, Math.min(70, tab.split))
              : 50,
        }),
      );
      let current =
        Number.isInteger(saved.current) &&
        saved.current >= 0 &&
        saved.current < tabs.length
          ? saved.current
          : 0;
      if (requestedPath) {
        const existing = tabs.findIndex(
          (tab: WorkspaceTab) => tab.panes[tab.active].path === requestedPath,
        );
        if (existing >= 0) current = existing;
        else {
          tabs.push(newTab(requestedPath, defaultMode));
          current = tabs.length - 1;
        }
      }
      return { tabs, current };
    }
  } catch {
    /* Ignore a corrupt or unavailable local workspace. */
  }
  return { tabs: [newTab(requestedPath || "", defaultMode)], current: 0 };
}
type Dialog = {
  kind: string;
  paths?: string[];
  destination?: string;
  value?: any;
};
const initialRename: RenameOptions = {
  pattern: "",
  replacement: "",
  prefix: "",
  suffix: "",
  case: "",
  number: false,
  start: 1,
  step: 1,
  digits: 3,
};
function Modal({
  title,
  onClose,
  children,
  wide = false,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  const box = useRef<HTMLElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement;
    const el = box.current;
    (
      el?.querySelector<HTMLElement>("[data-autofocus]") ||
      el?.querySelector<HTMLElement>("input,button,select")
    )?.focus();
    const trap = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const items = Array.from(
        el?.querySelectorAll<HTMLElement>(
          "button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),a[href],summary",
        ) || [],
      ).filter((x) => x.offsetParent !== null);
      if (!items.length) return;
      const first = items[0],
        last = items.at(-1)!;
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      }
      if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    el?.addEventListener("keydown", trap);
    return () => {
      el?.removeEventListener("keydown", trap);
      previous?.focus();
    };
  }, [title]);
  return (
    <div
      className="overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <section
        ref={box}
        className={"modal " + (wide ? "wide" : "")}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === "Escape") onClose();
        }}
      >
        <header>
          <strong>{title}</strong>
          <button aria-label="Fermer" onClick={onClose}>
            <X size={18} />
          </button>
        </header>
        {children}
      </section>
    </div>
  );
}
function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}
export function App() {
  const panel = new URLSearchParams(location.search).has("panel");
  const [hello, setHello] = useState<Hello | null>(null);
  const [connecting, setConnecting] = useState(true);
  const [connectionError, setConnectionError] = useState("");
  const [connectionAttempt, setConnectionAttempt] = useState(1);
  const [firstFolder, setFirstFolder] = useState(false);
  const [firstFolderPicker, setFirstFolderPicker] = useState(false);
  const connectionController = useRef<AbortController | null>(null);
  const [workspace, setWorkspace] = useState<Workspace>(() =>
    restoreWorkspace(panel),
  );
  const followedSpaceKey = `followedSpace:${panel ? "panel" : "page"}`;
  const [spaces, setSpaces] = useState<HybridSpace[]>([]);
  const [followedSpaceId, setFollowedSpaceId] = useState<string | null>(null);
  const followedSpace = spaces.find((space) => space.id === followedSpaceId);
  const { tabs, current } = workspace;
  const { panes, active, dual } = tabs[current];
  const [sidebar, setSidebar] = useState(!panel && innerWidth > 760);
  const [hidden, setHidden] = useState(false);
  const [preferences, setPreferences] =
    useState<Preferences>(defaultPreferences);
  const [tags, setTags] = useState<TagStore>(emptyTags);
  const [appearances, setAppearances] = useState<FolderAppearances>({});
  const [volumes, setVolumes] = useState<Volume[]>([]);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [folderPreferences, setFolderPreferences] = useState<
    Record<string, { viewMode: ViewMode; sortBy: string; sortOrder: string }>
  >({});
  const [recentFolders, setRecentFolders] = useState<string[]>([]);
  const [folderSizes, setFolderSizes] = useState<Record<string, FolderSize>>(
    {},
  );
  const scanJobs = useRef(new Map<string, string>());
  const analysisGeneration = useRef(0);
  const closedTabs = useRef<WorkspaceTab[]>([]);
  const scrollPositions = useRef(
    new Map<string, { scrollTop: number; selected: Entry[] }>(),
  );
  const [theme, setTheme] = useState("dark");
  const [favorites, setFavorites] = useState<{ name: string; path: string }[]>(
    [],
  );
  const [stash, setStash] = useState<CollectionEntry[]>([]);
  const [savedCollections, setSavedCollections] = useState<SavedCollection[]>(
    [],
  );
  const localStash = stash.filter(
    (entry): entry is Entry => entry.type !== "web",
  );
  const [stashReview, setStashReview] = useState(false);
  const [pendingCapture, setPendingCapture] = useState<PendingCapture | null>(
    null,
  );
  const [captureOpen, setCaptureOpen] = useState(false);
  const [captureBusy, setCaptureBusy] = useState(false);
  const [captureError, setCaptureError] = useState("");
  const [shelf, setShelf] = useState(true);
  const [stashActionsOpen, setStashActionsOpen] = useState(false);
  const [links, setLinks] = useState<Record<string, Quicklink[]>>({});
  const [trash, setTrash] = useState<{ path: string; record: string }[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [jobsOpen, setJobsOpen] = useState(false);
  const jobsPane = useRef<HTMLElement>(null);
  const jobsWidthKey = `nextexplorer:jobs-width:${panel ? "panel" : "page"}`;
  const [jobsWidth, setJobsWidth] = useState(() => {
    try {
      const saved = Number(localStorage.getItem(jobsWidthKey));
      return Number.isFinite(saved) && saved >= 240 && saved <= 640
        ? saved
        : 280;
    } catch {
      return 280;
    }
  });
  const [jobsLimit, setJobsLimit] = useState(640);
  const visibleJobsWidth = Math.min(jobsWidth, jobsLimit);
  useEffect(() => {
    try {
      localStorage.setItem(jobsWidthKey, String(jobsWidth));
    } catch {}
  }, [jobsWidth, jobsWidthKey]);
  useEffect(() => {
    const workspace = jobsPane.current?.parentElement;
    if (!jobsOpen || !workspace) return;
    const navigation =
      workspace.querySelector<HTMLElement>(":scope > .sidebar");
    const measure = () => {
      const reserved =
        window.innerWidth <= 760 ? 40 : (navigation?.offsetWidth || 0) + 336;
      setJobsLimit(
        Math.max(240, Math.min(640, workspace.clientWidth - reserved)),
      );
    };
    const observer = new ResizeObserver(measure);
    observer.observe(workspace);
    if (navigation) observer.observe(navigation);
    measure();
    return () => observer.disconnect();
  }, [jobsOpen, sidebar]);
  function resizeJobs(next: number) {
    setJobsWidth(Math.max(240, Math.min(jobsLimit, Math.round(next))));
  }
  function dragJobs(clientX: number) {
    const bounds = jobsPane.current?.getBoundingClientRect();
    if (bounds) resizeJobs(bounds.right - clientX - 8);
  }
  const [preview, setPreview] = useState<Entry | null>(null);
  const [detailsExpanded, setDetailsExpanded] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(() => {
    try {
      return localStorage.getItem("nextexplorer:details") === "true";
    } catch {
      return false;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem("nextexplorer:details", String(detailsOpen));
    } catch {}
  }, [detailsOpen]);
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [undoReview, setUndoReview] = useState<{
    jobId: string;
    report: UndoReport;
  } | null>(null);
  const [undoBusy, setUndoBusy] = useState(false);
  const [undoError, setUndoError] = useState("");
  const [extractMerge, setExtractMerge] = useState(false);
  const [palette, setPalette] = useState(false);
  const [query, setQuery] = useState("");
  const [toast, setToast] = useState<{ text: string; error: boolean } | null>(
    null,
  );
  const [revision, setRevision] = useState(0);
  const [clipboard, setClipboard] = useState<{
    paths: string[];
    mode: string;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState("");
  const [rename, setRename] = useState(initialRename);
  const [dryRun, setDryRun] = useState<{
    valid: boolean;
    rows: { from: string; to: string; name: string; error: string }[];
  } | null>(null);
  const pane = panes[active];
  const notify = useCallback(
    (text: string, error = false) => setToast({ text, error }),
    [],
  );
  const refresh = useCallback(() => setRevision((n) => n + 1), []);
  const setPanes = (change: (panes: PaneState[]) => PaneState[]) =>
    setWorkspace((old) => ({
      ...old,
      tabs: old.tabs.map((tab, index) =>
        index === current ? { ...tab, panes: change(tab.panes) } : tab,
      ),
    }));
  const update = (i: number, p: Partial<PaneState>) =>
    setPanes((old) => old.map((v, k) => (k === i ? { ...v, ...p } : v)));
  const setSplit = (value: number) =>
    setWorkspace((old) => {
      const split = Math.max(30, Math.min(70, Math.round(value)));
      if (old.tabs[old.current].split === split) return old;
      return {
        ...old,
        tabs: old.tabs.map((tab, i) =>
          i === old.current ? { ...tab, split } : tab,
        ),
      };
    });
  const dragSplit = (clientX: number, divider: HTMLElement) => {
    const bounds = divider.parentElement!.getBoundingClientRect();
    setSplit(((clientX - bounds.left) / bounds.width) * 100);
  };
  const openTab = (path = pane.path) => {
    setWorkspace((old) => ({
      tabs: [
        ...old.tabs,
        newTab(path || hello?.home || "", preferences.defaultView),
      ],
      current: preferences.newTabFocus ? old.tabs.length : old.current,
    }));
    setPreview(null);
  };
  const activateTab = (index: number) => {
    setWorkspace((old) =>
      old.current === index ? old : { ...old, current: index },
    );
    setPreview(null);
  };
  const closeTab = (index: number) => {
    setWorkspace((old) => {
      if (old.tabs.length === 1) return old;
      closedTabs.current = [...closedTabs.current, old.tabs[index]].slice(-10);
      const tabs = old.tabs.filter((_, i) => i !== index);
      const current =
        old.current === index
          ? Math.min(index, tabs.length - 1)
          : old.current > index
            ? old.current - 1
            : old.current;
      return { tabs, current };
    });
    setPreview(null);
  };
  const navigate = (path: string, i = active, remember = true) => {
    const resolved = hello?.aliases[path] || path;
    if (resolved === panes[i].path) return;
    update(i, {
      path: resolved,
      selected: [],
      filter: "",
      listing: null,
      ...(remember
        ? { history: [...panes[i].history, panes[i].path].slice(-50) }
        : {}),
    });
    const previous = panes[i];
    const list = document.querySelectorAll<HTMLElement>(".file-scroll")[i];
    if (previous.path)
      scrollPositions.current.set(fileKey(previous.path), {
        scrollTop: list?.scrollTop || 0,
        selected: previous.selected,
      });
    const saved = preferences.rememberFolders
      ? folderPreferences[fileKey(resolved)]
      : undefined;
    update(i, {
      ...(saved || { viewMode: preferences.defaultView }),
      selected: scrollPositions.current.get(fileKey(resolved))?.selected || [],
      scrollTop: scrollPositions.current.get(fileKey(resolved))?.scrollTop || 0,
    });
    storageSet("lastPath", resolved);
    if (resolved === DRIVES_PATH) return;
    void storageUpdate<string[]>("recentFolders", [], (current) =>
      [resolved, ...current.filter((path) => path !== resolved)].slice(0, 20),
    ).catch((error) => notify(error.message, true));
  };
  const previousFolder = () => {
    const path = pane.history.at(-1);
    if (!path) return;
    update(active, { history: pane.history.slice(0, -1) });
    navigate(path, active, false);
  };
  function changePane(i: number, change: Partial<PaneState>) {
    update(i, change);
    if (
      preferences.rememberFolders &&
      (change.viewMode || change.sortBy || change.sortOrder)
    ) {
      const currentPane = { ...panes[i], ...change };
      void storageUpdate<
        Record<
          string,
          { viewMode: ViewMode; sortBy: string; sortOrder: string }
        >
      >("folderPreferences", {}, (stored) =>
        Object.fromEntries([
          ...Object.entries(stored)
            .filter(([path]) => path !== fileKey(currentPane.path))
            .slice(-199),
          [
            fileKey(currentPane.path),
            {
              viewMode: currentPane.viewMode,
              sortBy: currentPane.sortBy,
              sortOrder: currentPane.sortOrder,
            },
          ],
        ]),
      ).catch((error) => notify(error.message, true));
    }
  }
  const savedWorkspace = JSON.stringify({
    current,
    tabs: tabs.map((tab) => ({
      active: tab.active,
      dual: tab.dual,
      split: tab.split,
      panes: tab.panes.map(
        ({
          path,
          history,
          filter,
          sortBy,
          sortOrder,
          viewMode,
          scrollTop,
          selected,
          selectionPaths,
        }) => ({
          path,
          history,
          filter,
          sortBy,
          sortOrder,
          viewMode,
          scrollTop,
          selectionPaths: selectionPaths || selected.map((entry) => entry.path),
        }),
      ),
    })),
  });
  useEffect(() => {
    try {
      localStorage.setItem(workspaceKey(panel), savedWorkspace);
    } catch {
      /* Browsing still works if local storage is unavailable. */
    }
  }, [savedWorkspace, panel]);
  async function connect() {
    connectionController.current?.abort();
    const controller = new AbortController();
    connectionController.current = controller;
    setConnecting(true);
    setConnectionAttempt(1);
    setConnectionError("");
    setHello(null);
    try {
      const h = await connectCompanion(
        () =>
          bridge.request<Hello>(
            "HELLO",
            {
              protocolVersion: PROTOCOL_VERSION,
            },
            HELLO_TIMEOUT_MS,
          ),
        controller.signal,
        setConnectionAttempt,
        globalThis.chrome?.runtime?.id ? CONNECTION_ATTEMPTS : 1,
      );
      const storedPreferences = await storageGet<unknown>(preferencesKey, null);
      let startupPreferences = defaultPreferences;
      try {
        if (storedPreferences)
          startupPreferences = restorePreferences(storedPreferences);
      } catch (error) {
        notify(`Préférences ignorées : ${(error as Error).message}`, true);
      }
      const last = await storageGet<string | null>("lastPath", null);
      controller.signal.throwIfAborted();
      let path = typeof last === "string" && last ? last : h.home;
      try {
        await bridge.request("FS_STAT", { path });
      } catch {
        path = h.home;
      }
      controller.signal.throwIfAborted();
      const jobs = h.workerError ? [] : await bridge.request<Job[]>("JOBS");
      const history =
        !h.workerError && h.features?.operationJournal
          ? await bridge.request<Job[]>("OPERATION_JOURNAL").catch(() => {
              notify("Le journal local n’a pas pu être chargé.", true);
              return [];
            })
          : [];
      controller.signal.throwIfAborted();
      const needsFirstFolder = firstFolder || (!last &&
        !new URLSearchParams(location.search).get("path") &&
        workspace.tabs.every((tab) => tab.panes.every((pane) => !pane.path)));
      setHello(h);
      setFirstFolder(needsFirstFolder);
      if (h.workerError)
        notify(
          `Exploration disponible, tâches locales indisponibles : ${h.workerError}`,
          true,
        );
      setWorkspace((old) => ({
        ...old,
        current:
          startupPreferences.startup !== "restore" &&
          !panel &&
          !new URLSearchParams(location.search).has("path")
            ? 0
            : old.current,
        tabs: (!panel &&
        !new URLSearchParams(location.search).has("path") &&
        startupPreferences.startup !== "restore"
          ? (startupPreferences.startup === "folders"
              ? startupPreferences.startupPaths
              : [h.home]
            ).map((path) => newTab(path, startupPreferences.defaultView))
          : old.tabs
        ).map((tab) => ({
          ...tab,
          panes: tab.panes.map((p) => ({ ...p, path: p.path || path })),
        })),
      }));
      if (
        !panel &&
        !new URLSearchParams(location.search).has("path") &&
        startupPreferences.startup === "home" &&
        !needsFirstFolder
      )
        setDialog({ kind: "home" });
      setJobs((current) => {
        const live = jobs.map((j) => {
          const recent = current.find((v) => v.id === j.id && !v.archived);
          return recent &&
            ["completed", "error", "cancelled"].includes(recent.state)
            ? recent
            : j;
        });
        return [
          ...new Map([...history, ...live].map((j) => [j.id, j])).values(),
        ]
          .sort((a, b) => (b.startedAt || "").localeCompare(a.startedAt || ""))
          .slice(0, 100);
      });
    } catch (e) {
      if (controller.signal.aborted) return;
      setConnectionError((e as Error).message);
      setHello(null);
    } finally {
      if (!controller.signal.aborted) setConnecting(false);
    }
  }
  useEffect(() => {
    connect();
    Promise.all([
      storageGet("favorites", []),
      storageGet("quicklinks", {}),
      storageGet("trash", []),
      storageGet("theme", "dark"),
    ]).then(async ([f, l, t, th]) => {
      setFavorites(f);
      setLinks(l);
      setTrash(t);
      if (!(await storageGet(preferencesKey, null))) setTheme(th);
    });
    return () => connectionController.current?.abort();
  }, []);
  async function loadVolumes() {
    if (!hello) return;
    try {
      const result = hello.features?.diskVolumes
        ? await bridge.request<Volume[]>("DISK_VOLUMES", {}, 6000)
        : hello.roots.map((root) => ({ ...root, kind: "local" as const }));
      setVolumes(result);
    } catch (error) {
      notify((error as Error).message, true);
    }
  }
  useEffect(() => {
    void loadVolumes();
    const timer = setInterval(() => void loadVolumes(), 60000);
    return () => clearInterval(timer);
  }, [hello]);
  useEffect(() => {
    let live = true;
    const refreshCollections = () => {
      // Read under the same lock as writers so a late initial read cannot
      // replace a newer notification with stale data.
      navigator.locks
        .request("nextexplorer:stash", async () => {
          const entries = await storageGet<CollectionEntry[]>("stash", []);
          if (live) setStash(entries);
        })
        .catch((e) => {
          if (live) notify(e.message, true);
        });
      navigator.locks
        .request("nextexplorer:savedCollections", async () => {
          const lists = await storageGet<SavedCollection[]>(
            "savedCollections",
            [],
          );
          if (live) setSavedCollections(lists);
        })
        .catch((e) => {
          if (live) notify(e.message, true);
        });
    };
    const unsubscribe = storageSubscribe(
      ["stash", "savedCollections"],
      refreshCollections,
    );
    refreshCollections();
    return () => {
      live = false;
      unsubscribe();
    };
  }, []);
  useEffect(() => {
    let live = true;
    const read = () =>
      navigator.locks
        .request(`nextexplorer:${spacesKey}`, async () => {
          const spaces = restoreSpaces(await storageGet(spacesKey, []));
          const id = await storageGet<unknown>(followedSpaceKey, null);
          const selected = spaces.find((space) => space.id === id);
          if (id !== null && !selected)
            await storageSet(followedSpaceKey, null);
          if (live) {
            setSpaces(spaces);
            setFollowedSpaceId(selected?.id || null);
          }
        })
        .catch((error) => {
          if (live) notify(error.message, true);
        });
    const unsubscribe = storageSubscribe([spacesKey, followedSpaceKey], read);
    void read();
    return () => {
      live = false;
      unsubscribe();
    };
  }, [followedSpaceKey]);
  async function followSpace(id: string | null) {
    await navigator.locks.request(`nextexplorer:${spacesKey}`, async () => {
      const spaces = restoreSpaces(await storageGet(spacesKey, []));
      if (id !== null && !spaces.some((space) => space.id === id))
        throw new Error("Cet espace a été supprimé ou ne peut plus être lu.");
      await storageSet(followedSpaceKey, id);
      setSpaces(spaces);
      setFollowedSpaceId(id);
    });
  }
  useEffect(() => {
    let live = true;
    const refreshCapture = () =>
      navigator.locks
        .request("nextexplorer:pendingCapture", async () => {
          const capture = await storageGet<PendingCapture | null>(
            "pendingCapture",
            null,
          );
          if (live) {
            setPendingCapture(capture);
            if (capture) setCaptureOpen(true);
          }
        })
        .catch((e) => {
          if (live) notify(e.message, true);
        });
    const unsubscribe = storageSubscribe(["pendingCapture"], refreshCapture);
    refreshCapture();
    return () => {
      live = false;
      unsubscribe();
    };
  }, []);
  useEffect(() => {
    let live = true;
    const read = () =>
      Promise.all([
        storageGet<unknown>(preferencesKey, null),
        storageGet<unknown>(tagsKey, emptyTags()),
        storageGet<
          Record<
            string,
            { viewMode: ViewMode; sortBy: string; sortOrder: string }
          >
        >("folderPreferences", {}),
        storageGet<string[]>("recentFolders", []),
        storageGet<unknown>(folderAppearanceKey, {}),
      ])
        .then(([raw, tagData, folderData, recent, appearanceData]) => {
          if (!live) return;
          const next = raw ? restorePreferences(raw) : defaultPreferences;
          setPreferences(next);
          setHidden(next.hidden);
          if (raw) setTheme(next.theme);
          setTags(restoreTags(tagData));
          setAppearances(restoreFolderAppearances(appearanceData));
          setFolderPreferences(
            Object.fromEntries(
              Object.entries(folderData)
                .filter(
                  ([path, value]) =>
                    path.length <= 4096 &&
                    value &&
                    ["name", "size", "mtime", "type", "tags"].includes(
                      value.sortBy,
                    ) &&
                    ["asc", "desc"].includes(value.sortOrder),
                )
                .slice(-200)
                .map(([path, value]) => [
                  path,
                  {
                    ...value,
                    viewMode: restoreViewMode(
                      value.viewMode,
                      false,
                      next.defaultView,
                    ),
                  },
                ]),
            ),
          );
          setRecentFolders(
            Array.isArray(recent)
              ? recent.filter((path) => typeof path === "string").slice(0, 20)
              : [],
          );
        })
        .catch((error) => {
          if (live) notify(error.message, true);
        });
    const unsubscribe = storageSubscribe(
      [
        preferencesKey,
        tagsKey,
        "folderPreferences",
        "recentFolders",
        folderAppearanceKey,
      ],
      () => void read(),
    );
    void read();
    return () => {
      live = false;
      unsubscribe();
    };
  }, []);
  async function changeTheme(value: string) {
    setTheme(value);
    try {
      await storageUpdate(preferencesKey, defaultPreferences, (current) =>
        restorePreferences({ ...current, theme: value }),
      );
    } catch (error) {
      notify((error as Error).message, true);
    }
  }
  useEffect(() => {
    const media = matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      document.documentElement.dataset.theme =
        theme === "system" ? (media.matches ? "dark" : "light") : theme;
      document.documentElement.dataset.accent = preferences.accent;
    };
    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [theme, preferences.accent]);
  useEffect(() => {
    document.documentElement.dataset.theme =
      theme === "system"
        ? matchMedia("(prefers-color-scheme: dark)").matches
          ? "dark"
          : "light"
        : theme;
    storageSet("theme", theme);
  }, [theme]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), toast.error ? 12000 : 4500);
    return () => clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    setFormError("");
    setBusy(false);
  }, [dialog?.kind]);
  const loadKey = JSON.stringify(
    panes.map((p) => [p.path, p.filter, p.sortBy, p.sortOrder]),
  );
  useEffect(() => {
    if (!hello) return;
    let live = true;
    const load = async (i: number) => {
      const p = panes[i];
      if (!p.path) return;
      if (p.path === DRIVES_PATH) {
        update(i, { loading: false, listing: null });
        return;
      }
      update(i, { loading: true });
      try {
        let offset = 0;
        let snapshot = "";
        let entries: Entry[] = [];
        let listing;
        do {
          listing = await bridge.request<any>("FS_LIST_DIR", {
            path: p.path,
            filter: p.filter,
            sortBy: p.sortBy,
            sortOrder: p.sortOrder,
            showHidden: hidden,
            mixedSort: !preferences.foldersFirst,
            offset,
            limit: 500,
            snapshot,
          });
          entries.push(...listing.entries);
          snapshot = listing.snapshot;
          if (listing.nextOffset <= offset) break;
          offset = listing.nextOffset;
        } while (live && offset < listing.total);
        if (live)
          setPanes((old) =>
            old.map((v, k) =>
              k === i
                ? {
                    ...v,
                    loading: false,
                    listing: { ...listing, entries },
                    selectionPaths: undefined,
                    selected: (v.selectionPaths
                      ? v.selectionPaths.map((path) => ({ path }))
                      : v.selected
                    ).flatMap((s) => {
                      const current = entries.find((e) => e.path === s.path);
                      return current ? [current] : [];
                    }),
                  }
                : v,
            ),
          );
      } catch (e) {
        if (live) {
          update(i, { loading: false });
          notify((e as Error).message, true);
        }
      }
    };
    const timer = setTimeout(() => {
      load(0);
      if (dual) load(1);
    }, 90);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [
    loadKey,
    hello,
    hidden,
    revision,
    dual,
    current,
    preferences.foldersFirst,
  ]);
  useEffect(() => {
    if (hello && panes[0].path)
      bridge
        .request("FS_WATCH", {
          paths: panes
            .slice(0, dual ? 2 : 1)
            .map((p) => p.path)
            .filter((path) => path !== DRIVES_PATH),
        })
        .catch((e) => notify(e.message, true));
  }, [hello, panes[0].path, panes[1].path, dual, current]);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const unsubscribe = bridge.subscribe((e) => {
      if (e.event === "ORGANIZATION_ERROR") notify(String(e.data), true);
      if (e.event === "FS_CHANGED") {
        setFolderSizes({});
        clearTimeout(timer);
        timer = setTimeout(refresh, 250);
      }
      if (e.event === "JOB_UPDATE") {
        const j = e.data as Job;
        setJobs((old) =>
          [j, ...old.filter((v) => v.id !== j.id)].slice(0, 100),
        );
        if (["completed", "error", "cancelled"].includes(j.state)) refresh();
        if (
          j.kind === "scan" &&
          j.state === "completed" &&
          scanJobs.current.has(j.id)
        ) {
          void readFolderSizes(j.id);
        }
        if (j.state === "error") notify(j.error || "La tâche a échoué", true);
        if (j.kind === "scan" && ["error", "cancelled"].includes(j.state)) {
          setAnalysis((current) =>
            current?.jobId === j.id
              ? {
                  ...current,
                  loading: false,
                  error: j.error || "Analyse arrêtée",
                }
              : current,
          );
          scanJobs.current.delete(j.id);
        }
      }
      if (e.event === "DISCONNECTED") {
        setHello(null);
        setConnectionError(String(e.data));
      }
    });
    return () => {
      unsubscribe();
      clearTimeout(timer);
    };
  }, [notify, refresh]);
  useEffect(() => {
    if (dialog?.kind !== "batch") return;
    let live = true;
    setDryRun(null);
    const timer = setTimeout(
      () =>
        bridge
          .request("BATCH_RENAME", {
            paths: dialog.paths,
            ...rename,
            apply: false,
          })
          .then((v) => {
            if (live) {
              setDryRun(v);
              setFormError("");
            }
          })
          .catch((e) => {
            if (live) setFormError(e.message);
          }),
      220,
    );
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [dialog, rename]);
  async function analyzeSpace(path: string) {
    const epoch = ++analysisGeneration.current;
    setDetailsOpen(true);
    setAnalysis({ path, loading: true });
    try {
      const result = await bridge.request<{ jobId: string }>("SCAN", { path });
      scanJobs.current.set(result.jobId, path);
      if (epoch !== analysisGeneration.current) return;
      setAnalysis({ path, jobId: result.jobId, loading: true });
      const jobs = await bridge.request<Job[]>("JOBS");
      const job = jobs.find((job) => job.id === result.jobId);
      if (job?.state === "completed") await readFolderSizes(result.jobId);
      else if (job && ["error", "cancelled"].includes(job.state))
        setAnalysis({ path, error: job.error || "Analyse arrêtée" });
    } catch (error) {
      if (epoch === analysisGeneration.current)
        setAnalysis({ path, error: (error as Error).message });
    }
  }
  async function readFolderSizes(jobId: string) {
    try {
      const result = await bridge.request<{
        items: { path: string; size: number }[];
        path: string;
        total: number;
        skipped: number;
        truncated?: boolean;
      }>("JOB_RESULT", { jobId });
      if (result) {
        const path = scanJobs.current.get(jobId) || result.path;
        if (path)
          setAnalysis((current) =>
            current?.jobId === jobId ? { path, jobId, result } : current,
          );
        setFolderSizes((old) => ({
          ...old,
          ...Object.fromEntries(
            result.items.map((item) => [
              fileKey(item.path),
              {
                size: item.size,
                partial: result.skipped > 0 || !!result.truncated,
              },
            ]),
          ),
        }));
        scanJobs.current.delete(jobId);
      }
    } catch (error) {
      notify((error as Error).message, true);
    }
  }
  async function run(action: string, payload: unknown, success = "Terminé") {
    try {
      const r = await bridge.request(action, payload);
      if (r?.jobId) {
        setJobsOpen(true);
        notify("Tâche ajoutée à la file");
      } else {
        notify(success);
        refresh();
      }
      return r;
    } catch (e) {
      notify((e as Error).message, true);
      throw e;
    }
  }
  async function collect(entries: CollectionEntry[] = pane.selected) {
    let added = 0;
    try {
      const next = await storageUpdate<CollectionEntry[]>(
        "stash",
        [],
        (current) => {
          const merged = mergeCollection(current, entries);
          added = merged.length - current.length;
          return merged;
        },
      );
      setStash(next);
      setShelf(true);
      notify(
        added
          ? `${added} élément(s) ajouté(s) à la collecte`
          : "Ces éléments sont déjà dans la collecte",
      );
      return true;
    } catch (e) {
      notify(`Collecte non sauvegardée : ${(e as Error).message}`, true);
      return false;
    }
  }
  async function removeCollected(path?: string) {
    try {
      setStash(
        await storageUpdate<CollectionEntry[]>("stash", [], (current) =>
          path === undefined
            ? []
            : current.filter((entry) => entry.path !== path),
        ),
      );
    } catch (e) {
      notify((e as Error).message, true);
    }
  }
  async function finishCapture(destination?: string) {
    if (!pendingCapture || captureBusy) return;
    setCaptureBusy(true);
    setCaptureError("");
    try {
      await navigator.locks.request("nextexplorer:pendingCapture", async () => {
        const current = await storageGet<PendingCapture | null>(
          "pendingCapture",
          null,
        );
        if (current?.id !== pendingCapture.id)
          throw new Error(
            "Cette capture a déjà été traitée dans une autre vue",
          );
        if (destination !== undefined) {
          if (!hello)
            throw new Error(
              "Connectez le compagnon pour enregistrer la capture",
            );
          if (!destination.trim())
            throw new Error("Choisissez un dossier de destination");
          if (current.kind === "image")
            await saveCapturedImage(current, destination.trim());
          else
            await bridge.request("FS_WRITE", {
              path: destination.trim(),
              name: `Extrait-${current.id}.txt`,
              text: capturedText(current),
            });
        }
        try {
          await storageSet("pendingCapture", null);
        } catch (error) {
          if (destination !== undefined)
            throw new Error(
              `Fichier enregistré, mais brouillon non effacé : ${(error as Error).message}. Écartez la capture après vérification.`,
            );
          throw error;
        }
      });
      setPendingCapture(null);
      setCaptureOpen(false);
      if (destination !== undefined) {
        notify(
          pendingCapture.kind === "image"
            ? "Image et provenance enregistrées"
            : "Extrait enregistré",
        );
        refresh();
      } else notify("Capture écartée");
    } catch (e) {
      setCaptureError((e as Error).message);
    } finally {
      setCaptureBusy(false);
    }
  }
  function showDialog(kind: string, extra: Partial<Dialog> = {}) {
    setExtractMerge(false);
    setFormError("");
    setDialog({
      kind,
      paths: pane.selected.map((e) => e.path),
      destination: pane.path,
      ...extra,
    });
  }
  function openQuickAction(action: QuickAction) {
    const entries =
      dialog?.kind === "quick"
        ? dialog.value?.entries || pane.selected
        : pane.selected;
    showDialog("quick", { value: { action, entries: [...entries] } });
  }
  async function openEntry(entry: Entry) {
    if (entry.type === "directory") {
      navigate(entry.path);
      return;
    }
    if (entry.name.endsWith(".session.json")) {
      showDialog("session", { paths: [entry.path] });
      return;
    }
    if (entry.ext === ".weblink") {
      try {
        const link = JSON.parse(await bridge.text(entry.path));
        const u = safeURL(link.url);
        if (!u) throw new Error("Lien invalide");
        window.open(u, "_blank", "noopener");
      } catch (e) {
        notify((e as Error).message, true);
      }
      return;
    }
    setPreview(entry);
  }
  function action(a: string, paths?: string[]) {
    const selected = paths || pane.selected.map((e) => e.path);
    const first = pane.selected[0];
    if (
      pane.path === DRIVES_PATH &&
      !["home", "settings", "tags", "drives"].includes(a)
    ) {
      notify("Ouvrez un lecteur pour utiliser cette action", true);
      return;
    }
    const noSelection = [
      "mkdir",
      "note",
      "paste",
      "favorite",
      "terminal",
      "code",
      "scan",
      "duplicates",
      "git",
      "web",
      "settings",
      "saveSession",
      "pdf",
      "downloads",
      "prepare",
      "spaces",
      "groups",
      "search",
      "home",
      "tags",
      "trashList",
      "drives",
    ];
    if (!selected.length && !noSelection.includes(a)) {
      notify("Sélectionnez au moins un fichier", true);
      return;
    }
    switch (a) {
      case "tag-picker":
        showDialog("tag-picker", { value: { entries: [...pane.selected] } });
        break;
      case "quick":
        showDialog("quick", { value: { entries: [...pane.selected] } });
        break;
      case "drives":
        navigate(DRIVES_PATH);
        break;
      case "appearance":
        showDialog("appearance", { value: { entries: [...pane.selected] } });
        break;
      case "preview":
        if (first) setPreview(first);
        break;
      case "open":
        run("OS_OPEN", { path: selected[0], mode: "default" }).catch(() => {});
        break;
      case "stash":
        collect();
        break;
      case "copy":
      case "cut":
        setClipboard({ paths: selected, mode: a === "copy" ? "copy" : "move" });
        notify(
          `${selected.length} élément(s) ${a === "copy" ? "copié(s)" : "à déplacer"}`,
        );
        break;
      case "paste":
        if (clipboard)
          showDialog("transfer", {
            paths: clipboard.paths,
            value: { mode: clipboard.mode },
          });
        else notify("Aucun fichier copié");
        break;
      case "favorite": {
        const next = favorites.some((f) => f.path === pane.path)
          ? favorites.filter((f) => f.path !== pane.path)
          : [...favorites, { name: basename(pane.path), path: pane.path }];
        setFavorites(next);
        storageSet("favorites", next);
        break;
      }
      case "terminal":
      case "code":
        run("OS_OPEN", { path: pane.path, mode: a }).catch(() => {});
        break;
      case "scan":
        void analyzeSpace(pane.path);
        break;
      case "duplicates":
        run("DUPLICATES", { path: pane.path }).catch(() => {});
        break;
      case "git":
        run("GIT_STATUS", { path: pane.path })
          .then((v) =>
            showDialog("output", { value: { title: "État Git", text: v } }),
          )
          .catch(() => {});
        break;
      case "saveSession":
        saveSession(pane.path)
          .then(() => {
            notify("Session sauvegardée");
            refresh();
          })
          .catch((e) => notify(e.message, true));
        break;
      case "pdf":
        currentBrowserPage()
          .then((page) => {
            if (!page)
              throw new Error("Ouvrez une page HTTP(S) dans cette fenêtre");
            showDialog("page-pdf", {
              value: { page, id: crypto.randomUUID() },
            });
          })
          .catch((e) => notify(e.message, true));
        break;
      case "batch":
        setRename(initialRename);
        showDialog(a, { paths: selected });
        break;
      default:
        showDialog(a, { paths: selected });
    }
  }
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest(".console-pane")) return;
      // Removing a focused basket row can move focus to the document body.
      if (stashReview || captureOpen) {
        if (e.key === "Escape") setStashReview(false);
        if (e.key === "Escape" && !captureBusy) setCaptureOpen(false);
        return;
      }
      const input = (e.target as HTMLElement).closest(
        "input,textarea,select,[contenteditable]",
      );
      const assigned = Object.entries(preferences.shortcuts).find(
        ([, key]) => key && key === shortcutKey(e),
      )?.[0];
      if (assigned === "palette") {
        e.preventDefault();
        setPalette((p) => !p);
        setQuery("");
        return;
      }
      if (e.key === "Escape") {
        setPalette(false);
        setPreview(null);
        setDialog(null);
        return;
      }
      if (input || dialog || palette) return;
      if (
        (e.ctrlKey || e.metaKey) &&
        e.shiftKey &&
        e.key.toLowerCase() === "t"
      ) {
        const tab = closedTabs.current.pop();
        if (tab) {
          e.preventDefault();
          setWorkspace((old) => ({
            tabs: [...old.tabs, tab],
            current: old.tabs.length,
          }));
        }
        return;
      }
      if (!assigned) return;
      if (
        panel &&
        ![
          "back",
          "parent",
          "filter",
          "refresh",
          "search",
          "settings",
          "home",
          "tags",
        ].includes(assigned)
      )
        return;
      e.preventDefault();
      if (assigned === "refresh") refresh();
      else if (assigned === "back") previousFolder();
      else if (assigned === "parent" && pane.listing?.parentPath)
        navigate(pane.listing.parentPath);
      else if (assigned === "filter")
        document
          .querySelector<HTMLInputElement>(
            panel ? ".companion-search input" : ".pane.active .filter input",
          )
          ?.focus();
      else if (assigned === "selectAll")
        update(active, { selected: pane.listing?.entries || [] });
      else if (assigned === "preview" && preview) setPreview(null);
      else action(assigned);
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  });
  async function drop(e: React.DragEvent, path: string) {
    e.preventDefault();
    const internal = e.dataTransfer.getData("application/x-nextexplorer");
    if (internal) {
      try {
        const paths = JSON.parse(internal);
        showDialog("transfer", {
          paths,
          destination: path,
          value: { mode: e.ctrlKey ? "copy" : "move" },
        });
      } catch {
        notify("Sélection invalide", true);
      }
      return;
    }
    if (e.dataTransfer.files.length) {
      const files = Array.from(e.dataTransfer.files);
      try {
        for (const file of files) {
          const parts: Uint8Array[] = [];
          for (let offset = 0; offset < file.size; offset += 256 * 1024)
            parts.push(
              new Uint8Array(
                await file.slice(offset, offset + 256 * 1024).arrayBuffer(),
              ),
            );
          if (!parts.length) parts.push(new Uint8Array());
          await writeChunks(path, file.name, parts);
        }
        notify("Fichiers importés");
        refresh();
      } catch (err) {
        notify((err as Error).message, true);
      }
      return;
    }
    const url =
      e.dataTransfer
        .getData("text/uri-list")
        .split("\n")
        .find((s) => !s.startsWith("#")) || "";
    const text = e.dataTransfer.getData("text/plain");
    const html = e.dataTransfer.getData("text/html");
    let image = "";
    if (html) {
      const doc = new DOMParser().parseFromString(html, "text/html");
      image = doc.querySelector("img")?.src || "";
    }
    if (safeURL(image)) {
      showDialog("web", {
        destination: path,
        value: { url: image, mode: "download" },
      });
    } else if (safeURL(url || text)) {
      showDialog("web", {
        destination: path,
        value: { url: url || text, mode: "link" },
      });
    } else if (text) {
      try {
        await run(
          "FS_WRITE",
          { path, name: `Note-${Date.now()}.md`, text },
          "Note enregistrée",
        );
      } catch {}
    }
  }
  const commands = commandList;
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!dialog) return;
    const form = new FormData(e.currentTarget);
    const str = (k: string) => String(form.get(k) || "");
    const num = (k: string) => Number(str(k));
    const checked = (k: string) => form.has(k);
    setBusy(true);
    setFormError("");
    try {
      const paths = dialog.paths || [];
      const path = dialog.destination || pane.path;
      switch (dialog.kind) {
        case "page-pdf":
          await capturePagePDF(
            str("destination"),
            dialog.value.page,
            dialog.value.id,
          );
          refresh();
          notify("PDF et provenance enregistrés");
          break;
        case "mkdir":
          await run("FS_MKDIR", { path, name: str("name") }, "Dossier créé");
          break;
        case "note":
          await run(
            "FS_WRITE",
            { path, name: str("name"), text: str("text") },
            "Note enregistrée",
          );
          break;
        case "rename":
          await run(
            "FS_RENAME",
            { path: paths[0], name: str("name") },
            "Fichier renommé",
          );
          break;
        case "transfer":
          if (dialog.value?.download)
            await verifyDownload(dialog.value.download);
          if (dialog.value?.groupEntries)
            await verifyGroupTransfer(
              dialog.value.groupEntries,
              str("destination"),
              (path) => bridge.request<Entry>("FS_STAT", { path }, 5000),
            );
          if (dialog.value?.groupOrigins)
            await verifyGroupOrigins(
              dialog.value.groupEntries,
              dialog.value.groupOrigins,
              (path) => bridge.request<Entry>("FS_STAT", { path }, 5000),
              readProvenance,
            );
          if (checked("merge") && hello?.features?.transferMerge !== true) {
            throw new Error(
              "Mettez à jour le compagnon pour fusionner des dossiers.",
            );
          }
          await run(dialog.value?.download ? "DOWNLOAD_FILE" : "FS_TRANSFER", {
            paused: checked("paused"),
            ...(dialog.value?.download
              ? { download: dialog.value.download }
              : {}),
            paths,
            destination: str("destination"),
            mode: str("mode"),
            conflict: str("conflict"),
            merge: checked("merge"),
          });
          if (
            dialog.value?.download &&
            checked("rememberDownloadDestination")
          ) {
            try {
              await rememberDownloadDestination(str("destination"));
            } catch (error) {
              notify(
                `Rangement lancé, mais destination non mémorisée : ${(error as Error).message}`,
                true,
              );
            }
          }
          break;
        case "trash": {
          const r = await run(
            "FS_TRASH",
            { paths },
            "Éléments placés dans la corbeille",
          );
          const next = [...trash, ...r];
          setTrash(next);
          storageSet("trash", next);
          break;
        }
        case "zip":
          await run("ZIP", {
            paths,
            destination: str("destination"),
            name: str("name"),
            archiveFormat: str("archiveFormat"),
            paused: checked("paused"),
            password: str("password"),
            store: checked("store"),
          });
          break;
        case "extract":
          if (checked("merge") && !hello?.features?.extractMerge)
            throw new Error(
              "Mettez à jour le compagnon pour extraire dans un dossier existant.",
            );
          if (paths.length !== 1 || !/\.(zip|7z|rar)$/i.test(paths[0]))
            throw new Error("Sélectionnez une seule archive ZIP, 7z ou RAR.");
          if (paths[0].toLowerCase().endsWith(".zip")) {
            if (!hello?.features?.zipExtract)
              throw new Error(
                "Mettez à jour le compagnon pour extraire un ZIP.",
              );
          } else if (!hello?.features?.archiveExtract || !hello?.tools["7z"]) {
            throw new Error(
              "L’extraction 7z/RAR nécessite le compagnon à jour et le moteur 7-Zip.",
            );
          }
          await run(
            paths[0].toLowerCase().endsWith(".zip")
              ? "ZIP_EXTRACT"
              : "ARCHIVE_EXTRACT",
            {
              paths,
              destination: str("destination"),
              name: str("name"),
              conflict: str("conflict"),
              merge: checked("merge"),
              password: str("password"),
              paused: checked("paused"),
            },
          );
          break;
        case "batch":
          await run(
            "BATCH_RENAME",
            { paths, ...rename, apply: true },
            "Renommage appliqué",
          );
          break;
        case "metadata": {
          const tags = Object.fromEntries(
            ["Artist", "Title", "Album", "Track", "Genre", "Year"]
              .filter((k) => str(k))
              .map((k) => [k, str(k)]),
          );
          await run("METADATA_WRITE", { paths, tags, strip: checked("strip") });
          break;
        }
        case "hash": {
          const result = await bridge.request<string>("HASH", {
            path: paths[0],
            algorithm: str("algorithm"),
          });
          setDialog({
            kind: "output",
            value: {
              title: "Empreinte " + str("algorithm"),
              text: result,
              match: str("expected")
                ? result.toLowerCase() === str("expected").trim().toLowerCase()
                : null,
            },
          });
          return;
        }
        case "pin": {
          const url = safeURL(str("url"));
          if (!url) throw new Error("URL HTTP(S) requise");
          const next = {
            ...links,
            [path]: [...(links[path] || []), { title: str("name"), url }],
          };
          setLinks(next);
          storageSet("quicklinks", next);
          break;
        }
        case "collected-link": {
          const link = collectedLink(dialog.value.path, dialog.value.name);
          await run(
            "FS_WRITE",
            {
              path: str("destination"),
              name: `Lien-${crypto.randomUUID()}.weblink`,
              text: JSON.stringify(
                {
                  title: link.name,
                  url: link.path,
                  collectedAt: dialog.value.collectedAt,
                  sourceUrl: dialog.value.sourceUrl,
                },
                null,
                2,
              ),
            },
            "Lien enregistré",
          );
          break;
        }
        case "web": {
          const mode = str("mode");
          if (mode === "download" || mode === "media")
            await run("DOWNLOAD", {
              destination: path,
              url: str("url"),
              name: str("name"),
              mode,
            });
          else await webCapture(path, str("url"), mode);
          refresh();
          notify("Capture enregistrée ou ajoutée à la file");
          break;
        }
        case "session":
          await restoreSession(paths[0]);
          notify("Session restaurée");
          break;
      }
      setDialog(null);
    } catch (err) {
      setFormError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const running = jobs.filter((j) =>
    ["running", "paused", "queued", "cancelling"].includes(j.state),
  );
  const analysisView = analysis ? (
    <SpaceAnalysis
      analysis={analysis}
      onAnalyze={analyzeSpace}
      onClose={() => {
        analysisGeneration.current++;
        setDetailsExpanded(false);
        setAnalysis(null);
      }}
      onNavigate={async (path) => {
        setDetailsExpanded(false);
        try {
          const entry = await bridge.request<Entry>("FS_STAT", { path }, 5000);
          navigate(
            entry.type === "directory"
              ? path
              : path.slice(
                  0,
                  Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\")) + 1,
                ),
          );
        } catch (error) {
          notify((error as Error).message, true);
        }
      }}
    />
  ) : undefined;
  function chooseFirstFolder(path: string) {
    navigate(path);
    if (path === pane.path)
      void storageSet("lastPath", path).catch(() =>
        notify(
          "Le dossier est ouvert, mais son choix n’a pas pu être mémorisé.",
          true,
        ),
      );
    setFirstFolderPicker(false);
    setFirstFolder(false);
  }
  const connectionSetup =
    !hello || firstFolder ? (
      <ConnectionSetup
        connected={!!hello}
        connecting={connecting}
        attempt={connectionAttempt}
        error={connectionError}
        onConnect={connect}
        onChooseFolder={() => setFirstFolderPicker(true)}
        onUseHome={() => hello && chooseFirstFolder(hello.home)}
      />
    ) : null;
  return (
    <OrganizationContext.Provider
      value={{ preferences, tags, sizes: folderSizes, appearances, volumes }}
    >
      <div className={"app " + (panel ? "sidepanel" : "")}>
        <header className="appbar">
          <button
            className="brand"
            onClick={() =>
              panel ? (setPalette(true), setQuery("")) : setSidebar(!sidebar)
            }
            title={
              panel
                ? "Rechercher et afficher les commandes"
                : "Afficher la navigation"
            }
          >
            <span className="brand-mark">
              <Layers size={21} />
            </span>
            <strong>
              Next<span>Explorer</span>
            </strong>
          </button>
          <span className="appbar-divider" />
          <button
            className="workspace-switch"
            hidden={preferences.hiddenActions.includes("spaces")}
            onClick={() => showDialog("spaces")}
            title="Enregistrer ou reprendre un espace"
          >
            <Folder size={15} />
            <span>Espace local</span>
            <ChevronDown size={13} />
          </button>
          {!panel && (
            <button
              className="command-trigger"
              onClick={() => {
                setPalette(true);
                setQuery("");
              }}
            >
              <Search size={14} />
              <span>Aller à un fichier, une action…</span>
              <kbd>Ctrl K</kbd>
            </button>
          )}
          <div className="appbar-actions">
            {panel ? (
              <>
                <details
                  className="companion-options"
                  onBlur={(event) => {
                    if (!event.currentTarget.contains(event.relatedTarget))
                      event.currentTarget.open = false;
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Escape") {
                      event.currentTarget.open = false;
                      event.currentTarget.querySelector("summary")?.focus();
                    }
                  }}
                >
                  <summary
                    aria-label="Options du panneau"
                    title="Options du panneau"
                  >
                    <MoreHorizontal size={20} />
                  </summary>
                  <div
                    onClick={(event) => {
                      (
                        event.currentTarget.parentElement as HTMLDetailsElement
                      ).open = false;
                    }}
                  >
                    <button
                      onClick={() => {
                        setPalette(true);
                        setQuery("");
                      }}
                    >
                      <Search size={17} /> Rechercher une action…
                    </button>
                    <button onClick={() => showDialog("spaces")}>
                      <Folder size={17} /> Espaces hybrides…
                    </button>
                    <button onClick={() => showDialog("search")}>
                      <Search size={17} /> Rechercher dans mes fichiers…
                    </button>
                    <button onClick={() => showDialog("tags")}>
                      <Layers size={17} /> Tags…
                    </button>
                    <button onClick={() => showDialog("home")}>
                      <Folder size={17} /> Accueil…
                    </button>
                    <button onClick={() => showDialog("groups")}>
                      <Layers size={17} /> Regrouper les fichiers…
                    </button>
                    <button
                      title="Changer de thème"
                      onClick={() =>
                        void changeTheme(theme === "dark" ? "light" : "dark")
                      }
                    >
                      <Sun size={17} /> Changer de thème
                    </button>
                    <button
                      title="Réglages"
                      onClick={() => showDialog("settings")}
                    >
                      <Settings2 size={17} /> Réglages
                    </button>
                  </div>
                </details>
                <button
                  className="companion-expand"
                  title="Ouvrir en pleine page"
                  onClick={() =>
                    openFullExplorer(pane.path).catch((error) =>
                      notify(error.message, true),
                    )
                  }
                >
                  <ExternalLink size={17} /> Agrandir
                </button>
              </>
            ) : (
              <>
                <button
                  title="Changer de thème"
                  onClick={() =>
                    void changeTheme(theme === "dark" ? "light" : "dark")
                  }
                >
                  <Sun size={17} />
                </button>
                <button title="Réglages" onClick={() => showDialog("settings")}>
                  <Settings2 size={17} />
                </button>
              </>
            )}
          </div>
        </header>
        <div
          className="workspace"
          style={{ "--jobs-width": `${visibleJobsWidth}px` } as CSSProperties}
        >
          {!panel && sidebar && (
            <aside className="sidebar">
              <div className="sidebar-top">
                <span>Explorateur</span>
                <button
                  title="Masquer la navigation"
                  onClick={() => setSidebar(false)}
                >
                  <PanelLeftClose size={16} />
                </button>
              </div>
              <button className="nav-item" onClick={() => showDialog("home")}>
                <Folder size={17} />
                Accueil
              </button>
              <button className="nav-item" onClick={() => showDialog("search")}>
                <Search size={17} />
                Recherche locale
              </button>
              <button className="nav-item" onClick={() => showDialog("tags")}>
                <Layers size={17} />
                Tags
              </button>
              {tags.labels.map((tag) => (
                <button
                  key={tag.id}
                  className="nav-item"
                  onClick={() =>
                    showDialog("tagged", { value: { tag: tag.id } })
                  }
                >
                  <span className={"tag-dot tag-" + tag.color} /> {tag.name}
                </button>
              ))}
              <button
                className={
                  "nav-item " + (pane.path !== DRIVES_PATH ? "current" : "")
                }
                onClick={() => {
                  if (hello) navigate(hello.home);
                }}
              >
                <Folder size={17} />
                Mes fichiers<span className="shortcut">Alt E</span>
              </button>
              <button
                className="nav-item"
                onClick={() => {
                  setShelf(!shelf);
                }}
              >
                <Layers size={17} />
                Collecte<span className="count">{stash.length}</span>
              </button>
              <button
                className="nav-item"
                onClick={() => setJobsOpen(!jobsOpen)}
              >
                <ArrowDownToLine size={17} />
                Activité
                {running.length > 0 && (
                  <span className="count">{running.length}</span>
                )}
              </button>
              <div className="nav-section">
                <span>Accès rapide</span>
                <button
                  title="Épingler le dossier actif"
                  disabled={!hello}
                  hidden={preferences.hiddenActions.includes("favorite")}
                  onClick={() => action("favorite")}
                >
                  <Plus size={13} />
                </button>
              </div>
              {hello &&
                Object.entries(hello.aliases)
                  .filter(([k]) => ["~dl", "~desk", "~docs"].includes(k))
                  .map(([k, p]) => (
                    <button
                      key={k}
                      className="nav-item"
                      onClick={() => navigate(p)}
                    >
                      <FolderIcon path={p} size={16} />
                      {
                        {
                          "~dl": "Téléchargements",
                          "~desk": "Bureau",
                          "~docs": "Documents",
                        }[k]
                      }
                      <span className="shortcut">{k}</span>
                    </button>
                  ))}
              {favorites.map((f) => (
                <button
                  className={
                    "nav-item " + (pane.path === f.path ? "current" : "")
                  }
                  key={f.path}
                  onClick={() => navigate(f.path)}
                  title={f.path}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    const next = favorites.filter((v) => v.path !== f.path);
                    setFavorites(next);
                    storageSet("favorites", next);
                  }}
                >
                  {appearances[fileKey(f.path)] ? (
                    <FolderIcon path={f.path} size={16} />
                  ) : (
                    <Star size={15} />
                  )}
                  <span className="truncate">{f.name}</span>
                </button>
              ))}
              <div className="nav-section">
                <span>Emplacements</span>
                <HardDrive size={13} />
              </div>
              <button
                className={
                  "nav-item " + (pane.path === DRIVES_PATH ? "current" : "")
                }
                onClick={() => navigate(DRIVES_PATH)}
              >
                <Monitor size={17} />
                Ce PC
              </button>
              {hello?.roots.map((r) => (
                <button
                  className={
                    "nav-item " + (pane.path === r.path ? "current" : "")
                  }
                  key={r.path}
                  onClick={() => navigate(r.path)}
                >
                  <HardDrive size={17} />
                  <span className="nav-drive">
                    <span>{r.name}</span>
                    <DriveCapacity
                      volume={
                        volumes.find(
                          (v) => fileKey(v.path) === fileKey(r.path),
                        ) || (r as Volume)
                      }
                    />
                  </span>
                </button>
              ))}
              <div className="nav-section">
                <span>Outils</span>
              </div>
              <button
                className="nav-item"
                disabled={!hello}
                hidden={preferences.hiddenActions.includes("scan")}
                onClick={() => action("scan")}
              >
                <LayoutPanelLeft size={16} />
                Espace disque
              </button>
              <button
                className="nav-item"
                disabled={!hello}
                hidden={preferences.hiddenActions.includes("duplicates")}
                onClick={() => action("duplicates")}
              >
                <Copy size={16} />
                Doublons
              </button>
              <button
                className="nav-item"
                disabled={!hello}
                hidden={preferences.hiddenActions.includes("groups")}
                onClick={() => action("groups")}
              >
                <Layers size={16} /> Groupes de fichiers
              </button>
              <button
                className="nav-item"
                disabled={!hello}
                hidden={preferences.hiddenActions.includes("trashList")}
                onClick={() => showDialog("trashList")}
              >
                <Trash2 size={16} />
                Corbeille
              </button>
              <div className="sidebar-bottom">
                <ShieldCheck size={19} />
                <div>
                  <strong>Vos fichiers restent ici</strong>
                  <span>Traitement local, sans cloud</span>
                </div>
              </div>
            </aside>
          )}
          <main>
            {followedSpace && (
              <button
                className="space-follow"
                aria-label={`Ouvrir les tâches de ${followedSpace.name}`}
                aria-describedby="space-follow-progress"
                onClick={() =>
                  showDialog("spaces", {
                    value: { focusSpaceId: followedSpace.id },
                  })
                }
              >
                <Folder size={18} aria-hidden="true" />
                <span className="space-follow-name">
                  <small>Espace suivi</small>
                  <strong>{followedSpace.name}</strong>
                </span>
                <span className="space-follow-count" id="space-follow-progress">
                  {followedSpace.tasks.filter((task) => task.done).length}/
                  {followedSpace.tasks.length} tâches
                </span>
                <ChevronDown size={18} aria-hidden="true" />
              </button>
            )}
            {hello && !panel && (
              <div className="tabs-bar">
                <div
                  className="tabs-scroll"
                  role="tablist"
                  aria-label="Onglets de dossiers"
                >
                  {tabs.map((tab, index) => {
                    const path = tab.panes[tab.active].path;
                    const label = tab.dual
                      ? `${basename(tab.panes[0].path)} · ${basename(tab.panes[1].path)}`
                      : basename(path) || "Mes fichiers";
                    return (
                      <div
                        className={
                          "workspace-tab" +
                          (current === index ? " current" : "")
                        }
                        key={index}
                      >
                        {tabs.length > 1 && (
                          <button
                            className="tab-close"
                            aria-label={`Fermer l’onglet ${label}`}
                            onClick={() => closeTab(index)}
                          >
                            <X size={15} />
                          </button>
                        )}
                        <button
                          className="tab-select"
                          role="tab"
                          id={`folder-tab-${index}`}
                          aria-controls="active-tab-panel"
                          aria-selected={current === index}
                          aria-label={`Onglet ${index + 1} : ${label}`}
                          tabIndex={current === index ? 0 : -1}
                          title={
                            tab.dual
                              ? `${tab.panes[0].path} | ${tab.panes[1].path}`
                              : path
                          }
                          onClick={() => activateTab(index)}
                          onAuxClick={(e) => {
                            if (e.button === 1) {
                              e.preventDefault();
                              closeTab(index);
                            }
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Delete" && tabs.length > 1) {
                              e.preventDefault();
                              closeTab(index);
                              requestAnimationFrame(() =>
                                document
                                  .querySelector<HTMLButtonElement>(
                                    ".tab-select[tabindex='0']",
                                  )
                                  ?.focus(),
                              );
                              return;
                            }
                            if (
                              ![
                                "ArrowLeft",
                                "ArrowRight",
                                "Home",
                                "End",
                              ].includes(e.key)
                            )
                              return;
                            e.preventDefault();
                            const next =
                              e.key === "Home"
                                ? 0
                                : e.key === "End"
                                  ? tabs.length - 1
                                  : (index +
                                      (e.key === "ArrowRight" ? 1 : -1) +
                                      tabs.length) %
                                    tabs.length;
                            activateTab(next);
                            requestAnimationFrame(() =>
                              document
                                .querySelectorAll<HTMLButtonElement>(
                                  ".tab-select",
                                )
                                [next]?.focus(),
                            );
                          }}
                        >
                          <Folder size={15} />
                          <span>{label}</span>
                        </button>
                      </div>
                    );
                  })}
                </div>
                <details className="tab-actions">
                  <summary aria-label="Actions des onglets">
                    <MoreHorizontal size={18} />
                  </summary>
                  <div>
                    <button
                      type="button"
                      onClick={() =>
                        setWorkspace((old) => ({
                          tabs: [
                            ...old.tabs,
                            {
                              ...old.tabs[old.current],
                              panes: old.tabs[old.current].panes.map((p) => ({
                                ...p,
                                listing: null,
                                selected: [],
                              })),
                            },
                          ],
                          current: old.tabs.length,
                        }))
                      }
                    >
                      Dupliquer l’onglet
                    </button>
                    <button
                      type="button"
                      disabled={current === 0}
                      onClick={() =>
                        setWorkspace((old) => {
                          const next = [...old.tabs];
                          [next[current - 1], next[current]] = [
                            next[current],
                            next[current - 1],
                          ];
                          return { tabs: next, current: current - 1 };
                        })
                      }
                    >
                      Déplacer à gauche
                    </button>
                    <button
                      type="button"
                      disabled={current === tabs.length - 1}
                      onClick={() =>
                        setWorkspace((old) => {
                          const next = [...old.tabs];
                          [next[current + 1], next[current]] = [
                            next[current],
                            next[current + 1],
                          ];
                          return { tabs: next, current: current + 1 };
                        })
                      }
                    >
                      Déplacer à droite
                    </button>
                    <button
                      type="button"
                      disabled={!closedTabs.current.length}
                      onClick={() => {
                        const tab = closedTabs.current.pop();
                        if (tab)
                          setWorkspace((old) => ({
                            tabs: [...old.tabs, tab],
                            current: old.tabs.length,
                          }));
                      }}
                    >
                      Rouvrir l’onglet fermé
                    </button>
                  </div>
                </details>
                <button
                  className="tab-new"
                  title="Nouvel onglet"
                  aria-label="Nouvel onglet"
                  onClick={() => openTab()}
                >
                  <Plus size={18} />
                </button>
              </div>
            )}
            {!panel && (
              <div className="workspace-toolbar">
                <div>
                  {!sidebar && (
                    <button
                      title="Afficher la navigation"
                      onClick={() => setSidebar(true)}
                    >
                      <PanelLeftOpen size={17} />
                    </button>
                  )}
                  <span className={"status-dot " + (hello ? "online" : "")} />
                  <span>
                    {hello
                      ? "Compagnon connecté"
                      : connecting
                        ? "Connexion…"
                        : "Compagnon non connecté"}
                  </span>
                </div>
                <div>
                  <button
                    className={hidden ? "toggled" : ""}
                    title="Afficher les fichiers cachés"
                    onClick={() => {
                      setHidden(!hidden);
                      void storageUpdate(
                        preferencesKey,
                        defaultPreferences,
                        (value) =>
                          restorePreferences({ ...value, hidden: !hidden }),
                      ).catch((error) => notify(error.message, true));
                    }}
                  >
                    Cachés
                  </button>
                  <button
                    title="Double panneau"
                    aria-pressed={dual}
                    className={dual ? "toggled" : ""}
                    onClick={() => {
                      setWorkspace((old) => ({
                        ...old,
                        tabs: old.tabs.map((tab, i) =>
                          i === old.current
                            ? {
                                ...tab,
                                dual: !tab.dual,
                                active: tab.dual ? 0 : tab.active,
                              }
                            : tab,
                        ),
                      }));
                    }}
                  >
                    <LayoutPanelLeft size={16} />
                    <span>Double panneau</span>
                  </button>
                  <button
                    title="Volet d’aperçu"
                    aria-pressed={detailsOpen}
                    className={detailsOpen ? "toggled" : ""}
                    onClick={() => setDetailsOpen(!detailsOpen)}
                  >
                    <PanelRightOpen size={16} />
                    <span>Aperçu</span>
                  </button>
                  <button
                    title="Plus d’actions"
                    onClick={() => {
                      setPalette(true);
                      setQuery(">");
                    }}
                  >
                    <MoreHorizontal size={19} />
                  </button>
                </div>
              </div>
            )}
            {panel ? (
              <BrowserCompanion
                hello={hello}
                connectionSetup={connectionSetup}
                pane={pane}
                favorites={favorites}
                stash={stash}
                pendingCapture={
                  pendingCapture ? pendingCapture.kind || "text" : null
                }
                onNavigate={(path) => navigate(path)}
                onBack={previousFolder}
                showHidden={hidden}
                onHiddenChange={(value) => {
                  setHidden(value);
                  void storageUpdate(
                    preferencesKey,
                    defaultPreferences,
                    (current) =>
                      restorePreferences({ ...current, hidden: value }),
                  ).catch((error) => notify(error.message, true));
                }}
                onChange={(value) => changePane(active, value)}
                onCollect={collect}
                onRemove={(path) => void removeCollected(path)}
                onPreview={(entry) =>
                  entry.type === "web"
                    ? setStashReview(true)
                    : void openEntry(entry)
                }
                onReview={() => setStashReview(true)}
                onPendingCapture={() => {
                  setCaptureError("");
                  setCaptureOpen(true);
                }}
                onCaptureLink={(url) =>
                  showDialog("web", { value: { url, mode: "link" } })
                }
                onCapturePage={(page) =>
                  showDialog("page-pdf", {
                    value: { page, id: crypto.randomUUID() },
                  })
                }
                onDownloads={() => showDialog("downloads")}
                onPrepare={(page, entries, target) =>
                  showDialog("prepare", {
                    value: { page, entries: entries || localStash, target },
                  })
                }
                onNote={() => showDialog("note")}
                analysis={analysisView}
                onRefreshVolumes={loadVolumes}
                onFolderAction={async (action) => {
                  try {
                    const entry = await bridge.request<Entry>(
                      "FS_STAT",
                      { path: pane.path },
                      5000,
                    );
                    showDialog(action === "tags" ? "tag-picker" : action, {
                      value: { entries: [entry] },
                    });
                  } catch (error) {
                    notify((error as Error).message, true);
                  }
                }}
                onDrop={drop}
              />
            ) : !hello || firstFolder ? (
              <section className="onboarding">
                <span className="onboarding-icon">
                  <Layers size={42} />
                </span>
                <h1>Bienvenue dans NextExplorer</h1>
                <p>Vos dossiers locaux, à côté de vos pages web.</p>
                {connectionSetup}
              </section>
            ) : (
              <>
                <div className="explorer-content">
                  <div
                    className={"panes " + (dual ? "dual" : "")}
                    role="tabpanel"
                    id="active-tab-panel"
                    aria-labelledby={`folder-tab-${current}`}
                    style={
                      { "--split": `${tabs[current].split}%` } as CSSProperties
                    }
                  >
                    {panes.slice(0, dual ? 2 : 1).map((p, i) => (
                      <Fragment key={`${current}-${i}`}>
                        {i === 1 && (
                          <div
                            className="pane-divider"
                            role="separator"
                            aria-label="Ajuster la largeur des panneaux"
                            aria-orientation="vertical"
                            aria-valuemin={30}
                            aria-valuemax={70}
                            aria-valuenow={tabs[current].split}
                            aria-valuetext={`${tabs[current].split} % à gauche`}
                            tabIndex={0}
                            title="Glisser pour ajuster · double-clic pour réinitialiser"
                            onPointerDown={(e) => {
                              if (e.button !== 0) return;
                              e.currentTarget.setPointerCapture(e.pointerId);
                              e.preventDefault();
                              dragSplit(e.clientX, e.currentTarget);
                            }}
                            onPointerMove={(e) => {
                              if (
                                !e.currentTarget.hasPointerCapture(e.pointerId)
                              )
                                return;
                              e.preventDefault();
                              dragSplit(e.clientX, e.currentTarget);
                            }}
                            onPointerUp={(e) => {
                              if (
                                e.currentTarget.hasPointerCapture(e.pointerId)
                              )
                                e.currentTarget.releasePointerCapture(
                                  e.pointerId,
                                );
                            }}
                            onDoubleClick={() => setSplit(50)}
                            onKeyDown={(e) => {
                              const next =
                                e.key === "ArrowLeft"
                                  ? tabs[current].split - 5
                                  : e.key === "ArrowRight"
                                    ? tabs[current].split + 5
                                    : e.key === "Home"
                                      ? 30
                                      : e.key === "End"
                                        ? 70
                                        : null;
                              if (next === null) return;
                              e.preventDefault();
                              setSplit(next);
                            }}
                          />
                        )}
                        <Pane
                          pane={p}
                          active={active === i}
                          onActive={() =>
                            setWorkspace((old) =>
                              old.tabs[old.current].active === i
                                ? old
                                : {
                                    ...old,
                                    tabs: old.tabs.map((tab, index) =>
                                      index === old.current
                                        ? { ...tab, active: i }
                                        : tab,
                                    ),
                                  },
                            )
                          }
                          onChange={(v) => changePane(i, v)}
                          onNavigate={(path) => navigate(path, i)}
                          onBack={() => {
                            const previous = p.history.at(-1);
                            if (previous) {
                              update(i, { history: p.history.slice(0, -1) });
                              navigate(previous, i, false);
                            }
                          }}
                          onOpenTab={openTab}
                          onPreview={openEntry}
                          onAction={action}
                          onDrop={drop}
                          links={links[p.path] || []}
                          onPin={(link) => {
                            if (link) {
                              const next = {
                                ...links,
                                [p.path]: (links[p.path] || []).filter(
                                  (l) => l.url !== link.url,
                                ),
                              };
                              setLinks(next);
                              storageSet("quicklinks", next);
                            } else showDialog("pin", { destination: p.path });
                          }}
                          showHidden={hidden}
                          refresh={refresh}
                          onRefreshVolumes={loadVolumes}
                        />
                      </Fragment>
                    ))}
                  </div>
                  {
                    <DetailsPane
                      visible={detailsOpen}
                      path={pane.path === DRIVES_PATH ? "" : pane.path}
                      consoleAvailable={!!hello?.features?.consoleVersion}
                      expanded={detailsExpanded}
                      onExpandedChange={setDetailsExpanded}
                      entries={pane.selected.map(
                        (entry) =>
                          pane.listing?.entries.find(
                            (item) => item.path === entry.path,
                          ) || entry,
                      )}
                      exiftool={!!hello?.tools.exiftool}
                      onClose={() => {
                        setDetailsExpanded(false);
                        setDetailsOpen(false);
                      }}
                      onError={(message) => notify(message, true)}
                      onConvert={
                        hello?.tools.magick
                          ? (entry) =>
                              showDialog("convert", {
                                paths: [entry.path],
                                value: { format: "png" },
                              })
                          : undefined
                      }
                      onTags={() => action("tag-picker")}
                      onCustomize={() => action("appearance")}
                      analysis={analysisView}
                      analysisKey={analysis?.jobId || analysis?.path}
                      actions={
                        <QuickActions
                          entries={pane.selected}
                          hello={hello}
                          onAction={openQuickAction}
                          onConvert={() => action("convert")}
                        />
                      }
                    />
                  }
                </div>
                {(pane.selected.length > 0 || clipboard) && (
                  <div className="selectionbar">
                    <span>
                      {pane.selected.length
                        ? `${pane.selected.length} sélectionné(s)`
                        : "Éléments copiés"}
                    </span>
                    {pane.selected.length > 0 && (
                      <>
                        <button onClick={() => collect()}>
                          <Plus size={15} />
                          Collecter
                        </button>
                        <button onClick={() => action("tag-picker")}>
                          Tags
                        </button>
                        <button onClick={() => action("batch")}>
                          Renommer
                        </button>
                        <button
                          disabled={
                            !pane.selected.some((entry) =>
                              conversionKind(entry),
                            )
                          }
                          onClick={() => action("convert")}
                        >
                          Convertir
                        </button>
                      </>
                    )}
                    {clipboard && (
                      <button onClick={() => action("paste")}>Coller</button>
                    )}
                  </div>
                )}
              </>
            )}
            {!panel && shelf && (
              <section
                className="stash"
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  const raw = e.dataTransfer.getData(
                    "application/x-nextexplorer",
                  );
                  if (raw)
                    try {
                      Promise.all(
                        JSON.parse(raw).map((path: string) =>
                          bridge.request<Entry>("FS_STAT", { path }),
                        ),
                      )
                        .then(collect)
                        .catch((err) => notify(err.message, true));
                    } catch {}
                }}
              >
                <div
                  className={
                    "stash-heading" + (stashActionsOpen ? " expanded" : "")
                  }
                >
                  <strong>
                    <Layers size={15} />
                    Collecte <span>{stash.length}</span>
                  </strong>
                  <div
                    className="stash-actions"
                    role="group"
                    aria-label="Actions de la collecte"
                  >
                    {pendingCapture && (
                      <button
                        className="stash-main"
                        onClick={() => {
                          setCaptureError("");
                          setCaptureOpen(true);
                        }}
                      >
                        {pendingCapture.kind === "image"
                          ? "Image en attente"
                          : "Extrait en attente"}
                      </button>
                    )}
                    <button
                      className="stash-main"
                      onClick={() => setStashReview(true)}
                      title="Examiner la collecte"
                    >
                      Examiner
                    </button>
                    {localStash.length > 0 && (
                      <>
                        <button
                          onClick={() =>
                            showDialog("transfer", {
                              paths: localStash.map((e) => e.path),
                              value: { mode: "move" },
                            })
                          }
                        >
                          Déplacer ici
                        </button>
                        <button
                          onClick={() =>
                            showDialog("zip", {
                              paths: localStash.map((e) => e.path),
                            })
                          }
                        >
                          ZIP
                        </button>
                        <button
                          disabled={
                            !localStash.some((entry) => conversionKind(entry))
                          }
                          onClick={() =>
                            showDialog("convert", {
                              paths: localStash.map((e) => e.path),
                            })
                          }
                        >
                          Convertir
                        </button>
                        <button
                          title="Insérer dans le formulaire de la page web"
                          onClick={() =>
                            sendFiles(localStash.map((e) => e.path))
                              .then(() =>
                                notify("Fichiers insérés dans le formulaire"),
                              )
                              .catch((e) => notify(e.message, true))
                          }
                        >
                          <ExternalLink size={14} />
                        </button>
                        <button
                          title="Vider la collecte"
                          onClick={() => removeCollected()}
                        >
                          <Trash2 size={14} />
                        </button>
                      </>
                    )}
                    <button
                      title="Replier la collecte"
                      onClick={() => setShelf(false)}
                    >
                      <ChevronDown size={15} />
                    </button>
                  </div>
                  <button
                    className="stash-more"
                    title="Plus d’actions de collecte"
                    aria-expanded={stashActionsOpen}
                    onClick={() => setStashActionsOpen(!stashActionsOpen)}
                  >
                    <MoreHorizontal size={18} />
                  </button>
                </div>
                <div className="stash-items">
                  {stash.length ? (
                    stash.map((entry) => (
                      <div className="stash-item" key={entry.path}>
                        <button
                          title={entry.path}
                          onDoubleClick={() =>
                            entry.type === "web"
                              ? setStashReview(true)
                              : openEntry(entry)
                          }
                        >
                          {entry.type === "web" ? (
                            <Link size={18} />
                          ) : (
                            <FileIcon entry={entry} />
                          )}
                          <span>{entry.name}</span>
                        </button>
                        <button
                          aria-label={`Retirer ${entry.name} de la collecte`}
                          onClick={() => removeCollected(entry.path)}
                        >
                          <X size={14} />
                        </button>
                      </div>
                    ))
                  ) : (
                    <span className="stash-placeholder">
                      Déposez ici des fichiers de plusieurs dossiers pour les
                      traiter ensemble.
                    </span>
                  )}
                </div>
              </section>
            )}
          </main>
          {jobsOpen && (
            <>
              <div
                className="jobs-divider"
                role="separator"
                tabIndex={0}
                aria-label="Ajuster la largeur de l’activité"
                aria-orientation="vertical"
                aria-valuemin={240}
                aria-valuemax={jobsLimit}
                aria-valuenow={visibleJobsWidth}
                aria-valuetext={`${visibleJobsWidth} pixels`}
                title="Glisser pour ajuster · double-clic pour réinitialiser"
                onPointerDown={(event) => {
                  if (event.button !== 0) return;
                  event.currentTarget.setPointerCapture(event.pointerId);
                  event.preventDefault();
                  dragJobs(event.clientX);
                }}
                onPointerMove={(event) => {
                  if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                    event.preventDefault();
                    dragJobs(event.clientX);
                  }
                }}
                onPointerUp={(event) => {
                  if (event.currentTarget.hasPointerCapture(event.pointerId))
                    event.currentTarget.releasePointerCapture(event.pointerId);
                }}
                onDoubleClick={() => resizeJobs(280)}
                onKeyDown={(event) => {
                  const next =
                    event.key === "ArrowLeft"
                      ? visibleJobsWidth + 20
                      : event.key === "ArrowRight"
                        ? visibleJobsWidth - 20
                        : event.key === "Home"
                          ? 240
                          : event.key === "End"
                            ? jobsLimit
                            : null;
                  if (next !== null) {
                    event.preventDefault();
                    resizeJobs(next);
                  }
                }}
              />
              <aside ref={jobsPane} className="jobs" aria-label="Activité">
                <header>
                  <strong>Activité</strong>
                  <button
                    title="Fermer l’activité"
                    onClick={() => setJobsOpen(false)}
                  >
                    <X size={17} />
                  </button>
                </header>
                <p className="muted">
                  {hello?.features?.durableJobs
                    ? "Les tâches locales continuent après fermeture du panneau ou de Chrome. Après arrêt du PC, les tâches interrompues attendent une reprise explicite et vérifiée. Une pause peut attendre la fin du fichier en cours et bloque la file."
                    : "Journal local : 20 transferts récents."}{" "}
                  Arrêter ne défait pas les opérations déjà réalisées.
                </p>
                {!jobs.length ? (
                  <div className="empty">
                    <Check size={26} />
                    <p>Aucune tâche en cours</p>
                  </div>
                ) : (
                  jobs.map((j) => (
                    <article className="job" key={j.id}>
                      <div>
                        <strong className="job-type">
                          <span className="job-type-icon" aria-hidden="true">
                            {jobIcons[j.kind] || <History size={18} />}
                          </span>
                          <span>
                            {{
                              transfer: "Transfert",
                              convert: "Conversion",
                              recipe: "Conversion puis archive",
                              zip: "Création d’archive",
                              extract: "Extraction d’archive",
                              scan: "Analyse du disque",
                              quick: "Action rapide",
                              duplicates: "Recherche de doublons",
                              metadata: "Métadonnées",
                              download: "Téléchargement",
                            }[j.kind] || j.kind}
                          </span>
                        </strong>
                        <span className={"job-state " + j.state}>
                          {
                            {
                              queued: "En attente",
                              running: "En cours",
                              paused: "En pause",
                              completed: "Terminé",
                              cancelled: "Annulé",
                              error: "Erreur",
                              unknown: "Issue inconnue",
                              interrupted: "Interrompu · examen requis",
                              checking: "Vérification de la reprise",
                              cancelling: "Arrêt en cours",
                            }[j.state]
                          }
                        </span>
                      </div>
                      <progress
                        max={j.total || Math.max(j.done, 1)}
                        value={j.done}
                      />
                      <div className="job-info">
                        <span>
                          {["transfer", "download", "extract"].includes(j.kind)
                            ? `${size(j.done)} / ${size(j.total)}`
                            : `${j.done} traité(s)`}
                        </span>
                        {j.kind === "transfer" && (
                          <span>
                            {size(Math.round(j.speed))}/s · {Math.ceil(j.eta)} s
                          </span>
                        )}
                      </div>
                      {j.error && <p className="error">{j.error}</p>}
                      {j.startedAt && (
                        <p className="muted">
                          {new Date(j.startedAt).toLocaleString()}{" "}
                          {j.archived ? "· Journal enregistré" : ""}
                        </p>
                      )}
                      {j.journalError && (
                        <p className="error">{j.journalError}</p>
                      )}
                      {j.state === "unknown" && (
                        <p>
                          Résultat final non enregistré. Vérifiez les fichiers
                          avant toute nouvelle tentative.
                        </p>
                      )}
                      {j.audit &&
                        (j.kind === "transfer" ||
                          (j.kind === "extract" &&
                            j.audit.copied + j.audit.skipped > 0)) && (
                          <details>
                            <summary>
                              {j.audit.copied} copié(s), {j.audit.moved}{" "}
                              déplacé(s), {j.audit.skipped} ignoré(s)
                            </summary>
                            <p>
                              {j.audit.sourceRetained} copie(s) avec source non
                              supprimée. Un dossier ignoré compte comme un
                              élément.
                            </p>
                            {(j.audit.entries || []).map((entry, i) => (
                              <p key={i} style={{ overflowWrap: "anywhere" }}>
                                <strong>
                                  {{
                                    copied: "Copié",
                                    moved: "Déplacé",
                                    skipped: "Ignoré",
                                    "source-retained":
                                      "Copié, source conservée",
                                  }[entry.status] || entry.status}
                                </strong>
                                <br />
                                {entry.source}
                                <br />→ {entry.destination}
                              </p>
                            ))}
                            <p className="muted">
                              10 détails maximum ; chemins longs abrégés.{" "}
                              {j.audit.omitted} détail(s) supplémentaire(s) non
                              conservé(s). Les dossiers créés et les fichiers
                              non atteints ne sont pas détaillés.
                            </p>
                          </details>
                        )}
                      <div className="job-actions">
                        {hello?.features?.transferUndo &&
                          j.kind === "transfer" &&
                          !["queued", "running", "paused"].includes(
                            j.state,
                          ) && (
                            <button
                              disabled={undoBusy}
                              onClick={async () => {
                                setUndoBusy(true);
                                setUndoError("");
                                try {
                                  const report =
                                    await bridge.request<UndoReport>(
                                      "TRANSFER_UNDO_CHECK",
                                      { jobId: j.id },
                                    );
                                  setUndoReview({ jobId: j.id, report });
                                } catch (e) {
                                  notify((e as Error).message, true);
                                } finally {
                                  setUndoBusy(false);
                                }
                              }}
                            >
                              Vérifier l’annulation
                            </button>
                          )}
                        {!j.archived &&
                          ["running", "paused"].includes(j.state) &&
                          (j.kind === "transfer" || j.durable) && (
                            <button
                              title={
                                j.state === "paused" ? "Reprendre" : "Pause"
                              }
                              onClick={() =>
                                bridge
                                  .control(
                                    j,
                                    j.state === "paused" ? "resume" : "pause",
                                  )
                                  .catch((e) => notify(e.message, true))
                              }
                            >
                              {j.state === "paused" ? (
                                <Play size={14} />
                              ) : (
                                <Pause size={14} />
                              )}
                            </button>
                          )}
                        {!j.archived &&
                          [
                            "queued",
                            "running",
                            "paused",
                            "interrupted",
                          ].includes(j.state) && (
                            <button
                              onClick={() =>
                                bridge
                                  .control(j, "cancel")
                                  .catch((e) => notify(e.message, true))
                              }
                            >
                              Arrêter
                            </button>
                          )}
                        {!j.archived && j.state === "completed" && (
                          <button
                            onClick={() =>
                              bridge
                                .request("JOB_RESULT", { jobId: j.id })
                                .then((result) => {
                                  if (j.kind === "scan") {
                                    setAnalysis({
                                      path:
                                        result.path ||
                                        scanJobs.current.get(j.id) ||
                                        pane.path,
                                      jobId: j.id,
                                      result,
                                    });
                                    setDetailsOpen(true);
                                    setJobsOpen(false);
                                  } else
                                    showDialog("result", {
                                      value: { ...j, result },
                                    });
                                })
                                .catch((e) => notify(e.message, true))
                            }
                          >
                            Voir le résultat
                          </button>
                        )}
                        {j.state === "interrupted" && j.recoverable && (
                          <form
                            onSubmit={async (event) => {
                              event.preventDefault();
                              const data = new FormData(event.currentTarget);
                              try {
                                await bridge.request("JOB_CONTROL", {
                                  jobId: j.id,
                                  command: "recover",
                                  password: String(data.get("password") || ""),
                                });
                                setJobs(await bridge.request<Job[]>("JOBS"));
                              } catch (e) {
                                notify((e as Error).message, true);
                              }
                            }}
                          >
                            {j.needsPassword && (
                              <label className="field">
                                Mot de passe de l’archive
                                <input
                                  name="password"
                                  type="password"
                                  autoComplete="off"
                                  required
                                  maxLength={256}
                                />
                              </label>
                            )}
                            <button type="submit">Vérifier et reprendre</button>
                          </form>
                        )}
                      </div>
                    </article>
                  ))
                )}
              </aside>
            </>
          )}
        </div>
        <footer className="statusbar">
          <span>
            {panel ? (
              <span className={"status-dot " + (hello ? "online" : "")} />
            ) : (
              <Monitor size={12} />
            )}
            {panel
              ? hello
                ? "Fichiers connectés"
                : connecting
                  ? "Connexion…"
                  : "Hors ligne"
              : hello
                ? `${hello.platform} · v${hello.version}`
                : "NextExplorer 1.0"}
          </span>
          {!panel && (
            <button onClick={() => setShelf(!shelf)}>
              <Layers size={12} />
              Collecte {stash.length}
            </button>
          )}
          <span className="statusbar-spacer" />
          {!panel && (
            <span className="keyboard-hint">
              Espace · Aperçu <span>Ctrl K · Commandes</span>
            </span>
          )}
          <button onClick={() => setJobsOpen(!jobsOpen)}>
            {running.length ? (
              <LoaderCircle size={12} className="spin" />
            ) : (
              <Check size={12} />
            )}{" "}
            {running.length ? `${running.length} tâche(s)` : "Prêt"}
          </button>
        </footer>
        {toast && (
          <div
            className={"toast " + (toast.error ? "error" : "")}
            role="status"
          >
            {toast.error ? <X size={16} /> : <Check size={16} />}
            <span>{toast.text}</span>
            <button title="Fermer le message" onClick={() => setToast(null)}>
              <X size={14} />
            </button>
          </div>
        )}
        {firstFolderPicker && hello && (
          <FolderPicker
            hello={hello}
            path={pane.path || hello.home}
            favorites={favorites}
            showHidden={hidden}
            onChoose={chooseFirstFolder}
            onClose={() => setFirstFolderPicker(false)}
          />
        )}
        {preview && (
          <Preview
            entry={preview}
            actions={
              <>
                <QuickActions
                  entries={[preview]}
                  hello={hello}
                  onAction={(action) => {
                    setPreview(null);
                    showDialog("quick", {
                      value: { action, entries: [preview] },
                    });
                  }}
                  onConvert={() => {
                    setPreview(null);
                    showDialog("convert", { paths: [preview.path] });
                  }}
                />
                <div className="organization-actions preview-organization">
                  <button
                    onClick={() => {
                      setPreview(null);
                      showDialog("tag-picker", {
                        value: { entries: [preview] },
                      });
                    }}
                  >
                    Tags…
                  </button>
                  {preview.type === "directory" && (
                    <button
                      onClick={() => {
                        setPreview(null);
                        showDialog("appearance", {
                          value: { entries: [preview] },
                        });
                      }}
                    >
                      Personnaliser…
                    </button>
                  )}
                </div>
              </>
            }
            onClose={() => setPreview(null)}
            onError={(s) => notify(s, true)}
            onConvert={
              hello?.tools.magick
                ? () => {
                    const path = preview.path;
                    setPreview(null);
                    showDialog("convert", {
                      paths: [path],
                      value: { format: "png" },
                    });
                  }
                : undefined
            }
          />
        )}
        {pendingCapture && captureOpen && (
          <Modal
            title={
              pendingCapture.kind === "image"
                ? "Enregistrer l’image"
                : "Enregistrer la sélection"
            }
            onClose={() => {
              if (!captureBusy) setCaptureOpen(false);
            }}
          >
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void finishCapture(
                  String(
                    new FormData(e.currentTarget).get("destination") || "",
                  ),
                );
              }}
            >
              <div className="modal-content">
                <p>
                  La capture attend votre confirmation. Fermer cette fenêtre
                  conserve le brouillon.
                </p>
                <p>
                  <strong>{pendingCapture.title || "Page web"}</strong>
                  <br />
                  Source : {pendingCapture.sourceUrl}
                  <br />
                  Date :{" "}
                  {new Date(pendingCapture.collectedAt).toLocaleString("fr-FR")}
                </p>
                {pendingCapture.kind === "image" ? (
                  <>
                    <p>Image : {pendingCapture.imageUrl.split(/[?#]/)[0]}</p>
                    <p className="muted">
                      Le téléchargement commence après confirmation et
                      autorisation d’accès au site de l’image. Limite : 16 Mo.
                      Un fichier .source.json conservera sa provenance, sans
                      paramètres ni fragment d’URL.
                    </p>
                  </>
                ) : (
                  <pre
                    className="output"
                    style={{ maxHeight: 180, whiteSpace: "pre-wrap" }}
                  >
                    {pendingCapture.text}
                  </pre>
                )}
                <Field label="Dossier de destination">
                  <input name="destination" required defaultValue={pane.path} />
                </Field>
                {captureError && (
                  <p className="error" role="alert">
                    {captureError}
                  </p>
                )}
              </div>
              <footer>
                <button
                  type="button"
                  disabled={captureBusy}
                  onClick={() => void finishCapture()}
                >
                  Écarter la capture
                </button>
                <button
                  type="button"
                  disabled={captureBusy}
                  onClick={() => setCaptureOpen(false)}
                >
                  Plus tard
                </button>
                <button
                  className="primary"
                  type="submit"
                  disabled={captureBusy || !hello}
                >
                  {captureBusy
                    ? "Enregistrement…"
                    : pendingCapture.kind === "image"
                      ? "Enregistrer l’image"
                      : "Enregistrer l’extrait"}
                </button>
              </footer>
            </form>
          </Modal>
        )}
        {stashReview && (
          <Modal
            title="Examiner la collecte"
            onClose={() => setStashReview(false)}
          >
            <div className="modal-content">
              <p>
                {localStash.length} fichier(s) ou dossier(s),{" "}
                {stash.length - localStash.length} lien(s) web. La collecte
                garde des références : les originaux ne sont ni copiés ni
                déplacés. Retirer un élément ne supprime pas son fichier.
              </p>
              <CollectionCheck entries={stash} connected={!!hello} />
              <form
                className="collection-link-form"
                onSubmit={async (e) => {
                  e.preventDefault();
                  const form = e.currentTarget;
                  const name = String(
                    new FormData(form).get("collectionName") || "",
                  );
                  try {
                    const entries = await navigator.locks.request(
                      "nextexplorer:stash",
                      () => storageGet<CollectionEntry[]>("stash", []),
                    );
                    const lists = await storageUpdate<SavedCollection[]>(
                      "savedCollections",
                      [],
                      (current) => saveCollection(current, name, entries),
                    );
                    setSavedCollections(lists);
                    form.reset();
                    notify("Liste enregistrée");
                  } catch (err) {
                    notify((err as Error).message, true);
                  }
                }}
              >
                <Field label="Nom de la liste">
                  <input name="collectionName" required maxLength={80} />
                </Field>
                <button type="submit" disabled={!stash.length}>
                  Enregistrer cette liste
                </button>
              </form>
              {savedCollections.length > 0 && (
                <section aria-label="Listes enregistrées">
                  <p className="muted">
                    Ajouter une liste conserve les éléments du panier actuel.
                    Supprimer une liste ne touche ni au panier ni aux fichiers.
                  </p>
                  <ul className="collection-review">
                    {savedCollections.map((list) => (
                      <li key={list.id}>
                        <div>
                          <strong>{list.name}</strong>
                          <small>{list.entries.length} élément(s)</small>
                        </div>
                        <button
                          aria-label={`Ajouter la liste ${list.name} au panier`}
                          onClick={() => collect(list.entries)}
                        >
                          Ajouter
                        </button>
                        <button
                          aria-label={`Supprimer la liste ${list.name}`}
                          onClick={async () => {
                            try {
                              setSavedCollections(
                                await storageUpdate<SavedCollection[]>(
                                  "savedCollections",
                                  [],
                                  (current) =>
                                    current.filter(
                                      (item) => item.id !== list.id,
                                    ),
                                ),
                              );
                            } catch (err) {
                              notify((err as Error).message, true);
                            }
                          }}
                        >
                          <Trash2 size={16} />
                        </button>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
              <form
                className="collection-link-form"
                onSubmit={async (e) => {
                  e.preventDefault();
                  const form = e.currentTarget;
                  const data = new FormData(form);
                  try {
                    if (
                      await collect([
                        collectedLink(
                          String(data.get("url") || ""),
                          String(data.get("title") || ""),
                        ),
                      ])
                    )
                      form.reset();
                  } catch (err) {
                    notify((err as Error).message, true);
                  }
                }}
              >
                <Field label="Adresse du lien">
                  <input
                    name="url"
                    type="url"
                    required
                    maxLength={8192}
                    placeholder="https://…"
                  />
                </Field>
                <Field label="Titre (facultatif)">
                  <input name="title" maxLength={200} />
                </Field>
                <button type="submit">Ajouter un lien</button>
              </form>
              {stash.length === 0 ? (
                <p className="muted">
                  Sélectionnez des fichiers dans un dossier, puis utilisez
                  Collecter.
                </p>
              ) : (
                <ul className="collection-review collection-entries">
                  {stash.map((entry) => (
                    <li key={entry.path}>
                      {entry.type === "web" ? (
                        <Link size={18} />
                      ) : (
                        <FileIcon entry={entry} />
                      )}
                      <div>
                        <strong>{entry.name}</strong>
                        <span>
                          {entry.type === "web" ? (
                            <a
                              href={safeURL(entry.path) || undefined}
                              target="_blank"
                              rel="noreferrer"
                            >
                              {entry.path}
                            </a>
                          ) : (
                            entry.path
                          )}
                        </span>
                        <small>
                          {entry.type === "web"
                            ? `Lien · ajouté le ${new Date(entry.collectedAt).toLocaleDateString("fr-FR")}`
                            : entry.type === "directory"
                              ? "Dossier"
                              : size(entry.size)}
                        </small>
                        {entry.type === "web" && entry.sourceUrl && (
                          <small>Origine : {entry.sourceUrl}</small>
                        )}
                        {entry.type === "web" && (
                          <button
                            disabled={!hello || !pane.path}
                            onClick={() => {
                              setStashReview(false);
                              showDialog("collected-link", {
                                paths: [],
                                value: entry,
                              });
                            }}
                          >
                            Enregistrer le lien…
                          </button>
                        )}
                      </div>
                      <button
                        aria-label={`Retirer ${entry.name} de la collecte`}
                        onClick={() => removeCollected(entry.path)}
                      >
                        <X size={18} />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <p className="muted">
                Destination :{" "}
                {pane.path || "ouvrez un dossier pour choisir une destination"}.
                La copie ci-dessous concerne uniquement les fichiers et dossiers
                ; chaque lien s’enregistre séparément.
              </p>
              <p className="muted">
                Les références sont conservées à la réouverture. Si un fichier a
                été déplacé ou supprimé depuis sa collecte, l’opération peut
                échouer.
              </p>
              <InsertionHistory />
            </div>
            <footer>
              <button onClick={() => setStashReview(false)}>Fermer</button>
              <button
                className="primary"
                disabled={!hello || !pane.path || !localStash.length}
                onClick={() => {
                  setStashReview(false);
                  showDialog("transfer", {
                    paths: localStash.map((e) => e.path),
                    value: { mode: "copy" },
                  });
                }}
              >
                Copier vers ce dossier
              </button>
            </footer>
          </Modal>
        )}
        {undoReview && (
          <Modal
            title={
              undoReview.report.resume
                ? "Récupérer une annulation"
                : undoReview.report.mode === "move"
                  ? "Annuler un déplacement"
                  : "Annuler une copie"
            }
            onClose={() => {
              if (!undoBusy) setUndoReview(null);
            }}
          >
            <div className="modal-content">
              {undoReview.report.eligible ? (
                <>
                  {undoReview.report.resume && (
                    <p>
                      {undoReview.report.completed} étape(s) déjà terminée(s) et
                      vérifiée(s), {undoReview.report.count} restante(s). Les
                      étapes terminées ne seront pas rejouées.{" "}
                      {undoReview.report.count === 0
                        ? "Seul le journal sera complété."
                        : "La reprise nécessite votre confirmation."}
                    </p>
                  )}
                  {!!undoReview.report.reconciled && (
                    <p>
                      {undoReview.report.reconciled} résultat(s) manquant(s) :
                      les fichiers et leurs emplacements confirment que ces
                      actions sont terminées. Votre confirmation ajoutera cette
                      vérification au journal sans modifier les fichiers.
                    </p>
                  )}
                  {undoReview.report.count > 0 && (
                    <>
                      {undoReview.report.mode === "move" ? (
                        <>
                          <p>
                            {undoReview.report.count} élément(s) seront remis à
                            leur emplacement d’origine. Aucun fichier existant
                            ne sera remplacé.
                          </p>
                          <p>
                            Le contenu a été vérifié et les emplacements
                            d’origine sont libres. Une nouvelle vérification
                            précédera l’annulation.
                          </p>
                          <p>
                            Entre volumes, les données seront recopiées et
                            vérifiées avant la mise en corbeille de la version
                            déplacée. Prévoyez l’espace nécessaire pour la copie
                            de retour.
                          </p>
                          {!!undoReview.report.directories && (
                            <p>
                              {undoReview.report.directories} dossier(s)
                              source(s) supprimé(s) lors de la fusion seront
                              recréés. Les dossiers et fichiers préexistants de
                              la destination seront conservés. Les autorisations
                              des dossiers recréés seront héritées de leur
                              parent.
                            </p>
                          )}
                        </>
                      ) : (
                        <>
                          <p>
                            {undoReview.report.count} élément(s) copié(s),
                            fichiers ou dossiers, seront placés dans la
                            corbeille. Les originaux seront conservés.
                          </p>
                          <p>
                            Le contenu des originaux et des copies a été
                            vérifié. Les dossiers créés par la copie seront
                            retirés entiers ; les dossiers déjà présents avant
                            une fusion seront conservés. Une nouvelle
                            vérification précédera l’annulation.
                          </p>
                        </>
                      )}
                      {!!undoReview.report.replacements && (
                        <p>
                          {undoReview.report.replacements} ancien(s) fichier(s)
                          remplacé(s) seront ensuite restaurés depuis la
                          corbeille. Les nouvelles versions seront conservées.
                        </p>
                      )}
                      <ul>
                        {undoReview.report.paths.map((p, i) => (
                          <li key={p} style={{ overflowWrap: "anywhere" }}>
                            {p}
                            {undoReview.report.targets?.[i] && (
                              <>
                                <br />→ {undoReview.report.targets[i]}
                              </>
                            )}
                          </li>
                        ))}
                      </ul>
                      {undoReview.report.count > 10 && (
                        <p>Les dix premiers chemins sont affichés.</p>
                      )}
                    </>
                  )}
                </>
              ) : (
                <p>{undoReview.report.reason}</p>
              )}
              {undoError && <p className="error">{undoError}</p>}
            </div>
            <footer>
              <button disabled={undoBusy} onClick={() => setUndoReview(null)}>
                Retour à l’activité
              </button>
              {undoReview.report.eligible && (
                <button
                  className="primary"
                  disabled={undoBusy}
                  onClick={async () => {
                    setUndoBusy(true);
                    setUndoError("");
                    try {
                      const result = await bridge.request<{
                        count: number;
                        replacements?: number;
                      }>(
                        undoReview.report.resume
                          ? "TRANSFER_UNDO_RESUME"
                          : "TRANSFER_UNDO",
                        { jobId: undoReview.jobId },
                        30 * 60 * 1000,
                      );
                      notify(
                        undoReview.report.resume
                          ? "Annulation récupérée : étapes restantes terminées."
                          : (undoReview.report.mode === "move"
                              ? `Déplacement annulé : ${result.count} élément(s) remis à leur emplacement d’origine`
                              : `Copie annulée : ${result.count} élément(s) placé(s) dans la corbeille`) +
                              (result.replacements
                                ? ` ; ${result.replacements} ancien(s) fichier(s) restauré(s)`
                                : ""),
                      );
                      setUndoReview(null);
                      refresh();
                    } catch (e) {
                      setUndoError((e as Error).message);
                      setUndoReview((current) =>
                        current
                          ? {
                              ...current,
                              report: {
                                ...current.report,
                                eligible: false,
                                reason:
                                  "L’annulation n’a pas abouti. Vérifiez à nouveau son état depuis l’activité.",
                              },
                            }
                          : null,
                      );
                      refresh();
                    } finally {
                      setUndoBusy(false);
                    }
                  }}
                >
                  {undoBusy
                    ? "Annulation…"
                    : undoReview.report.resume
                      ? undoReview.report.count
                        ? "Reprendre l’annulation"
                        : "Terminer l’annulation"
                      : undoReview.report.mode === "move"
                        ? "Annuler ce déplacement"
                        : "Annuler cette copie"}
                </button>
              )}
            </footer>
          </Modal>
        )}
        {palette && (
          <Modal title="Aller à…" onClose={() => setPalette(false)}>
            <div className="palette-search">
              <Search size={19} />
              <input
                autoFocus
                placeholder="Action, chemin ou alias (~dl, ~desk)…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    const cmd = commands.filter(([, l]) =>
                      fuzzy(query.replace(/^>\s*/, ""), l),
                    )[0];
                    setPalette(false);
                    if (
                      query.startsWith("~") ||
                      /^(?:[a-z]:[\\/]|\/)/i.test(query)
                    )
                      navigate(query);
                    else if (cmd) action(cmd[0]);
                  }
                }}
              />
              <kbd>Échap</kbd>
            </div>
            <div className="command-list">
              {Object.entries(hello?.aliases || {})
                .filter(([a, p]) => query.startsWith("~") && fuzzy(query, a))
                .map(([a, p]) => (
                  <button
                    key={a}
                    onClick={() => {
                      navigate(p);
                      setPalette(false);
                    }}
                  >
                    <Folder size={16} />
                    <span>{p}</span>
                    <kbd>{a}</kbd>
                  </button>
                ))}
              {commands
                .filter(([, l]) => fuzzy(query.replace(/^>\s*/, ""), l))
                .map(([a, l]) => (
                  <button
                    key={a}
                    disabled={!hello && a !== "settings"}
                    onClick={() => {
                      setPalette(false);
                      action(a);
                    }}
                  >
                    <Command size={15} />
                    <span>{l}</span>
                    <ArrowRight size={14} />
                  </button>
                ))}
            </div>
          </Modal>
        )}
        {dialog && (
          <Modal
            title={
              (
                {
                  mkdir: "Nouveau dossier",
                  note: "Nouvelle note",
                  rename: "Renommer",
                  transfer: "Transférer les fichiers",
                  trash: "Mettre à la corbeille",
                  zip: "Créer une archive",
                  extract: "Extraire une archive",
                  batch: "Renommer par lot",
                  convert: "Convertir les fichiers",
                  hash: "Calculer une empreinte",
                  pin: "Épingler un lien au dossier",
                  web: "Capturer depuis le web",
                  "collected-link": "Enregistrer le lien",
                  "page-pdf": "Enregistrer la page en PDF",
                  downloads: dialog.value?.ruleDraft
                    ? "Créer une règle de rangement"
                    : "Ranger les téléchargements",
                  spaces: "Espaces hybrides",
                  groups: "Regrouper les fichiers",
                  prepare: "Préparer des images pour le web",
                  metadata: "Modifier les métadonnées",
                  session: "Restaurer la session",
                  settings: "Réglages et moteurs",
                  search: "Rechercher dans mes fichiers et espaces",
                  tags: "Tags des fichiers",
                  "tag-picker": "Modifier les tags",
                  tagged: "Fichiers et dossiers tagués",
                  appearance: "Personnaliser les dossiers",
                  quick: dialog.value?.action
                    ? {
                        rotate: "Faire pivoter",
                        annotate: "Annoter",
                        trim: "Raccourcir",
                        "pdf-create": "Créer un PDF",
                      }[dialog.value.action as QuickAction]
                    : "Actions rapides",
                  home: "Accueil",
                  trashList: "Corbeille NextExplorer",
                  output: dialog.value?.title,
                  result: "Résultat de la tâche",
                } as Record<string, string>
              )[dialog.kind] || dialog.kind
            }
            onClose={() => {
              if (!busy) setDialog(null);
            }}
            wide={[
              "convert",
              "batch",
              "result",
              "search",
              "settings",
              "quick",
            ].includes(dialog.kind)}
          >
            {dialog.kind === "quick" ? (
              <div className="modal-content">
                {dialog.value?.action ? (
                  <Suspense
                    fallback={<p role="status">Ouverture de l’outil…</p>}
                  >
                    <QuickActionDialog
                      action={dialog.value.action}
                      entries={dialog.value.entries}
                      destination={pane.path}
                      hello={hello}
                      favorites={favorites}
                      onClose={() => setDialog(null)}
                      onComplete={() => {
                        refresh();
                        notify("Copie enregistrée");
                      }}
                      onJob={() => {
                        setJobsOpen(true);
                        notify("Action ajoutée à l’activité");
                      }}
                      onBusy={setBusy}
                    />
                  </Suspense>
                ) : (
                  <>
                    <QuickActions
                      entries={dialog.value?.entries || []}
                      hello={hello}
                      onAction={openQuickAction}
                      onConvert={() => action("convert")}
                    />
                    {!quickActions(dialog.value?.entries || [], hello)
                      .length && (
                      <p>
                        Aucune action rapide pour cette sélection. Choisissez
                        des images, des PDF ou un média.
                      </p>
                    )}
                  </>
                )}
              </div>
            ) : dialog.kind === "convert" ? (
              <ConversionDialog
                paths={dialog.paths || []}
                destination={dialog.destination || pane.path}
                initialFormat={dialog.value?.format}
                hello={hello}
                favorites={favorites}
                onClose={() => setDialog(null)}
                onStart={async (payload) => {
                  setBusy(true);
                  try {
                    await run(payload.archive ? "RECIPE" : "CONVERT", payload);
                    setDialog(null);
                  } finally {
                    setBusy(false);
                  }
                }}
              />
            ) : dialog.kind === "search" ? (
              <div className="modal-content">
                <SearchDialog
                  path={pane.path}
                  hello={hello}
                  spaces={spaces}
                  collection={stash}
                  initialTag={dialog.value?.tag}
                  onOpen={(entry) => {
                    setDialog(null);
                    void openEntry(entry);
                  }}
                  onSpace={(id) =>
                    showDialog("spaces", { value: { focusSpaceId: id } })
                  }
                />
              </div>
            ) : dialog.kind === "tag-picker" ? (
              <div className="modal-content">
                <TagPicker
                  selection={dialog.value?.entries || []}
                  onManage={() =>
                    showDialog("tags", {
                      value: { entries: dialog.value?.entries || [] },
                    })
                  }
                />
              </div>
            ) : dialog.kind === "tags" ? (
              <div className="modal-content">
                <TagsDialog
                  selection={dialog.value?.entries || pane.selected}
                  onSearch={(tag) => showDialog("tagged", { value: { tag } })}
                />
              </div>
            ) : dialog.kind === "tagged" ? (
              <div className="modal-content">
                <TaggedFilesDialog
                  id={dialog.value.tag}
                  onOpen={(entry) => {
                    setDialog(null);
                    void openEntry(entry);
                  }}
                />
              </div>
            ) : dialog.kind === "appearance" ? (
              <div className="modal-content">
                <FolderAppearanceDialog
                  entries={dialog.value?.entries || []}
                  onClose={() => setDialog(null)}
                />
              </div>
            ) : dialog.kind === "home" ? (
              <div className="modal-content">
                <HomeDialog
                  hello={hello}
                  favorites={favorites}
                  recent={recentFolders}
                  onRefreshVolumes={loadVolumes}
                  onTag={(tag) => showDialog("tagged", { value: { tag } })}
                  onNavigate={async (path) => {
                    try {
                      const entry = await bridge.request<Entry>(
                        "FS_STAT",
                        { path },
                        5000,
                      );
                      if (entry.type !== "directory")
                        throw new Error("Dossier indisponible");
                      navigate(entry.path);
                      setDialog(null);
                    } catch (error) {
                      notify((error as Error).message, true);
                    }
                  }}
                />
              </div>
            ) : dialog.kind === "groups" ? (
              <div className="modal-content">
                <FileGroupsDialog
                  selection={pane.selected}
                  path={pane.path}
                  connected={!!hello}
                  checkedHash={!!hello?.features?.checkedHash}
                  imageSamples={
                    !!hello?.features?.imageSamples && !!hello.tools.magick
                  }
                  showHidden={hidden}
                  space={followedSpace || null}
                  onRules={(ruleDraft) =>
                    showDialog("downloads", { value: { ruleDraft } })
                  }
                  onTransfer={(entries, destination, origins) =>
                    showDialog("transfer", {
                      paths: entries.map((entry) => entry.path),
                      destination,
                      value: {
                        mode: "copy",
                        groupEntries: entries,
                        groupOrigins: origins,
                      },
                    })
                  }
                  onLocate={(path) => {
                    const parent = path.replace(/[\\/][^\\/]+$/, "");
                    navigate(
                      /^[a-z]:$/i.test(parent) ? parent + "\\" : parent || "/",
                    );
                    setDialog(null);
                  }}
                />
              </div>
            ) : dialog.kind === "prepare" ? (
              <div className="modal-content">
                <PrepareImagesDialog
                  entries={
                    dialog.value?.entries ||
                    (pane.selected.length ? pane.selected : localStash)
                  }
                  hello={hello}
                  path={pane.path}
                  favorites={favorites}
                  page={dialog.value?.page}
                  target={dialog.value?.target}
                  onCollect={collect}
                />
              </div>
            ) : dialog.kind === "spaces" ? (
              <div className="modal-content">
                <SpacesDialog
                  connected={!!hello}
                  followedId={followedSpaceId}
                  focusId={dialog.value?.focusSpaceId}
                  onFollow={followSpace}
                  snapshot={{
                    tabs: tabs.map((tab) => ({
                      paths: tab.panes.map((pane) => pane.path),
                      modes: tab.panes.map((pane) => pane.viewMode),
                      active: tab.active,
                      dual: tab.dual,
                      split: tab.split,
                    })),
                    current,
                    entries: stash,
                    links,
                  }}
                  onRestore={async (space) => {
                    const nextStash = await storageUpdate<CollectionEntry[]>(
                      "stash",
                      [],
                      (current) => mergeCollection(current, space.entries),
                    );
                    const nextLinks = await storageUpdate<
                      Record<string, Quicklink[]>
                    >("quicklinks", {}, (current) => {
                      const result = { ...current };
                      for (const [path, links] of Object.entries(space.links))
                        result[path] = [
                          ...new Map(
                            [...(current[path] || []), ...links].map((link) => [
                              link.url,
                              link,
                            ]),
                          ).values(),
                        ];
                      return result;
                    });
                    setStash(nextStash);
                    setLinks(nextLinks);
                    setWorkspace((old) => ({
                      current: old.tabs.length + space.current,
                      tabs: [
                        ...old.tabs,
                        ...space.tabs.map((tab) => ({
                          active: tab.active,
                          dual: tab.dual,
                          split: tab.split,
                          panes: tab.paths.map((path, i) => ({
                            ...fresh(tab.modes[i]),
                            path,
                          })),
                        })),
                      ],
                    }));
                  }}
                />
              </div>
            ) : dialog.kind === "downloads" ? (
              <div className="modal-content">
                <DownloadList
                  connected={!!hello}
                  hello={hello}
                  path={pane.path}
                  favorites={favorites}
                  jobs={jobs}
                  ruleDraft={dialog.value?.ruleDraft}
                  onChoose={(download, filing) => {
                    const suggestion = downloadSuggestion(
                      download,
                      filing.rules,
                    );
                    showDialog("transfer", {
                      paths: [download.filename],
                      destination: suggestion.ambiguous
                        ? ""
                        : suggestion.destination ||
                          filing.destinations[0] ||
                          pane.path,
                      value: { mode: "move", download, filing, suggestion },
                    });
                  }}
                />
              </div>
            ) : ["settings", "trashList", "output", "result"].includes(
                dialog.kind,
              ) ? (
              <div className="modal-content">
                {dialog.kind === "settings" ? (
                  <>
                    <PreferencesDialog />
                    <EngineStatus tools={hello?.tools} onRefresh={() => {
                        setDialog(null);
                        connect();
                      }} />
                    <button
                      onClick={() =>
                        void changeTheme(theme === "dark" ? "light" : "dark")
                      }
                    >
                      Thème {theme === "dark" ? "clair" : "sombre"}
                    </button>
                  </>
                ) : dialog.kind === "trashList" ? (
                  <>
                    {trash.length === 0 ? (
                      <p>
                        La corbeille est vide. Les fichiers supprimés par
                        NextExplorer peuvent être restaurés ici.
                      </p>
                    ) : (
                      trash.map((t) => (
                        <div className="trash-row" key={t.record}>
                          <span title={t.path}>{basename(t.path)}</span>
                          <button
                            onClick={() =>
                              bridge
                                .request("FS_RESTORE", { path: t.record })
                                .then(() => {
                                  const next = trash.filter(
                                    (v) => v.record !== t.record,
                                  );
                                  setTrash(next);
                                  storageSet("trash", next);
                                  refresh();
                                  notify("Fichier restauré");
                                })
                                .catch((e) => notify(e.message, true))
                            }
                          >
                            Restaurer
                          </button>
                        </div>
                      ))
                    )}
                  </>
                ) : dialog.kind === "output" ? (
                  <>
                    <pre className="output">{dialog.value.text}</pre>
                    {dialog.value.match !== null &&
                      dialog.value.match !== undefined && (
                        <p
                          className={dialog.value.match ? "available" : "error"}
                        >
                          {dialog.value.match
                            ? "Les empreintes correspondent"
                            : "Les empreintes diffèrent"}
                        </p>
                      )}
                    <button
                      onClick={() =>
                        navigator.clipboard
                          .writeText(dialog.value.text)
                          .then(() => notify("Copié"))
                          .catch((e) => notify(e.message, true))
                      }
                    >
                      Copier
                    </button>
                  </>
                ) : dialog.value.kind === "extract" ? (
                  <>
                    <p>
                      {dialog.value.result.merged
                        ? `${dialog.value.result.audit.copied} fichier(s) copiés, ${dialog.value.result.audit.skipped} élément(s) ignorés lors de la fusion.`
                        : dialog.value.result.skipped
                          ? "Extraction ignorée : la destination existe déjà."
                          : `${dialog.value.result.entries} entrée(s) extraites · ${size(dialog.value.result.bytes)}`}
                    </p>
                    <p style={{ overflowWrap: "anywhere" }}>
                      {dialog.value.result.destination}
                    </p>
                    {!dialog.value.result.skipped && (
                      <button
                        onClick={() => {
                          navigate(dialog.value.result.destination);
                          setDialog(null);
                        }}
                      >
                        Ouvrir le dossier extrait
                      </button>
                    )}
                  </>
                ) : dialog.value.kind === "duplicates" ? (
                  <>
                    <p>
                      Les groupes ci-dessous ont une empreinte BLAKE3 identique.
                      Conservez au moins un exemplaire.
                    </p>
                    {dialog.value.result.truncated && (
                      <p role="status">
                        Analyse partielle : limite de parcours ou de résultats
                        atteinte. Réduisez le dossier analysé.
                      </p>
                    )}
                    {dialog.value.result.groups.length === 0 && (
                      <p>Aucun doublon trouvé.</p>
                    )}
                    {dialog.value.result.groups.map((g: any) => (
                      <div className="duplicate-group" key={g.hash}>
                        <code>{g.hash.slice(0, 24)}…</code>
                        {g.paths.map((p: string, i: number) => (
                          <div key={p}>
                            <span title={p}>{p}</span>
                            {i > 0 && (
                              <button
                                onClick={() =>
                                  showDialog("trash", { paths: [p] })
                                }
                              >
                                <Trash2 size={14} />
                                Corbeille
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    ))}
                    <p className="muted">
                      {dialog.value.result.skipped} fichier(s) non lisible(s) ·
                      300 groupes maximum
                    </p>
                  </>
                ) : (
                  <pre className="output">
                    {JSON.stringify(dialog.value.result, null, 2)}
                  </pre>
                )}
              </div>
            ) : (
              <form onSubmit={submit}>
                <div className="modal-content">
                  {["mkdir", "rename", "note", "zip", "extract"].includes(
                    dialog.kind,
                  ) &&
                    !(dialog.kind === "extract" && extractMerge) && (
                      <Field label="Nom">
                        <input
                          name="name"
                          required
                          defaultValue={
                            dialog.kind === "rename"
                              ? basename(dialog.paths?.[0] || "")
                              : dialog.kind === "note"
                                ? `Note-${Date.now()}.md`
                                : dialog.kind === "extract"
                                  ? basename(
                                      dialog.paths?.[0] || "Archive.zip",
                                    ).replace(/\.(zip|7z|rar)$/i, "") +
                                    "-extrait"
                                  : dialog.kind === "zip"
                                    ? `Archive-${Date.now()}.zip`
                                    : ""
                          }
                          placeholder="Nom du dossier"
                        />
                      </Field>
                    )}
                  {dialog.kind === "note" && (
                    <Field label="Contenu">
                      <textarea name="text" rows={10} placeholder="# Ma note" />
                    </Field>
                  )}
                  {dialog.kind === "collected-link" && (
                    <p>
                      Enregistrer « {dialog.value.name} » sous forme de fichier
                      .weblink : {dialog.value.path}. Le contenu de la page ne
                      sera pas téléchargé.
                    </p>
                  )}
                  {dialog.kind === "transfer" && dialog.value?.download && (
                    <p>
                      Ranger le téléchargement terminé{" "}
                      <strong>
                        {basename(dialog.value.download.filename)}
                      </strong>
                      <br />
                      Depuis : {dialog.value.download.filename}
                      <br />
                      Le transfert sera enregistré dans l’activité. Vérifiez la
                      destination et le choix en cas de fichier existant.
                    </p>
                  )}
                  {dialog.kind === "transfer" && dialog.value?.groupEntries && (
                    <>
                      <p>
                        Destination proposée par vos règles{" "}
                        {dialog.value.groupOrigins
                          ? "d’extension et de site, avec une origine déclarée contrôlée"
                          : "d’extension"}
                        . Vérifiez les fichiers, la destination, l’opération et
                        les conflits avant de confirmer. Présence, nom, taille
                        et date seront revérifiés.
                      </p>
                      {dialog.value.groupOrigins && (
                        <p className="muted">
                          Les origines déclarées seront relues et comparées à
                          l’aperçu. Une origine modifiée ou indisponible bloque
                          le transfert ; ces métadonnées ne prouvent pas
                          l’authenticité du contenu.
                        </p>
                      )}
                      <ul className="path-list">
                        {dialog.paths?.map((path) => (
                          <li key={path}>{path}</li>
                        ))}
                      </ul>
                      <p className="muted">
                        Les métadonnées voisines (.source.json) ne sont pas
                        transférées. L’association de provenance n’est pas
                        maintenue après copie ou déplacement. Aucune règle n’est
                        créée ou activée.
                      </p>
                    </>
                  )}
                  {dialog.kind === "page-pdf" && (
                    <>
                      <p>
                        <strong>{dialog.value.page.title}</strong>
                        <br />
                        Source : {dialog.value.page.url.split(/[?#]/)[0]}
                      </p>
                      <p>
                        Enregistrer la page ouverte en PDF avec sa provenance.
                        Chrome demandera l’autorisation de capture. La page doit
                        rester active jusqu’à la fin.
                      </p>
                      <p className="muted">
                        Rendu d’impression, 32 Mo maximum. Les contenus chargés
                        au défilement peuvent manquer. Annuler ne crée aucun
                        fichier.
                      </p>
                    </>
                  )}
                  {dialog.kind === "transfer" && dialog.value?.download ? (
                    <>
                      {dialog.value.suggestion.ambiguous ? (
                        <p>
                          Plusieurs règles correspondent. Choisissez le dossier
                          de destination.
                        </p>
                      ) : (
                        dialog.value.suggestion.destination && (
                          <p>
                            Destination proposée par :{" "}
                            {dialog.value.suggestion.rules
                              .map((rule: { name: string }) => rule.name)
                              .join(", ")}
                          </p>
                        )
                      )}
                      <DownloadDestination
                        initialPath={dialog.destination || ""}
                        recent={dialog.value.filing.destinations}
                        hello={hello}
                        favorites={favorites}
                      />
                      <label className="checkbox">
                        <input
                          name="rememberDownloadDestination"
                          type="checkbox"
                          defaultChecked
                        />{" "}
                        Mémoriser cette destination
                      </label>
                    </>
                  ) : (
                    [
                      "transfer",
                      "zip",
                      "extract",
                      "collected-link",
                      "page-pdf",
                    ].includes(dialog.kind) && (
                      <Field label="Dossier de destination">
                        <input
                          name="destination"
                          required
                          defaultValue={dialog.destination}
                        />
                      </Field>
                    )
                  )}
                  {dialog.kind === "extract" && (
                    <>
                      <label className="checkbox">
                        <input
                          name="merge"
                          type="checkbox"
                          checked={extractMerge}
                          disabled={!hello?.features?.extractMerge}
                          onChange={(event) =>
                            setExtractMerge(event.target.checked)
                          }
                        />
                        Extraire directement dans le dossier de destination et
                        fusionner
                      </label>
                      <Field
                        label={
                          extractMerge
                            ? "Si un fichier existe déjà"
                            : "Si le sous-dossier existe déjà"
                        }
                      >
                        <select
                          key={String(extractMerge)}
                          name="conflict"
                          defaultValue="rename"
                        >
                          <option value="rename">
                            Conserver les deux (nom numéroté)
                          </option>
                          <option value="skip">
                            {extractMerge
                              ? "Ignorer l’élément en conflit"
                              : "Ignorer cette extraction"}
                          </option>
                          {extractMerge ? (
                            <option value="overwrite">
                              Remplacer (ancien fichier dans la corbeille
                              locale)
                            </option>
                          ) : (
                            <option value="error">
                              Arrêter avec une erreur
                            </option>
                          )}
                        </select>
                      </Field>
                      <p className="muted">
                        {extractMerge
                          ? "L’archive est vérifiée avant la fusion. Les sous-dossiers sont réunis ; un fichier ne remplace jamais un dossier. Une interruption pendant la fusion peut laisser des fichiers déjà copiés : pas de retour arrière global."
                          : "L’archive est extraite dans un nouveau sous-dossier. Aucun fichier existant remplacé."}
                      </p>
                      <p className="muted">
                        Limites : 3 000 entrées, 256 Mio par entrée, 1 Gio au
                        total. Archives multivolumes, liens et chemins dangereux
                        refusés. Pour 7z/RAR : moteur 7-Zip requis, traitement
                        limité à 5 minutes et espace temporaire pouvant
                        approcher 3 Gio.
                      </p>
                      {!hello?.features?.zipExtract && (
                        <p className="error">
                          Mettez à jour le compagnon pour activer l’extraction.
                        </p>
                      )}
                    </>
                  )}
                  {dialog.kind === "zip" && (
                    <>
                      <Field label="Format d’archive">
                        <select name="archiveFormat" defaultValue="zip">
                          <option value="zip">ZIP</option>
                          <option value="7z" disabled={!hello?.tools["7z"]}>
                            7z · moteur 7-Zip
                          </option>
                        </select>
                      </Field>
                      <label className="checkbox">
                        <input name="store" type="checkbox" />
                        Sans compression (plus rapide)
                      </label>
                      <p className="muted">
                        Le nom doit porter l’extension du format choisi.
                        Création bornée à 3 000 entrées, 256 Mio par fichier et
                        1 Gio au total. Une archive existante reste intacte.
                      </p>
                    </>
                  )}
                  {["zip", "extract"].includes(dialog.kind) && (
                    <Field label="Mot de passe de l’archive (facultatif)">
                      <input
                        type="password"
                        name="password"
                        maxLength={256}
                        autoComplete="new-password"
                        disabled={!hello?.tools["7z"]}
                      />
                      <small>
                        7-Zip requis pour les archives chiffrées. Le mot de
                        passe reste en mémoire pendant la tâche ; il sera
                        redemandé si une reprise est possible après redémarrage.
                      </small>
                    </Field>
                  )}
                  {dialog.kind === "transfer" && (
                    <>
                      <Field label="Opération">
                        <select
                          name="mode"
                          defaultValue={dialog.value?.mode || "copy"}
                        >
                          <option value="copy">Copier</option>
                          <option value="move">Déplacer</option>
                        </select>
                      </Field>
                      <label className="checkbox">
                        <input
                          type="checkbox"
                          name="merge"
                          disabled={hello?.features?.transferMerge !== true}
                        />
                        Fusionner les dossiers de même nom
                      </label>
                      {hello?.features?.transferMerge !== true && (
                        <p className="muted">
                          La fusion nécessite le compagnon à jour.
                        </p>
                      )}
                      <Field label="Si un nom existe déjà">
                        <select name="conflict" defaultValue="rename">
                          <option value="rename">
                            Conserver les deux (nom numéroté)
                          </option>
                          <option value="skip">
                            Ignorer l’élément existant
                          </option>
                          <option value="overwrite">
                            Remplacer (ancien fichier conservé dans
                            .nextexplorer-trash)
                          </option>
                        </select>
                      </Field>
                      <p className="muted">
                        Ce choix s’applique à toute la sélection. Les conflits
                        prévisibles sont vérifiés avant le transfert. Chaque
                        copie est vérifiée avec BLAKE3. La fusion rassemble les
                        contenus des dossiers ; ce choix règle les conflits
                        entre leurs fichiers. En déplacement, les éléments
                        ignorés restent à la source. Un fichier ne remplace
                        jamais un dossier.
                      </p>
                    </>
                  )}
                  {dialog.kind === "trash" && (
                    <>
                      <p>
                        Ces {dialog.paths?.length} élément(s) seront déplacés
                        dans une corbeille locale restaurable.
                      </p>
                      <ul className="path-list">
                        {dialog.paths?.map((p) => (
                          <li key={p}>{p}</li>
                        ))}
                      </ul>
                    </>
                  )}
                  {dialog.kind === "batch" && (
                    <>
                      <div className="form-grid">
                        {(
                          [
                            "pattern",
                            "replacement",
                            "prefix",
                            "suffix",
                          ] as const
                        ).map((key, i) => (
                          <Field
                            key={key}
                            label={
                              [
                                "Expression régulière",
                                "Remplacement ($1, $2…)",
                                "Préfixe / {DateTimeOriginal}, {Artist}…",
                                "Suffixe / {Model}, {Title}…",
                              ][i]
                            }
                          >
                            <input
                              value={rename[key]}
                              onChange={(e) =>
                                setRename({ ...rename, [key]: e.target.value })
                              }
                            />
                          </Field>
                        ))}
                        <Field label="Casse">
                          <select
                            value={rename.case}
                            onChange={(e) =>
                              setRename({ ...rename, case: e.target.value })
                            }
                          >
                            <option value="">Conserver</option>
                            {[
                              "lowercase",
                              "UPPERCASE",
                              "snake_case",
                              "kebab-case",
                              "camelCase",
                            ].map((v) => (
                              <option key={v}>{v}</option>
                            ))}
                          </select>
                        </Field>
                        <label className="checkbox">
                          <input
                            type="checkbox"
                            checked={rename.number}
                            onChange={(e) =>
                              setRename({ ...rename, number: e.target.checked })
                            }
                          />
                          Ajouter une numérotation
                        </label>
                        {(["start", "step", "digits"] as const).map(
                          (key, i) => (
                            <Field
                              key={key}
                              label={["Départ", "Pas", "Chiffres"][i]}
                            >
                              <input
                                type="number"
                                min={key === "start" ? 0 : 1}
                                max={key === "digits" ? 9 : undefined}
                                value={rename[key]}
                                onChange={(e) =>
                                  setRename({
                                    ...rename,
                                    [key]: Number(e.target.value),
                                  })
                                }
                              />
                            </Field>
                          ),
                        )}
                      </div>
                      <table className="dry-run">
                        <thead>
                          <tr>
                            <th>Avant</th>
                            <th>Après</th>
                            <th>Validation</th>
                          </tr>
                        </thead>
                        <tbody>
                          {dryRun?.rows.map((r) => (
                            <tr key={r.from}>
                              <td>{basename(r.from)}</td>
                              <td>{r.name}</td>
                              <td className={r.error ? "error" : "available"}>
                                {r.error || "✓"}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      <p className="muted">
                        Les collisions sont vérifiées avant application. Les
                        tags dynamiques nécessitent ExifTool.
                      </p>
                    </>
                  )}
                  {dialog.kind === "metadata" && (
                    <>
                      <p>
                        Une sauvegarde <code>_original</code> est conservée à
                        côté de chaque fichier.
                      </p>
                      <label className="checkbox">
                        <input type="checkbox" name="strip" />
                        Supprimer toutes les métadonnées, dont le GPS
                      </label>
                      <div className="form-grid">
                        {[
                          "Artist",
                          "Title",
                          "Album",
                          "Track",
                          "Genre",
                          "Year",
                        ].map((k) => (
                          <Field key={k} label={k}>
                            <input name={k} />
                          </Field>
                        ))}
                      </div>
                    </>
                  )}
                  {dialog.kind === "hash" && (
                    <>
                      <Field label="Algorithme">
                        <select name="algorithm">
                          <option value="blake3">BLAKE3</option>
                          <option value="sha256">SHA-256</option>
                          <option value="md5">MD5</option>
                        </select>
                      </Field>
                      <Field label="Empreinte attendue (facultative)">
                        <input
                          name="expected"
                          placeholder="Collez l’empreinte à vérifier"
                        />
                      </Field>
                    </>
                  )}
                  {dialog.kind === "pin" && (
                    <>
                      <Field label="Titre">
                        <input
                          name="name"
                          required
                          placeholder="Documentation du projet"
                        />
                      </Field>
                      <Field label="URL">
                        <input
                          type="url"
                          name="url"
                          required
                          placeholder="https://…"
                        />
                      </Field>
                    </>
                  )}
                  {dialog.kind === "web" && (
                    <>
                      <Field label="Adresse web">
                        <input
                          type="url"
                          name="url"
                          required
                          defaultValue={dialog.value?.url || ""}
                          placeholder="https://…"
                        />
                      </Field>
                      <Field label="Enregistrer comme">
                        <select
                          name="mode"
                          defaultValue={dialog.value?.mode || "link"}
                        >
                          <option value="link">Lien enrichi .weblink</option>
                          <option value="markdown">Article Markdown</option>
                          <option value="download">
                            Fichier / image d’origine
                          </option>
                          <option value="media">
                            Média audio / vidéo (yt-dlp)
                          </option>
                        </select>
                      </Field>
                      <Field label="Nom du fichier (téléchargement direct)">
                        <input
                          name="name"
                          defaultValue={
                            dialog.value?.url
                              ? basename(new URL(dialog.value.url).pathname) ||
                                "Téléchargement"
                              : "Téléchargement"
                          }
                        />
                      </Field>
                      <p className="muted">
                        Une capture de page demande l’accès au site concerné.
                        Les fichiers sont enregistrés dans le dossier actif.
                      </p>
                    </>
                  )}
                  {dialog.kind === "session" && (
                    <p>
                      Rouvrir les onglets de cette session et restaurer leurs
                      groupes dans la fenêtre actuelle ?
                    </p>
                  )}
                  {dialog.paths?.length &&
                  ["batch", "metadata", "zip", "transfer", "extract"].includes(
                    dialog.kind,
                  ) ? (
                    <p className="muted">
                      {dialog.paths.length} élément(s) sélectionné(s)
                    </p>
                  ) : null}
                  {formError && (
                    <p className="error" role="alert">
                      {formError}
                    </p>
                  )}
                  {hello?.features?.durableJobs &&
                    !dialog.value?.download &&
                    ["zip", "extract", "transfer"].includes(dialog.kind) && (
                      <label className="checkbox">
                        <input name="paused" type="checkbox" />
                        Démarrer en pause dans l’activité
                      </label>
                    )}
                </div>
                <footer>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => setDialog(null)}
                  >
                    Annuler
                  </button>
                  <button
                    className={dialog.kind === "trash" ? "danger" : "primary"}
                    disabled={
                      busy || (dialog.kind === "batch" && !dryRun?.valid)
                    }
                    type="submit"
                  >
                    {busy && <LoaderCircle size={15} className="spin" />}
                    {busy
                      ? "Traitement…"
                      : dialog.kind === "trash"
                        ? "Mettre à la corbeille"
                        : dialog.kind === "batch"
                          ? "Appliquer le renommage"
                          : "Confirmer"}
                  </button>
                </footer>
              </form>
            )}
          </Modal>
        )}
      </div>
    </OrganizationContext.Provider>
  );
}
