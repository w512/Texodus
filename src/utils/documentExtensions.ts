/** File extensions Texodus can open and show in a workspace (without a dot). */
export const SUPPORTED_DOCUMENT_EXTENSIONS = ['md', 'markdown', 'txt'] as const;

const supportedExtensions = new Set<string>(SUPPORTED_DOCUMENT_EXTENSIONS);

/** Returns whether a local path or filename has a supported document extension. */
export function isSupportedDocument(path: string): boolean {
  const name = path.replaceAll('\\', '/').split('/').pop() ?? '';
  const dot = name.lastIndexOf('.');
  if (dot < 0 || dot === name.length - 1) return false;
  return supportedExtensions.has(name.slice(dot + 1).toLowerCase());
}
