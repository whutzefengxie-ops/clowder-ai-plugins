import { dispatch } from './actions.mjs';
import { fail } from './config.mjs';
import { safeError } from './execution.mjs';
import { body, requireToken, send } from './http.mjs';
import { Tasks } from './tasks.mjs';

export function serverScopes(receiver, options) {
  const executors = new Map();
  const legacyCurrent = async () => (options.connection ? options.connection.current() : receiver);
  const legacy = new Tasks(legacyCurrent, (input) =>
    options.connection ? options.connection.run(input, options) : dispatch(receiver, input, options),
  );
  async function scope(url) {
    if (!options.projects)
      return {
        receiver: await legacyCurrent(),
        options: { ...options, tasks: legacy },
        tasks: legacy,
      };
    const params = new URL(url, 'http://localhost').searchParams;
    if (params.getAll('project').length > 1) fail('PROJECT_NOT_FOUND', '请求只能指定一个项目');
    const id = params.get('project') ?? 'default',
      connection = await options.projects.connection(id);
    if (!executors.has(id))
      executors.set(
        id,
        new Tasks(
          () => connection.current(),
          (input) => connection.run(input, options),
          id,
        ),
      );
    const tasks = executors.get(id);
    return {
      receiver: await connection.current(),
      tasks,
      options: {
        ...options,
        connection,
        tasks,
        projectId: id,
        workspace: () => projectWorkspace(id),
      },
    };
  }
  async function projectWorkspace(id) {
    const listed = await options.projects.list();
    await Promise.all(listed.projects.map(enrich));
    return { ...listed, currentId: id };
  }
  async function enrich(project) {
    if (project.error) return;
    try {
      const bound = await options.projects.connection(project.id);
      if (!executors.has(project.id))
        executors.set(
          project.id,
          new Tasks(
            () => bound.current(),
            (input) => bound.run(input, options),
            project.id,
          ),
        );
      const executor = executors.get(project.id),
        task = await executor.latest();
      project.operationStatus = task?.status ?? null;
      project.busy = Boolean(
        executor.busy() ||
          ['RUNNING', 'CANCELLING', 'STOP_UNCONFIRMED'].includes(task?.status) ||
          task?.persistence?.status === 'FAILED',
      );
    } catch (error) {
      project.error = safeError(error);
    }
  }
  return {
    scope,
    update: (next) => {
      if (!options.projects && !options.connection) receiver = next;
    },
    close: () => Promise.all([legacy.close(), ...[...executors.values()].map((tasks) => tasks.close())]),
  };
}
export function checkProjectInput(input, id) {
  if (!id) return;
  if ((input.projectId && input.projectId !== id) || (id !== 'default' && input.projectId !== id))
    fail('PROJECT_CHANGED', '页面与请求项目不一致，请返回原项目核对；未执行其他项目的操作');
}

export async function projectRequest(request, response, options, token, path) {
  if (path !== '/api/projects' || !options.projects) return false;
  if (request.method === 'GET') {
    send(response, 200, { token, workspace: await options.projects.list() });
    return true;
  }
  requireToken(request, token);
  if (request.method !== 'POST') {
    send(response, 404, { code: 'NOT_FOUND' });
    return true;
  }
  const input = await body(request);
  if (!['create', 'rename'].includes(input.action)) fail('INVALID_PROJECT_INPUT', '项目操作需要 create 或 rename');
  const project = await options.projects[input.action](input);
  send(response, input.action === 'create' ? 201 : 200, {
    project,
    workspace: await options.projects.list(),
  });
  return true;
}
