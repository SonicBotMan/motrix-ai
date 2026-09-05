# Motrix AI 修复与迭代方案（v1.6.1 → v2.0 可市场版本）

> 依据 2026-09-05 两轮独立审计（基础设施层 + 功能层活体验证）编制。
> 原则：**先让"装上就能用"，再谈"用起来惊艳"**。每个任务带验收标准（DoD），不达标不合并。

---

## 现状基线（审计实测数据）

| 维度   | 数据                                                                                                  |
| ------ | ----------------------------------------------------------------------------------------------------- |
| 发布包 | Windows 缺引擎且产物错乱（已修 gitignore，PR#92）；macOS 无签名；Arch 无包（PR#92 已建链路）          |
| 搜索   | 5 provider 可用 2（nyaa/mikan），1337x URL 模板 bug 必 404，btdig 反爬页，TG 不可达；**全链路无代理** |
| AI     | 默认 opencode（需外部 server，开箱死）；anthropic provider 端点映射错误（必失败）；无代理             |
| 字幕   | GUI 走 OpenSubtitles（需用户自备 key）；core 的 shooter 解析器与真实 API 字段不匹配（恒空）           |
| i18n   | 16 个在用 key 未定义；主视图 TaskFirstView 零 t() 调用；53+ 死 key                                    |
| 死功能 | prevent_sleep/allow_sleep/get_aria2_log/start_http_api 前端零调用                                     |
| 测试   | 702 全绿但全在 core 纯逻辑；GUI composables 覆盖 6.5%；**零 e2e、零真实网络回归**                     |

**功能可用率现状估计：~35%（安装/引擎 0，搜索 2/5，AI 0，字幕 0.5，基础任务管理 1）**

---

## Phase 0：止血（0.5 天，v1.6.2 hotfix）

目标：合并 PR#92（Arch 打包 + gitignore + 引擎回退），打 v1.6.2，拿到第一个"真能装"的 Arch 包，同时验证 Arch CI 链路。

- [ ] 合并 PR#92，触发 release workflow，盯 `build-arch-pkg` job 首跑
- [ ] 解包验证 v1.6.2：pkg 内含 .PKGINFO/.desktop/图标/引擎或 aria2 依赖声明
- [ ] 在 Arch 虚拟机（或 docker archlinux）装一遍：`pacman -U` → 启动 → 引擎起 → 手动下个文件 → 断网恢复
- **DoD**：Arch 用户从 pacman 到完成一次真实下载，全程无手工步骤

## Phase 1：功能可用性 P0（2–3 天，v1.7.0 核心）

### 1.1 全链路代理支持（搜索+AI+字幕，一切境外功能的前提）

- `packages/core/src/config/schema.ts`：新增 `network.proxy: { mode: 'none'|'system'|'manual', url: string }`（defaults.ts/migrations.ts 同步）
- Rust `commands/mod.rs::build_http_client`：接受 proxy 参数（reqwest `.proxy()`），所有调用点（search_proxy / parse_with_llm / opensubtitles / download_subtitle）注入
- 前端 `SettingsView → SystemTab`：代理模式 + URL 表单（含"测试连通性"按钮，调新增 `test_proxy` 命令）
- aria2 侧：`configured_proxy_args()` 已存在——确认其读同一 config 字段（消除双轨）
- TS core（cli/mcp 路径）：fetch 走 undici EnvHttpProxyAgent + 显式 proxy 配置
- **DoD**：设置代理为 `http://<mihomo>:7890` 后，btdig/1337x/TG/anthropic 在受限网络下全部出结果；不用代理时行为与现在一致

### 1.2 搜索链路修复

- `search.rs`：1337x URL 模板补 `/{section}/` 段（`/search/{q}/all/last-seeders/`）
- Provider 注册表化：每个 provider 有 `{ id, name, enabled, health }`，health = 最近一次探测（页面可达 + 解析出 ≥1 行）
- 设置 UI：provider 开关 + 状态点（绿=可用/灰=未测/红=不可用）；默认只启用探测通过的
- btdig：先试 JSON API（若站点提供）替代 HTML 正则；否则标记为"实验性"
- **活体回归脚本** `scripts/probe-providers.mjs`（Node，无依赖）：抓各站真实页面跑同一套正则，输出矩阵——进 CI（weekly 定时 + 手动触发），失败只告警不阻断（站点波动是正常的）
- **DoD**：probe 脚本在开发机+CI 跑通；GUI 里每个启用的 provider 都能返回真实结果；死源不再展示

### 1.3 AI 链路修复

- `useOpenCode.ts`：anthropic 端点改为 `/v1/messages` 正确格式（或本期直接下线 anthropic 选项，保留 openai/ollama/custom 三类 OpenAI 兼容）
- 默认 provider 改为显式 `'none'`（= 纯启发式），UI 常驻徽标："AI 模式：启发式 / 已连接 LLM"
- LLM 解析失败时 toast 报错（现在静默回退，用户以为 AI 在工作）
- **DoD**：配一个真实 OpenAI 兼容端点（含 ollama 本地）后，输入"下载 xxx"能观察到真实 LLM 解析（日志可见）；不配置时 UI 明示启发式

### 1.4 发布管线加固（防"假产物"再发生）

- macOS：CI secrets 加 Apple Developer ID + 公证（无证书期：对 resources/bin 引擎做 ad-hoc `codesign -s -` + 文档写明右键打开步骤）
- Windows：把 `motrix-ai-engine.exe`（~10MB）提交入库（PR#92 的 gitignore 已放行）——来源：官方 aria2 Windows 构建改名
- 新增 **artifact-verification job**：解包每个产物，断言 ① 平台正确（Windows 包里没有 MacOS/ 目录）② 引擎二进制存在且魔数正确 ③ PKG 结构完整。任何断言失败 release 标记为 failed
- **DoD**：连续两个 tag 的产物全部通过 artifact-verification

