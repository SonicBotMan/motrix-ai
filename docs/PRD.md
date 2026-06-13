# Motrix AI — PRD

> **Product Requirements Document** | v1.0 Draft | 2026-06-13
>
> 这是一份**活文档**。所有变更记录在 §14 变更日志中。

---

## 1. 概述 (Overview)

### 1.1 产品定位

**Motrix AI** 是一款**AI 原生的开源下载管理器**。

传统下载工具（IDM、迅雷、Motrix Next）是"人操作工具"——用户手动找链接、手动粘贴、手动管理队列。Motrix AI 翻转了这个范式：

> **用户用自然语言说出想要什么，AI 负责找到资源、安排下载、整理文件、匹配字幕。**

不是在 Motrix Next 上加个聊天框，而是**重新定义下载器的交互方式**——以 AI 作为主入口，下载引擎作为后端服务，GUI 作为实时反馈层。

### 1.2 核心价值主张

| 传统下载器 | Motrix AI |
|-----------|-----------|
| 手动复制粘贴 magnet/URL | 自然语言："下流浪地球 2 4K 字幕版" |
| 手动搜索资源 | AI 自动搜索 BT/磁力源，过滤广告，评估种子健康度 |
| 手动找字幕 | 下载完成后自动匹配字幕 |
| 手动整理文件夹 | 按模板自动重命名 + 分类归档 |
| 固定下载配置 | 根据时段/带宽/磁盘/网络状态自适应调整 |
| 单设备 | 多设备协调，下载完自动归档到 NAS |

**一句话**：传统下载器是"锤子"，Motrix AI 是"你说要钉钉子，它帮你把画挂好"。

### 1.3 目标用户

**主要用户**：普通桌面用户

- 不懂 aria2、不懂 magnet、不想折腾配置
- 有下载需求（电影、软件、课程、资源包），希望"说出来就行"
- 跨平台（Mac / Windows / Linux）
- 可能有 NAS，希望下载完自动归档

**次要用户**：进阶 / 技术用户

- 习惯 CLI 操作
- 需要精细控制（并发数、限速、Tracker 列表）
- 需要接入自定义 AI 模型（BYOK）
- 可能有 PT 站需求

### 1.4 项目背景

现有下载工具在 AI 时代已经落后了一个时代：

- **Motrix**（2023 年停更）：基于 Electron，体积臃肿，无法维护
- **Motrix Next**（2026 年活跃）：做了架构升级（Tauri 2 + Aria2），但依然是"传统交互"
- **IDM**：闭源、无 BT、Windows only
- **迅雷**：广告、限速、隐私问题

Motrix AI 的机会在于：**将下载器的交互从"操作工具"升级为"描述需求"，AI 负责执行**。

---

## 2. 问题与机会 (Problem & Opportunity)

### 2.1 现有下载工具的系统性痛点

**P1：资源发现是手动的**

用户要下载一部电影，当前流程是：
1. 打开浏览器，搜索资源站
2. 翻阅结果，辨别广告、钓鱼链接
3. 找到 magnet/torrent 链接
4. 复制到下载器
5. 等待下载完成
6. 去另一个站搜字幕
7. 下载字幕，重命名，放到正确位置

**这 7 步里，只有第 5 步是下载器干的。**

**P2：下载配置是静态的**

传统下载器的并发数、限速、Tracker 都是手动配置的。但实际情况是：
- 白天家里其他人用网 → 应该降速
- 深夜无人 → 应该全速
- 磁盘快满 → 应该暂停低优先级任务
- BT 死链 → 应该自动换源重试

**P3：跨设备是割裂的**

用户在 Mac 上找到资源，下载完成后需要手动 rsync 到 NAS。没有"下载完自动归档"的闭环。

**P4：现有 AI 编码工具的能力闲置**

OpenCode / Claude / Hermes 等 AI 工具已经能做结构化推理（意图拆解、关键词生成、质量判断），但它们没有被接入下载场景。**AI 能力 + 下载引擎之间缺一座桥。**

### 2.2 竞品分析

| 维度 | Motrix Next | qBittorrent | IDM | 迅雷 | **Motrix AI** |
|------|-------------|-------------|-----|------|---------------|
| 交互方式 | 手动操作 | 手动操作 | 手动操作 | 手动操作 | **自然语言** |
| 资源搜索 | ❌ 无 | ❌ 无 | ❌ 无 | ✅ 内置（限速） | **AI 自动搜** |
| 字幕匹配 | ❌ 无 | ❌ 无 | ❌ 无 | ❌ 无 | **自动匹配** |
| 自适应调度 | ❌ | ❌ | ❌ | ❌ | **时段/带宽/磁盘/网络** |
| 多设备协调 | ❌ | ❌ | ❌ | ❌ | **NAS 自动归档** |
| 开源 | ✅ MIT | ✅ GPL | ❌ 闭源 | ❌ 闭源 | **✅ MIT** |
| 广告 | 无 | 无 | 无 | 有 | **无** |
| 跨平台 | ✅ | ✅ | ❌ Win only | ✅ | **✅** |
| AI 集成 | ❌ | ❌ | ❌ | ❌ | **✅ OpenCode SDK** |

### 2.3 机会窗口

- **AI 工具链成熟**：OpenCode 提供免费模型 + SDK + 结构化输出，接入成本极低
- **MCP 协议标准化**：2026 年 MCP 已成为 LLM-tool 的事实标准
- **Motrix 生态真空**：Motrix 停更 3 年，Motrix Next 刚重写完架构，尚未做 AI 集成
- **用户预期变化**：ChatGPT 教育了用户"用自然语言跟工具对话"，下载器还没跟上

---

## 3. 目标与成功指标 (Goals & Metrics)

### 3.1 MVP 目标（PoC → MVP，~4 周）

**验证核心价值**：用户用自然语言说"下 XX"，AI 自动完成搜索→入队→下载→后处理的完整闭环。

