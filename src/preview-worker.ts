import hljs from "highlight.js/lib/common";
import { marked } from "marked";

self.onmessage = (event: MessageEvent<{ text: string; markdown: boolean }>) => {
  const { text, markdown } = event.data;
  try {
    self.postMessage(
      markdown
        ? marked.parse(text, { async: false })
        : hljs.highlightAuto(text).value,
    );
  } catch {
    self.postMessage(null);
  }
};
