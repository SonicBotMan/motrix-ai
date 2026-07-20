# Motrix AI — GUI 重构升级计划

> 基于 Open Design 专业设计系统，从 Naive UI 通用组件迁移到自定义组件系统
>
> **设计来源：** `docs/design/` 目录下的完整设计系统
> **原型文件：** `docs/design/prototype.html`（3521 行，141 KB）
> **视觉基线：** `docs/design/references/*.png`（3840×2160，Retina）

---

## 一、现状分析

### 当前实现

| 维度         | 现状                                                             |
| ------------ | ---------------------------------------------------------------- |
| **UI 框架**  | Naive UI（通用组件库）                                           |
| **布局**     | Chat-first（聊天优先）                                           |
| **设计系统** | 无（使用 Naive UI 默认主题）                                     |
| **组件**     | 8 个 Vue 组件（MainView, QueueView, SettingsView, ChatPanel 等） |
| **动效**     | 无自定义动效                                                     |
| **无障碍**   | 基础                                                             |
| **字体**     | 系统默认                                                         |
| **主题**     | Naive UI 暗色/亮色                                               |

### 设计系统要求

| 维度         | 目标                                                                                                                        |
| ------------ | --------------------------------------------------------------------------------------------------------------------------- |
| **UI 框架**  | 自定义组件系统（纯 CSS + Vue 3）                                                                                            |
| **布局**     | Task-first（任务列表 80% + 底部聊天 20%）                                                                                   |
| **设计系统** | 完整 token 体系（颜色/字体/间距/圆角/阴影/动效）                                                                            |
| **组件**     | 8 个核心组件（Chrome bar, Bottom chat, Task table, Detail panel, Toast stack, Row menu, Detail more menu, Onboarding card） |
| **动效**     | 5 个动效原语 + 统一缓动函数                                                                                                 |
| **无障碍**   | WCAG 2.1 AA（焦点环/ARIA/键盘快捷键/减少动效）                                                                              |
| **字体**     | Inter（UI）+ JetBrains Mono（数字）                                                                                         |
| **主题**     | Dark 默认 + Light 切换（完整 token 体系）                                                                                   |

---

## 二、重构范围

### 2.1 删除 Naive UI 依赖

**影响范围：**

- `apps/gui/src/views/MainView.vue` — 使用 NButton, NIcon, NTag, NProgress, NSpin
- `apps/gui/src/views/QueueView.vue` — 使用 NButton, NIcon, NTag, NProgress
- `apps/gui/src/views/SettingsView.vue` — 使用 NInput, NSelect, NSwitch, NCard
- `apps/gui/src/components/ChatPanel.vue` — 使用 NInput, NButton, NScrollbar
- `apps/gui/src/components/SearchResultsModal.vue` — 使用 NModal, NButton
- `apps/gui/src/components/TaskDetailModal.vue` — 使用 NModal, NButton, NProgress
- `apps/gui/src/components/ScheduleConfig.vue` — 使用 NCard, NButton, NInput, NSwitch
- `apps/gui/src/components/NASConfig.vue` — 使用 NCard, NButton, NInput, NSwitch

**操作：**

1. 从 `package.json` 移除 `naive-ui` 依赖
2. 从 `main.ts` 移除 Naive UI 插件注册
3. 逐个文件替换 Naive UI 组件为自定义组件

### 2.2 实现设计 Token 系统

**新建文件：** `apps/gui/src/styles/tokens.css`

