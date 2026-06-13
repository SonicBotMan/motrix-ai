// file/organizer.ts — 文件归类与移动
// 对应 PRD §6.5 文件组织与重命名（归类 + 落盘管线）

import { promises as fs } from "node:fs";
import path from "node:path";
import type { ResourceType, DownloadIntent, AppConfig } from "../types.js";

/** 视频扩展名集合 */
const VIDEO_EXTS = new Set(["mkv", "mp4", "avi", "ts", "mov"]);
/** 软件安装包扩展名集合 */
const SOFTWARE_EXTS = new Set(["exe", "dmg", "deb", "rpm", "appimage"]);
/** 音频扩展名集合 */
const MUSIC_EXTS = new Set(["mp3", "flac", "wav"]);

/**
 * 文件归类与移动管理器。
 *
 * 负责：根据扩展名或 NL 解析意图判定资源类型、根据配置解析目标目录、
 * 创建目录并处理同名冲突（自动追加 (2)、(3) 后缀），最后移动文件。
 */
export class FileOrganizer {
  /** 默认下载根目录（对应 config.downloads.base_dir） */
  private baseDir: string;

  /**
   * @param baseDir 默认下载根目录
   */
  constructor(baseDir: string) {
    this.baseDir = baseDir;
  }

  /**
   * 根据文件名扩展名或下载意图判定资源类型。
   * 当提供 intent 且其 resource_type 非 "other" 时以意图为准，否则回落到扩展名判定。
   *
   * @param filename 文件名（含扩展名）
   * @param intent   NL 解析后的下载意图（可选）
   * @returns 资源类型
   *
   * @example
   *   classify("movie.mkv")                // => "movie"
   *   classify("setup.exe")                // => "software"
   *   classify("track.flac")               // => "music"
   *   classify("data.bin", intent)         // => intent.resource_type
   */
  classify(filename: string, intent?: DownloadIntent): ResourceType {
    // 意图优先：AI 解析结果具有权威性
    if (intent && intent.resource_type && intent.resource_type !== "other") {
      return intent.resource_type;
    }

    const ext = this.extractExt(filename);
    if (VIDEO_EXTS.has(ext)) return "movie";
    if (SOFTWARE_EXTS.has(ext)) return "software";
    if (MUSIC_EXTS.has(ext)) return "music";
    return "other";
  }

  /**
   * 根据资源类型与配置解析最终目标目录。
   * movie/tv → movie_dir，software → software_dir，music/other → other_dir，
   * 子目录若为相对路径则拼接在 base_dir 之下。
   *
   * @param resourceType 资源类型
   * @param config       应用配置
   * @returns 目标目录绝对路径
   *
   * @example
   *   getTargetDir("movie", config)   // => "/downloads/Movies"
   */
  getTargetDir(resourceType: ResourceType, config: AppConfig): string {
    const dl = config.downloads;
    let dir: string;
    switch (resourceType) {
      case "movie":
      case "tv":
        dir = dl.movie_dir;
        break;
      case "software":
        dir = dl.software_dir;
        break;
      case "music":
      case "other":
      default:
        dir = dl.other_dir;
        break;
    }
    return path.isAbsolute(dir) ? dir : path.join(dl.base_dir, dir);
  }

  /**
   * 将文件移动到目标目录，若目标不存在则递归创建。
   * 遇到同名文件自动追加 (2)、(3)… 后缀以避免覆盖。
   *
   * @param sourcePath 源文件绝对路径
   * @param targetDir  目标目录
   * @param filename   目标文件名
   * @returns 移动后的最终路径
   */
  async moveFile(sourcePath: string, targetDir: string, filename: string): Promise<string> {
    await fs.mkdir(targetDir, { recursive: true });

    const finalPath = await this.resolveConflict(targetDir, filename);
    await fs.rename(sourcePath, finalPath);
    return finalPath;
  }

  /**
   * 完整的文件归类→落盘管线。
   *
   * @param filePath 待处理的源文件路径
   * @param intent   NL 解析后的下载意图（可选，用于辅助分类）
   * @param config   应用配置（可选，缺失时使用 baseDir 作为目标目录）
   * @returns 文件最终落盘路径
   *
   * @example
   *   await organizer.organize("/tmp/a.mkv", intent, config)
   *   // => "/downloads/Movies/a.mkv"
   */
  async organize(
    filePath: string,
    intent?: DownloadIntent,
    config?: AppConfig,
  ): Promise<string> {
    const filename = path.basename(filePath);
    const resourceType = this.classify(filename, intent);

    let targetDir: string;
    if (config) {
      targetDir = this.getTargetDir(resourceType, config);
    } else {
      targetDir = this.baseDir;
      await fs.mkdir(targetDir, { recursive: true });
    }

    return this.moveFile(filePath, targetDir, filename);
  }

  /**
   * 解析同名冲突，返回不会覆盖现有文件的目标路径。
   * 策略：在文件名与扩展名之间插入 (2)、(3)… 序号。
   *
   * @example
   *   resolveConflict("/dir", "a.mkv")  // 若已存在则返回 "/dir/a (2).mkv"
   */
  private async resolveConflict(dir: string, filename: string): Promise<string> {
    const ext = this.extractExt(filename);
    const base = ext !== "bin" ? filename.slice(0, -(ext.length + 1)) : filename;

    let candidate = path.join(dir, filename);
    let index = 2;
    while (await this.exists(candidate)) {
      const newName = ext !== "bin" ? `${base} (${index}).${ext}` : `${base} (${index})`;
      candidate = path.join(dir, newName);
      index++;
    }
    return candidate;
  }

  /** 判断路径是否存在（不抛异常） */
  private async exists(p: string): Promise<boolean> {
    try {
      await fs.access(p);
      return true;
    } catch {
      return false;
    }
  }

  /** 提取文件扩展名（不含点），无扩展名时返回 "bin" */
  private extractExt(filename: string): string {
    const parts = filename.split(".");
    return parts.length > 1 ? parts.pop()!.toLowerCase() : "bin";
  }
}
