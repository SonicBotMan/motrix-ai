#!/usr/bin/env bash
# arch-smoke.sh — Arch 运行时验收（在 archlinux 容器内执行）
# 流程: pacman -U PKG → Xvfb 启动 GUI → 等 HTTP API token → 引擎 getVersion
#       → 真实下载一个小文件 → 校验落盘 → 通过/失败
# 用法: PKG 目录通过 /pkg 挂载
set -uo pipefail

PKG_DIR="${1:-/pkg}"
FAIL() { echo "SMOKE-FAIL: $1"; echo "=== 应用环境信息 ==="; ls -la ~/.motrix-ai 2>/dev/null; tail -20 ~/.motrix-ai/aria2.log 2>/dev/null; exit 1; }
OK()   { echo "SMOKE-OK: $1"; }

# 0) 安装 PKG（pacman 自动解析依赖）
shopt -s nullglob
pkgs=("$PKG_DIR"/*.pkg.tar.zst)
[ ${#pkgs[@]} -ge 1 ] || FAIL "no .pkg.tar.zst in $PKG_DIR"
pacman -U --noconfirm --needed "${pkgs[0]}" >/dev/null 2>&1 || pacman -U --noconfirm "${pkgs[0]}" >/dev/null || FAIL "pacman -U failed"
OK "PKG 安装成功: ${pkgs[0]}"
command -v motrix-ai >/dev/null || FAIL "CLI 入口 motrix-ai 不存在（.desktop/CLI 打包问题）"
OK "CLI 入口 /usr/bin/motrix-ai 存在"

# 1) 虚拟显示下启动 GUI
xvfb-run -a /usr/share/motrix-ai/motrix-ai > /tmp/app.log 2>&1 &
APP_PID=$!
sleep 3
kill -0 "$APP_PID" 2>/dev/null || { FAIL "应用启动 3s 内崩溃"; cat /tmp/app.log; }
OK "GUI 进程存活 (pid $APP_PID)"

# 2) 等 HTTP API（18900）吐出 token —— 同时证明引擎子系统已初始化
TOKEN=""
for i in $(seq 1 60); do
  if ! kill -0 "$APP_PID" 2>/dev/null; then FAIL "应用运行中退出"; fi
  TOKEN=$(curl -s -m 3 "http://127.0.0.1:18900/" 2>/dev/null | python3 -c "import json,sys;
try: print(json.load(sys.stdin).get('token',''))
except: print('')" 2>/dev/null)
  [ -n "$TOKEN" ] && break
  sleep 2
done
[ -n "$TOKEN" ] || { FAIL "HTTP API(18900) 60s 内未返回 token"; tail -30 /tmp/app.log; }
OK "HTTP API 就绪，token 已获取"

# 3) 引擎 JSON-RPC getVersion（带 token）
VER=$(curl -s -m 5 "http://127.0.0.1:6800/jsonrpc" -H 'Content-Type: application/json' \
  -d "{\"jsonrpc\":\"2.0\",\"id\":\"smoke\",\"method\":\"aria2.getVersion\",\"params\":[\"token:$TOKEN\"]}" \
  | python3 -c "import json,sys; print(json.load(sys.stdin).get('result',{}).get('version',''))" 2>/dev/null)
[ -n "$VER" ] || FAIL "aria2 引擎 RPC getVersion 失败（引擎未起？）"
OK "aria2 引擎运行中 (v$VER)"

# 4) 真实下载：GitHub raw 小文件 → 等待 complete → 校验落盘
GID=$(curl -s -m 5 "http://127.0.0.1:6800/jsonrpc" -H 'Content-Type: application/json' \
  -d "{\"jsonrpc\":\"2.0\",\"id\":\"smoke\",\"method\":\"aria2.addUri\",\"params\":[\"token:$TOKEN\",[\"https://raw.githubusercontent.com/SonicBotMan/motrix-ai/main/LICENSE\"],{\"out\":\"smoke-license.txt\"}]}" \
  | python3 -c "import json,sys; print(json.load(sys.stdin).get('result',''))" 2>/dev/null)
[ -n "$GID" ] && [ "$GID" != "None" ] || FAIL "addUri 失败（下载队列不可用）"
OK "下载任务已入队 gid=$GID"

DONE=""
for i in $(seq 1 60); do
  ST=$(curl -s -m 5 "http://127.0.0.1:6800/jsonrpc" -H 'Content-Type: application/json' \
    -d "{\"jsonrpc\":\"2.0\",\"id\":\"smoke\",\"method\":\"aria2.tellStatus\",\"params\":[\"token:$TOKEN\",\"$GID\",[\"status\",\"completedLength\"]]}" \
    | python3 -c "import json,sys; d=json.load(sys.stdin).get('result',{}); print(d.get('status',''))" 2>/dev/null)
  case "$ST" in
    complete) DONE=1; break ;;
    error|removed) FAIL "下载任务失败 (status=$ST)";;
  esac
  sleep 2
done
[ -n "$DONE" ] || FAIL "下载 2min 未完成"
OK "下载任务 complete"

# 落盘校验（默认下载目录 ~/Downloads/Motrix AI 或 config 指定处）
FOUND=$(find ~/Downloads /usr/share/motrix-ai -name 'smoke-license.txt' -size +1c 2>/dev/null | head -1)
[ -n "$FOUND" ] || { ls -laR ~/Downloads 2>/dev/null | head -20; FAIL "下载文件未落盘"; }
OK "文件落盘: $FOUND ($(stat -c%s "$FOUND") B)"

# 5) 收尾
kill "$APP_PID" 2>/dev/null
sleep 2
echo "=== ✅ SMOKE TEST PASSED: 安装/启动/引擎/下载/落盘 全链路通过 ==="
exit 0
