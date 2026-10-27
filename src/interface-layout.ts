import type { Preferences } from "./preferences";

export function tabDropIndex(
  clientX: number,
  left: number,
  scrollLeft: number,
  step: number,
  count: number,
) {
  if (
    ![clientX, left, scrollLeft, step, count].every(Number.isFinite) ||
    step <= 0 ||
    count < 1
  )
    return -1;
  return Math.max(
    0,
    Math.min(count - 1, Math.floor((clientX - left + scrollLeft) / step)),
  );
}

export function interfaceMetrics(
  preferences: Pick<Preferences, "density" | "textSize">,
) {
  const scale = { compact: 0.8, standard: 1, comfortable: 1.2 }[
    preferences.density
  ];
  return { scale, text: preferences.textSize / 100 };
}

export function fileMetrics(
  view: { width: number; height: number; iconSize: number },
  preferences: Pick<Preferences, "density" | "textSize">,
) {
  const { scale, text } = interfaceMetrics(preferences);
  return {
    width: view.width
      ? Math.round(Math.max(view.width * scale, 120 * text))
      : 0,
    height: Math.ceil(
      Math.max(28 * text, view.height * scale + Math.max(0, text - 1) * 48),
    ),
    iconSize: Math.round(view.iconSize * scale),
  };
}

export function moveTab<T>(
  workspace: { tabs: T[]; current: number },
  from: number,
  to: number,
) {
  if (
    !Number.isInteger(from) ||
    !Number.isInteger(to) ||
    from < 0 ||
    to < 0 ||
    from >= workspace.tabs.length ||
    to >= workspace.tabs.length ||
    from === to
  )
    return workspace;
  const tabs = [...workspace.tabs];
  tabs.splice(to, 0, tabs.splice(from, 1)[0]);
  const afterRemoval = workspace.current - (from < workspace.current ? 1 : 0);
  const current =
    workspace.current === from
      ? to
      : afterRemoval + (to <= afterRemoval ? 1 : 0);
  return { tabs, current };
}