MVP 必须能回答的问题：
- NL→意图拆解是否可靠？（准确率 > 90%）
- 搜索→magnet 入队是否流畅？（端到端 < 30 秒）
- 普通用户能否在 5 分钟内完成第一次下载？

### 3.2 v1.0 目标（~12 周）

**完整可用的 AI 下载管理器**，面向普通用户：

- 6 平台二进制分发（macOS / Windows / Linux × x64 + ARM64）
- 自然语言入队 + 自动字幕 + 自动重命名
- 时段 / 磁盘 / 带宽自适应调度
- 多设备协调（NAS 归档）
- 浏览器扩展（Chrome / Edge / Firefox）
- 完整文档 + 架构图 + 演示视频
- GitHub Actions CI/CD 自动构建 6 平台

### 3.3 关键指标

| 指标 | MVP（4 周） | v1.0（12 周） | 定义 |
|------|-------------|---------------|------|
| NL 意图解析准确率 | > 85% | > 95% | 结构化输出的 title/quality/subtitle 与用户意图一致 |
| 端到端延迟（NL→magnet） | < 30s | < 15s | 从用户输入到任务入队 |
| GitHub Stars | — | 1,000+ | 代表作级项目的基准线 |
| CI 通过率 | 100% | 100% | 6 平台构建 + 单元测试 |
| 首次使用转化率 | — | > 60% | 安装后 10 分钟内完成第一次下载 |

---

## 4. 用户与场景 (Users & Scenarios)

### 4.1 用户画像

**画像 A：小明（普通用户，28 岁，Mac 用户）**

- 不懂技术，不知道什么是 magnet
- 看到朋友分享的电影资源链接，想下到本地看
- 痛点：每次都要找资源站 → 找链接 → 复制到下载器 → 等着 → 还得找字幕
- 期望：**说出来就行，别让我动手**

**画像 B：老王（进阶用户，35 岁，NAS 用户）**

- 有群晖 NAS，家里 Mac + Windows 双系统
- 经常下载 4K 电影、课程、软件包
- 痛点：下载完要手动整理到 NAS，配置经常要根据时间段调
- 期望：**自动协调，下载完自动归档，不用我管**

**画像 C：小李（技术用户，24 岁，Linux 用户）**

- 习惯 CLI，喜欢定制化
- 有 PT 站账号，需要精细控制 Tracker / 上传比
- 痛点：现有工具太死板，不能根据条件自动调整
- 期望：**给我 API，让我自己编排**

### 4.2 关键使用场景

#### 场景 1：自然语言下载（核心场景）

```
用户：「下流浪地球 2 4K 字幕版」

AI 处理：
  1. 意图拆解 → {title: "流浪地球2", quality: "4K", subtitle: true}
  2. 生成搜索关键词 → ["流浪地球2 4K", "The Wandering Earth 2 4K"]
  3. 并发搜索 BT/磁力源 → 返回 5 个候选
  4. 评估排序（seeders/大小/质量匹配）→ 选最优 1 个
  5. aria2 入队 → 开始下载
  6. GUI 实时显示进度

下载完成后：
  7. 自动搜索字幕（shooter.cn / subhd）
  8. 下载匹配的 .srt 文件
  9. 按模板重命名：Movies/流浪地球2 (2023)/流浪地球2.4K.mkv
  10. 通知用户：✅ 完成
```

#### 场景 2：URL 直接下载

```
用户粘贴一个 URL → 自动识别类型 → 入队 → 下载 → 完成
```

#### 场景 3：磁力/BT 链接直接下载

```
用户粘贴 magnet:?xt=... 或拖入 .torrent 文件 → 入队 → 下载
```

#### 场景 4：批量下载

```
用户：「把这个播放列表里的视频全下了」
AI：解析列表 → 生成 N 个任务 → 批量入队 → 按序下载
```

#### 场景 5：智能调度（后台运行）

```
后台 daemon 持续运行：
  - 23:00-07:00（深夜）→ 全速下载
  - 08:00-18:00（白天）→ 限速 50%，让路给家里网络
  - 磁盘剩余 < 10GB → 暂停低优先级任务
  - BT 任务无 seeders 超过 1 小时 → 自动换 Tracker 重试
```

#### 场景 6：多设备协调

```
Mac 下载完成 → 自动 rsync/syncthing 到 NAS
  - 电影 → NAS:/Media/Movies/
  - 软件 → NAS:/Software/
  - 课程 → NAS:/Courses/
```

#### 场景 7：浏览器一键下载

```
用户在浏览器看到视频/文件 → 点击 Motrix AI 扩展按钮 → 自动捕获链接 → 入队
```

### 4.3 用户旅程地图（首次使用）

```
安装 Motrix AI
    ↓
打开应用（看到 Chat-first 界面，中央是对话框）
    ↓
输入"下 VS Code 最新版"
    ↓
AI 回复："找到 Visual Studio Code 1.101.0 (macOS ARM64)，开始下载"
    ↓
右侧任务列表实时显示进度
    ↓
下载完成，弹出通知
    ↓
用户感受：「比以前简单多了」
```

---

## 5. 产品范围 (Scope)

### 5.1 MoSCoW 优先级

