import { spawnSync } from 'node:child_process';

import { postInstall } from 'fumadocs-mdx/next';

const args = process.argv.slice(2);

if (args.length === 0) {
  console.error('Usage: node scripts/run-next.mjs <next-command> [...args]');
  process.exit(1);
}

await postInstall({
  configPath: 'source.config.ts',
  outDir: '.source',
  index: {},
});

const result = spawnSync('next', args, {
  stdio: 'inherit',
  shell: process.platform === 'win32',
  env: {
    ...process.env,
    _FUMADOCS_MDX: '1',
  },
});

process.exit(result.status ?? 1);
