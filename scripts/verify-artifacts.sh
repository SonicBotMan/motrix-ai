#!/usr/bin/env bash
# verify-artifacts.sh — 发布产物结构验证（防"假产物"：平台错乱/缺引擎/结构损坏）
# 用法: verify-artifacts.sh <release_id> <output_dir>
# 依赖: ubuntu-latest 自带 file/tar/zstd/dpkg-deb；7zip 由 CI 预装
set -uo pipefail

RELEASE_ID="${1:?usage: verify-artifacts.sh <release_id> <out_dir>}"
OUT="${2:?usage: verify-artifacts.sh <release_id> <out_dir>}"
TOKEN="${GITHUB_TOKEN:-${GH_TOKEN:?set GITHUB_TOKEN (CI) or GH_TOKEN (local: gh auth token)}}"
mkdir -p "$OUT"

echo "### 下载 release $RELEASE_ID 的全部资产"
python3 - "$RELEASE_ID" "$OUT" "$TOKEN" <<'PY'
import json, sys, urllib.request, pathlib
rid, out, token = sys.argv[1], pathlib.Path(sys.argv[2]), sys.argv[3]
req = urllib.request.Request(
    f"https://api.github.com/repos/SonicBotMan/motrix-ai/releases/{rid}",
    headers={"Authorization": f"Bearer {token}", "Accept": "application/vnd.github+json"})
d = json.load(urllib.request.urlopen(req))
for a in d["assets"]:
    p = out / a["name"]
    with urllib.request.urlopen(urllib.request.Request(a["url"], headers={"Authorization": f"Bearer {token}", "Accept": "application/octet-stream"})) as r, open(p, "wb") as f:
        f.write(r.read())
    print(f"  downloaded {a['name']} ({a['size']} B)")
PY
[ $? -eq 0 ] || { echo "FAIL: asset download failed"; exit 1; }

FAIL=0
pass() { echo "PASS: $1"; }
fail() { echo "FAIL: $1"; FAIL=1; }

# ── Arch PKG ─────────────────────────────────────────────
for f in "$OUT"/*.pkg.tar.zst; do
  [ -e "$f" ] || { fail "no .pkg.tar.zst asset found"; break; }
  name=$(basename "$f")
  d=$(mktemp -d); (cd "$d" && tar -xf "$f" 2>/dev/null)  # auto-detects zstd
  [ -f "$d/.PKGINFO" ] && pass "$name: .PKGINFO" || fail "$name: missing .PKGINFO"
  [ -f "$d/usr/share/applications/motrix-ai.desktop" ] && pass "$name: .desktop" || fail "$name: missing .desktop"
  ls "$d"/usr/share/icons/hicolor/*/apps/motrix-ai.png >/dev/null 2>&1 && pass "$name: icons" || fail "$name: missing icons"
  bin="$d/usr/share/motrix-ai/motrix-ai"
  [ -x "$bin" ] && pass "$name: app binary present" || { fail "$name: app binary missing"; continue; }
  magic=$(od -An -tx1 -N4 "$bin" | tr -d ' ')
  [ "$magic" = "7f454c46" ] && pass "$name: app binary is ELF" || fail "$name: app binary not ELF (magic $magic — wrong platform?)"
  arch=$(readelf -h "$bin" 2>/dev/null | grep -oP 'Machine:\s+\K\w+')
  [ "$arch" = "X86-64" ] && pass "$name: ELF machine X86-64" || fail "$name: ELF machine '$arch' != X86-64"
  # 引擎：内置二进制或依赖系统 aria2（PKG 允许两者，但必须有一个）
  engs=$(ls "$d/usr/share/motrix-ai/resources/bin/" 2>/dev/null | grep -c 'motrix-ai-engine' || true)
  if [ "$engs" -ge 1 ]; then
    elfok=1
    for e in "$d/usr/share/motrix-ai/resources/bin/motrix-ai-engine-"*; do
      m=$(od -An -tx1 -N4 "$e" | tr -d ' ')
      [ "$m" = "7f454c46" ] || elfok=0
    done
    [ "$elfok" = "1" ] && pass "$name: $engs bundled engine(s) all ELF" || fail "$name: bundled engine not ELF"
  else
    pass "$name: no bundled engine (will rely on system aria2 dependency)"
  fi
  grep -r "Contents/MacOS" "$d" >/dev/null 2>&1 && fail "$name: macOS paths inside Linux PKG!" || true
  rm -rf "$d"
done