| 优先级 | 功能 |
|--------|------|
| **Must Have** | 自然语言下载（NL→搜索→magnet→入队） |
| **Must Have** | aria2 下载引擎集成（HTTP/BT/磁力/FTP） |
| **Must Have** | Chat-first GUI（Tauri 2 + Vue 3） |
| **Must Have** | 任务管理（列表/暂停/恢复/删除/重试） |
| **Must Have** | 下载完成后自动字幕匹配 |
| **Must Have** | 文件自动重命名 + 分类归档 |
| **Must Have** | 跨平台安装包（macOS / Windows / Linux × x64 + ARM64） |
| **Must Have** | OpenCode SDK 集成（默认免费模型） |
| **Should Have** | 时段自适应调度（白天限速/深夜全速） |
| **Should Have** | 磁盘保护（剩余空间阈值 → 暂停低优先级） |
| **Should Have** | 智能重试 + 换源（BT 死链自动换 Tracker） |
| **Should Have** | 多设备协调（NAS 归档） |
| **Should Have** | 浏览器扩展（Chrome / Edge / Firefox） |
| **Should Have** | 系统托盘 + 通知 |
| **Should Have** | CLI 模式（`motrix-ai ask`） |
| **Could Have** | BYOK（接入 Anthropic / OpenAI / Ollama） |
| **Could Have** | MCP Server 暴露（供 Claude Desktop / Hermes / 其他 agent 调用） |
| **Could Have** | 国际化（i18n，中/英/日） |
| **Could Have** | 深色/浅色/跟随系统主题 |
| **Won't Have (this version)** | PT 站专用功能（做种/上传比管理） |
| **Won't Have** | 移动端（iOS / Android） |
| **Won't Have** | 云端同步（跨设备配置同步） |
| **Won't Have** | 内置播放器 |

### 5.2 MVP 必含功能（最小可演示闭环）

MVP 的定义：**端到端跑通一次自然语言下载**。

```
MVP = NL 意图解析 + 资源搜索 + aria2 入队 + 下载进度 + 字幕匹配 + 文件重命名 + 极简 GUI
```

具体清单：
1. `motrix-ai ask "下 XX"` 命令行可用
2. OpenCode SDK 调用免费模型，NL→结构化 JSON 输出
3. 至少 1 个搜索 provider（mikan / btdig / DuckDuckGo BT 搜索）
4. aria2 RPC 客户端（addUri / 暂停 / 删除 / 查询状态）
5. 至少 1 个字幕源（shooter.cn / subhd）
6. 文件重命名模板引擎
7. Tauri 2 GUI 骨架（Chat 面板 + 任务列表，可运行但不必完美）

### 5.3 明确不做 (Out of Scope)

| 不做 | 理由 |
|------|------|
| 内置 AI 模型推理 | 成本高、隐私风险，用 OpenCode 免费模型足够 |
| 重写 aria2 | Aria2 Next 已经在维护，没必要 |
| fork Motrix Next 代码 | 避免 upstream 撕裂，只对接其 aria2 RPC |
| BT 做种 / PT 站管理 | 社区敏感，且跟 AI 下载器定位不符 |
| 移动端 | Tauri 2 暂不支持移动端成熟方案 |
| 视频/音频播放 | 职责单一，不做成万能工具 |
| 云同步 | 复杂度高，MVP 阶段不碰 |

---

## 6. 功能详解 (Functional Spec)

### 6.1 自然语言下载

**输入**：用户在 Chat 面板输入自然语言

**处理流程**：
```
自然语言文本
    ↓
OpenCode SDK (client.session.prompt)
    ↓  JSON Schema 强制结构化输出
{
  title: string,
  year?: number,
  quality?: "4K" | "1080p" | "720p" | "other",
  need_subtitle: boolean,
  search_keywords: string[],
  resource_type: "movie" | "tv" | "software" | "music" | "other"
}
    ↓
Search Provider 并发查询
    ↓
返回候选列表（排序：seeders desc, size reasonable, quality match）
    ↓
用户确认或 AI 自动选择最优
    ↓
aria2 RPC addUri → 入队
```

**错误处理**：
- 意图不明确（"下那个东西"）→ AI 追问
- 搜索无结果 → 告知用户 + 建议换关键词
- magnet 链接无效 → 自动换源重试

**已验证技术路径**：`/tmp/motrix-ai-verify/test-nl.mjs` 已端到端跑通 OpenCode SDK JSON Schema 结构化输出。

### 6.2 任务队列与调度

**队列模型**：
```
Task {
  id: string              // 唯一 ID
  source_query: string    // 用户原始输入
  intent: DownloadIntent  // NL 解析结果
  uri: string             // magnet/http/torrent URL
  status: "pending" | "downloading" | "paused" | "completed" | "failed"
  priority: 1-5           // 5 = 最高
  progress: number        // 0-100
  speed: { down: number, up: number }
  files: FileEntry[]      // 下载文件列表
  subtitle?: SubtitleEntry
  created_at: Date
  completed_at?: Date
  retry_count: number
  error?: string
}
```

**队列操作**：
- 添加（from NL / from URL / from magnet / from .torrent）
- 暂停 / 恢复 / 删除 / 重试
- 优先级调整（拖拽排序）
- 批量操作（全部暂停 / 全部开始）

**并发控制**：
- 全局最大并发任务数（默认 3，可配置）
- 单任务最大连接数（默认 16，可配置）
- BT peer 限制（默认 50）

### 6.3 时段 / 磁盘 / 网络自适应

#### 6.3.1 时段调度

```yaml
schedule:
  - name: "深夜全速"
    time: "23:00-07:00"
    speed_limit: unlimited
    max_concurrent: 5
    
  - name: "白天让路"
    time: "07:00-18:00"
    speed_limit: "5MB/s"
    max_concurrent: 2
    
  - name: "晚间适度"
    time: "18:00-23:00"
    speed_limit: "10MB/s"
    max_concurrent: 3
```

#### 6.3.2 磁盘保护

```
规则：
  - 磁盘剩余 < 5GB → 暂停所有低优先级任务（priority < 3）
  - 磁盘剩余 < 2GB → 暂停所有任务 + 系统通知
  - 磁盘剩余 > 20GB → 恢复被暂停的任务
```

#### 6.3.3 智能重试

```
失败原因分类：
  - HTTP 403/404 → 换源重试
  - BT no peers (1h+) → 换 Tracker 列表重试
  - Tracker timeout → 切换 Tracker
  - 网络断开 → 等待恢复后自动继续
  - 磁盘满 → 暂停 + 通知

重试策略：
  - 最多重试 3 次
  - 每次重试间隔：30s → 60s → 120s（指数退避）
  - 3 次都失败 → 标记为 failed + 通知用户
```

