/**
 * Cross-platform basename — strips everything up to the last `/` or `\`.
 * Used wherever we want to display the file part of a full path without
 * pulling in node's `path` module (we're in a webview).
 */
export function basename(path: string): string {
  return path.split(/[\\/]/).pop() || path;
}
