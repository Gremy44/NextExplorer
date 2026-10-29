import { relatedTexts, searchIndex, type LocalIndex } from "./local-index";

let index: LocalIndex | null = null;
self.onmessage = (
  event: MessageEvent<{
    index?: LocalIndex;
    id: number;
    query?: string;
    extension?: string;
    keyword?: string;
    related?: string;
  }>,
) => {
  const message = event.data;
  if (message.index) {
    index = message.index;
    return;
  }
  if (!index) return;
  try {
    if (message.related) {
      self.postMessage({
        id: message.id,
        similar: relatedTexts(index.files, message.related).map(
          ({ file, score }) => ({ path: file.entry.path, score }),
        ),
      });
    } else {
      self.postMessage({
        id: message.id,
        paths: searchIndex(
          index,
          message.query || "",
          message.extension,
          message.keyword,
        ).map((file) => file.entry.path),
      });
    }
  } catch (error) {
    self.postMessage({ id: message.id, error: (error as Error).message });
  }
};