### 6.4 字幕发现与匹配

**字幕源（可插拔）**：
- shooter.cn（国内最稳）
- subhd.tv（资源丰富）
- OpenSubtitles（国际，API key 可选）

**匹配策略**：
```
1. 根据下载文件名提取标题 + 年份 + 分辨率
2. 查询字幕源
3. 按语言（优先中文）+ 匹配度排序
4. 下载 Top 1 个 .srt/.ass 文件
5. 放到同目录，文件名与视频文件一致
```

**失败处理**：
- 无匹配字幕 → 通知用户"未找到字幕"，不阻塞
- 字幕源不可用 → 跳过，下一个源

### 6.5 文件组织与重命名

**默认模板**：
```
Movies/{title} ({year})/{title}.{quality}.{ext}
TV/{title}/Season {season}/{title} S{season}E{episode}.{ext}
Software/{name}/{filename}
Other/{filename}
```

**分类逻辑**：
- 根据 `resource_type`（NL 解析结果）决定模板
- `.mkv/.mp4/.avi/.ts` → Movies 或 TV
- `.exe/.dmg/.deb/.rpm/.AppImage` → Software
- 其他 → Other

**冲突处理**：
- 同名文件已存在 → 添加序号 `filename (2).ext`
- 已有文件更大 → 跳过（可能是更好的版本）

### 6.6 多设备协调

**架构**：Motrix AI 在 Mac/PC 上运行，NAS 上跑 aria2 RPC。

```
Mac (Motrix AI GUI + 客户端)
    ↓ aria2 RPC over LAN
NAS (aria2 daemon)
    ↓ 下载完成后回调
Mac (后处理：重命名 + 字幕)
    ↓ rsync / syncthing
NAS (归档目录)
```

**配置**：
```yaml
archive:
  enabled: true
  targets:
    - name: "NAS Movies"
      host: "192.168.11.147"
      path: "/volume1/Media/Movies"
      match: { resource_type: "movie" }
      
    - name: "NAS Software"
      host: "192.168.11.147"
      path: "/volume1/Software"
      match: { resource_type: "software" }
```

### 6.7 浏览器扩展

**支持浏览器**：Chrome / Edge / Firefox

**功能**：
- 右键菜单："用 Motrix AI 下载此链接"
- 自动捕获页面中的 magnet / .torrent 链接
- 视频嗅探（检测 `<video>` 标签的 src）
- 点击扩展图标 → 弹出 Motrix AI 的 mini Chat 界面

**实现**：独立仓库 `motrix-ai-extension`，通过 IPC（WebSocket / Native Messaging）与主应用通信。

### 6.8 AI 调度引擎（OpenCode 集成）

**集成方式**：`@opencode-ai/sdk` → 启动/连接 OpenCode server → 通过 session API 调用。

**AI 负责的事**：
1. 自然语言意图拆解（JSON Schema 结构化输出）
2. 搜索关键词生成（多语言、多角度）
3. 搜索结果评估与排序
4. 失败原因分析与重试决策
5. 文件分类与命名建议

**AI 不负责的事**：
1. 直接操作文件系统（由 core 模块处理）
2. 直接调用 aria2 RPC（由 core 模块处理）
3. 网络请求（由 search providers 处理）

**默认模型**：`opencode/deepseek-v4-flash-free`（免费、中文友好、速度快）

**可选模型**（用户 BYOK）：
- Anthropic Claude
- OpenAI GPT-4o
- Google Gemini
- Ollama 本地模型

---

## 7. 技术架构 (Architecture)

### 7.1 系统拓扑

```
┌──────────────────────────────────────────────────────────────┐
│  User Interface                                              │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────────────┐  │
│  │  Tauri GUI  │  │  CLI         │  │  Browser Extension │  │
│  │  (Chat-first)│  │  motrix-ai   │  │  Chrome/Edge/FF    │  │
│  └──────┬──────┘  └──────┬───────┘  └─────────┬──────────┘  │
└─────────┼────────────────┼────────────────────┼──────────────┘
          │                │                    │
          ▼                ▼                    ▼
┌──────────────────────────────────────────────────────────────┐
│  Motrix AI Core (TypeScript / Bun / Node)                    │
│  ┌─────────────────┐  ┌──────────────────────────────────┐  │
│  │  AI Engine       │  │  Download Engine                 │  │
│  │  ┌─────────────┐│  │  ┌────────────┐ ┌─────────────┐ │  │
│  │  │ OpenCode SDK││  │  │ aria2 RPC  │ │ Queue Mgr   │ │  │
│  │  │ (NL→Intent) ││  │  │ Client     │ │ (SQLite)    │ │  │
│  │  └─────────────┘│  │  └────────────┘ └─────────────┘ │  │
│  │  ┌─────────────┐│  │  ┌────────────┐ ┌─────────────┐ │  │
│  │  │ Search      ││  │  │ Scheduler  │ │ Subtitle    │ │  │
│  │  │ Providers   ││  │  │ (时段/磁盘)│ │ Finder      │ │  │
│  │  └─────────────┘│  │  └────────────┘ └─────────────┘ │  │
│  └─────────────────┘  │  ┌────────────┐ ┌─────────────┐ │  │
│                       │  │ File Mgr   │ │ Archive     │ │  │
│                       │  │ (重命名)   │ │ (NAS sync)  │ │  │
│                       │  └────────────┘ └─────────────┘ │  │
│                       └──────────────────────────────────┘  │
│  ┌────────────────────────────────────────────────────────┐  │
│  │  MCP Server (对外暴露)                                 │  │
│  │  Tools: download_natural_language, download_url,        │  │
│  │        queue_list, queue_pause, queue_resume,           │  │
│  │        search_subtitle, file_rename, scheduler_config   │  │
│  └────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────┘
          │
          ▼ aria2 JSON-RPC (localhost:6800 / LAN)
┌──────────────────────────────────────────────────────────────┐
│  Aria2 Next Engine (sidecar binary or external daemon)       │
└──────────────────────────────────────────────────────────────┘
```

