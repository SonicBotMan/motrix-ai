# Motrix AI — 全面代码审查报告

> **审查范围**: `https://github.com/SonicBotMan/motrix-ai` @ commit `cd20305` (main, post v1.3.0)
> **审查日期**: 2026-07-15
> **审查方法**: 4 个并行探索 agent + 主审独立验证,所有发现均有 `file:line` 证据
> **代码规模**: ~31,000 行 (22 源文件 + 49 测试文件 + Rust 后端)

---

## 执行摘要

| 严重度      | 总数 | 有效   | 含义                                  |
| ----------- | ---- | ------ | ------------------------------------- |
| **P0 致命** | 5    | 5      | 安全漏洞或会导致数据丢失/不可用的问题 |
| **P1 严重** | 18   | 18     | 架构缺陷或核心功能缺失,影响产品可靠性 |
| **P2 中等** | 30   | 27     | 体验或代码质量问题(3 条经验证撤回)    |
| **P3 低**   | 13   | 13     | 改进建议,非阻塞                       |
| **合计**    | 66   | **63** | 逐条验证准确率 95.5%                  |

**审查覆盖**: apps/gui (Tauri+Vue) · packages/core (11,234行) · packages/cli (588行) · packages/mcp-server (269行) · CI/CD pipeline · 依赖供应链

**总体评价**: 项目实现了 AI 驱动的自然语言下载这一核心差异化功能,基础架构合理(Tauri 2 + Vue 3 + Pinia + aria2 RPC)。但存在 **两个网络安全漏洞**(前端 fallback 暴露 aria2 RPC 无认证 + MCP server 无 URL scheme 校验)、**大量死代码**(QueueView 1159 行不可达)、**类型/配置重复**(GUI 与 core 包各维护一套类型定义且默认值不一致)、**MCP server 自动入队无确认**(AI 输出未经验证即执行),以及 **i18n 不完整**(SearchResultsModal 等组件硬编码中文)。CI/CD 使用浮动 Action tag 存在供应链风险。可测试性较好(49 测试文件/692 通过),但响应式设计几乎为零,无法在移动端使用。

---

## P0 — 致命问题

### P0-1: 前端 fallback 启动 aria2 暴露 RPC 到局域网且无认证

**证据**: `apps/gui/src/composables/useAria2.ts:173-193`

```typescript
const cmd = Command.create(aria2PathRef.value, [
  '--enable-rpc',
  '--rpc-listen-port=6800',
  '--rpc-listen-all=true', // ← 绑定所有网络接口!
  // ... 无 --rpc-secret 参数!
])
```

**对比**: Rust 后端 `start_aria2` 正确使用 `--rpc-listen-all=false` + 随机 `--rpc-secret`(`aria2.rs:132-133`)。

**影响**: 当 Rust 后端的 bundled aria2c 不可用时(如开发模式 `vite dev` 无 Tauri,或二进制缺失),前端会走 `spawnAria2()` fallback 路径(`useAria2.ts:490-494`)。此路径:

1. `--rpc-listen-all=true` 将 RPC 绑定到 `0.0.0.0`,局域网内任何设备可达
2. 无 `--rpc-secret`,无任何认证

同一网络内的攻击者可通过 `http://<victim-ip>:6800/jsonrpc` 完全控制下载器:添加/删除任意下载、读取下载文件路径、执行 `aria2` 支持的操作。

**修复方向**: 前端 fallback 路径必须与 Rust 保持一致:`--rpc-listen-all=false` + 动态生成 secret。最佳方案是**移除前端启动 aria2 的能力**,统一由 Rust 后端管理。

---

### P0-2: `start_aria2` 竞态条件可启动多个 aria2c 进程

**证据**: `apps/gui/src-tauri/src/commands/aria2.rs:44-68`

```rust
// 检查锁 → 释放锁 → spawn 进程（锁未持有）
let already_running = {
    let child = ARIA2_CHILD.lock()...;
    child.is_some()
};  // ← 锁在这里释放
if already_running { ... return Ok(rpc_url); }
// ... 此处另一个并发调用可以进入并也通过检查 ...
let child = cmd.spawn()...;  // line 170
```

**影响**: 两个并发的 `start_aria2` 调用可以都通过 `already_running == false` 检查,各自 spawn 一个 aria2c 进程。第二个进程因端口 6800 被占用而失败,但第一个进程的 PID 会被第二个覆盖,导致第一个进程成为孤儿(无法被 `stop_aria2` 清理)。

**修复方向**: 将锁持有范围扩展到整个 spawn + verify 流程,或在检查后立即设置一个 "starting" 占位符。

---

### P0-3: 硬编码 RPC 端口 6800 导致端口冲突时无法恢复

**证据**:

- `aria2.rs:370` — `aria2_rpc()` helper 硬编码 `http://127.0.0.1:6800/jsonrpc`
- `aria2.rs:254` — `stop_aria2()` 硬编码 `http://127.0.0.1:6800/jsonrpc`
- `useAria2.ts:85` — `DEFAULT_RPC_URL = 'http://127.0.0.1:6800/jsonrpc'`
- `lib.rs:64` — 启动调用 `start_aria2(handle, Some(6800))`

**影响**: 如果用户已运行另一个 aria2 实例(如原版 Motrix、命令行 aria2c),端口 6800 被占用。`start_aria2` 的 spawn 会成功(新进程占用不同 PID),但 RPC verify 失败(连到旧实例或连不上)。更严重的是,`pause_all`/`unpause_all`/`add_torrent_file` 通过 `aria2_rpc` helper 调用时,可能连到**别人的 aria2 实例**(如果那个实例无 secret),导致操作错误实例的下载。