```css
:root {
  /* Backgrounds */
  --bg: #0a0a0b;
  --bg-elevated: #121214;
  --surface: #18181b;
  --surface-hover: #222225;
  --surface-elevated: #27272a;

  /* Foregrounds */
  --fg: #fafafa;
  --fg-secondary: #a1a1aa;
  --fg-tertiary: #71717a;
  --fg-muted: #52525b;

  /* Borders */
  --border: #27272a;
  --border-hover: #3f3f46;

  /* Brand */
  --primary: #3b82f6;
  --primary-hover: #2563eb;
  --primary-muted: rgba(59, 130, 246, 0.12);
  --primary-subtle: rgba(59, 130, 246, 0.08);
  --accent: #10b981;
  --accent-muted: rgba(16, 185, 129, 0.12);
  --warning: #f59e0b;
  --warning-muted: rgba(245, 158, 11, 0.12);
  --error: #ef4444;
  --error-muted: rgba(239, 68, 68, 0.12);

  /* Radius */
  --radius-xs: 6px;
  --radius-sm: 8px;
  --radius-md: 12px;
  --radius-lg: 16px;
  --radius-xl: 20px;
  --radius-full: 9999px;

  /* Shadows */
  --shadow-xs: 0 1px 2px rgba(0, 0, 0, 0.3);
  --shadow-sm: 0 1px 3px rgba(0, 0, 0, 0.4), 0 1px 2px rgba(0, 0, 0, 0.3);
  --shadow-md: 0 4px 6px rgba(0, 0, 0, 0.4), 0 2px 4px rgba(0, 0, 0, 0.3);
  --shadow-lg: 0 10px 25px rgba(0, 0, 0, 0.5), 0 4px 10px rgba(0, 0, 0, 0.4);

  /* Typography */
  --font-ui: 'Inter', system-ui, -apple-system, sans-serif;
  --font-mono: 'JetBrains Mono', ui-monospace, 'SF Mono', monospace;

  /* Spacing */
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-5: 20px;
  --space-6: 24px;
  --space-8: 32px;
  --space-10: 40px;
  --space-12: 48px;

  /* Easing */
  --ease-out: cubic-bezier(0.16, 1, 0.3, 1);
  --ease-spring: cubic-bezier(0.2, 0.8, 0.2, 1);
  --transition-fast: 150ms var(--ease-out);
  --transition-base: 250ms var(--ease-out);
  --transition-slow: 400ms var(--ease-out);

  /* Dimensions */
  --chrome-height: 48px;
  --bottom-chat-height: 96px;

  /* Focus Ring */
  --focus-ring: oklch(92% 0.005 255);
  --focus-ring-soft: oklch(92% 0.005 255 / 0.22);
}

[data-theme='light'] {
  --bg: #fafafa;
  --bg-elevated: #ffffff;
  --surface: #f3f4f6;
  --surface-hover: #e5e7eb;
  --surface-elevated: #ffffff;
  --fg: #111827;
  --fg-secondary: #4b5563;
  --fg-tertiary: #6b7280;
  --fg-muted: #9ca3af;
  --border: #e5e7eb;
  --border-hover: #d1d5db;
  --primary: #2563eb;
  --primary-hover: #1d4ed8;
  --primary-muted: rgba(37, 99, 235, 0.08);
  --primary-subtle: rgba(37, 99, 235, 0.05);
  --accent: #059669;
  --accent-muted: rgba(5, 150, 105, 0.08);
  --warning: #d97706;
  --warning-muted: rgba(217, 119, 6, 0.08);
  --error: #dc2626;
  --error-muted: rgba(220, 38, 38, 0.08);
  --focus-ring: oklch(45% 0.15 255);
  --focus-ring-soft: oklch(45% 0.15 255 / 0.14);
}
```

### 2.3 实现 8 个核心组件

#### 组件 1：ChromeBar（顶部窗口栏）

**文件：** `apps/gui/src/components/chrome/ChromeBar.vue`

**规格：**

- 48px 高度，粘性顶部
- 左侧：macOS 窗口装饰点（装饰性）+ "Motrix AI" 文字标
- 右侧：主题切换按钮（28×28）+ 设置按钮（28×28）
- 焦点环：2px 近白环 + 6px 光晕

#### 组件 2：BottomChat（底部聊天输入）

**文件：** `apps/gui/src/components/chat/BottomChat.vue`

**规格：**

- 96px 高度（2 行 × 48px）
- 上行：快捷操作芯片（⌘1-5）
- 下行：附件按钮 + 输入框 + 发送按钮
- 发送状态：按钮旋转 + 禁用 + "Sending..." 文字
- Toast 栈显示在输入框上方

#### 组件 3：TaskTable（任务表格）

**文件：** `apps/gui/src/components/task/TaskTable.vue`

**规格：**

- 8 列：名称 / 来源 / 状态 / 进度 / 速度 / 大小 / ETA / 操作
- 状态着色：下载中（蓝）、完成（绿）、暂停（橙）、失败（红）
- 进度条：下载中有 shimmer 动效
- 行点击：180ms 行闪烁 → 详情面板弹出
- 过滤器：全部 / 活跃 / 完成 / 失败
- 空状态：过滤器感知文案

