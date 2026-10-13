#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { createConnection } from './connections.mjs';
import { discover } from './github.mjs';
import { createReceiverServer, listen } from './server.mjs';
import { configuredReceiver } from './settings.mjs';

const [operation, configPath, ...args] = process.argv.slice(2);
try {
  if (!configPath)
    throw new Error(
      '用法：clowder-repo-sync <setup|serve|status|adopt|discover|tags|select-tag|start|issue|prepare|resolve|cancel-version|pr|clear-pr|create-pr|recover|receipts|unlock> <私有配置.json> [参数]',
    );
  const connection = ['setup', 'serve'].includes(operation) ? await createConnection(configPath) : null;
  const receiver = connection
    ? await connection.current()
    : await configuredReceiver(JSON.parse(await readFile(configPath, 'utf8')));
  const serve = async () => {
    const port = Number(args[0] ?? 5187);
    const server = await listen(createReceiverServer(receiver, { connection }), port);
    for (const signal of ['SIGINT', 'SIGTERM'])
      process.once(signal, () => {
        void server.shutdown().catch(() => {
          console.error('执行器停止结果待确认，请在本机核对进程与执行锁。');
        });
      });
    console.log(`真实仓库工作台：http://127.0.0.1:${port}/`);
    console.log('正式服务：请在本机网页配置仓库与基线。未配置平台适配器时，PR 在内部平台手工创建。');
  };
  const actions = {
    status: () => receiver.status(),
    adopt: () => receiver.adopt(args[0], args[1]),
    discover: () => discover(receiver),
    start: () => receiver.start(),
    issue: () => receiver.linkIssue(args[0], args[1], args[2]),
    prepare: () => receiver.prepare(),
    pr: () => receiver.linkPr(args[0], { previousUrl: args[1] }),
    'clear-pr': () => receiver.linkPr(null, { previousUrl: args[0] }),
    'create-pr': () => receiver.createPr(),
    recover: () => receiver.recover(),
    receipts: async () => receiver.receipts(JSON.parse(await readFile(args[0], 'utf8'))),
    unlock: () => receiver.store.unlock(args[0] === '--confirm-no-writers'),
    tags: () => receiver.tags(),
    'select-tag': () => receiver.selectTag(args[0]),
    'cancel-version': () => receiver.cancelVersion(),
    resolve: async () => receiver.resolve(args[0], args[1], args[2] ? await readFile(args[2], 'utf8') : undefined),
    setup: serve,
    serve,
  };
  if (!Object.hasOwn(actions, operation)) throw new Error('未知命令');
  const result = await actions[operation]();
  if (!['setup', 'serve'].includes(operation))
    console.log(JSON.stringify(operation === 'status' ? result : (result ?? { ok: true }), null, 2));
} catch (error) {
  console.error(
    `${error.code ?? 'CONFIGURATION_ERROR'}: ${error instanceof SyntaxError ? '配置 JSON 无效，请在本机核对；未执行操作。' : error.message}`,
  );
  process.exitCode = 1;
}
