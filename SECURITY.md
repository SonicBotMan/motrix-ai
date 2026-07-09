# Security Policy

## Supported Versions

Motrix AI is in active development. Security fixes are applied to the latest `main` branch only.

## Known advisories

### glib 0.18.5 — Unsoundness in `Iterator`/`DoubleEndedIterator` impls for `glib::VariantStrIter`

- **CVE**: GHSArh3h / Dependabot alert #2
- **Severity**: medium
- **Affected range**: `>= 0.15.0, < 0.20.0`
- **First patched version**: `0.20.0`
- **Current lockfile version**: `0.18.5`

#### Why we cannot upgrade today

`glib` is a transitive dependency of `tauri`:

```
tauri 2.11.5
  → gtk ^0.18
    → glib ^0.18   ← locked here
```

The latest published `tauri` 2.x release (2.11.5 as of 2026-07-05) still depends on `gtk ^0.18`, which requires `glib ^0.18`. `glib 0.20.0` is ABI-incompatible with `gtk 0.18.x`, so a `Cargo.toml [patch]` override would fail to compile.

There is no `tauri 2.12+` available yet — the upstream has not shipped a release that bumps the `gtk` chain.

#### Actual exposure for this project

`glib::VariantStrIter` is part of GNOME's GObject introspection bindings. Motrix AI does not directly call any `glib::Variant*` APIs — we use `tauri` purely as a desktop-app runtime (window, tray, IPC). The vulnerable iterator is only reachable from code paths that walk `Variant` payloads, which our binary does not construct.

The residual risk is therefore best characterised as **"transitive dependency carries an unsound API that our process never invokes"** rather than a directly exploitable defect.

#### Mitigation

1. **Monitor upstream**: dependabot is configured to open PRs for `tauri` updates (see `.github/dependabot.yml`, cargo ecosystem, weekly). The moment `tauri 2.12+` ships with a `gtk` bump, dependabot will surface it.
2. **Dismissed alert**: Dependabot alert #2 has been dismissed as `tolerable_risk` with this SECURITY.md as the reasoning. The dismissal will be auto-reopened if a new patched version becomes available.
3. **No source-level workaround** is possible without breaking the build.

#### When this can be resolved

Once `tauri` publishes a release (likely `2.12.0` or beyond) that allows `gtk 0.19+`, the standard `cargo update -p glib --precise 0.20.x` flow will resolve the advisory with no code change required here.

## Reporting a vulnerability

To report a security issue in Motrix AI itself (not in dependencies), please open a private security advisory at:

```
https://github.com/SonicBotMan/motrix-ai/security/advisories/new
```

Do **not** open a public issue for security problems.

We aim to acknowledge reports within 72 hours and to ship a fix or mitigation within 30 days, depending on severity.