#### 组件 4：DetailPanel（详情面板）

**文件：** `apps/gui/src/components/task/DetailPanel.vue`

**规格：**

- 720 × min(88vh, 760px)，视口居中
- 5 个区域：粘性头 / 4 列统计条 / 进度环 / 可折叠区 / 粘性脚
- 打开动效：modalScaleIn（400ms）
- 关闭动效：modalScaleOut（220ms）
- Esc 键关闭

#### 组件 5：ToastStack（Toast 栈）

**文件：** `apps/gui/src/components/toast/ToastStack.vue`

**规格：**

- 最多 4 个可见，column-reverse 堆叠
- 3 种类型：info（蓝）、success（绿）、error（红）
- 自动消失：2 秒
- 位置：底部聊天输入框上方
- `aria-live="polite"` 无障碍通知

#### 组件 6：RowMenu（行菜单）

**文件：** `apps/gui/src/components/task/RowMenu.vue`

**规格：**

- 每行 ··· 触发
- 4 个操作：暂停/恢复、重试、删除、打开文件位置
- 点击外部关闭

#### 组件 7：DetailMoreMenu（详情更多菜单）

**文件：** `apps/gui/src/components/task/DetailMoreMenu.vue`

**规格：**

- 详情面板头部右侧 ··· 触发
- 操作：复制链接、打开文件位置、查看日志

#### 组件 8：OnboardingCard（引导卡片）

**文件：** `apps/gui/src/components/onboarding/OnboardingCard.vue`

**规格：**

- 480 × 600，视口居中
- 3 步向导：介绍 → 主题选择 → 快捷操作
- 步骤切换：fadeSlideUp（250ms）
- 顶部 3px 渐变条纹（唯一渐变）

---

## 三、实施计划

### Phase 1：基础设施（3 天）

| 任务           | 文件                    | 说明                                      |
| -------------- | ----------------------- | ----------------------------------------- |
| 1.1 设计 Token | `styles/tokens.css`     | 完整 CSS 变量体系                         |
| 1.2 字体配置   | `index.html`            | Inter + JetBrains Mono                    |
| 1.3 基础组件   | `components/ui/`        | Button, Input, Icon, Tag, Progress, Modal |
| 1.4 动效系统   | `styles/animations.css` | 5 个 keyframe + 统一缓动                  |
| 1.5 无障碍基础 | `styles/a11y.css`       | 焦点环 + prefers-reduced-motion           |

### Phase 2：核心组件（5 天）

| 任务               | 文件                                       | 说明               |
| ------------------ | ------------------------------------------ | ------------------ |
| 2.1 ChromeBar      | `components/chrome/ChromeBar.vue`          | 顶部窗口栏         |
| 2.2 TaskTable      | `components/task/TaskTable.vue`            | 任务表格（8 列）   |
| 2.3 BottomChat     | `components/chat/BottomChat.vue`           | 底部聊天输入       |
| 2.4 ToastStack     | `components/toast/ToastStack.vue`          | Toast 通知栈       |
| 2.5 DetailPanel    | `components/task/DetailPanel.vue`          | 详情面板（5 区域） |
| 2.6 RowMenu        | `components/task/RowMenu.vue`              | 行操作菜单         |
| 2.7 OnboardingCard | `components/onboarding/OnboardingCard.vue` | 引导卡片           |

### Phase 3：视图重构（3 天）

| 任务              | 文件                     | 说明                              |
| ----------------- | ------------------------ | --------------------------------- |
| 3.1 MainView      | `views/MainView.vue`     | Task-first 布局（80/20）          |
| 3.2 SettingsView  | `views/SettingsView.vue` | 7 标签页设置                      |
| 3.3 QueueView     | `views/QueueView.vue`    | 队列视图（可选，合并到 MainView） |
| 3.4 移除 Naive UI | `package.json`           | 清理依赖                          |

### Phase 4：数据集成（2 天）

| 任务              | 文件                         | 说明                      |
| ----------------- | ---------------------------- | ------------------------- |
| 4.1 Task 数据适配 | `stores/tasks.ts`            | 连接真实 aria2 数据       |
| 4.2 Mock 数据扩展 | `mock/tasks.ts`              | 14 个任务（设计系统要求） |
| 4.3 快捷键        | `composables/useKeyboard.ts` | ⌘1-5, j/k, Esc, Enter     |