### 7.2 模块划分

```
motrix-ai/
├── packages/
│   ├── core/                    # 核心引擎（无 UI 依赖）
│   │   ├── src/
│   │   │   ├── ai/
│   │   │   │   ├── intent-parser.ts      # NL → 结构化意图
│   │   │   │   ├── keyword-generator.ts   # 搜索关键词生成
│   │   │   │   └── result-evaluator.ts    # 搜索结果评估排序
│   │   │   ├── aria2/
│   │   │   │   ├── client.ts             # aria2 RPC 封装
│   │   │   │   └── types.ts
│   │   │   ├── search/
│   │   │   │   ├── provider.ts           # Provider 接口
│   │   │   │   ├── mikan.ts              # Mikan 适配器
│   │   │   │   ├── btdig.ts              # btdig 适配器
│   │   │   │   └── duckduckgo.ts         # DuckDuckGo BT 搜索
│   │   │   ├── subtitle/
│   │   │   │   ├── finder.ts
│   │   │   │   ├── shooter.ts            # shooter.cn 适配器
│   │   │   │   └── subhd.ts
│   │   │   ├── queue/
│   │   │   │   ├── manager.ts            # 任务队列管理
│   │   │   │   ├── database.ts           # SQLite 存储
│   │   │   │   └── types.ts
│   │   │   ├── scheduler/
│   │   │   │   ├── time-based.ts         # 时段调度
│   │   │   │   ├── disk-based.ts         # 磁盘保护
│   │   │   │   └── retry.ts              # 智能重试
│   │   │   ├── file/
│   │   │   │   ├── renamer.ts            # 文件重命名
│   │   │   │   ├── organizer.ts          # 分类归档
│   │   │   │   └── templates.ts          # 模板引擎
│   │   │   ├── archive/
│   │   │   │   ├── sync.ts               # rsync/syncthing 集成
│   │   │   │   └── types.ts
│   │   │   └── config/
│   │   │       ├── schema.ts             # 配置文件 schema
│   │   │       └── loader.ts
│   │   └── package.json
│   │
│   ├── mcp-server/              # MCP Server（暴露给外部 agent）
│   │   ├── src/
│   │   │   ├── server.ts
│   │   │   └── tools/
│   │   │       ├── download-natural-language.ts
│   │   │       ├── download-url.ts
│   │   │       ├── queue-list.ts
│   │   │       ├── queue-manage.ts
│   │   │       ├── search-subtitle.ts
│   │   │       ├── file-rename.ts
│   │   │       └── scheduler-config.ts
│   │   └── package.json
│   │
│   ├── cli/                     # 命令行工具
│   │   ├── src/
│   │   │   ├── index.ts
│   │   │   ├── commands/
│   │   │   │   ├── ask.ts        # motrix-ai ask "下 XX"
│   │   │   │   ├── add.ts        # motrix-ai add <url>
│   │   │   │   ├── list.ts       # motrix-ai list
│   │   │   │   ├── pause.ts
│   │   │   │   └── config.ts
│   │   └── package.json
│   │
│   └── daemon/                  # 系统服务
│       ├── src/
│       │   ├── index.ts
│       │   ├── service-macos.ts   # launchd
│       │   ├── service-windows.ts # Windows Service
│       │   └── service-linux.ts   # systemd
│       └── package.json
│
├── apps/
│   └── gui/                     # Tauri 2 GUI
│       ├── src-tauri/           # Rust 端（IPC + shell，不写业务逻辑）
│       │   ├── Cargo.toml
│       │   └── src/
│       │       └── main.rs
│       ├── src/                 # Vue 3 前端
│       │   ├── App.vue
│       │   ├── main.ts
│       │   ├── components/
│       │   │   ├── ChatPanel.vue        # 主聊天面板
│       │   │   ├── TaskList.vue         # 任务列表
│       │   │   ├── TaskDetail.vue       # 任务详情
│       │   │   ├── Settings.vue         # 设置页
│       │   │   └── ScheduleConfig.vue   # 调度配置
│       │   ├── stores/
│       │   │   ├── tasks.ts             # Pinia 任务状态
│       │   │   ├── chat.ts              # 聊天历史
│       │   │   └── config.ts            # 配置状态
│       │   ├── composables/
│       │   │   ├── useAria2.ts          # aria2 WebSocket 连接
│       │   │   ├── useOpenCode.ts       # OpenCode SDK 调用
│       │   │   └── useSchedule.ts       # 调度策略
│       │   └── assets/
│       ├── package.json
│       └── tauri.conf.json
│
├── docs/
│   ├── PRD.md                   # 本文档
│   ├── architecture.md          # 架构详解
│   ├── ROADMAP.md               # 路线图
│   └── adr/                     # 架构决策记录
│
├── .github/
│   ├── workflows/
│   │   ├── ci.yml               # 构建 + 测试
│   │   └── release.yml          # 6 平台发布
│   └── ISSUE_TEMPLATE/
│
├── turbo.json                   # Turborepo 配置
├── package.json                 # Monorepo root
├── LICENSE                      # MIT
└── README.md
```

### 7.3 数据流

