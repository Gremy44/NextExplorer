import { expect, it } from "vitest";
import {
  addSpace,
  editSpaceTasks,
  normalizeSpace,
  parseSpaceFile,
  restoreSpaces,
  serializeSpaceFile,
  SPACE_FILE_LIMIT,
  SPACE_TASK_LIMIT,
  updateSpace,
} from "./spaces";

const snapshot = {
  version: 1,
  id: "voyage",
  name: " Voyage ",
  date: "2026-10-07T12:00:00.000Z",
  tabs: [
    {
      paths: ["D:/Voyage", "D:/Billets"],
      modes: ["tiles", "details"],
      active: 1,
      dual: true,
      split: 60,
    },
  ],
  current: 0,
  entries: [
    {
      path: "D:/Voyage/billet.txt",
      name: "billet.txt",
      type: "file",
      size: 12,
      mtime: 123,
      ext: ".txt",
    },
  ],
  links: {
    "D:/Voyage": [{ title: "Hôtel", url: "https://exemple.fr/reservation" }],
  },
  browser: {
    tabs: [{ url: "https://exemple.fr/", title: "Hôtel", groupId: 1 }],
    groups: [{ id: 1, title: "Voyage", color: "blue" }],
  },
};
it("conserve dossiers, modes, collecte, liens et groupes sans contenu de fichier", () => {
  const space = normalizeSpace(snapshot);
  expect(space.name).toBe("Voyage");
  expect(space.tabs[0]).toMatchObject({
    paths: ["D:/Voyage", "D:/Billets"],
    active: 1,
    dual: true,
    split: 60,
  });
  expect(space.entries).toEqual(snapshot.entries);
  expect(space.links).toEqual(snapshot.links);
  expect(space.browser).toEqual(snapshot.browser);
  expect(
    normalizeSpace({
      ...snapshot,
      current: 100,
      tabs: [{ ...snapshot.tabs[0], split: 500, modes: ["unknown"] }],
    }),
  ).toMatchObject({
    current: 0,
    tabs: [{ split: 70, modes: ["details", "details"] }],
  });
});

it("conserve les anciennes versions sans tâches et exporte l’avancement explicite", () => {
  const space = normalizeSpace(snapshot);
  expect(space.tasks).toEqual([]);
  const tasks = [{ id: "task-1", label: " Préparer le CV ", done: true }];
  const withTasks = normalizeSpace({ ...snapshot, tasks });
  expect(withTasks.tasks).toEqual([{ ...tasks[0], label: "Préparer le CV" }]);
  expect(parseSpaceFile(serializeSpaceFile(withTasks))).toEqual(withTasks);
  expect(tasks[0].label).toBe(" Préparer le CV ");
});

it("valide les tâches importées, leur nombre, leur identité et leur état sans exécuter le texte", () => {
  const task = { id: "task-1", label: "Préparer le CV", done: false };
  for (const tasks of [
    null,
    {},
    [null],
    [{ ...task, id: "" }],
    [{ ...task, label: " " }],
    [{ ...task, label: "x".repeat(161) }],
    [{ ...task, label: "ligne\nsecret" }],
    [{ ...task, done: "true" }],
    [task, { ...task, label: "Lettre" }],
    [task, { ...task, id: "task-2", label: " PRÉPARER LE CV " }],
    [task, { ...task, id: "task-2", label: "Pre\u0301parer le CV" }],
    Array.from({ length: 21 }, (_, i) => ({
      ...task,
      id: `task-${i}`,
      label: `Pièce ${i}`,
    })),
  ]) {
    expect(() =>
      parseSpaceFile(
        JSON.stringify({
          format: "nextexplorer-space",
          version: 1,
          space: { ...snapshot, tasks },
        }),
      ),
    ).toThrow();
  }
  expect(
    normalizeSpace({
      ...snapshot,
      tasks: [{ ...task, label: '<img src="https://exemple.fr">' }],
    }).tasks[0].label,
  ).toBe('<img src="https://exemple.fr">');
});

it("édite seulement les tâches ciblées sur la dernière version et préserve les autres champs et espaces", () => {
  const space = normalizeSpace(snapshot);
  const other = { ...space, id: "other", name: "Autre" };
  const initial = [space, other];
  let current = editSpaceTasks(initial, space.id, {
    kind: "add",
    id: "cv",
    label: "CV",
  });
  current = editSpaceTasks(current, space.id, {
    kind: "add",
    id: "lettre",
    label: "Lettre",
  });
  current[0] = { ...current[0], name: "Voyage corrigé", entries: [] };
  current = editSpaceTasks(current, space.id, {
    kind: "set",
    id: "cv",
    done: true,
  });
  expect(current[0]).toMatchObject({
    name: "Voyage corrigé",
    entries: [],
    tasks: [
      { id: "cv", done: true },
      { id: "lettre", done: false },
    ],
  });
  expect(
    editSpaceTasks(current, space.id, { kind: "set", id: "cv", done: true }),
  ).toEqual(current);
  current = editSpaceTasks(current, space.id, {
    kind: "set",
    id: "cv",
    done: false,
  });
  current = editSpaceTasks(current, space.id, { kind: "remove", id: "lettre" });
  expect(current[0].tasks).toEqual([{ id: "cv", label: "CV", done: false }]);
  expect(current[1]).toEqual(other);
  expect(current[0].browser).toEqual(space.browser);
  expect(current[0].links).toEqual(space.links);
  expect(initial[0].tasks).toEqual([]);
});