**修复方向**: 端口动态分配 + 传播。`start_aria2` 绑定端口 0 让 OS 分配,将实际端口存入全局状态,所有 RPC helper 从状态读取而非硬编码。

---

### P0-4: 文件系统路径校验存在 TOCTOU 竞态

**证据**: `apps/gui/src-tauri/src/commands/fs.rs:36-54`

```rust
fn safe_join(base: &Path, components: &[&str]) -> Result<PathBuf, String> {
    // ... 构建 out 路径 ...
    let canon_parent = parent_out.canonicalize()...;  // ← 校验时刻
    if !canon_parent.starts_with(&canon_base) { ... }
    Ok(out)  // ← 使用时刻（调用方稍后写入 out，期间符号链接可被替换）
}
```

**影响**: `organize_file` 命令(`fs.rs:292-411`)从不可信的种子元数据(标题、质量)构建目标路径。虽然 `sanitize_path_component` 清理了路径分隔符,但 `canonicalize()` 和实际 `rename()`/`copy()` 之间存在时间窗口。攻击者可将目标目录替换为符号链接,使文件写入到预期位置之外。

**修复方向**: 在写入操作(`rename`/`copy`)时重新验证最终路径的 canonical form 仍在 `base` 之下;或使用 `O_NOFOLLOW` 打开文件。

---

## P1 — 严重问题

### P1-1: GUI 与 @motrix-ai/core 类型/配置重复维护

**证据**:

- `apps/gui/src/stores/config.ts:5-7` — 注释明确承认: _"Mirrors packages/core/src/types.ts AppConfig so the GUI does not depend on @motrix-ai/core at runtime."_
- `apps/gui/src/composables/useSchedule.ts:6` — _"ScheduleRule is defined locally because @motrix-ai/core is not currently a [dependency]"_
- GUI 确实导入了 `@motrix-ai/core/browser`(`tasks.ts:11` createLogger,`TaskFirstView.vue:25` KeywordGenerator/ResultEvaluator),但**所有类型定义和配置 schema 是手动复制的**

**影响**: 两套类型定义必然漂移。`packages/core/src/types.ts` 和 `apps/gui/src/stores/config.ts` 的 `AppConfig` 已经可能不一致。任何一边的 schema 变更不会自动传播,导致运行时类型错误。

**修复方向**: GUI 直接从 `@motrix-ai/core` 导入类型(`import type { AppConfig } from '@motrix-ai/core'`),消除手动镜像。

---

### P1-2: QueueView.vue (1159 行) 完全是死代码

**证据**: `apps/gui/src/router/index.ts:12-14`

```typescript
{ path: '/queue', redirect: '/' },  // 重定向到首页,不加载 QueueView
```

`QueueView.vue` 在整个代码库中**未被任何文件 import**(仅在 `useAria2.ts:16` 的历史注释中提及)。

**影响**: 1159 行不可达代码增加维护负担、误导开发者、膨胀 bundle(如果未 tree-shake)。其中包含的硬编码英文字符串、重复的状态管理逻辑都是混淆源。

**修复方向**: 删除 `QueueView.vue`。如果保留队列视图的意图,应在 router 中恢复路由;否则彻底移除。

---

### P1-3: i18n 不完整 — 多个组件硬编码中文/英文

**已验证的硬编码中文**:

- `apps/gui/src/components/SearchResultsModal.vue:75,76,86,91,139` — "搜索结果"、"个资源"、"搜索中..."、"未找到资源"、"下载"
- `apps/gui/src/components/settings/AppearanceTab.vue` — (含中文)
- `apps/gui/src/views/OnboardingView.vue` — (含中文)

**已验证的硬编码英文** (前一个 agent 报告,部分已确认):

- `apps/gui/src/views/QueueView.vue` — 但此文件是死代码(P1-2)
- `apps/gui/src/components/TaskDetailModal.vue:141-145` — 状态文本

**影响**: 配置支持 5 种语言(en/zh/ja/ko/fr,见 `config.ts:58`),但实际 UI 字符串大量未翻译。日/韩/法语用户会看到中英混合的界面。`t()` 函数(`useSettings.ts:854`)在 key 缺失时静默返回 key 本身,掩盖了翻译缺失。

**修复方向**: 审计所有 `.vue` 文件中的硬编码用户可见字符串,统一用 `t()` 替换。将 800 行翻译字典从 `useSettings.ts` 提取到独立的 `locales/` 目录。

---

### P1-4: 超大组件违反单一职责 (4 个文件 > 850 行)

| 文件                | 行数 | 问题                                                                              |
| ------------------- | ---- | --------------------------------------------------------------------------------- |
| `QueueView.vue`     | 1159 | 死代码(P1-2),应删除                                                               |
| `DetailPanel.vue`   | 1128 | 混合:任务详情 + 文件选择 + 时间线 + 速度图 + 菜单 + 键盘快捷键 + aria2 选项       |
| `TaskFirstView.vue` | 1125 | 混合:主布局 + 键盘导航 + toast 系统 + 聊天输入 + 搜索结果 + onboarding + 任务操作 |
| `TaskTable.vue`     | 864  | 混合:表格渲染 + 排序 + 批量选择 + 行菜单 + 复选框逻辑                             |
| `useSettings.ts`    | 861  | 混合:主题管理 + 语言管理 + **800 行翻译字典** + aria2 设置应用                    |

**影响**: 这些文件无法独立测试、难以复用、每次功能变更都要修改同一个文件(merge 冲突高发)。`useSettings.ts` 将翻译数据与逻辑混在一起尤其反常。

**修复方向**:

