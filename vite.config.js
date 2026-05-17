import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";

const host = process.env.TAURI_DEV_HOST;

/**
 * Strip legacy WOFF references from @fontsource CSS so only WOFF2 is bundled.
 * Tauri's WebView (WebKit / WebView2 / WebKitGTK) always supports WOFF2.
 * Cuts ~50% of the bundled font payload (Iosevka alone is ~2MB per weight in WOFF).
 */
function dropLegacyWoff() {
  return {
    name: "drop-legacy-woff",
    enforce: "pre",
    transform(code, id) {
      if (!id.includes("@fontsource") || !id.endsWith(".css")) return null;
      const cleaned = code.replace(
        /\s*,\s*url\([^)]+\.woff\)\s*format\(['"]woff['"]\)/g,
        ""
      );
      return cleaned === code ? null : { code: cleaned, map: null };
    },
  };
}

// https://vite.dev/config/
export default defineConfig(async () => ({
  plugins: [vue(), dropLegacyWoff()],

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // 3. tell Vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
  },
}));