it("ne recrée pas un espace ou une tâche supprimés dans une autre vue", () => {
  const space = normalizeSpace(snapshot);
  expect(() =>
    editSpaceTasks([], space.id, { kind: "add", id: "cv", label: "CV" }),
  ).toThrow("supprimé");
  for (const change of [
    { kind: "set" as const, id: "absent", done: true },
    { kind: "remove" as const, id: "absent" },
  ])
    expect(() => editSpaceTasks([space], space.id, change)).toThrow(
      "autre vue",
    );
  expect(space.tasks).toEqual([]);
});

it("refuse une écriture qui perdrait un autre espace illisible ou dépasserait la capacité", () => {
  const space = normalizeSpace(snapshot);
  const value = [space, { ...space, id: "other", tasks: "broken" }];
  const before = JSON.stringify(value);
  expect(() =>
    editSpaceTasks(value, space.id, { kind: "add", id: "cv", label: "CV" }),
  ).toThrow();
  expect(JSON.stringify(value)).toBe(before);
  expect(() =>
    editSpaceTasks([space, space], space.id, {
      kind: "add",
      id: "cv",
      label: "CV",
    }),
  ).toThrow("double");
  const full = normalizeSpace({
    ...space,
    tasks: Array.from({ length: SPACE_TASK_LIMIT }, (_, i) => ({
      id: `task-${i}`,
      label: `Pièce ${i}`,
      done: false,
    })),
  });
  expect(() =>
    editSpaceTasks([full], space.id, {
      kind: "add",
      id: "extra",
      label: "Extra",
    }),
  ).toThrow("20 tâches");
  const one = editSpaceTasks([space], space.id, {
    kind: "add",
    id: "cv",
    label: "CV",
  });
  expect(() =>
    editSpaceTasks(one, space.id, { kind: "add", id: "cv2", label: " cv " }),
  ).toThrow("existe déjà");
});

it("préserve les tâches lors d’une actualisation et refuse un avancement changé après l’aperçu", () => {
  const previous = normalizeSpace({
    ...snapshot,
    tasks: [{ id: "cv", label: "CV", done: false }],
  });
  const candidate = normalizeSpace({ ...previous, entries: [], tasks: [] });
  const updated = updateSpace([previous], previous, candidate)[0];
  expect(updated.tasks).toEqual(previous.tasks);
  expect(updated.entries).toEqual([]);
  const current = editSpaceTasks([previous], previous.id, {
    kind: "set",
    id: "cv",
    done: true,
  });
  expect(() => updateSpace(current, previous, candidate)).toThrow("autre vue");
  expect(current[0].tasks[0].done).toBe(true);
});

it("garde indépendantes les tâches d’un espace importé avec une nouvelle identité", () => {
  const original = normalizeSpace({
    ...snapshot,
    tasks: [{ id: "cv", label: "CV", done: true }],
  });
  const imported = {
    ...parseSpaceFile(serializeSpaceFile(original)),
    id: "import",
    name: "Copie",
  };
  const current = editSpaceTasks(addSpace([original], imported), imported.id, {
    kind: "set",
    id: "cv",
    done: false,
  });
  expect(current[0].tasks[0].done).toBe(false);
  expect(current[1].tasks[0].done).toBe(true);
});
it("refuse sessions dangereuses, chemins relatifs, versions et lots excessifs", () => {
  for (const change of [
    { version: 2 },
    { name: " " },
    { date: "incorrect" },
    { tabs: [{ ...snapshot.tabs[0], paths: ["../secret", "D:/Billets"] }] },
    { tabs: Array(31).fill(snapshot.tabs[0]) },
    { entries: Array(201).fill(snapshot.entries[0]) },
    { browser: { tabs: [{ url: "javascript:alert(1)" }], groups: [] } },
    {
      browser: { tabs: [{ url: "https://user:pass@exemple.fr" }], groups: [] },
    },
    { browser: { tabs: [], groups: [{ id: 1, color: "unknown" }] } },
  ])
    expect(() => normalizeSpace({ ...snapshot, ...change })).toThrow();
  expect(
    restoreSpaces([null, { ...snapshot, version: 2 }, snapshot, snapshot]),
  ).toHaveLength(1);
  expect(restoreSpaces("broken")).toEqual([]);
});
it("empêche les doublons de nom et borne les espaces conservés", () => {
  const space = normalizeSpace(snapshot);
  expect(addSpace([], space)).toEqual([space]);
  expect(() =>
    addSpace([space], { ...space, id: "other", name: "voyage" }),
  ).toThrow("existe déjà");
  expect(() =>
    addSpace(Array(30).fill(space), { ...space, name: "Autre" }),
  ).toThrow("30 espaces");
});

