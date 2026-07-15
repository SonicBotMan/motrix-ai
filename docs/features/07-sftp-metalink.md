# Feature: SFTP and Metalink Protocol Support

> **Audit Ref**: P3-5
> **Priority**: P3 — Protocol completeness
> **Estimate**: 4-6 hours
> **Risk**: Low (aria2 handles the protocols; we just need to expose them)

## Problem

aria2 supports SFTP and Metalink natively, but motrix-ai only exposes HTTP/HTTPS/FTP/magnet/torrent. The `addTask()` function in `tasks.ts:247` and the `download_url` MCP tool don't validate or handle these protocols.

## Goal

Users can add SFTP URLs (`sftp://`) and Metalink files (`.metalink`) to the download queue.

## Implementation Plan

### Step 1: Add SFTP URL support (1h)

SFTP is just another URI scheme that aria2 handles via `aria2.addUri`:

1. Add `sftp://` to the MCP server's `ALLOWED_URL_SCHEMES` array (already has http/https/ftp/magnet/ed2k/thunder)
2. Add `sftp://` detection to CLI's `isHttpUrl()` check in `add.ts` — rename to `isDirectUrl()` and include sftp
3. Test: `motrix-ai add sftp://user@host/path/to/file` works

### Step 2: Add Metalink file support (2h)

Metalink (`.metalink` or `.meta4`) is an XML format listing multiple mirrors. aria2 handles it via `aria2.addMetalink`:

1. Add Rust command `add_metalink_file` in `fs.rs` (mirror of `add_torrent_file` — read file, base64 encode, call `aria2.addMetalink`)
2. Register in `lib.rs` invoke_handler
3. Add `.metalink` and `.meta4` detection in CLI's `add.ts` and GUI's file picker dialog
4. Test: `motrix-ai add file.metalink` works

### Step 3: Add Metalink to GUI (2h)

1. In `TaskFirstView.vue`'s file picker handler, accept `.metalink` and `.meta4` extensions alongside `.torrent`
2. Call the new `add_metalink_file` Rust command
3. Add Metalink icon to the add-task dialog

### Step 4: Document supported protocols (0.5h)

Update README and onboarding to list all supported protocols:

- HTTP / HTTPS
- FTP / SFTP
- Magnet links
- BitTorrent (.torrent)
- Metalink (.metalink / .meta4)

## Verification

- `motrix-ai add sftp://test@localhost/file` — aria2 accepts the URI
- `motrix-ai add test.metalink` — aria2 parses the metalink and creates tasks
- GUI file picker accepts `.metalink` files

## Dependencies

- aria2 must be compiled with SFTP support (`--with-libssh2`) — verify the bundled aria2c binary supports it
- No new Rust dependencies needed
