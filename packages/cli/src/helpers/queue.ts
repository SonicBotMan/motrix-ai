// helpers/queue.ts — shared QueueManager + TaskDatabase bootstrap for CLI

import { Aria2Client, QueueManager, TaskDatabase, loadConfig } from '@motrix-ai/core'

export function createQueue() {
  const config = loadConfig()
  const aria2 = new Aria2Client({
    rpcUrl: config.aria2.rpc_url,
    rpcSecret: config.aria2.rpc_secret,
  })
  const db = new TaskDatabase()
  db.init()
  return {
    config,
    queue: new QueueManager(aria2, db),
    db,
    rpcUrl: config.aria2.rpc_url,
  }
}
