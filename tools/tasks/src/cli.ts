import { writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { renderBoard } from './board.ts'
import { claim, currentView } from './claim.ts'
import { next, view } from './derive.ts'
import { gitIn } from './git.ts'
import { loadFromDisk } from './load.ts'
import { doneByDay, renderStatus } from './status.ts'
import { validateGenerated, validateTasks } from './validate.ts'

const ROOT = resolve(import.meta.dirname, '../../..')
const git = gitIn(ROOT)
const now = (): number => Math.floor(Date.now() / 1000)
const log = (s: string): void => console.log(s)

const [cmd = 'help', ...rest] = process.argv.slice(2).filter((a) => a !== '--')
const flag = (name: string): boolean => rest.includes(`--${name}`)
const opt = (name: string): string | undefined => {
  const i = rest.indexOf(`--${name}`)
  return i >= 0 ? rest[i + 1] : undefined
}
const positional = rest.filter((a, i) => !a.startsWith('--') && !rest[i - 1]?.match(/^--(lane|phase|owner)$/))

function run(): number {
  switch (cmd) {
    case 'validate': {
      const r = validateTasks(loadFromDisk(ROOT))
      const gen = validateGenerated(ROOT)
      for (const w of r.warnings) console.warn(`warning: ${w}`)
      for (const e of [...r.errors, ...gen]) console.error(`error: ${e}`)
      const n = loadFromDisk(ROOT).tasks.length
      if (r.errors.length || gen.length) return 1
      log(`tasks:validate ok — ${n} tasks, ${r.warnings.length} warnings`)
      return 0
    }
    case 'board': {
      const live = flag('live')
      const v = live ? currentView(git, ROOT, true, now(), log) : view(loadFromDisk(ROOT).tasks, [], now())
      const md = renderBoard(v, { live })
      if (live) log(md)
      else {
        writeFileSync(join(ROOT, 'docs/BOARD.md'), md)
        log('wrote docs/BOARD.md')
      }
      return 0
    }
    case 'status': {
      writeFileSync(join(ROOT, 'docs/STATUS.md'), renderStatus(loadFromDisk(ROOT).tasks, doneByDay(git)))
      log('wrote docs/STATUS.md')
      return 0
    }
    case 'next': {
      const v = currentView(git, ROOT, !flag('local'), now(), log)
      const lane = opt('lane')
      const phase = opt('phase')
      const r = next(v, { ...(lane ? { lane } : {}), ...(phase ? { phase } : {}) })
      for (const s of r.skipped) log(`skipped ${s.task.id}: ${s.reason}`)
      if (!r.task) {
        log('no ready task matches; see pnpm tasks:board --live')
        return 2
      }
      log(`next: ${r.task.id} — ${r.task.title}`)
      log(`  lane ${r.task.lane}, size ${r.task.size}, critical path ${v.cp.get(r.task.id)}`)
      log(`  file ${r.task.path}`)
      log(`  claim it with: pnpm tasks:claim ${r.task.id}`)
      return 0
    }
    case 'claim': {
      const id = positional[0]
      if (!id) {
        log('usage: pnpm tasks:claim <id> [--owner <name>] [--no-push] [--local]')
        return 1
      }
      const owner = opt('owner')
      return claim({
        root: ROOT, git, id, push: !flag('no-push'), remote: !flag('local'), nowSec: now(), log,
        ...(owner ? { owner } : {}),
      })
    }
    default:
      log('usage: tasks <validate | board [--live] | status | next [--lane X] [--phase P] [--local] | claim <id>>')
      return cmd === 'help' ? 0 : 1
  }
}

process.exitCode = run()
