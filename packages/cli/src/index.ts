#!/usr/bin/env node
// cli/src/index.ts — motrix-ai CLI 入口
// 对应 PRD §5.1 Should Have: CLI 模式

import { Command } from 'commander'
import { registerAskCommand } from './commands/ask.js'
import { registerAddCommand } from './commands/add.js'
import { registerListCommand } from './commands/list.js'
import { registerPauseCommand } from './commands/pause.js'
import { registerConfigCommand } from './commands/config.js'

const program = new Command()

program
  .name('motrix-ai')
  .description('AI-native download manager — describe what you want, AI handles the rest')
  .version('1.2.0')

registerAskCommand(program)
registerAddCommand(program)
registerListCommand(program)
registerPauseCommand(program)
registerConfigCommand(program)

program.parse()
