# Motrix AI 修复与迭代方案（Arch-first 路线）

> 依据 2026-09-05 两轮独立审计（基础设施层 + 功能层活体验证）编制。
> **平台战略：以 Arch Linux 为唯一主线平台**（2026-09-05 用户决策）。macOS/Windows 产物在 v2.0 前不纳入发布承诺。
> 原则：**先让"装上就能用"，再谈"用起来惊艳"**。每个任务带验收标准（DoD），不达标不合并。

---

## 现状基线（审计实测数据）

- 功能可用率现状估计：**~35%**（安装/引擎 0，搜索 2/5，AI 0，字幕 0，基础任务管理 1）
- 搜索：5 provider 可用 2（nyaa/mikan）；1337x URL 模板 bug 必 404；btdig 反爬页；TG 不可达；**全链路无代理**
- AI：默认 opencode（需外部 server，开箱死）；anthropic provider 端点映射错误（必失败）；无代理
- 字幕：GUI 走 OpenSubtitles（需用户自备 key）；core 的 shooter 解析器与真实 API 字段不匹配（恒空）
- i18n：16 个在用 key 未定义；主视图 TaskFirstView 零 t() 调用；53+ 死 key
- 死功能：prevent_sleep / allow_sleep / get_aria2_log / start_http_api 前端零调用
- 测试：702 全绿但全在 core 纯逻辑；GUI composables 覆盖 6.5%；零 e2e、零真实网络回归
- 发布：Arch 打包链路已建（PR#92）；artifact-verification 尚缺

---

## Phase 0：止血（0.5 天，v1.6.2）

合并 PR#92（Arch 打包 + gitignore + 引擎三级回退），打 v1.6.2，拿到第一个"真能装"的 Arch 包，验证 Arch CI 链路。

- [ ] 合并 PR#92，触发 release workflow，盯 `build-arch-pkg` job 首跑
- [ ] 解包验证 v1.6.2 PKG：.PKGINFO / .desktop / 图标 / 引擎二进制（ELF 魔数）/ 架构一致
- [ ] Arch 实机（或 docker archlinux）装一遍：`pacman -U` → 启动 → 引擎起（内置或 `pacman -S aria2` 回退）→ 真实下载一个文件 → 归类落盘
- **DoD**：Arch 用户从 pacman 到完成一次真实下载，全程无手工步骤

## Phase 1：功能可用性 P0（2–3 天，v1.7.0 核心）

### 1.1 全链路代理支持（搜索+AI+字幕，一切境外功能的前提）

- `packages/core/src/config/schema.ts`：新增 `network.proxy: { mode: 'none'|'system'|'manual', url: string }`（defaults.ts / migrations.ts 同步）
- Rust `commands/mod.rs::build_http_client`：接受 proxy 参数（reqwest `.proxy()`），所有出网调用点（search_proxy / parse_with_llm / opensubtitles / download_subtitle）注入
- 前端 `SettingsView → SystemTab`：代理模式 + URL 表单 + "测试连通性"按钮（新增 `test_proxy` 命令）
- aria2 侧：确认 `configured_proxy_args()` 读同一 config 字段（消除双轨）
- TS core（cli/mcp 路径）：fetch 走 undici dispatcher + 显式 proxy 配置
- **DoD**：设置代理后，btdig/1337x/TG/LLM 在受限网络下出结果；不配置时行为与现在一致

### 1.2 搜索链路修复

- `search.rs`：1337x URL 模板补 `/{section}/` 段（`/search/{q}/all/last-seeders/`）
- Provider 注册表化：`{ id, name, enabled, health }`，health = 最近一次探测（页面可达 + 解析出 ≥1 行）
- 设置 UI：provider 开关 + 状态点（绿=可用/灰=未测/红=不可用）；默认只启用探测通过的
- btdig：若提供 JSON API 则改走 API，否则标记"实验性"
- 活体回归脚本 `scripts/probe-providers.mjs`：抓各站真实页面跑同一套正则输出矩阵——进 CI（weekly + 手动），失败只告警不阻断
- **DoD**：GUI 里每个启用的 provider 都能返回真实结果；死源不再展示

### 1.3 AI 链路修复

- anthropic provider：本期**下线**（修 /v1/messages 格式不值当，且目标用户用不到）；保留 openai / ollama / custom 三类 OpenAI 兼容
- 默认 provider 显式 `'none'`（= 纯启发式），UI 常驻徽标："AI 模式：启发式 / 已连接 LLM"
- LLM 解析失败时 toast 报错（现在静默回退，用户以为 AI 在工作）
- **DoD**：配真实 OpenAI 兼容端点（含本地 ollama）后能观察到真实 LLM 解析；不配置时 UI 明示启发式

### 1.4 发布管线加固（Linux/Arch 范围）

- release workflow 矩阵收敛：主力产物 = **Arch PKG**（build-arch-pkg）+ Linux AppImage/deb/rpm（best-effort）；macOS/Windows job 打 experimental 标签，不进发布承诺
- 新增 **artifact-verification job**（Linux 产物）：解包断言 ① PKG 结构完整（.PKGINFO/.desktop/图标）② 引擎二进制存在且为正确 ELF ③ 架构与包一致（x86_64）。断言失败 release 标 failed
- **DoD**：连续两个 tag 的 Linux 产物全部通过 artifact-verification

