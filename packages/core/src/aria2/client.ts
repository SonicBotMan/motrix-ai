// aria2/client.ts — aria2 JSON-RPC 客户端
// 对应 PRD §7.3 数据流：Queue Manager → aria2 RPC

import type { Task, TaskStatus, FileEntry } from '../types.js'
import { Aria2Error } from '../errors.js'
import { createLogger } from '../logger.js'

const logger = createLogger('aria2')

interface Aria2Options {
  rpcUrl?: string // 默认 http://127.0.0.1:6800/jsonrpc
  rpcSecret?: string
}

interface Aria2Status {
  gid: string
  status: 'active' | 'waiting' | 'paused' | 'error' | 'complete' | 'removed'
  totalLength: string
  completedLength: string
  downloadSpeed: string
  uploadSpeed: string
  files: Array<{
    index: string
    path: string
    length: string
    completedLength: string
    uris?: Array<{ uri: string; status: string }>
  }>
  errorMessage?: string
  errorCode?: string
}

export class Aria2Client {
  private rpcUrl: string
  private secret: string
  private idCounter = 0

  constructor(options: Aria2Options = {}) {
    this.rpcUrl = options.rpcUrl ?? 'http://127.0.0.1:6800/jsonrpc'
    this.secret = options.rpcSecret ?? ''
  }

  /** 通用 RPC 调用 */
  private async call<T>(method: string, ...params: unknown[]): Promise<T> {
    const id = `motrix-ai-${++this.idCounter}`
    const secretParam = this.secret ? `token:${this.secret}` : undefined
    const allParams = secretParam ? [secretParam, ...params] : params

    const res = await fetch(this.rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id, method, params: allParams }),
    })

    if (!res.ok) throw new Aria2Error(`aria2 RPC error: ${res.status} ${res.statusText}`)
    const data = (await res.json()) as { result?: T; error?: { code: number; message: string } }
    if (data.error) {
      logger.error(`RPC call "${method}" failed: ${data.error.code} ${data.error.message}`)
      throw new Aria2Error(`aria2 error ${data.error.code}: ${data.error.message}`)
    }
    return data.result!
  }

  /** 添加下载任务（HTTP/磁力/BT） */
  async addUri(uri: string, options?: { dir?: string; filename?: string }): Promise<string> {
    const aria2Opts: Record<string, string> = {}
    if (options?.dir) aria2Opts.dir = options.dir
    if (options?.filename) aria2Opts.out = options.filename
    return this.call<string>('aria2.addUri', [uri], aria2Opts)
  }

  /** 添加 .torrent 文件 */
  async addTorrent(torrentBase64: string, options?: { dir?: string }): Promise<string> {
    const aria2Opts: Record<string, string> = {}
    if (options?.dir) aria2Opts.dir = options.dir
    return this.call<string>('aria2.addTorrent', torrentBase64, [], aria2Opts)
  }

  /** 查询任务状态 */
  async tellStatus(gid: string): Promise<Aria2Status> {
    return this.call<Aria2Status>('aria2.tellStatus', gid)
  }

  /** 查询所有活跃任务 */
  async tellActive(): Promise<Aria2Status[]> {
    return this.call<Aria2Status[]>('aria2.tellActive')
  }

  /** 查询等待中的任务 */
  async tellWaiting(offset = 0, num = 100): Promise<Aria2Status[]> {
    return this.call<Aria2Status[]>('aria2.tellWaiting', offset, num)
  }

  /** 查询已停止的任务 */
  async tellStopped(offset = 0, num = 100): Promise<Aria2Status[]> {
    return this.call<Aria2Status[]>('aria2.tellStopped', offset, num)
  }

  /** 暂停任务 */
  async pause(gid: string): Promise<string> {
    return this.call<string>('aria2.pause', gid)
  }

  /** 恢复任务 */
  async unpause(gid: string): Promise<string> {
    return this.call<string>('aria2.unpause', gid)
  }

  /** 删除任务 */
  async remove(gid: string): Promise<string> {
    return this.call<string>('aria2.remove', gid)
  }

  /** 获取全局统计 */
  async getGlobalStat(): Promise<{
    downloadSpeed: string
    uploadSpeed: string
    numActive: string
    numWaiting: string
    numStopped: string
  }> {
    return this.call('aria2.getGlobalStat')
  }

  /** 修改全局选项 */
  async changeGlobalOption(options: Record<string, string>): Promise<string> {
    return this.call<string>('aria2.changeGlobalOption', options)
  }

  /** 设置全局下载速度限制 (bytes/s, 0=unlimited) */
  async setGlobalSpeedLimit(bytesPerSec: number): Promise<void> {
    await this.changeGlobalOption({ 'max-overall-download-limit': String(bytesPerSec) })
  }

  /** 将 aria2 状态转换为 Motrix AI Task */
  mapToTask(status: Aria2Status, sourceQuery?: string): Task {
    const statusMap: Record<string, TaskStatus> = {
      active: 'downloading',
      waiting: 'pending',
      paused: 'paused',
      complete: 'completed',
      error: 'failed',
      removed: 'failed',
    }

    return {
      id: status.gid,
      source_query: sourceQuery ?? '',
      uri: status.files?.[0]?.uris?.[0]?.uri ?? '',
      status: statusMap[status.status] ?? 'pending',
      // default low priority; tasks set explicitly to >= 3 are protected from low-disk pause
      priority: 2,
      progress:
        status.totalLength === '0'
          ? 0
          : Math.round((Number(status.completedLength) / Number(status.totalLength)) * 100),
      speed: {
        down: Number(status.downloadSpeed),
        up: Number(status.uploadSpeed),
      },
      files: status.files.map((f): FileEntry => ({
        name: f.path.split('/').pop() ?? f.path,
        path: f.path,
        size: Number(f.length),
        completed: Number(f.completedLength),
      })),
      created_at: new Date(),
      retry_count: 0,
      aria2_gid: status.gid,
      error: status.errorMessage,
    }
  }
}
