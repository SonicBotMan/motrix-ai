// file/renamer.ts — 文件重命名与分类
// 对应 PRD §6.5 文件组织与重命名

import type { ResourceType, Quality } from "../types.js";

interface RenameContext {
  title: string;
  year?: number;
  quality?: Quality;
  resource_type: ResourceType;
  original_filename: string;
}

export class FileRenamer {
  /**
   * 根据模板生成目标路径
   * @example generatePath({ title: "流浪地球 2", year: 2023, quality: "4K", ... })
   *   // => "Movies/流浪地球 2 (2023)/流浪地球 2.4K.mkv"
   */
  generatePath(ctx: RenameContext): string {
    const ext = this.extractExt(ctx.original_filename);
    const dir = this.getDir(ctx.resource_type);

    const titleClean = ctx.title.replace(/[\/\\:*?"<>|]/g, "").trim();
    const folderName = ctx.year ? `${titleClean} (${ctx.year})` : titleClean;
    const fileName = ctx.quality && ctx.quality !== "other"
      ? `${titleClean}.${ctx.quality}.${ext}`
      : `${titleClean}.${ext}`;

    return `${dir}/${folderName}/${fileName}`;
  }

  /** 生成字幕文件路径（与视频同目录同名） */
  generateSubtitlePath(videoPath: string, language: string): string {
    const ext = this.extractExt(videoPath);
    const basePath = videoPath.replace(`.${ext}`, "");
    return `${basePath}.${language}.srt`;
  }

  private getDir(resourceType: ResourceType): string {
    switch (resourceType) {
      case "movie":
      case "tv":       return "Movies";
      case "software": return "Software";
      case "music":    return "Music";
      default:         return "Other";
    }
  }

  private extractExt(filename: string): string {
    const parts = filename.split(".");
    return parts.length > 1 ? parts.pop()! : "bin";
  }
}
