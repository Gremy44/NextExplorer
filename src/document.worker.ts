import { createDocument } from "./document-operations";
self.onmessage = async (
  event: MessageEvent<Parameters<typeof createDocument>>,
) => {
  try {
    const bytes = await createDocument(...event.data);
    self.postMessage({ bytes }, { transfer: [bytes.buffer] });
  } catch (error) {
    self.postMessage({ error: (error as Error).message });
  }
};
