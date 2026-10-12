#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { isAbsolute } from 'node:path';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createRepoSyncMcpServer } from './mcp-server.mjs';
import { configuredReceiver } from './settings.mjs';

try {
  const file = process.env.REPO_SYNC_CONFIG_FILE;
  if (!file || !isAbsolute(file)) throw new Error('Private configuration file required');
  const receiver = await configuredReceiver(JSON.parse(await readFile(file, 'utf8')));
  const server = createRepoSyncMcpServer(receiver);
  for (const signal of ['SIGINT', 'SIGTERM'])
    process.once(signal, () => {
      void server.close();
    });
  await server.connect(new StdioServerTransport());
} catch {
  console.error('[repo-sync] 插件无法启动，请检查私有配置与台账；未执行 Git 操作。');
  process.exitCode = 1;
}
