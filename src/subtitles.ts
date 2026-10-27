// Keep only timed text cues; do not import style blocks or markup from local subtitle files.
export function subtitleToVTT(text: string) {
  if (new TextEncoder().encode(text).length > 128 * 1024)
    throw new Error("Sous-titres limités à 128 Kio");
  const cues: string[] = [];
  const time = String.raw`(?:\d{2,}:)?\d{2}:\d{2}[.,]\d{3}`;
  const timing = new RegExp(`^(${time})\\s+-->\\s+(${time})(?:\\s.*)?$`);
  for (const block of text
    .replace(/^\ufeff/, "")
    .replace(/\r\n?/g, "\n")
    .split(/\n\s*\n/)) {
    const lines = block.split("\n");
    const index = lines.findIndex((line) => timing.test(line.trim()));
    if (index < 0) continue;
    const match = timing.exec(lines[index].trim())!;
    const seconds = (value: string) => {
      const parts = value.replace(",", ".").split(":").map(Number);
      const sec = parts.pop()!,
        min = parts.pop()!,
        hour = parts.pop() || 0;
      return sec < 60 && min < 60 ? hour * 3600 + min * 60 + sec : NaN;
    };
    if (!(seconds(match[2]) > seconds(match[1]))) continue;
    const body = lines
      .slice(index + 1)
      .join("\n")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
    if (body.trim())
      cues.push(
        `${match[1].replace(",", ".")} --> ${match[2].replace(",", ".")}\n${body}`,
      );
  }
  if (!cues.length) throw new Error("Aucun sous-titre horodaté SRT/VTT valide");
  return `WEBVTT\n\n${cues.join("\n\n")}\n`;
}
export function codecWarning(codec: string) {
  const messages: Record<string, string> = {
    ac3: "AC-3",
    eac3: "E-AC-3",
    dts: "DTS",
    truehd: "TrueHD",
    hevc: "HEVC",
    mpeg4: "MPEG-4 ASP",
    wmv3: "WMV",
  };
  return messages[codec]
    ? `${messages[codec]} : décodage non garanti dans Chrome. Si l’image ou le son manque, ouvrez le fichier dans son application ou créez une copie compatible.`
    : "";
}