## Phase 2：产品完整度 P1（3–4 天，v1.7.0 收尾）

### 2.1 字幕

- 修 `core/subtitle/shooter.ts` 解析器对齐真实 API（`Files[].Ext/Link`，Link 为下载 URL 而非 base64）——已有真实响应样本
- GUI 字幕默认走 shooter（免 key），OpenSubtitles 保留为可选增强
- subhd.tv 纳入 probe 脚本做活体验证
- **DoD**：下完一部带年份的动漫/电影，无 key 自动挂上中文字幕

### 2.2 i18n 补全

- 补 16 个缺失 key × 5 语言；TaskFirstView / DetailPanel / TaskRow / Toast 接入 t()；清 53+ 死 key
- `scripts/i18n-check.mjs` 进 CI：静态提取所有 `t('key')` 与 strings.ts 对账 + 每语言非空断言
- **DoD**：切 5 种语言，全 UI 无原始 key、无空白、无中英混杂

### 2.3 睡眠防止 + 死代码

- SystemTab 加"下载时防止系统睡眠"开关 → `prevent_sleep`/`allow_sleep`（**有活跃下载才阻止**，非开关驱动）
- `get_aria2_log`：接到"引擎状态"设置区（启动失败时显示日志尾部，让最近 commit 的 UI 错误展示真正落地）
- `start_http_api`：文档化保留（供 CLI/MCP 本地集成），UI 不加
- **DoD**：有下载任务时系统不睡眠，任务结束后 N 分钟内恢复

## Phase 3：质量体系 P2（4–5 天，v1.8）

### 3.1 E2E 测试

- Playwright + Tauri driver：启动 → onboarding 完成 → 持久化（重启不重出）→ 引擎启动 → 真实下载小文件 → 完成 → 归类落盘 → 设置保存/读回
- Arch PKG 安装 e2e（docker archlinux 里装 PKG 再跑，验证打包正确性闭环）
- **DoD**：PR 必须 e2e 绿

### 3.2 GUI 单测

- composables 层（useAria2 / useDownloadPipeline / useSearch / useSubtitle / useSchedule）mock Tauri invoke 单测
- **DoD**：GUI 行覆盖 6.5% → ≥40%

### 3.3 本地健康度统计（无遥测，尊重 PRIVACY.md）

- config 旁挂 `stats.json`：引擎启动成功率 / provider 成功率 / LLM 解析成功率；"关于"页可看可清
- **DoD**：跑一周后用户能看到自己的功能成功率（为迭代提供数据）

## Phase 4：发布与运营

| 版本   | 内容                                                                                                | 渠道                                                             |
| ------ | --------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| v1.6.2 | Phase 0                                                                                             | GitHub Release（Arch PKG 首发）                                  |
| v1.7.0 | Phase 1+2                                                                                           | Release（Arch PKG 主力）+ **AUR 首次提交** + README 宣称对齐现实 |
| v1.8   | Phase 3                                                                                             | 质量门槛固化进 CI                                                |
| v2.0   | 视数据决定：BT 详情面板/Peers、任务搜索、多账号；**macOS/Windows 是否重新纳入主线由 v2.0 数据决定** |                                                                  |

- AUR：用 `packaging/arch/PKGBUILD` 提交，维护者 48h 响应
- Arch 滚动更新风险：PKGBUILD 依 Arch 惯例 depends 锁包名不锁版本；CI 每周跑一次 arch 构建 job 保持常绿（webkit2gtk 4.1 大版本变动时第一时间发现）
- AUDIT-REPORT.md 状态列逐项 close

## 风险登记

| 风险                                         | 概率 | 缓解                                                     |
| -------------------------------------------- | ---- | -------------------------------------------------------- |
| btdig/TG 彻底死（反爬升级）                  | 高   | provider 可关可替 + probe 脚本早发现；mikan 保底动漫场景 |
| Arch 滚动更新破坏构建（webkit2gtk 4.1 漂移） | 中   | weekly arch 构建 job 常绿 + PKG 安装 e2e                 |
| 活体回归 CI 抖动误报                         | 高   | 只告警不阻断；人工二次确认                               |
| 代理配置把用户流量引错                       | 低   | 仅作用于白名单出站点，UI 明示"仅用于搜索/AI/字幕"        |
| 单人力瓶颈                                   | 中   | 按 Phase 交付，v1.6.2 先出止血                           |

## 执行顺序（可直接开工）

1. **今天**：合并 PR#92 → 打 v1.6.2 → 验 Arch 包（Phase 0）
2. **明天-后天**：1.1 代理 + 1.2 搜索 + 1.3 AI（同 v1.7 分支并行，互不依赖）
3. **第 4-6 天**：1.4 发布管线 + 2.1-2.3
4. **下周一**：v1.7.0 tag + AUR 提交
5. **下下周**：Phase 3 质量体系 → v1.8
