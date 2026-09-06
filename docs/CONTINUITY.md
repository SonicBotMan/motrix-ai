# motrix-ai 项目延续状态（活文档，每次 checkpoint 更新）

> 更新：2026-09-06 · 更新人：pi 会话（SonicBotMan 的编码代理）

## 一句话状态

**v1.7.0 已发布且全验收管线绿（构建/结构校验/Arch 冒烟安装-启动-真实下载）；
等用户在 Arch 实机确认后，才允许 AUR 提交。**

## 背景

- 项目：motrix-ai — AI 原生下载管理器（Tauri 2 + Vue 3 + Rust + aria2，源自 Motrix 理念）
  GitHub: `SonicBotMan/motrix-ai`
- 战略决策（2026-09-05 用户拍板）：**Arch-first**。macOS/Windows 产物降级 experimental，v2.0 前不纳入主线。
- 起因：两轮独立审计（基础设施层 + 功能层活体验证）发现 v1.6.1 不可市场：
  - Windows 发布包是错乱的 macOS 产物、引擎 .exe 从未入库（.gitignore P0）
  - macOS 无签名；搜索 5 源仅 2 活；AI 开箱即死（opencode 默认 + anthropic 端点写错）；
    字幕 GUI 走 OpenSubtitles 需自备 key，core 的 shooter 解析器与真实 API 不符
  - 4 个死功能（prevent_sleep/allow_sleep/get_aria2_log 等前端零调用）
- 完整方案：`docs/RELIABILITY-AND-FEATURE-REMEDIATION.md`（Phase 0-4 + 验收定义 4 条）

## 已完成（2026-09-05/06）

| 项                                                                                                                                                     | 状态                  |
| ------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------- |
| PR#92：Arch PKG 打包链 + 引擎三级回退（内置→PATH aria2c→报错指引）+ .gitignore P0                                                                      | ✅ 已合并             |
| 1.1 全链路代理（config 丢弃 network 段的 bug、Rust 注入、UI+测试按钮）                                                                                 | ✅ v1.7.0             |
| 1.2 搜索（1337x URL 修复 + probe-providers.mjs 活体探测）                                                                                              | ✅ v1.7.0             |
| 1.3 AI（anthropic 下线、none 默认、迁移 3→4、openai 支持 relay）                                                                                       | ✅ v1.7.0             |
| 2.1 字幕 shooter 解析器对齐真实 API                                                                                                                    | ✅ v1.7.0             |
| 2.2 i18n（settings.schedule 补齐；"16 缺失"系审计脚本误报，真实缺 1 个）                                                                               | ✅ v1.7.0             |
| 2.3 睡眠防止接线（useSleepGuard）                                                                                                                      | ✅ v1.7.0             |
| 1.4 artifact-verification 关卡（10 类资产结构/魔数/平台防错乱）                                                                                        | ✅ v1.7.0             |
| **arch-smoke 验收 gate**（fresh Arch 容器：pacman 装 → Xvfb 起 GUI → 引擎 RPC → 真实下载落盘）                                                         | ✅ v1.7.0，8-job 全绿 |
| 修掉的验收坑：PKGINFO `./` 前缀被 pacman 拒、.PKGINFO 缺 depends、webkit 包名 webkit2gtk-4.1、xvfb 在 xorg-server-xvfb、tauri CLI --no-bundle、pnpm@10 | ✅ 全部               |

## 遗留（按优先级/依赖顺序）

1. **[阻塞项] Arch 实机验收**（验收定义第 3/4 条）
   - 用户的 Arch 机器（称 "lihgtOS"）：**IP 和登录方式未给**。已探明：192.168.11.180(asus) 是 Ubuntu 非 Arch；.123/.139/.172/.175/.179 拒绝当前 SSH key
   - 需要用户：提供 IP + 登录方式（key 可用则免密）
   - 验收步骤：装 v1.7.0 PKG → onboarding → 配 mihomo 代理（192.168.11.123:7890）→ 搜索出结果 → 下载完成 → 字幕挂上；`node scripts/probe-providers.mjs`（PROBE_PROXY=同地址）确认可用源 ≥2
2. **AUR 提交**（实机验收全绿后）
   - `packaging/arch/PKGBUILD` 已就绪；还差：AUR 目录规范（.gitignore）、v1.7.0 源码 tarball 的 sha256sums、aur.archlinux.org 网页 create request（用户操作）
3. **Phase 3 质量体系 → v1.8**
   - Playwright + Tauri driver e2e（PR 必跑）
   - GUI composable 单测（当前 6.5% 行覆盖 → 目标 40%）
   - 本地健康度统计（无遥测，stats.json 用户可见可清）
4. **长尾**
   - provider 健康 UI（设置页状态点，默认只启用探测通过的源）
   - 主视图（TaskFirstView/DetailPanel 等）接入 t()；清 47 个死 i18n key（含正则噪声，需精确核）
   - btdig/1337x/TG 的真实网络可达性（数据中心出口全死，需用户网络验证）
   - macOS 签名（Arch-first 范围外，v2.0 决策项）

## 关键文件索引

```
packaging/arch/          PKGBUILD · Dockerfile(构建) · Dockerfile.smoke(验收) · package.sh(PKG 组装)
scripts/                 verify-artifacts.sh · arch-smoke.sh · probe-providers.mjs · fetch-release-pkg.py
.github/workflows/release.yml   8 jobs: create → build×5 → verify → arch-smoke → publish
docs/RELIABILITY-AND-FEATURE-REMEDIATION.md   完整方案（Phase 0-4）
```

## 下次会话延续协议

1. 读本文档 + `docs/RELIABILITY-AND-FEATURE-REMEDIATION.md`
2. 记忆检索（pi 空间）：`nmem m search "motrix-ai" --space pi`（审计结论 + 使用指南都在）
3. `gh run list` / `gh release view v1.7.0` 确认远端状态
4. 问用户：实机验收做了吗？结果如何？→ 全绿则启动 AUR，未做则协助获取 Arch 机器访问权
