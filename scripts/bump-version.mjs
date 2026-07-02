#!/usr/bin/env node
/**
 * Bumps the app version everywhere it's duplicated:
 *   - package.json  (tauri.conf.json reads its version from here via
 *     `"version": "../package.json"`)
 *   - src-tauri/Cargo.toml
 *   - src-tauri/Cargo.lock (via `cargo update --workspace`, which only
 *     refreshes workspace members — dependencies stay pinned)
 *
 * Usage: bun run bump 3.1.0
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const version = process.argv[2];
if (!/^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/.test(version ?? '')) {
  console.error('Usage: bun run bump <semver>   (e.g. bun run bump 3.1.0)');
  process.exit(1);
}

const pkgPath = new URL('../package.json', import.meta.url);
const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
const previous = pkg.version;
pkg.version = version;
writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');

// Only the [package] version sits at the start of a line; dependency
// versions are inline (`tauri = { version = "2", … }`) and don't match.
const cargoPath = new URL('../src-tauri/Cargo.toml', import.meta.url);
const cargo = readFileSync(cargoPath, 'utf8');
writeFileSync(cargoPath, cargo.replace(/^version = ".*"$/m, `version = "${version}"`));

let lockNote = 'src-tauri/Cargo.lock';
try {
  execFileSync('cargo', ['update', '--workspace'], {
    cwd: fileURLToPath(new URL('../src-tauri', import.meta.url)),
    stdio: 'inherit',
  });
} catch {
  lockNote = 'Cargo.lock NOT updated — run `cargo update --workspace` in src-tauri/';
}

console.log(`Bumped ${previous} -> ${version} (package.json, src-tauri/Cargo.toml, ${lockNote})`);
