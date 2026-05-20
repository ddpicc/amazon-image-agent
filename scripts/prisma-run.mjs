import { spawnSync } from 'child_process'
import { loadEnvFile } from './load-env.mjs'

loadEnvFile('.env.local')

const args = process.argv.slice(2)

if (args.length === 0) {
  console.error('Usage: node scripts/prisma-run.mjs <prisma args...>')
  process.exit(1)
}

const result = spawnSync(
  process.platform === 'win32' ? 'npx.cmd' : 'npx',
  ['prisma', ...args],
  {
    stdio: 'inherit',
    env: process.env,
  },
)

if (typeof result.status === 'number') {
  process.exit(result.status)
}

process.exit(1)
