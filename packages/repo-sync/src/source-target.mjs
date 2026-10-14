import { fail } from './config.mjs';
import { freezeTag } from './tags.mjs';

export async function sourceTarget(receiver, state, heads, selection) {
  const kind = selection?.kind ?? 'latest';
  let commit = heads.upstream;
  let frozenTag;
  if (kind === 'tag') {
    frozenTag = await freezeTag(receiver.git, selection.value);
    commit = frozenTag.commit;
  } else if (kind === 'commit') {
    if (!/^[a-f0-9]{40}$/.test(selection.value ?? '')) fail('INVALID_TARGET', '请填写完整的目标 commit SHA');
    commit = await receiver.git.sha(selection.value);
  } else if (kind !== 'latest') fail('INVALID_TARGET', '目标需要 latest、tag 或 commit');
  if (
    !(await receiver.git.isAncestor(state.accepted.upstream, commit)) ||
    !(await receiver.git.isAncestor(commit, heads.upstream))
  )
    fail('TARGET_NOT_FORWARD', '目标必须位于已接收版本到当前上游分支之间，不能回退或跨分支');
  if (!(await receiver.git.mainBoundary(commit, heads.upstream)))
    fail('TARGET_NOT_MAIN_BOUNDARY', '目标不在上游主干接受边界上，不能截断一个 PR');
  return {
    kind,
    value: kind === 'latest' ? 'latest' : selection.value,
    commit,
    ...(frozenTag ? { frozenTag } : {}),
    selectedAt: new Date().toISOString(),
  };
}