### Phase 5：打磨（2 天）

| 任务               | 文件 | 说明                         |
| ------------------ | ---- | ---------------------------- |
| 5.1 无障碍测试     | —    | Tab 遍历、焦点环、屏幕阅读器 |
| 5.2 减少动效测试   | —    | prefers-reduced-motion 验证  |
| 5.3 视觉对比       | —    | 对照 PNG 基线截图验证        |
| 5.4 反 AI 垃圾检查 | —    | 22 条规则逐条检查            |

---

## 四、文件结构（重构后）

```
apps/gui/src/
├── styles/
│   ├── tokens.css              # 设计 Token
│   ├── animations.css          # 动效系统
│   ├── a11y.css                # 无障碍样式
│   └── global.css              # 全局样式
├── components/
│   ├── ui/                     # 基础 UI 组件
│   │   ├── UiButton.vue
│   │   ├── UiInput.vue
│   │   ├── UiIcon.vue
│   │   ├── UiTag.vue
│   │   ├── UiProgress.vue
│   │   └── UiModal.vue
│   ├── chrome/
│   │   └── ChromeBar.vue
│   ├── chat/
│   │   └── BottomChat.vue
│   ├── task/
│   │   ├── TaskTable.vue
│   │   ├── DetailPanel.vue
│   │   ├── RowMenu.vue
│   │   └── DetailMoreMenu.vue
│   ├── toast/
│   │   └── ToastStack.vue
│   └── onboarding/
│       └── OnboardingCard.vue
├── composables/
│   ├── useAria2.ts
│   ├── useKeyboard.ts          # 新增：快捷键
│   ├── useTheme.ts             # 新增：主题切换
│   └── ...
├── stores/
│   ├── tasks.ts
│   ├── chat.ts
│   └── config.ts
├── views/
│   ├── MainView.vue            # 重构：Task-first 布局
│   └── SettingsView.vue        # 重构：7 标签页
└── mock/
    └── tasks.ts                # 14 个 Mock 任务
```

---

## 五、验收标准

### 5.1 视觉验收

- [ ] 对照 `02-main-screen.png` 截图，像素级还原
- [ ] 对照 `01-onboarding.png` 截图，引导页还原
- [ ] 对照 `03-detail-overlay.png` 截图，详情面板还原
- [ ] Dark/Light 主题切换正确
- [ ] 无 emoji、无 em-dash、无 AI 垃圾文案

### 5.2 交互验收

- [ ] 任务行点击 → 180ms 闪烁 → 详情面板弹出
- [ ] 过滤器切换 → 行 stagger 动效（220ms × 6）
- [ ] 发送按钮 → 旋转 + 禁用 + "Sending..."
- [ ] Toast 自动消失（2 秒）
- [ ] 快捷键 ⌘1-5 正常工作

### 5.3 无障碍验收

- [ ] Tab 遍历：每个交互元素可到达
- [ ] 焦点环：2px 近白环 + 6px 光晕
- [ ] 屏幕阅读器：状态变更通知
- [ ] 减少动效：`prefers-reduced-motion` 生效
- [ ] 对比度：≥ 4.5:1（WCAG AA）

### 5.4 性能验收

- [ ] 首屏加载 < 2 秒
- [ ] 60fps 动效
- [ ] 内存占用 < 200MB
- [ ] Bundle size < 1MB（gzip 后）

---

## 六、风险与缓解

| 风险                     | 影响 | 缓解                         |
| ------------------------ | ---- | ---------------------------- |
| 移除 Naive UI 后功能缺失 | 高   | 逐个替换，保留功能           |
| 动效性能问题             | 中   | 使用 CSS transform + opacity |
| 无障碍测试复杂           | 中   | 使用 axe DevTools 自动化     |
| 视觉还原度不足           | 中   | 对照 PNG 基线逐像素验证      |

---

## 七、时间线

```
Week 1: Phase 1 (基础设施) + Phase 2 (核心组件) 前半
Week 2: Phase 2 后半 + Phase 3 (视图重构)
Week 3: Phase 4 (数据集成) + Phase 5 (打磨)
```

**总周期：3 周**

---

_本文档基于 Open Design 设计系统生成，设计来源文件位于 `docs/design/` 目录。_