```
用户输入 "下流浪地球 2 4K 字幕版"
    │
    ▼
┌─────────────────────────────────────┐
│ Intent Parser (OpenCode SDK)        │
│ 输入: 自然语言文本                    │
│ 输出: {title, year, quality,         │
│        need_subtitle, search_keywords│
│        resource_type}                │
└─────────────┬───────────────────────┘
              │
              ▼
┌─────────────────────────────────────┐
│ Search Providers (并发)              │
│ 输入: search_keywords[]              │
│ 输出: [{magnet, title, size,         │
│         seeders, source}]            │
└─────────────┬───────────────────────┘
              │
              ▼
┌─────────────────────────────────────┐
│ Result Evaluator (OpenCode SDK)      │
│ 输入: 候选列表 + 用户意图             │
│ 输出: 最优 1 个 + 置信度             │
└─────────────┬───────────────────────┘
              │
              ▼
┌─────────────────────────────────────┐
│ Queue Manager → aria2 RPC            │
│ addUri → 创建下载任务                 │
│ 输出: aria2 GID                      │
└─────────────┬───────────────────────┘
              │
              ▼ (下载完成后)
┌─────────────────────────────────────┐
│ Post-Processing Pipeline             │
│ 1. Subtitle Finder → 下载字幕        │
│ 2. File Renamer → 按模板重命名       │
│ 3. Organizer → 移动到分类目录        │
│ 4. Archive Sync → rsync 到 NAS       │
│ 5. Notification → 通知用户           │
└─────────────────────────────────────┘
```

### 7.4 关键技术选型

| 层级 | 选型 | 理由 |
|------|------|------|
| **语言** | TypeScript 5.x | 跟 OpenCode / Hermes 同栈，类型安全，招 contributor 容易 |
| **运行时** | Node.js 22 LTS | 稳定、跨平台、生态成熟 |
| **包管理** | pnpm (monorepo) | Turborepo 生态最优，workspace 原生支持 |
| **构建** | Turborepo + tsup | monorepo 并行构建，tree-shaking |
| **AI 引擎** | `@opencode-ai/sdk` | 免费模型、结构化输出、已验证 |
| **下载引擎** | Aria2 Next (JSON-RPC) | 事实标准，跨平台，已被 Motrix Next 验证 |
| **GUI 框架** | Tauri 2 (Rust) | 轻量（~20MB）、性能好、安全沙箱 |
| **前端框架** | Vue 3 Composition API + Pinia | 跟 Motrix Next 同栈，社区成熟 |
| **UI 库** | Naive UI | 轻量、无主题耦合、Vue 3 原生 |
| **样式** | Vanilla CSS + Custom Properties | 零依赖、易定制、性能最好 |
| **数据库** | SQLite (better-sqlite3) | 单文件、零配置、跨平台 |
| **测试** | Vitest + Playwright | TS 原生、快、Tauri WebDriver 支持 |
| **CI** | GitHub Actions | 6 平台矩阵构建，免费 |
| **字幕源** | shooter.cn + subhd | 国内最稳，HTTP API |
| **搜索** | DuckDuckGo + 可插拔 Provider | 隐私友好、无 API key、可扩展 |

### 7.5 第三方依赖与许可证合规

| 依赖 | 许可证 | 用途 | 风险 |
|------|--------|------|------|
| `@opencode-ai/sdk` | MIT | AI 调用 | 低 |
| `better-sqlite3` | MIT | 数据库 | 低 |
| `@modelcontextprotocol/sdk` | MIT | MCP server | 低 |
| Naive UI | MIT | UI 组件 | 低 |
| Tauri 2 | MIT/Apache 2.0 | 桌面框架 | 低 |
| Aria2 Next | MIT/GPL | 下载引擎 | 中（GPL 的 sidecar 模式不影响主应用 MIT） |

**决策**：主应用 MIT 协议。Aria2 Next 以 sidecar 二进制分发，不链接到主进程，GPL 不传染。

---

## 8. 用户体验 (UX)

### 8.1 设计原则

1. **Chat-first**：AI 对话面板是主入口，不是附加功能
2. **零配置开箱即用**：默认免费模型、默认配置、默认 aria2，装完就能用
3. **渐进式复杂度**：普通用户用 Chat，进阶用户用 Settings，CLI 用户用命令行
4. **实时反馈**：所有操作都有即时视觉反馈（进度条、动画、通知）
5. **Material Design 3 动效**：遵循 MD3 的非对称时间曲线和强调缓动

### 8.2 关键界面

#### 8.2.1 主界面（Chat-first）

```
┌──────────────────────────────────────────────────────────────────┐
│  Motrix AI                                    [设置] [最小化] [×]│
├──────────────────────────────────────────────┬───────────────────┤
│                                              │                   │
│  ┌────────────────────────────────────────┐  │   下载任务列表     │
│  │                                        │  │                   │
│  │        AI 对话区域（主内容区）           │  │  ▶ 流浪地球2.4K  │
│  │                                        │  │    ████████░░ 78% │
│  │  🤖：你好！输入你想要下载的内容即可。   │  │    ↓ 45.2 MB/s   │
│  │                                        │  │                   │
│  │  👤：下流浪地球 2 4K 字幕版             │  │  ■ VS Code.dmg   │
│  │                                        │  │    ██████████ 100%│
│  │  🤖：找到 3 个候选：                    │  │    ✅ 完成        │
│  │      1. 流浪地球2.4K.BluRay (42.3GB)   │  │                   │
│  │      2. 流浪地球2.4K.WEB-DL (18.7GB)   │  │  ▶ Python 3.13   │
│  │         ⭐ 推荐：seeders 最多          │  │    ███░░░░░░ 28%  │
│  │      3. 流浪地球2.4K.HDRip (12.1GB)    │  │    ↓ 12.8 MB/s   │
│  │                                        │  │                   │
│  │  [开始下载推荐项] [查看全部]             │  │                   │
│  │                                        │  │                   │
│  └────────────────────────────────────────┘  │                   │
│                                              │                   │
│  ┌────────────────────────────────────────┐  │                   │
│  │  输入你想要下载的内容...          [发送]│  │                   │
│  └────────────────────────────────────────┘  │                   │
├──────────────────────────────────────────────┴───────────────────┤
│  状态栏：aria2 运行中 | 队列 3 个任务 | 网络 ↓ 45.2 MB/s ↑ 2.1  │
└──────────────────────────────────────────────────────────────────┘
```