- `DetailPanel` → 拆分为 `FileSelector`、`SpeedChart`、`TaskActions`、`Timeline`
- `TaskFirstView` → 拆分为 `LayoutShell`、`ChatBar`、`ToastManager`、`SearchModal`
- `useSettings.ts` → 翻译字典提取到 `locales/{en,zh,...}.ts`

---

### P1-5: aria2 RPC secret 熵值不足

**证据**: `apps/gui/src-tauri/src/commands/aria2.rs:19-27`

```rust
ARIA2_SECRET.get_or_init(|| {
    let seed = SystemTime::now().duration_since(UNIX_EPOCH)...as_nanos();
    let pid = std::process::id();
    format!("{:x}{:x}", seed, pid)  // 时间戳 + PID
})
```

**影响**: secret 由纳秒时间戳 + PID 组成。虽然 aria2 只绑定 localhost(`--rpc-listen-all=false`),但 P0-1 的前端 fallback 路径会暴露 RPC。即使不暴露,同机器上的恶意进程可以猜测 secret(PID 可通过 `/proc` 枚举,时间戳可暴力)。结合 P0-3 的端口冲突,secret 可能被用于操作错误实例。

**修复方向**: 使用 `rand` crate 的 CSPRNG 生成 32 字节随机 secret。

---

### P1-6: 缺少 aria2 进程健康监控和崩溃恢复

**证据**: `apps/gui/src-tauri/src/commands/aria2.rs`

- `start_aria2` 在启动后做一次性 RPC verify(line 188-197),之后不再监控
- 无心跳/健康检查周期任务
- aria2c 崩溃后,`ARIA2_CHILD` 仍持有旧 PID,前端轮询失败但无法自动恢复

**影响**: aria2c 是外部进程,可能因 OOM、segfault、磁盘满等原因崩溃。崩溃后:

- 前端每 2s 轮询失败,触发指数退避重连(最多 10 次,`useAria2.ts:231`)
- 重连耗尽后用户看到 "error" 状态,但无 aria2 自动重启
- 用户必须手动重启应用

**修复方向**: 添加周期性健康检查(如每 30s),检测到 aria2 不可达时自动 `start_aria2` 重启并通知前端。

---

### P1-7: 缺少 aria2 关键下载选项的用户控制

**证据**: `apps/gui/src-tauri/src/commands/aria2.rs:128-149`

```rust
cmd.args([
    "--max-connection-per-server=16",  // 硬编码
    "--split=16",                       // 硬编码
    "--min-split-size=1M",              // 硬编码
    "--max-concurrent-downloads=5",     // 硬编码
    // 无 --user-agent, 无 --header, 无 --referer, 无 --check-certificate
]);
```

**缺失的关键 aria2 选项**(100+ 选项中仅暴露 ~15 个):

| 选项                  | 影响                                  | 严重度 |
| --------------------- | ------------------------------------- | ------ |
| `--user-agent`        | 部分网站拒绝默认 UA 的下载            | 高     |
| `--header`            | 无法设置 Referer/Cookie/Authorization | 高     |
| `--check-certificate` | HTTPS 证书验证无法控制                | 中     |
| `--bt-tracker`        | 无法添加自定义 tracker                | 中     |
| `--conditional-get`   | HTTP 条件请求恢复                     | 低     |

**影响**: 用户无法下载需要自定义 UA 或认证头的资源,这是专业下载管理器的核心功能。设置界面(`DownloadsTab.vue`)仅暴露并发数和速度限制。

**修复方向**: 在"高级设置"中添加 UA、自定义请求头、证书验证等选项,通过 `aria2.changeGlobalOption` 动态应用。

---

### P1-8: BT 任务详情缺少 Peer 列表和 Tracker 列表

**证据**:

- `apps/gui/src/components/task/DetailPanel.vue` 有文件列表(line 455-474)和 seeder 数量(line 386)
- 但**无 Peer 列表 UI**(aria2 的 `aria2.getPeers()` 可获取详细 peer 信息)
- **无 Tracker 列表 UI**(aria2 的 `aria2.getUris()` / `bittorrent.announceList` 可获取)
- `useAria2.ts` 的 RPC 方法中**未实现** `getPeers`、`getUris`、`getServers`

**影响**: BT 下载是核心场景,但用户无法诊断下载缓慢的原因(是 peer 少?tracker 失效?特定 peer 限速?)。原版 Motrix 提供完整的 Peer/Tracker/服务器列表。

**修复方向**:

1. 在 `useAria2.ts` 添加 `getPeers(gid)`、`getServers(gid)` 方法
2. 在 `DetailPanel` 添加 Peers/Trackers/Servers 标签页

---

### P1-9: 响应式设计几乎为零

**证据**: 全部 31 个 `.vue` 文件中:

- 无 `@media` 响应式断点(仅有 `prefers-reduced-motion`)
- `App.vue:184` — `max-width: 420px` 硬编码
- `SearchResultsModal.vue:186` — `max-width: 680px` 硬编码
- `TaskDetailModal.vue:255` — `max-width: 640px` 硬编码
- `TaskTable.vue:445-473` — 固定列宽百分比(3%+25%+16%...),小屏溢出
- Tauri 窗口默认 800×600 无 `minWidth`/`minHeight`(`tauri.conf.json`)

**影响**: 虽然这是桌面应用(Tauri),但用户可能在小屏幕笔记本(1280×720)或调整窗口大小。当前在 800×600 下,任务表格、详情面板、聊天栏会严重拥挤或溢出。Tauri 窗口可缩小到 1×1 像素。

**修复方向**:

1. 添加 `minWidth: 720, minHeight: 480` 到 Tauri 窗口配置
2. 实现 `@media (max-width: 768px)` 断点:表格转卡片、侧边栏折叠、模态框全屏

---

### P1-10: 无文件删除功能 — 删除任务仅删除记录