## Phase 2：产品完整度 P1（3–4 天，v1.7.0 收尾）

### 2.1 字幕

- 修 `core/subtitle/shooter.ts` 解析器对齐真实 API（`Files[].Ext/Link`，Link 为下载 URL 而非 base64）——已拿到真实响应样本
- GUI 字幕链默认走 shooter（免 key），OpenSubtitles 保留为可选增强（有 key 时多一路）
- subhd.tv 活体验证（同 probe 脚本模式）
- **DoD**：下完一部带年份的电影，无 key 自动挂上中文字幕（mikan/nyaa 源）

### 2.2 i18n 补全

- 补 16 个缺失 key × 5 语言；TaskFirstView/DetailPanel/TaskRow/Toast 接入 t()
- 清 53+ 死 key
- `scripts/i18n-check.mjs` 进 CI：静态提取所有 `t('key')` 与 strings.ts 定义对账 + 每语言非空断言
- **DoD**：切 5 种语言，全 UI 无原始 key、无空白、无中英混杂

### 2.3 睡眠防止 + 死代码

- SystemTab 加"下载时防止系统睡眠"开关 → `prevent_sleep`/`allow_sleep`（下载开始/结束事件驱动，不是开关驱动——aria2 有任务时才阻止）
- `get_aria2_log`：接到"引擎状态"设置区（启动失败时显示日志尾部——最近 commit 的 UI 错误展示真正落地）
- `start_http_api`：文档化保留（供 CLI/MCP 本地集成），UI 不加
- **DoD**：Mac 合盖测试：有下载任务时不睡，暂停/完成后 N 分钟内睡

## Phase 3：质量体系 P2（4–5 天，v1.8）

### 3.1 E2E 测试

- Playwright + Tauri driver（tauri.conf 加 `driver` feature）：
  - 启动 → onboarding 完成 → 持久化（重启不重出）
  - 引擎启动 → 真实下载一个小文件（CI 用 raw.githubusercontent 固定资源）→ 进度 → 完成 → 归类落盘
  - 搜索 modal 打开 → provider 列表 → 关闭（不联网，mock 或探测跳过）
  - 设置保存 → 重启读回
- ubuntu job 每次 PR 跑；mac/windows nightly
- **DoD**：PR 必须 e2e 绿

### 3.2 GUI 单测

- composables 层（useAria2/useDownloadPipeline/useSearch/useSubtitle/useSchedule）mock Tauri invoke 后单测，目标行覆盖 40%
- **DoD**：vitest coverage 断言 GUI ≥ 40%（恢复当年被降掉的阈值的一半）

### 3.3 本地健康度统计（无遥测，尊重 PRIVACY.md）

- config 旁挂 `stats.json`：引擎启动成功率、provider 成功率、LLM 解析成功率——"关于本页"可看可清
- **DoD**：跑一周后用户能看到自己的搜索/AI 成功率，为迭代提供数据

## Phase 4：发布与运营

| 版本   | 内容                                                                            | 渠道                                                     |
| ------ | ------------------------------------------------------------------------------- | -------------------------------------------------------- |
| v1.6.2 | Phase 0                                                                         | GitHub Release（Arch PKG 首发）                          |
| v1.7.0 | Phase 1+2                                                                       | Release + AUR 首次提交 + 文档更新（README 宣称对齐现实） |
| v1.8   | Phase 3                                                                         | 同上，质量门槛固化进 CI                                  |
| v2.0   | 视数据决定：BT 详情面板/Peers、任务搜索、多账号、移动端（browser ext 已有雏形） |                                                          |

- AUR 提交：用 `packaging/arch/PKGBUILD`，维护者响应 48h SLA
- README 重写：宣称只写"已验证可用"的功能；provider 可用性明示依赖网络环境
- AUDIT-REPORT.md 状态列更新（P1-3 i18n / P1-9 响应式 等逐项 close）

## 风险登记

| 风险                                | 概率 | 缓解                                                                      |
| ----------------------------------- | ---- | ------------------------------------------------------------------------- |
| btdig/TG 彻底死（JS 渲染/反爬升级） | 高   | provider 可关可替，probe 脚本早发现；备选加国内可达源（mikan 已覆盖动漫） |
| Apple 开发者账号未购（$99/年）      | 中   | 过渡期 ad-hoc 签名 + 清晰安装文档；v1.8 前必须解决                        |
| 活体回归 CI 抖动误报                | 高   | 只告警不阻断；失败需人工二次确认                                          |
| 代理配置把用户流量引错              | 低   | 代理仅作用于 5 个白名单出站点，UI 明示"仅用于搜索/AI/字幕"                |
| 单人力瓶颈                          | 中   | 按 Phase 交付：v1.6.2 先出（止血），不追求大版本一次做完                  |

## 执行顺序（可直接开工）

1. **今天**：合并 PR#92 → 打 v1.6.2 → 验 Arch 包（Phase 0）
2. **明天-后天**：1.1 代理 + 1.2 搜索 + 1.3 AI（同一个 v1.7 分支并行做，互不依赖）
3. **第 4-6 天**：1.4 发布管线 + 2.1-2.3（Phase 2）
4. **下周一**：v1.7.0 tag + AUR
5. **下下周**：Phase 3 质量体系 → v1.8