#### 8.2.2 设置页

```
┌──────────────────────────────────────────────────────────────────┐
│  设置                                                            │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│  🤖 AI 模型                                                      │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │ 当前模型：opencode/deepseek-v4-flash-free (免费)           │  │
│  │ [切换模型] [BYOK 配置]                                      │  │
│  └────────────────────────────────────────────────────────────┘  │
│                                                                  │
│  📁 下载目录                                                     │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │ 默认：~/Downloads/Motrix AI                                 │  │
│  │ 电影：~/Downloads/Motrix AI/Movies                          │  │
│  │ 软件：~/Downloads/Motrix AI/Software                        │  │
│  │ [修改目录] [自定义模板]                                      │  │
│  └────────────────────────────────────────────────────────────┘  │
│                                                                  │
│  ⏰ 时段调度                                                     │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │ 深夜 (23:00-07:00)：全速 | 最大并发 5                      │  │
│  │ 白天 (07:00-18:00)：限速 5MB/s | 最大并发 2                 │  │
│  │ 晚间 (18:00-23:00)：限速 10MB/s | 最大并发 3                │  │
│  │ [+ 添加时段] [重置默认]                                     │  │
│  └────────────────────────────────────────────────────────────┘  │
│                                                                  │
│  💾 磁盘保护                                                     │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │ 低空间阈值：5 GB（暂停低优先级任务）                         │  │
│  │ 临界阈值：2 GB（暂停所有任务 + 通知）                        │  │
│  └────────────────────────────────────────────────────────────┘  │
│                                                                  │
│  📺 字幕                                                         │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │ 优先语言：简体中文 > 英文                                    │  │
│  │ 字幕源：shooter.cn ✅  subhd.tv ✅  OpenSubtitles ☐         │  │
│  └────────────────────────────────────────────────────────────┘  │
│                                                                  │
│  🖥️ 多设备                                                       │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │ NAS 归档：已连接 192.168.11.147                              │  │
│  │ 电影 → /volume1/Media/Movies ✅                             │  │
│  │ 软件 → /volume1/Software ✅                                 │  │
│  │ [测试连接] [添加目标]                                        │  │
│  └────────────────────────────────────────────────────────────┘  │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

### 8.3 交互模式

**模式 1：Chat-first（默认）**
- 中央大面板是 AI 对话
- 右侧窄栏是任务列表
- 用户主要通过自然语言交互

**模式 2：Task-first（切换）**
- 中央大面板是任务列表（表格视图）
- 底部是 mini Chat 输入框
- 适合多任务管理场景

**模式 3：Compact（最小化到托盘）**
- 仅系统托盘图标 + 速度显示
- 任务完成弹通知
- 点击托盘弹出 mini 面板

---

## 9. 平台与分发 (Platforms & Distribution)

### 9.1 平台支持矩阵

| 平台 | 架构 | 安装包格式 | 优先级 |
|------|------|-----------|--------|
| macOS | Apple Silicon (aarch64) | .dmg | P0（主力开发平台） |
| macOS | Intel (x64) | .dmg | P1 |
| Windows | x64 | .exe (NSIS) | P0 |
| Windows | ARM64 | .exe (NSIS) | P2 |
| Linux | x64 | .deb / .rpm / .AppImage | P1 |
| Linux | ARM64 | .deb / .rpm / .AppImage | P2 |

### 9.2 安装方式

**macOS**：
```bash
# Homebrew（推荐）
brew tap <org>/motrix-ai
brew install --cask motrix-ai
xattr -cr /Applications/Motrix\ AI.app  # 移除隔离标记

# 或下载 .dmg
```

**Windows**：
```bash
# Scoop（推荐）
scoop bucket add extras
scoop install extras/motrix-ai

# 或下载 .exe 安装器
```

**Linux**：
```bash
# Debian/Ubuntu
sudo dpkg -i motrix-ai_x.x.x_amd64.deb

# Fedora/RHEL
sudo rpm -i motrix-ai-x.x.x-1.x86_64.rpm

# 通用
chmod +x motrix-ai_x.x.x_amd64.AppImage
./motrix-ai_x.x.x_amd64.AppImage
```

### 9.3 代码签名策略

**macOS**：不签名（跟 Motrix Next 一致）。用户首次运行需 `xattr -cr` 或通过 Homebrew `--no-quarantine` 安装。

**理由**：Apple Developer Program $99/年，开源项目初期不值得。GitHub Actions CI 透明构建 + MIT 开源 = 用户可自行审计。

**Windows**：不签名。Windows Defender 可能误报，README 提供白名单教程。

**未来**：当 GitHub Stars > 5,000 时考虑申请 Apple 开发者证书 + Windows EV 证书。

### 9.4 自动更新

- macOS / Linux：Tauri updater plugin（检查 GitHub Releases → 下载 → 替换）
- Windows：NSIS 安装器内置更新检查
- 更新通道：Stable / Beta（用户可选）

---

## 10. 商业模式与开源治理 (Business & OSS)

### 10.1 许可证

**MIT License**。

所有代码、文档、资源均以 MIT 协议发布。用户可自由使用、修改、分发，包括商业用途。

### 10.2 社区治理

**CLA（Contributor License Agreement）**：
- 首次贡献前需签署 CLA
- 保护项目和贡献者的权益
- 使用 CLA Bot 自动化（GitHub App）

**RFC 流程**：
- 重大功能变更走 RFC（Request for Comments）
- 在 GitHub Discussions 发起
- 至少 7 天讨论期
- Maintainer 最终决定

**Issue 管理**：
- Bug Report / Feature Request / Question 模板
- 标签系统：`bug`、`enhancement`、`good first issue`、`help wanted`
- 定期清理 stale issues（90 天无活动自动关闭）

### 10.3 赞助与支持

- GitHub Sponsors
- Open Collective
- 不考虑商业化（无增值服务、无闭源组件、无数据收集）

---

## 11. 路线图 (Roadmap)

### 11.1 里程碑

| 阶段 | 时间 | 交付物 | 验收标准 |
|------|------|--------|----------|
| **PoC** | Week 1 | 代码验证（已在 /tmp/motrix-ai-verify 完成） | OpenCode SDK 结构化输出跑通 |
| **MVP** | Week 2-5 | 端到端 NL→下载→字幕→重命名 | `motrix-ai ask "下 XX"` 完成闭环 |
| **Alpha** | Week 6-9 | Tauri GUI + 完整调度 + 浏览器扩展 | 普通用户能安装使用 |
| **Beta** | Week 10-12 | 6 平台 CI + 文档 + 演示视频 | GitHub Releases 发布 |
| **v1.0** | Week 13 | 正式发布 | README + 架构图 + 路线图 + Star > 500 |
| **v1.x** | Week 14+ | 社区反馈迭代 | BYOK / i18n / MCP / 国际化 |

### 11.2 MVP 详细计划（Week 2-5）

```
Week 2: Monorepo 骨架 + core 模块
  - pnpm workspace + Turborepo 配置
  - aria2 RPC client（addUri / pause / resume / status / remove）
  - Queue Manager（SQLite schema + CRUD）
  - 配置文件 schema + loader
  - 单元测试覆盖率 > 80%

