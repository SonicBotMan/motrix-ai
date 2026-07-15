# Feature: Platform Capabilities (RTL, Windows Sleep, Autostart)

> **Audit Ref**: P2-14, P2-16, P2-17
> **Priority**: P2 — Platform completeness
> **Estimate**: 10-14 hours total (3 independent sub-features)
> **Risk**: Low-Medium (each is independent, additive)

## Sub-Feature A: RTL Support (P2-14)

### Problem

All 31 Vue files use physical CSS properties (`margin-left`, `padding-right`). No `dir="rtl"` support. Current supported languages (en/zh/ja/ko/fr) are all LTR, but Arabic/Hebrew users would have broken layouts.

### Plan

1. **Audit CSS**: Find all `left`/`right` physical properties across `.vue` and `.css` files
2. **Convert to logical properties**: `margin-left` → `margin-inline-start`, `text-align: left` → `text-align: start`, etc.
3. **Add `dir` attribute binding**: Set `dir` on `<html>` based on `language.value` (en/zh/ja/ko/fr → 'ltr', future ar/he → 'rtl')
4. **Test**: Add Arabic locale key set, verify layout mirrors correctly

### Estimate: 4-6h

### Priority: Low (no current RTL users)

---

## Sub-Feature B: Windows Sleep Prevention (P2-16)

### Problem

`apps/gui/src-tauri/src/services/power.rs:42` has a TODO: _"Requires linking against kernel32; left as a TODO placeholder."_ On Windows, the system may sleep during large downloads, interrupting them.

### Plan

1. **Add Windows API call** in `power.rs`:
   ```rust
   #[cfg(target_os = "windows")]
   {
       use windows::Win32::System::Power::SetThreadExecutionState;
       SetThreadExecutionState(EXECUTION_STATE::CONTINUOUS | EXECUTION_STATE::SYSTEM_REQUIRED);
   }
   ```
2. **Add `windows` crate** to `Cargo.toml` with `Win32_System_Power` feature
3. **Test on Windows**: Verify sleep is prevented while app is running

### Alternative (simpler): Use `tauri-plugin-autostart` pattern — create a background thread that periodically sends input events (less elegant but no new dependency).

### Estimate: 2-3h

### Priority: Medium (affects Windows users during downloads)

---

## Sub-Feature C: Autostart on Login (P2-17)

### Problem

No autostart capability. Users expect a download manager to optionally start on system boot.

### Plan

1. **Add `tauri-plugin-autostart`** to `Cargo.toml`
2. **Register plugin** in `lib.rs`:
   ```rust
   .plugin(tauri_plugin_autostart::init(MacosLauncher::LaunchAgent, None))
   ```
3. **Add Tauri commands**: `enable_autostart`, `disable_autostart`, `is_autostart_enabled`
4. **Add UI toggle** in Settings → Advanced tab
5. **Persist preference** in config

### Estimate: 3-4h

### Priority: Medium (common download manager feature)

## Verification

Each sub-feature is independent and can be shipped separately.

- RTL: `grep -rn "margin-left\|padding-right\|text-align: left" apps/gui/src` returns 0
- Windows sleep: Test on Windows 11 — system doesn't sleep during active download
- Autostart: Enable in settings, reboot, app launches automatically