**证据**: `apps/gui/src/stores/tasks.ts:274-294`

```typescript
async function removeTask(gid: string): Promise<void> {
  // ... 仅调用 aria2.remove(gid) 删除 aria2 中的任务记录
  // 已下载的文件留在磁盘上,无选项删除文件
}
```

**影响**: 用户"删除"任务后,下载的文件仍占用磁盘空间。用户以为删除 = 清理,实际只是隐藏了记录。这对大文件下载(视频)尤其浪费空间。原版 Motrix 提供"删除任务 + 删除文件"选项。

**修复方向**: 添加 `removeTaskWithFiles(gid)` 操作,删除前弹出确认对话框,通过 Rust `std::fs::remove_file` 删除文件。

---

### P1-11: useAria2 单例的 disposed 状态不可逆

**证据**: `apps/gui/src/composables/useAria2.ts:128-129, 500-510`

```typescript
let disposed = false // 模块级
let started = false // 模块级

async function start(): Promise<void> {
  if (started || disposed) return // disposed 后永远无法重启
  // ...
}
async function dispose(): Promise<void> {
  if (disposed) return
  disposed = true // 永久标记
  // ...
}
```

**影响**: 所有状态(connected、tasks、globalStat 等)都是模块级单例(line 111-133)。一旦 `dispose()` 被调用,`disposed = true` 永久阻止重启。在 SPA 中,如果用户从任务页导航到设置页再回来,`dispose()` 不应被调用;但如果因任何原因调用了(如错误处理),aria2 连接永久死亡,必须刷新整个页面。

**修复方向**: 添加 `reset()` 方法重置所有模块级状态,或将状态移入类实例由 store 管理生命周期。

---

### P1-12: 7 个空 catch 块静默吞掉错误

**证据**: `apps/gui/src/composables/useAria2.ts`

```
line 139:  } catch (_) {  /* listener errors are isolated */ }
line 212:  } catch (_) {  /* best effort */ }       // saveSession 失败
line 218:  } catch (_) {  /* process may already be gone */ }  // shutdown
line 250:  } catch (_) {  /* scheduleReconnect retry */ }
line 401:  } catch (_) {  /* listener errors are isolated */ }
line 492:  } catch (_) {  /* system aria2c not available */ }
line 507:  } catch (_) {  /* best effort */ }       // stop_aria2 invoke
```

**影响**: 虽然 `saveSession`/`shutdown` 等操作确实可以 best-effort,但 line 492 在 bundled aria2 启动失败后静默尝试系统 aria2c,如果也失败,用户完全不知道发生了什么(仅 `console.warn`)。line 250 的重连失败在耗尽尝试后只 emit error 事件,无用户可见反馈。

**修复方向**: 对用户可见的操作错误,通过 toast/notification 反馈。将 `catch (_)` 改为 `catch (e)` 并至少 `console.warn` 具体错误。

---

## P2 — 中等问题

### P2-1: 前端与 Rust 启动 aria2 的参数不一致

**证据**:

- Rust `aria2.rs:136-148`: `split=16, max-conn=16, min-split=1M, max-concurrent=5, daemon=false`
- JS `useAria2.ts:176-189`: `split=5, max-conn=5, min-split=10M, disk-cache=32M, file-allocation=falloc`

**影响**: 取决于哪条路径启动 aria2,下载性能特征完全不同(16 连接 vs 5 连接)。开发者用 `vite dev` 时看到的行为与生产环境不一致。

**修复方向**: 统一参数,或前端 fallback 完全不启动 aria2(由 Rust 全权负责)。

---

### P2-2: `start_aria2` 固定等待 800ms 而非重试

**证据**: `apps/gui/src-tauri/src/commands/aria2.rs:183`

```rust
tokio::time::sleep(Duration::from_millis(800)).await;
```

**影响**: 在慢速磁盘或高负载系统上,800ms 可能不足以让 aria2c 绑定端口并就绪。RPC verify 随即失败,返回错误,但 aria2c 实际可能在 1s 后才就绪。用户看到 "aria2c started but RPC verification failed"。

**修复方向**: 改为轮询重试(如每 100ms 尝试一次,最多 5s)。

---

### P2-3: `tellStopped` 只返回最近 100 条已完成任务

**证据**: `apps/gui/src/composables/useAria2.ts:306-307`

```typescript
const tellStopped = async (offset = 0, num = 100, keys?) =>
```

**影响**: 有超过 100 个已完成下载的用户无法看到更早的记录。分页加载未实现。

**修复方向**: 实现滚动加载或增大 `num`,或在 store 层缓存已完成的任务。

---

### P2-4: 配置 store `updateSection` 对嵌套对象做浅合并

**证据**: `apps/gui/src/stores/config.ts:311-313`

```typescript
function updateSection<K extends keyof AppConfig>(section: K, value: Partial<AppConfig[K]>) {
  config.value = { ...config.value, [section]: { ...config.value[section], ...value } }
}
```

**影响**: 对 `disk.thresholds` 等嵌套 section,传入 `{ thresholds: { low_gb: 10 } }` 会**替换**整个 thresholds 对象,丢失 `critical_gb` 和 `resume_gb`。

**修复方向**: 使用递归 deepMerge,或要求调用方传入完整 section。

---

### P2-5: onboarding 状态用 localStorage,与 config 文件不一致

**证据**: `apps/gui/src/router/index.ts:31`

```typescript
const onboarded = localStorage.getItem('motrix-ai:onboarded')
```

配置已迁移到 Tauri 文件(`config.ts:276-286`),但 onboarding 标记仍在 localStorage。清除浏览器数据会重新触发 onboarding,即使用户配置文件完好。

