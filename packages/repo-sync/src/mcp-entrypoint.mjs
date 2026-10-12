#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createConnection } from './connections.mjs';
import { createRepoSyncMcpServer } from './mcp-server.mjs';

try {
  const file = process.env.REPO_SYNC_CONFIG_FILE;
  const connection = await createConnection(file);
  const server = createRepoSyncMcpServer(await connection.current(), { connection });
  for (const signal of ['SIGINT', 'SIGTERM'])
    process.once(signal, () => {
      void server.close();
    });
  await server.connect(new StdioServerTransport());
} catch {
  console.error('[repo-sync] 插件无法启动，请检查私有配置与台账；未执行 Git 操作。');
  process.exitCode = 1;
}