# ── AppImage ─────────────────────────────────────────────
for f in "$OUT"/*.AppImage; do
  [ -e "$f" ] || continue
  m=$(od -An -tx1 -N4 "$f" | tr -d ' ')
  [ "$m" = "7f454c46" ] && pass "$(basename "$f"): is AppImage (ELF)" || fail "$(basename "$f"): not an AppImage ELF (magic $m)"
done

# ── .deb ─────────────────────────────────────────────────
for f in "$OUT"/*.deb; do
  [ -e "$f" ] || continue
  a=$(dpkg-deb -I "$f" 2>/dev/null | grep -i 'Architecture:' | awk '{print $2}')
  [ "$a" = "amd64" ] && pass "$(basename "$f"): arch amd64" || fail "$(basename "$f"): arch '$a' != amd64"
done

# ── .rpm（魔数校验，免装 rpm）────────────────────────────
for f in "$OUT"/*.rpm; do
  [ -e "$f" ] || continue
  m=$(od -An -tx1 -N4 "$f" | tr -d ' ')
  case "$m" in edabeedb|edab0600) pass "$(basename "$f"): RPM magic" ;; *) fail "$(basename "$f"): not an RPM (magic $m)" ;; esac
done

# ── .dmg（解包验平台 + 引擎）─────────────────────────────
for f in "$OUT"/*.dmg; do
  [ -e "$f" ] || continue
  n=$(basename "$f")
  d=$(mktemp -d)
  have_7z=0
  command -v 7zz >/dev/null 2>&1 && have_7z=1
  command -v 7z  >/dev/null 2>&1 && have_7z=1
  if [ "$have_7z" = "1" ]; then
    7zz x -y -o"$d" "$f" >/dev/null 2>&1 || 7z x -y -o"$d" "$f" >/dev/null 2>&1 || true
    appdir=$(find "$d" -maxdepth 1 -name '*.app' -type d | head -1)
    [ -n "$appdir" ] && pass "$n: contains .app bundle" || fail "$n: no .app bundle inside (extraction failed?)"
    exe="$appdir/Contents/MacOS/$(basename "$appdir" .app 2>/dev/null)"
    if [ -f "$exe" ]; then
      m=$(od -An -tx1 -N4 "$exe" | tr -d ' ')
      case "$m" in cffaedfe|cffae2fe|cefaedfe) pass "$n: app executable is Mach-O" ;;
        *) fail "$n: app executable NOT Mach-O (magic $m — wrong platform!)" ;;
      esac
    fi
    engs=$(find "$d" -name 'motrix-ai-engine*' | wc -l | tr -d ' ')
    [ "$engs" -ge 1 ] && pass "$n: $engs engine binaries present" || echo "WARN: $n: no engine binaries (macOS build needs codesign/adhoc)"
    # 签名检查（信息项）
    sigdir="$appdir/Contents/_CodeSignature"
    [ -d "$sigdir" ] && pass "$n: _CodeSignature present" || echo "WARN: $n: UNSIGNED (Gatekeeper will block on Apple Silicon)"
  else
    echo "WARN: $n: 7zip not available here — dmg not inspected (CI installs 7zip)"
  fi
  rm -rf "$d"
done

# ── .msi（OLE 魔数）──────────────────────────────────────
for f in "$OUT"/*.msi; do
  [ -e "$f" ] || continue
  m=$(od -An -tx1 -N4 "$f" | tr -d ' ')
  [ "$m" = "d0cf11e0" ] && pass "$(basename "$f"): MSI OLE magic" || fail "$(basename "$f"): not an MSI (magic $m)"
done

# ── NSIS setup.exe（PE 魔数 + 平台防错乱）────────────────
for f in "$OUT"/*-setup.exe; do
  [ -e "$f" ] || continue
  n=$(basename "$f")
  m=$(od -An -tx1 -N2 "$f" | tr -d ' ')
  [ "$m" = "4d5a" ] && pass "$n: PE (MZ) magic" || fail "$n: not a PE executable (magic $m)"
  # 防 macOS 内容混入（压缩数据里搜不到，退而检查大小下限：空壳 < 1MB 必有问题）
  sz=$(stat -c%s "$f")
  [ "$sz" -gt 1048576 ] && pass "$n: size $sz > 1MB (not an empty shell)" || fail "$n: suspiciously small ($sz B)"
done

echo
if [ "$FAIL" = "0" ]; then
  echo "### ✅ ALL ARTIFACT CHECKS PASSED"
else
  echo "### ❌ ARTIFACT VERIFICATION FAILED"
fi
exit "$FAIL"