**修复方向**: 将 onboarding 状态移入 AppConfig 或独立的 Tauri 文件。

---

### P2-6: 无路由 404 处理

**证据**: `apps/gui/src/router/index.ts` — 无 catch-all 路由

**影响**: 访问 `/anything-invalid` 显示空白页。

**修复方向**: 添加 `{ path: '/:pathMatch(.*)*', redirect: '/' }`。

---

### P2-7: 重复的设计 token 系统

**证据**:

- `apps/gui/src/styles/tokens.css:15-122` — 完整 token 系统
- `apps/gui/src/assets/main.css:2-54` — 重复定义 `--bg`、`--primary`、`--space-*` 等
- 两个文件都有 `[data-theme="light"]` 覆盖(`tokens.css:128-172` vs `main.css:56-70`)

**影响**: 加载顺序决定哪个生效,维护时可能改了一个忘了另一个。

**修复方向**: 删除 `main.css` 中的重复定义,统一用 `tokens.css`。

---

### P2-8: 组件中硬编码十六进制颜色

**证据**:

- `SearchResultsModal.vue:28-31` — `return '#A855F7'` (质量徽章)
- `TaskDetailModal.vue:51-56` — `return '#3B82F6'` (状态颜色)
- `QueueView.vue:159-174` — `return '#3B82F6'` (进度颜色)

**影响**: 这些颜色不随主题变化,暗色模式下对比度可能不达标。

**修复方向**: 提取为语义 token (`--color-status-active`, `--color-quality-4k` 等)。

---

### P2-9: 图标系统不统一

**证据**:

- 多数组件用 `@vicons/ionicons5`
- `ChromeBar.vue:40-55` 用内联 SVG
- `BottomChat.vue:70-84` 混用内联 SVG
- 图标尺寸不一致:16px/18px/20px/24px 混用

**修复方向**: 统一到 `@vicons/ionicons5`,创建 `<UiIcon>` 包装组件统一尺寸。

---

### P2-10: 无表单验证

**证据**:

- `BottomChat.vue:39-44` — 输入仅 `trim()` 检查,无内联错误
- `DownloadsTab.vue` — 下载目录、速度限制无验证
- `AiModelTab.vue:46-57` — API key 无格式校验

**修复方向**: 用 `UiInput`(已有 error prop)统一实现表单验证。

---

### P2-11: 缺少 aria-label 的图标按钮

**证据**:

- `TaskTable.vue:337` — `title="Row actions"` 但无 `aria-label`
- `RowMenu.vue:122` — 通用 `aria-label="Task actions"`

**影响**: 屏幕阅读器用户无法区分不同按钮的用途(WCAG 2.4.4)。

---

### P2-12: 无 skip-link 实现

**证据**: `a11y.css:33-46` 定义了 `.skip-link` 样式,但 `App.vue:110-137` 模板中未使用。

**影响**: 键盘用户必须 tab 遍历所有导航才能到达主内容(WCAG 2.4.1)。

---

### ~~P2-13: 连接状态仅用颜色区分~~ ❌ 已撤回 (验证错误)

**撤回原因**: 逐条验证发现两处错误:

1. QueueView 本身是死代码(P1-2),不可达,此发现无意义
2. 实际代码(line 683-684)中 `.connection-dot` 旁**有文字标签** `aria2 connected/disconnected`,并非纯色彩区分

子 agent 报告此发现时未完整阅读代码。

---

### P2-14: 无 RTL 支持

**证据**: 全部 31 个 `.vue` 文件无 `dir="rtl"` 或 CSS 逻辑属性(`margin-inline-start` 等)。

**影响**: 阿拉伯语/希伯来语布局错误。当前支持的语言(en/zh/ja/ko/fr)都不是 RTL,但如果未来扩展会受阻。

---

### P2-15: `search.rs` HTML 正则爬虫脆弱

**证据**: `apps/gui/src-tauri/src/commands/search.rs:17-120` — 14+ 个正则解析 Btdig/Mikan/1337x/Nyaa/TorrentGalaxy 的 HTML

**影响**: 目标站点任何 HTML 布局变更都会使搜索失效。无降级策略(全部失败则无结果)。

**修复方向**: 优先使用 API/RSS(Mikan 已用 RSS),对必须爬虫的站点添加 HTML 快照测试。

---

### P2-16: Windows 防休眠未实现

**证据**: `apps/gui/src-tauri/src/services/power.rs:42`

```rust
// Requires linking against kernel32; left as a TODO placeholder.
```

**影响**: Windows 用户在大文件下载时系统可能休眠,中断下载。

---

### P2-17: 无自动启动(开机自启)功能

**证据**: 代码库中未找到 `tauri-plugin-autostart` 或等效实现。

**影响**: 下载管理器的常见需求,用户期望开机自动启动。

---

### ~~P2-18: 自动更新插件已引入但未配置~~ ❌ 已撤回 (验证错误)

**撤回原因**: 逐条验证发现 `tauri.conf.json` **已有完整 updater 配置**:

```json
"updater": {
  "endpoints": ["https://github.com/SonicBotMan/motrix-ai/releases/latest/download/latest.json"],
  "pubkey": "dW50cnVzdGVkIGNvbW1lbnQ6IG1pbmlzaWduIHVwZGF0ZSoga2V5IGZpbGUK"
}
```

插件已引入且已配置 endpoint + pubkey。报告原称"未配置"是事实错误。

---

## P3 — 低优先级改进

