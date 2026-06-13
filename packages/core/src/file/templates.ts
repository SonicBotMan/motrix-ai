// file/templates.ts — 文件名模板引擎
// 对应 PRD §6.5 文件组织与重命名（模板渲染）

import type { ResourceType } from "../types.js";

/**
 * 各资源类型的默认重命名模板。
 * 支持的占位变量：{title} {year} {quality} {ext} {season} {episode} {filename} {date}
 */
export const DEFAULT_TEMPLATES: Record<ResourceType, string> = {
  movie: "{title} ({year})/{title}.{quality}.{ext}",
  tv: "{title}/Season {season}/{title} S{season}E{episode}.{ext}",
  software: "{title}/{filename}",
  music: "{title}/{filename}",
  anime: "{title}/{title}.{quality}.{ext}",
  other: "{filename}",
};

/** 文件名中非法字符（Windows / macOS / Linux 通用） */
const INVALID_CHARS = /[\\/:*?"<>|]/g;

/**
 * 文件名模板引擎。
 *
 * 负责将 {var} 风格的模板与变量字典渲染为最终相对路径，
 * 并对结果进行文件名安全清洗（移除非法字符、去除多余空白）。
 */
export class TemplateEngine {
  /**
   * 渲染模板：替换所有 {var} 占位符，并清洗文件名非法字符。
   *
   * @param template 模板字符串，例如 "{title} ({year})/{title}.{quality}.{ext}"
   * @param vars     变量字典，例如 { title: "流浪地球 2", year: "2023", quality: "4K", ext: "mkv" }
   * @returns 渲染并清洗后的路径，例如 "流浪地球 2 (2023)/流浪地球 2.4K.mkv"
   *
   * @example
   *   render("{title} S{season}E{episode}.{ext}", { title: "剧名", season: "01", episode: "02", ext: "mkv" })
   *   // => "剧名 S01E02.mkv"
   */
  render(template: string, vars: Record<string, string>): string {
    let result = template.replace(/\{(\w+)\}/g, (match, key: string) => {
      const value = vars[key];
      return value !== undefined ? value : match;
    });

    // 清洗非法文件名字符
    result = result.replace(INVALID_CHARS, "");

    // 去除每段（以 / 分隔）首尾空白，再合并多余分隔符
    result = result
      .split("/")
      .map((seg) => seg.trim())
      .filter((seg) => seg.length > 0)
      .join("/");

    return result;
  }

  /**
   * 根据资源类型获取对应的默认模板。
   *
   * @param resourceType 资源类型
   * @returns 模板字符串
   */
  getTemplate(resourceType: ResourceType): string {
    return DEFAULT_TEMPLATES[resourceType];
  }

  /**
   * 一站式渲染：按资源类型取默认模板，再用变量字典渲染。
   *
   * @param resourceType 资源类型
   * @param vars         变量字典
   * @returns 渲染后的相对路径
   *
   * @example
   *   renderPath("movie", { title: "流浪地球 2", year: "2023", quality: "4K", ext: "mkv" })
   *   // => "流浪地球 2 (2023)/流浪地球 2.4K.mkv"
   */
  renderPath(resourceType: ResourceType, vars: Record<string, string>): string {
    return this.render(this.getTemplate(resourceType), vars);
  }
}
