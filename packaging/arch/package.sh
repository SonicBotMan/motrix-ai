#!/bin/sh
# 组装 Arch PKG 包：/app/src-tauri 构建产物 → /out/*.pkg.tar.zst
# 用法（docker run -v $PWD/artifacts:/out arch-build-image /app/packaging/arch/package.sh）
set -eu

APP=/app/apps/gui/src-tauri
OUT=/out
PKG=/pkg
REL="$APP/target/release"

# 版本号
PKGVER=$(grep '^version' "$APP/Cargo.toml" | head -1 | sed 's/version = "\(.*\)"/\1/')
TARBALL="motrix-ai-${PKGVER}-1-x86_64.pkg.tar.zst"

BINNAME=$(ls "$REL" | grep -vE '\.(d|so|rlib|pdb|dll)$' | grep -v '^build$' | grep -v '^deps$' | head -1)
[ -n "$BINNAME" ] || { echo "ERROR: no tauri binary in $REL"; exit 1; }
echo "binary: $BINNAME (version $PKGVER)"

rm -rf "$PKG"
mkdir -p \
    "$PKG/usr/share/motrix-ai/resources/bin" \
    "$PKG/usr/bin" \
    "$PKG/usr/share/applications" \
    "$PKG/usr/share/icons/hicolor"

# 主程序 + 资源（resource_dir 相对 exe 解析）
install -m 755 "$REL/$BINNAME" "$PKG/usr/share/motrix-ai/motrix-ai"
install -m 644 "$APP/resources/bin/aria2.conf" "$PKG/usr/share/motrix-ai/resources/bin/aria2.conf"
# 内置引擎（有则装；Arch 用户也可 pacman -S aria2 走系统回退）
for f in "$APP"/resources/bin/motrix-ai-engine-*; do
    [ -f "$f" ] || continue
    install -m 755 "$f" "$PKG/usr/share/motrix-ai/resources/bin/$(basename "$f")"
done

# CLI 入口
printf '#!/bin/sh\nexec /usr/share/motrix-ai/motrix-ai "$@"\n' > "$PKG/usr/bin/motrix-ai"
chmod 755 "$PKG/usr/bin/motrix-ai"

# 应用菜单
cat > "$PKG/usr/share/applications/motrix-ai.desktop" << 'DESKTOP'
[Desktop Entry]
Type=Application
Name=Motrix AI
Comment=AI-native download manager
Exec=motrix-ai
Icon=motrix-ai
Terminal=false
Categories=Network;FileTransfer;
DESKTOP

# 图标
for size in 256 128 64 32 16; do
    if [ -f "$APP/icons/${size}x${size}.png" ]; then
        mkdir -p "$PKG/usr/share/icons/hicolor/${size}x${size}/apps"
        install -m 644 "$APP/icons/${size}x${size}.png" "$PKG/usr/share/icons/hicolor/${size}x${size}/apps/motrix-ai.png"
    fi
done

# .PKGINFO（pacman 元数据；depends 必须声明，否则 pacman -U 不做依赖解析）
cat > "$PKG/.PKGINFO" << INFO
pkgname = motrix-ai
pkgver = ${PKGVER}-1
pkgdesc = Motrix AI — AI-native download manager (Tauri 2 + Vue 3 + aria2)
arch = x86_64
url = https://github.com/SonicBotMan/motrix-ai
depends = glib2
depends = gtk3
depends = libayatana-appindicator
depends = libsoup3
depends = webkit2gtk-4.1
depends = alsa-lib
depends = xdg-utils
depends = zstd
builddate = $(date +%s)
pkgbase = motrix-ai
packager = motrix-ai CI <ci@motrix-ai.app>
INFO

mkdir -p "$OUT"
# 条目不带 ./ 前缀（makepkg 规范：.PKGINFO 必须在根且精确命名，pacman 按精确名查找）
( cd "$PKG" && tar -cf - .PKGINFO usr ) | zstd -q -19 > "$OUT/$TARBALL"
ls -la "$OUT/$TARBALL"