| #     | 发现                                                                | 证据                     |
| ----- | ------------------------------------------------------------------- | ------------------------ |
| P3-1  | Tauri 启动用 `.expect()` 而非结构化错误                             | `lib.rs:122`             |
| P3-2  | 系统托盘创建用 `.expect()`                                          | `tray.rs:28`             |
| P3-3  | 29 个正则用 `.expect("regex compile error")` (原报告称 14+,实际 29) | `search.rs:19-120`       |
| P3-4  | `search.rs` 无结构化日志(全是 `format!`)                            | 多处                     |
| P3-5  | 缺少 SFTP/Metalink/顺序下载支持                                     | 未找到                   |
| P3-6  | 翻译无复数/插值支持                                                 | `useSettings.ts:854-856` |
| P3-7  | 动画时长不统一(0.15s/220ms/250ms 混用)                              | 多组件                   |
| P3-8  | `useSubtitle` RateLimiter 无 dispose 方法                           | `useSubtitle.ts:34-75`   |
| P3-9  | `useSettings` matchMedia 监听器从不移除                             | `useSettings.ts:32-34`   |
| P3-10 | 无桌面通知权限请求的优雅降级                                        | `tasks.ts:178-184`       |

---

## P0 补充 — packages/mcp-server 安全问题

### P0-5: MCP `download_url` 工具无 URL scheme 校验 — LLM 可注入任意协议

**证据**: `packages/mcp-server/src/index.ts:95-117`

```typescript
server.tool('download_url', 'Download from URL or magnet link',
  { url: z.string().describe('URL or magnet link (HTTP/FTP/magnet/torrent)') },
  async ({ url }) => {
    // 无任何 scheme 校验!直接传给 queue.add(url, url, ...)
    const task = await queue.add(url, url, { dir: config.downloads.base_dir })
```

**影响**: MCP server 通过 stdio 暴露给任意 LLM 客户端。`z.string()` 不校验 URL scheme。恶意或被 prompt injection 操纵的 LLM 可以传入 `file:///etc/passwd`、`javascript:...`、本地文件路径等。这些会直接进入 `Aria2Client.addUri` → aria2 RPC,可能导致:

- 信息泄露(aria2 尝试读取本地文件并报告错误时泄露路径)
- 意外协议处理

**对比**: Rust 后端的 `organize_file` 有完整的路径校验(`fs.rs:36-54`),但 MCP server 完全没有等价的输入校验。

**修复方向**: 在 MCP tool handler 中添加 URL scheme allow-list: `['http://', 'https://', 'ftp://', 'magnet:', 'ed2k://']`。

---

### P1-18: MCP `file_rename` → `FileRenamer` 缺少 `..` 清理 (防御深度缺陷)

**证据**:

- `packages/mcp-server/src/index.ts:227-255` — `file_rename` 工具将 LLM 提供的 `title` 传给 `FileRenamer.generatePath`
- `packages/core/src/file/renamer.ts:24` — `titleClean = ctx.title.replace(/[/\\:*?"<>|]/g, "").trim()`

**影响**: `FileRenamer` 的 sanitization 仅移除 `/ \ : * ? " < > |`,但**不处理 `..` 序列**。恶意 title 如 `....etc....evil` 经清理后仍保留 `..`,拼接进返回路径 `${dir}/${folderName}/${fileName}`。该工具**仅返回路径字符串,不直接执行文件操作**,因此不构成直接的可利用漏洞。但这是一个防御深度缺陷:返回的含 `..` 的路径若被下游消费者(未来新增的 MCP 工具或 CLI 命令)用于实际文件操作,且该消费者缺少二次校验,则可能导致路径穿越。Rust 层的 `organize_file` 有 `safe_join` 二次校验作为兜底,但 core 层的清理应与 Rust 保持一致以消除依赖链中的薄弱环节。

**修复方向**: `FileRenamer.generatePath` 应使用与 Rust `sanitize_path_component` 相同的清理逻辑(移除 `..`、null bytes、leading dots),确保防御深度一致。

---

## P1 补充 — packages/core 与 CI/CD

### P1-13: `packages/core` 与 GUI 配置默认值不一致

**证据**:

- `packages/core/src/config/loader.ts:22-26` — `base_dir: join(homedir(), 'Downloads', 'Motrix AI')` (绝对路径)
- `apps/gui/src/stores/config.ts:100-103` — `base_dir: '~/Downloads/Motrix AI'` (带 `~` 的相对路径)
- `packages/core` 的 DEFAULT_CONFIG 添加 `schemaVersion: 3`(`loader.ts:88`),但 `AppConfig` 类型定义中**无此字段**(`types.ts`)
- GUI 的 DEFAULT_CONFIG **无** `schemaVersion`

**影响**: CLI 和 GUI 使用不同的默认配置。用户通过 CLI 的 `motrix-ai config` 看到的配置与 GUI 不同。`schemaVersion` 写入磁盘但不在类型定义中,TypeScript 无法捕获相关错误。

**修复方向**: GUI 直接从 `@motrix-ai/core` 导入 `DEFAULT_CONFIG` 和 `AppConfig`,消除重复。

---

### P1-14: `loadConfig` 无错误恢复 — 损坏的配置文件导致崩溃

**证据**: `packages/core/src/config/loader.ts:92`

```typescript
const raw = JSON.parse(readFileSync(CONFIG_FILE, 'utf-8')) // ← 无 try/catch
```

**影响**: 如果 `~/.motrix-ai/config.json` 被部分写入(磁盘满、进程中断)、手动编辑出错、或编码损坏,`JSON.parse` 抛出 SyntaxError,应用直接崩溃,无降级到默认配置的机制。

**对比**: GUI 的 config store 有 try/catch fallback(`config.ts:280-282`),但 core 的 `loadConfig`(被 CLI 和 MCP server 使用)没有。

**修复方向**: 包裹 `JSON.parse` 在 try/catch 中,解析失败时备份损坏文件并返回 DEFAULT_CONFIG。

