import { dirname, join } from 'node:path';
import { dispatch } from './actions.mjs';
import { fail, validateConfig } from './config.mjs';
import { githubRepository } from './github.mjs';
import { configurationLock, privateLocation, readPrivate, writePrivate } from './private-config.mjs';
import { configuredReceiver } from './settings.mjs';

const allowed = new Set([
  'action',
  'mode',
  'sourceUrl',
  'internalUrl',
  'sourceBranch',
  'targetBranch',
  'internalPaths',
  'mergePaths',
  'commitClosureVerified',
  'expectedRevision',
]);
export async function createConnection(file) {
  const path = await privateLocation(file);
  let revision = null;
  let receiver = null;
  let loaded = false;
  let editable = true;
  async function current() {
    await privateLocation(path);
    const saved = await readPrivate(path);
    if (!loaded || saved.revision !== revision) {
      receiver = saved.config ? await configuredReceiver(saved.config) : null;
      revision = saved.revision;
      loaded = true;
    }
    editable = !receiver || (receiver.config.configurationSource === 'workbench' && !(await receiver.status()));
    return receiver;
  }
  async function save(input) {
    if (!input || Object.keys(input).some((key) => !allowed.has(key)))
      fail('INVALID_CONFIGURATION_INPUT', '网页只接受仓库、分支、模式与文件规则，不能提交执行命令或目录');
    await current();
    if (input.expectedRevision !== revision)
      fail('CONFIGURATION_CHANGED', '配置已变化，请刷新后重新核对，未覆盖原配置');
    if (!editable)
      fail('CONFIGURATION_READ_ONLY', '已登记基线或使用手工配置，不能在向导覆盖；另一套绑定请使用新的私有配置文件');
    const next = validateConfig({
      ...(receiver?.config ?? {}),
      configurationSource: 'workbench',
      sourceUrl: input.sourceUrl,
      internalUrl: input.internalUrl,
      sourceBranch: input.sourceBranch,
      targetBranch: input.targetBranch,
      mode: input.mode,
      internalPaths: input.internalPaths,
      mergePaths: input.mergePaths,
      commitClosureVerified: input.commitClosureVerified,
      stateDir: dirname(path),
      checks: receiver?.config.checks ?? [{ command: 'git', args: ['fsck', '--no-reflogs'] }],
      checkProfile: receiver?.config.checkProfile ?? 'git-integrity',
    });
    next.stateDir = join(dirname(path), 'bindings', next.bindingId.slice(0, 24));
    githubRepository(next.sourceUrl);
    const candidate = await configuredReceiver(next);
    if (await candidate.status()) fail('ALREADY_ADOPTED', '此绑定已有台账，请使用原配置继续，不能覆盖');
    if ((await readPrivate(path)).revision !== revision) fail('CONFIGURATION_CHANGED', '配置已被本地修改，请刷新核对');
    await writePrivate(path, next);
    loaded = false;
    return current();
  }
  await current();
  return {
    current,
    describe: () => ({
      editable,
      revision,
      managed: receiver?.config.configurationSource === 'workbench',
      configurationFile: path,
      stateDir: receiver?.config.stateDir,
    }),
    save: (input) => configurationLock(path, () => save(input)),
    run: (input, options = {}) =>
      configurationLock(path, async () => {
        if (input.action === 'configure-repositories') return save(input);
        const bound = await current();
        if (!bound) fail('CONFIGURATION_REQUIRED', '请先保存真实仓库配置，再登记已有基线');
        verifyExecutionInput(input, bound, revision);
        if (input.action === 'configure') fail('CONFIGURATION_READ_ONLY', '请在仓库连接向导统一修改模式与文件规则');
        return dispatch(bound, input, options);
      }),
  };
}
function verifyExecutionInput(input, bound, revision) {
  if (input.expectedBinding && input.expectedBinding !== bound.config.bindingId)
    fail('CONFIGURATION_CHANGED', '仓库绑定已变化，任务尚未开始 Git 操作；请刷新核对');
  if (input.expectedRevision !== undefined && input.expectedRevision !== revision)
    fail('CONFIGURATION_CHANGED', '私有配置已变化，任务尚未开始 Git 操作；请刷新核对');
}
