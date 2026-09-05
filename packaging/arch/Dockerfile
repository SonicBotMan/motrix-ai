# Arch Linux 构建环境（Tauri 2 需要 WebKitGTK 4.1，Arch 官方源现成）
FROM archlinux:latest

# Tauri 2 Linux 构建依赖：rust 工具链 + webkit2gtk 4.1（含 libsoup3/gtk3 传递依赖）
# base-devel 提供 make/gcc；nodejs/npm 用于前端 workspace
RUN pacman -Sy --noconfirm \
        base-devel \
        rust \
        binutils \
        nodejs \
        npm \
        webkit2gtk \
        gtk3 \
        libayatana-appindicator \
        zstd

RUN npm install -g pnpm@9 @tauri-apps/cli@2

WORKDIR /app
COPY . /app

# 前端构建 + Tauri release 裸二进制（不产出平台安装器，PKG 由 package.sh 组装）
RUN set -e; \
    pnpm install --frozen-lockfile; \
    pnpm rebuild; \
    cd apps/gui; \
    tauri build --bundles none; \
    ls -la apps/gui/src-tauri/target/release/ | head -5