it("exporte et relit les références de l’espace sans perdre les pages ou les groupes", () => {
  const space = normalizeSpace(snapshot);
  const text = serializeSpaceFile(space);
  expect(JSON.parse(text)).toMatchObject({
    format: "nextexplorer-space",
    version: 1,
    space: { name: "Voyage" },
  });
  expect(parseSpaceFile(text)).toEqual(space);
  expect(space).toEqual(normalizeSpace(snapshot));
});

it("refuse les fichiers étrangers, endommagés ou de version inconnue", () => {
  for (const value of [
    null,
    [],
    snapshot,
    { format: "other", version: 1, space: snapshot },
    { format: "nextexplorer-space", version: 2, space: snapshot },
    { format: "nextexplorer-space", version: 1 },
  ])
    expect(() => parseSpaceFile(JSON.stringify(value))).toThrow();
  expect(() => parseSpaceFile("{broken")).toThrow("endommagé");
});

it("valide aussi les chemins, liens et références d’un fichier importé", () => {
  for (const change of [
    { tabs: [null] },
    { tabs: [{ ...snapshot.tabs[0], paths: ["../secret", "D:/Billets"] }] },
    { entries: [{ type: "web" }] },
    { entries: [{ type: "web", path: "https://exemple.fr", sourceUrl: true }] },
    { browser: { tabs: [null], groups: [] } },
    { browser: { tabs: [], groups: [null] } },
    { browser: { tabs: [{ url: "javascript:alert(1)" }], groups: [] } },
    { links: { "D:/Voyage": [null] } },
    { links: { "D:/Voyage": [{ url: "https://user:pass@exemple.fr" }] } },
  ])
    expect(() =>
      parseSpaceFile(
        JSON.stringify({
          format: "nextexplorer-space",
          version: 1,
          space: { ...snapshot, ...change },
        }),
      ),
    ).toThrow();
});

it("borne les fichiers en octets UTF-8 à l’import comme à l’export", () => {
  expect(() => parseSpaceFile("é".repeat(SPACE_FILE_LIMIT / 2 + 1))).toThrow(
    "2 Mio",
  );
  const url = "https://exemple.fr/" + "a".repeat(7000);
  const space = normalizeSpace({
    ...snapshot,
    entries: Array.from({ length: 200 }, () => ({
      type: "web",
      path: url,
      name: "Lien",
    })),
    links: {
      "D:/Voyage": Array.from({ length: 100 }, () => ({ url, title: "Lien" })),
    },
  });
  expect(() => serializeSpaceFile(space)).toThrow("2 Mio");
});

it("actualise un espace à capacité pleine sans perdre les autres instantanés", () => {
  const previous = normalizeSpace(snapshot);
  const others = Array.from({ length: 29 }, (_, i) => ({
    ...previous,
    id: `other-${i}`,
    name: `Autre ${i}`,
  }));
  const current = [...others, previous];
  const space = normalizeSpace({
    ...previous,
    name: "Voyage actualisé",
    date: "2026-10-09T12:00:00.000Z",
    entries: [],
  });
  expect(updateSpace(current, previous, space)).toEqual([space, ...others]);
  expect(current).toEqual([...others, previous]);
  expect(previous.entries).toEqual(snapshot.entries);
  expect(space.id).toBe(previous.id);
  expect(space.browser).toEqual(previous.browser);
});

it("refuse de remplacer un autre espace portant déjà le nom choisi", () => {
  const previous = normalizeSpace(snapshot);
  const other = { ...previous, id: "other", name: "Candidature" };
  expect(() =>
    updateSpace([previous, other], previous, {
      ...previous,
      name: " candidature ",
    }),
  ).toThrow("existe déjà");
  expect(other.name).toBe("Candidature");
});

it("ne ressuscite pas un espace supprimé et protège les modifications concurrentes", () => {
  const previous = normalizeSpace(snapshot);
  expect(() => updateSpace([], previous, previous)).toThrow("supprimé");
  for (const change of [
    { name: "Voyage corrigé" },
    { entries: [] },
    { browser: { tabs: [], groups: [] } },
  ]) {
    const current = normalizeSpace({ ...previous, ...change });
    expect(() => updateSpace([current], previous, previous)).toThrow(
      "autre vue",
    );
    expect(current).toEqual(normalizeSpace({ ...previous, ...change }));
  }
});

it("revalide l’identité et les références lors d’une actualisation", () => {
  const previous = normalizeSpace(snapshot);
  expect(() =>
    updateSpace([previous], previous, { ...previous, id: "other" }),
  ).toThrow("Identité");
  expect(() =>
    updateSpace([previous], previous, {
      ...previous,
      browser: {
        tabs: [{ url: "javascript:alert(1)", title: "", groupId: -1 }],
        groups: [],
      },
    }),
  ).toThrow();
  expect(previous.browser).toEqual(snapshot.browser);
});
