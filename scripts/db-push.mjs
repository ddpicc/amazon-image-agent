import { spawnSync } from 'child_process'
import { loadEnvFile } from './load-env.mjs'

loadEnvFile('.env.local')

const result = spawnSync(
  process.platform === 'win32' ? 'npx.cmd' : 'npx',
  ['prisma', 'db', 'push'],
  {
    stdio: 'inherit',
    env: process.env,
  },
)

if (typeof result.status === 'number') {
  process.exit(result.status)
}

process.exit(1)
