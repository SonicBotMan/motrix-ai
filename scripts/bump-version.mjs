#!/usr/bin/env node
/**
 * Bump version across all packages in the Motrix AI monorepo.
 * Updates: root package.json, Tauri config, Cargo.toml, and workspace packages.
 *
 * @param {string} version - Semantic version string (e.g., "0.1.0")
 * @example
 *   node scripts/bump-version.mjs 0.1.0
 */

import { readFileSync, writeFileSync } from 'fs'
import { join } from 'path'

const version = process.argv[2]
if (!version) {
  console.error('Usage: node scripts/bump-version.mjs <version>')
  process.exit(1)
}

const root = process.cwd()

/** Update root package.json */
const rootPkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf-8'))
rootPkg.version = version
writeFileSync(join(root, 'package.json'), JSON.stringify(rootPkg, null, 2) + '\n')

/** Update Tauri config */
const tauriConf = JSON.parse(readFileSync(join(root, 'apps/gui/src-tauri/tauri.conf.json'), 'utf-8'))
tauriConf.version = version
writeFileSync(join(root, 'apps/gui/src-tauri/tauri.conf.json'), JSON.stringify(tauriConf, null, 2) + '\n')

/** Update Cargo.toml */
const cargoPath = join(root, 'apps/gui/src-tauri/Cargo.toml')
let cargo = readFileSync(cargoPath, 'utf-8')
cargo = cargo.replace(/^version = "[^"]*"/m, `version = "${version}"`)
writeFileSync(cargoPath, cargo)

/** Update workspace packages */
for (const pkg of ['packages/core', 'packages/cli', 'packages/mcp-server']) {
  const pkgPath = join(root, pkg, 'package.json')
  const pkgJson = JSON.parse(readFileSync(pkgPath, 'utf-8'))
  pkgJson.version = version
  writeFileSync(pkgPath, JSON.stringify(pkgJson, null, 2) + '\n')
}

console.log(`✅ Version bumped to ${version} in all packages`)