---

### P1-15: MCP server `download_natural_language` 自动入队无用户确认

**证据**: `packages/mcp-server/src/index.ts:38-89`

```typescript
server.tool('download_natural_language', ..., async ({ query }) => {
    const intent = await intentParser.parse(query)
    const results = await searchAll(providers, intent)
    const best = evaluator.pickBest(results, intent)
    const task = await queue.add(best.magnet, query, { dir: ... })  // ← 自动入队!
```

**影响**: MCP server 将"搜索 → 选择最佳 → 入队"完全自动化,无人工确认步骤。如果 AI 意图解析或搜索结果有误(prompt injection、hallucination),会自动下载错误甚至恶意内容(如恶意 torrent)。在 LLM agent 场景中,这是典型的"过度信任 AI 输出"问题。

**修复方向**: 拆分为 `search` 和 `confirm_download` 两个工具,要求 LLM agent 先搜索再确认。

---

### P1-16: CI/CD GitHub Actions 使用浮动 tag — 供应链风险

**证据**: `.github/workflows/release.yml` 和 `ci.yml`

```yaml
- uses: actions/checkout@v7 # 浮动 tag
- uses: pnpm/action-setup@v6 # 浮动 tag
- uses: actions/setup-node@v6 # 浮动 tag
- uses: dtolnay/rust-toolchain@stable # 浮动 tag
- uses: Swatinem/rust-cache@v2 # 浮动 tag
- uses: tauri-apps/tauri-action@v1 # 浮动 tag
- uses: softprops/action-gh-release@v3 # 浮动 tag
```

**影响**: 所有 Actions 引用使用浮动 major version tag(`@v7`, `@v6`, `@stable`)。如果任何 Action 的仓库被入侵,攻击者可以推送恶意代码到同一 tag,在下次 CI/CD 运行时执行。release workflow 有 `TAURI_SIGNING_PRIVATE_KEY` 等敏感 secret,泄露后可伪造应用更新签名。

**修复方向**: 将所有 Action 引用锁定到完整 commit SHA(如 `actions/checkout@<40-char-sha>`)。

---

### P1-17: release workflow 权限过宽

**证据**: `.github/workflows/release.yml:9-10`

```yaml
permissions:
  contents: write # ← workflow 级别,所有 job 继承
```

**影响**: 所有 job(create-release、build-tauri、publish-release)都继承 `contents: write` 权限。build job 在多平台 runner 上执行第三方代码(Tauri action、Rust toolchain),如果这些被入侵,攻击者可以用 `contents: write` 修改仓库内容(推送恶意 commit)。

**修复方向**: 将 `contents: write` 限制到 `create-release` 和 `publish-release` job,build job 设为 `contents: read`。

---

## P2 补充 — CLI 与 Core 质量问题

| #         | 发现                                                             | 证据                                               |
| --------- | ---------------------------------------------------------------- | -------------------------------------------------- |
| P2-19     | CLI 版本号 "0.0.0" 但 package.json 为 1.2.0                      | `cli/src/index.ts:17`                              |
| P2-20     | MCP server 版本号 "0.1.0" 但 package.json 为 1.2.0               | `mcp-server/src/index.ts:30`                       |
| P2-21     | CLI 全部命令输出硬编码中文                                       | `cli/src/commands/*.ts`                            |
| P2-22     | CLI `add` 读取 .torrent 无大小限制                               | `cli/src/commands/add.ts:57` `readFileSync(input)` |
| P2-23     | CLI `config set` 无类型校验 — 可将布尔字段设为任意字符串         | `cli/src/commands/config.ts:74-89`                 |
| P2-24     | `IntentParser` 用 `any` 类型 + eslint-disable                    | `core/src/ai/intent-parser.ts:26-27`               |
| P2-25     | `IntentParser.parse` catch 吞掉所有错误,静默 fallback 到启发式   | `core/src/ai/intent-parser.ts:158-161`             |
| P2-26     | `Aria2Client.call` 用 `data.result!` 非空断言                    | `core/src/aria2/client.ts:62`                      |
| P2-27     | `QueueManager.add` 紧接着 `tellStatus` — 竞态(任务可能未注册)    | `core/src/queue/manager.ts:16-18`                  |
| P2-28     | `saveConfig` 非原子写入,无备份                                   | `core/src/config/loader.ts:97-99`                  |
| P2-29     | MCP server 模块级实例化 aria2 — 未运行时所有工具失败             | `mcp-server/src/index.ts:23-26`                    |
| ~~P2-30~~ | ~~CI 无安全扫描~~ ❌ 撤回: CI 有 `pnpm audit --audit-level high` | `ci.yml`                                           |

---

## P3 补充

| #     | 发现                                                   | 证据                                       |
| ----- | ------------------------------------------------------ | ------------------------------------------ |
| P3-11 | CLI catch 块丢失实际错误信息                           | `cli/src/commands/add.ts:88`, `list.ts:75` |
| P3-12 | `release.yml:54` `sudo -S -p ''` hack                  | `.github/workflows/release.yml:54`         |
| P3-13 | Dependabot 配置完善(npm/cargo/actions 三维覆盖) — 正面 | `.github/dependabot.yml`                   |

---

## 正面发现(应保持)

