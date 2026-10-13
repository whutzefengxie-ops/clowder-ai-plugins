import { randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import packageInfo from '../package.json' with { type: 'json' };
import { dispatch } from './actions.mjs';
import { fail } from './config.mjs';
import { safeError } from './execution.mjs';
import { body, requestPath, requireToken, send } from './http.mjs';
import { configure } from './settings.mjs';
import { Tasks } from './tasks.mjs';

const web = resolve(dirname(fileURLToPath(import.meta.url)), '../web');
const assets = new Map([
  ['/', 'index.html'],
  ['/app.mjs', 'app.mjs'],
  ['/styles.css', 'styles.css'],
  ['/progress.mjs', 'progress.mjs'],
  ['/receipts.mjs', 'receipts.mjs'],
  ['/version.mjs', 'version.mjs'],
  ['/connections.mjs', 'connections.mjs'],
  ['/operations.mjs', 'operations.mjs'],
  ['/operation-view.mjs', 'operation-view.mjs'],
  ['/files.mjs', 'files.mjs'],
  ['/pr.mjs', 'pr.mjs'],
  ['/diagnostics.mjs', 'diagnostics.mjs'],
  ['/issues.mjs', 'issues.mjs'],
]);
export function createReceiverServer(receiver, options = {}) {
  const token = randomBytes(32).toString('hex');
  const current = async () => (options.connection ? options.connection.current() : receiver);
  const tasks = new Tasks(current, async (input) =>
    options.connection ? options.connection.run(input, options) : dispatch(receiver, input, options),
  );
  options = {
    ...options,
    tasks,
    runtime: {
      productVersion: packageInfo.version,
      apiVersion: 2,
      instanceId: randomBytes(12).toString('hex'),
      startedAt: new Date().toISOString(),
    },
  };
  const server = createServer(async (request, response) => {
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader(
      'Content-Security-Policy',
      "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; object-src 'none'; base-uri 'none'; frame-ancestors 'self'",
    );
    try {
      const path = requestPath(request, server.address()?.port);
      if (options.connection && path.startsWith('/api/')) receiver = await options.connection.current();
      if (path.startsWith('/api/tasks')) {
        requireToken(request, token);
        return await taskRequest(request, response, path, tasks);
      }
      if (request.method === 'GET') return await get(receiver, options, token, path, response);
      if (request.method !== 'POST' || path !== '/api/action') return send(response, 404, { code: 'NOT_FOUND' });
      requireToken(request, token);
      if (tasks.busy()) fail('OPERATION_RUNNING', '已有任务执行中，请等待或取消原任务；不能修改绑定或重复操作');
      receiver = await post(receiver, options, token, await body(request), response);
    } catch (error) {
      return sendError(response, error);
    }
  });
  server.shutdown = async () => {
    await tasks.close();
    if (server.listening) await new Promise((done) => server.close(done));
  };
  return server;
}
async function taskRequest(request, response, path, tasks) {
  if (request.method === 'POST' && path === '/api/tasks')
    return send(response, 202, { operation: await tasks.start(await body(request)) });
  const match = /^\/api\/tasks\/([a-f0-9]{32})(\/cancel)?$/.exec(path);
  if (!match) return send(response, 404, { code: 'NOT_FOUND' });
  if (request.method === 'POST' && match[2]) return send(response, 202, { operation: await tasks.cancel(match[1]) });
  if (request.method !== 'GET' || match[2]) return send(response, 404, { code: 'NOT_FOUND' });
  const operation = await tasks.latest(match[1]);
  return send(
    response,
    operation ? 200 : 404,
    operation ? { operation } : { code: 'TASK_NOT_FOUND', message: '尚未找到这笔任务，请继续查询原请求' },
  );
}
async function post(receiver, options, token, input, response) {
  let result;
  if (options.connection) {
    result = await options.connection.run(input, options);
    receiver = await options.connection.current();
  } else if (input.action === 'configure') receiver = await configure(receiver, input);
  else result = await dispatch(receiver, input, options);
  if (['configure', 'configure-repositories'].includes(input.action))
    await get(receiver, options, token, '/api/status', response);
  else
    send(response, 200, {
      result: ['heads', 'tags', 'conflict', 'baseline-file'].includes(input.action) ? result : null,
      state: await receiver.status(),
    });
  return receiver;
}
function sendError(response, error) {
  const status = ['HOST_REJECTED', 'ORIGIN_REJECTED', 'TOKEN_REJECTED'].includes(error.code)
    ? 403
    : error.code === 'BODY_TOO_LARGE'
      ? 413
      : 409;
  return send(response, status, safeError(error));
}
async function get(receiver, options, token, path, response) {
  if (assets.has(path)) {
    const file = assets.get(path);
    const type = file.endsWith('.mjs') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : 'text/html';
    response.setHeader('Content-Type', `${type}; charset=utf-8`);
    response.end(await readFile(resolve(web, file)));
    return;
  }
  if (path !== '/api/status') return send(response, 404, { code: 'NOT_FOUND' });
  const {
    sourceUrl,
    internalUrl,
    internalWebUrl,
    sourceBranch,
    targetBranch,
    mode,
    internalPaths,
    mergePaths,
    checkProfile,
    commitClosureVerified,
    bindingId,
  } = receiver?.config ?? {};
  return send(response, 200, {
    token,
    state: receiver ? await receiver.status() : null,
    config: receiver
      ? {
          sourceUrl,
          internalUrl,
          internalWebUrl,
          prMode: receiver.config.pullRequests ? 'automatic' : 'manual',
          sourceBranch,
          targetBranch,
          mode,
          internalPaths,
          mergePaths,
          checkProfile,
          commitClosureVerified,
          bindingId,
        }
      : null,
    connection: options.connection?.describe(),
    platform: {
      prMode: receiver?.config.pullRequests ? 'automatic' : 'manual',
      repositoryUrl: receiver?.config.internalWebUrl ?? null,
    },
    service: 'production',
    runtime: options.runtime,
    operation: await options.tasks.latest(),
  });
}
export function listen(server, port = 5187) {
  if (!Number.isInteger(port) || port < 1024 || port > 65535 || [3003, 3004].includes(port))
    throw new Error('本地工具端口无效或被 Clowder AI 保留');
  return new Promise((resolvePromise, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => resolvePromise(server));
  });
}