Week 3: AI 引擎 + 搜索
  - OpenCode SDK 集成（intent-parser + keyword-generator）
  - Search Provider 抽象 + 2 个适配器（mikan + btdig）
  - Result Evaluator（排序算法）
  - CLI：motrix-ai ask 命令

Week 4: 后处理 + 字幕
  - Subtitle Finder（shooter.cn + subhd）
  - File Renamer（模板引擎）
  - Organizer（分类逻辑）
  - 端到端集成测试

Week 5: GUI 骨架 + 联调
  - Tauri 2 项目初始化
  - ChatPanel + TaskList 组件
  - 联调：Chat → AI → aria2 → 进度更新 → 完成通知
  - 录演示视频 + 更新 README
```

---

## 12. 风险与缓解 (Risks & Mitigations)

### 12.1 技术风险

| 风险 | 影响 | 概率 | 缓解 |
|------|------|------|------|
| OpenCode 免费模型下线 | AI 功能失效 | 低 | BYOK 兜底（Anthropic / OpenAI / Ollama） |
| aria2 RPC 不稳定 | 下载失败 | 低 | 重试机制 + Aria2 Next 活跃维护 |
| Tauri 2 macOS 签名问题 | 用户安装困难 | 中 | Homebrew `--no-quarantine` + 详细文档 |
| 搜索源 API 变动 | 搜索失效 | 高 | Provider 抽象层，可快速替换 |
| 字幕源 API 变动 | 字幕匹配失败 | 中 | 多源兜底（shooter + subhd + OpenSubtitles） |
| BT 资源搜索的法律风险 | 项目被 DMCA | 中 | 只搜索公开索引，不存储/分发内容，免责声明 |

### 12.2 法律合规

**BT/P2P 下载的法律边界**：
- Motrix AI **不存储、不索引、不分发**任何受版权保护的内容
- 搜索功能仅调用公开的第三方 API，结果由第三方提供
- 用户下载行为的责任在用户本人
- README 包含免责声明

**搜索源的合规**：
- DuckDuckGo 搜索（无 API key，合规）
- mikan / btdig（公开索引，合规）
- 不接入私有 Tracker / PT 站

### 12.3 社区风险

| 风险 | 缓解 |
|------|------|
| 贡献者不足 | `good first issue` 标签 + 详细 CONTRIBUTING.md + 代码注释充分 |
| 用户反馈暴增 | Issue 模板 + Discussion 分流 + 定期关闭 stale |
| Fork 后不再回来 | MIT 允许，不阻拦；但做好 upstream 保持领先 |

---

## 13. 附录 (Appendix)

### 13.1 术语表

| 术语 | 定义 |
|------|------|
| **NL** | Natural Language，自然语言 |
| **aria2** | 开源下载引擎，支持 HTTP/FTP/BT/磁力 |
| **Aria2 Next** | aria2 的维护分支，由 Motrix Next 作者维护 |
| **MCP** | Model Context Protocol，LLM 工具调用标准 |
| **OpenCode** | sst 开源的 AI 编码代理，内置免费模型 |
| **JSON-RPC** | aria2 的远程调用协议 |
| **Sidecar** | Tauri 的子进程管理方式，主应用与引擎进程分离 |
| **Provider** | 可插拔的搜索/字幕源适配器 |
| **BYOK** | Bring Your Own Key，用户自备 API key |

### 13.2 参考资料

- [Motrix Next](https://github.com/AnInsomniacy/motrix-next) — 前辈项目，Tauri 2 + Aria2 Next
- [Aria2 Next](https://github.com/AnInsomniacy/aria2-next) — aria2 维护分支
- [OpenCode](https://github.com/anomalyco/opencode) — AI 编码代理
- [OpenCode SDK](https://opencode.ai/docs/sdk) — JS/TS SDK 文档
- [Tauri 2](https://tauri.app) — 桌面应用框架
- [MCP Specification](https://modelcontextprotocol.io) — 工具调用协议
- [Material Design 3 Motion](https://m3.material.io/styles/motion/overview) — 动效规范

### 13.3 变更日志

| 日期 | 版本 | 变更 |
|------|------|------|
| 2026-06-13 | v1.0 Draft | 初始版本，完整 PRD |

---

*本文档由 Motrix AI 团队维护。如有疑问或建议，请在 [GitHub Discussions](#) 中提出。*