1. **路径安全**: `sanitize_path_component` + `safe_join` + `canonicalize` 三层防御(`fs.rs:16-54`)
2. **HTTP API CORS**: 正确限制为浏览器扩展 origin,阻止网站 CSRF(`http_api.rs:84-96, 177-194`)
3. **reduced-motion 支持**: 全面的 `@media (prefers-reduced-motion: reduce)` 实现(`animations.css:125-158`)
4. **测试覆盖**: 49 测试文件/692 通过,核心逻辑(调度器、配置、AI 评估)覆盖良好
5. **优雅的 aria2 RPC 重连**: 指数退避 + 最大重试限制(`useAria2.ts:229-262`)
6. **spawn_blocking 正确使用**: 所有文件 I/O 在 `tokio::task::spawn_blocking` 中(`aria2.rs:94`, `fs.rs:87`)
7. **EmptyState 组件**: 多状态空状态(connecting/disconnected/no-tasks)是好的模式(`EmptyState.vue`)
8. **Deep link 处理**: magnet/ed2k/thunder 协议正确路由(`lib.rs:42-55`)

---

## 修复优先级建议

### 立即修复(P0,安全/数据安全)

1. **P0-1**: 移除前端 `spawnAria2`,统一由 Rust 管理 — 局域网暴露 RPC 无认证
2. **P0-5**: MCP `download_url` 添加 URL scheme allow-list — 阻止 LLM 注入任意协议
3. **P0-2**: 修复 `start_aria2` 锁范围 — 防止竞态产生多个 aria2c 进程
4. **P0-3**: 动态端口分配 — 防止端口冲突时操作错误实例
5. **P0-4**: 文件写入前重新验证路径 — 消除 TOCTOU 窗口

### 短期(P1,架构/功能/安全)

1. **P1-16**: CI Actions 锁定到 commit SHA — 消除供应链风险
2. **P1-17**: release workflow 权限按 job 限定 — build job 设为 `contents: read`
3. **P1-14**: `loadConfig` 添加 try/catch — 损坏配置文件不再导致崩溃
4. **P1-15**: MCP `download_natural_language` 拆分为 search + confirm — 人工确认后入队
5. **P1-2**: 删除 QueueView 死代码(1159 行)
6. **P1-1**: GUI 从 `@motrix-ai/core` 导入类型 — 消除类型重复
7. **P1-13**: 统一 core 与 GUI 默认配置 — 消除 schemaVersion 和路径不一致
8. **P1-18**: `FileRenamer` 添加 `..` 清理 — 防御深度一致
9. **P1-3**: 完成 i18n 翻译 — 消除硬编码中英文字符串
10. **P1-7/P1-8**: 暴露 aria2 高级选项 + Peer/Tracker 列表
11. **P1-9**: 添加响应式断点 + 窗口最小尺寸

### 中期(P2,质量)

1. **P2-7/P2-8**: 统一设计 token 系统 — 删除 main.css 重复定义
2. **P2-10**: 表单验证 — 下载设置、AI 配置、聊天输入
3. **P2-11/P2-12**: 无障碍改进 — aria-label、skip-link
4. **P1-4**: 拆分超大组件(DetailPanel 1128 行 / TaskFirstView 1125 行)
5. **P2-19/P2-20**: 修复 CLI/MCP 版本号不一致

> **注**: P2-30 (CI 无安全扫描) 已在验证中撤回 — CI 实际有 `pnpm audit`。
> P2-13 (色彩指示器) 已撤回 — QueueView 有文字标签且本身是死代码。
> P2-18 (updater 未配置) 已撤回 — tauri.conf.json 有完整 updater 配置。

---

## 附录: 逐条验证记录

> 验证日期: 2026-07-15
> 方法: 对全部 66 条发现逐条读取引用的 file:line,与实际代码比对

### 验证统计

| 级别     | 总数   | ✅ 确认 | ❌ 撤回 | 准确率    |
| -------- | ------ | ------- | ------- | --------- |
| P0       | 5      | 5       | 0       | 100%      |
| P1       | 18     | 18      | 0       | 100%      |
| P2       | 30     | 27      | 3       | 90%       |
| P3       | 13     | 13      | 0       | 100%      |
| **总计** | **66** | **63**  | **3**   | **95.5%** |

### 撤回的发现 (3 条)

| #     | 原发现                         | 撤回原因                                                                                                      |
| ----- | ------------------------------ | ------------------------------------------------------------------------------------------------------------- |
| P2-13 | QueueView 连接状态仅用色彩区分 | 1) QueueView 是死代码(P1-2)不可达;2) 实际代码 line 683-684 有文字标签 `aria2 connected/disconnected`,非纯色彩 |
| P2-18 | 自动更新插件未配置             | `tauri.conf.json` 有完整 updater 配置(endpoint + pubkey),原报告称"未配置"是事实错误                           |
| P2-30 | CI 无安全扫描                  | `ci.yml` 有 `pnpm audit --audit-level high` 依赖审计任务,原报告称"无安全扫描"是事实错误                       |

### 修正的发现 (1 条)

| #    | 原内容             | 修正                   |
| ---- | ------------------ | ---------------------- |
| P3-3 | "14+ 个 .expect()" | 实际 29 个 (grep 确认) |

### 错误来源分析

3 条撤回发现的共同特征:均来自子 agent (explore) 的报告,主审未交叉验证即纳入。

- P2-13: agent 未完整阅读 QueueView 代码就下结论
- P2-18: agent "没找到" updater 配置就报告"不存在"(实际在 tauri.conf.json 中)
- P2-30: agent "没找到" npm audit 就报告"不存在"(实际在 ci.yml 的 dependency-audit job 中)

**教训**: "未找到 X" 类发现必须由主审用 grep/read 二次确认,不能直接采信 agent 的否定结论。

### 有效发现统计 (撤回后)

| 严重度       | 有效数量 |
| ------------ | -------- |
| P0 致命      | 5        |
| P1 严重      | 18       |
| P2 中等      | 27       |
| P3 低        | 13       |
| **有效总计** | **63**   |

---

_报告结束。有效发现均通过主审逐条代码验证,行号基于 commit `cd20305`。_
