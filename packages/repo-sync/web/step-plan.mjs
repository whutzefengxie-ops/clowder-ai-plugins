export function plannedSteps(stage, version) {
  return (
    {
      1: [
        ['source-read', '读取两侧仓库与来源元数据'],
        ['target-check', '核对目标、起点与历史范围'],
        ...(!version ? [['github-deliveries', '核对 PR、直接提交与 Issue 来源']] : []),
        ['delivery-start', '冻结本笔交付'],
      ],
      2: [
        ...(!version ? [['issue-create', '创建 / 复用并回读内部 Issue']] : []),
        ['candidate-build', '准备提交映射并保留内部文件'],
        ['candidate-check', '执行配置的候选检查'],
      ],
      3: [
        ['publish-intent', '保存原发布意图'],
        ['candidate-publish', '推送原候选分支'],
        ['candidate-ref', '回读候选 ref'],
        ['platform-pr', '创建 / 回读原内部 PR'],
        ...(!version ? [['issue-link', '关联并回读内部 Issue 与 PR']] : []),
      ],
      4: [['platform-review', '在内部平台审核并合入']],
      5: [
        ['merge-verify', '核验实际合入的核心文件与历史'],
        ...(!version ? [['issue-state', '核对接收条件、更新应关闭的 Issue 并回读']] : []),
        ['acceptance-save', '保存本笔接收结果'],
        ['execution-record', '保存原执行记录'],
      ],
    }[stage] ?? []
  );
}

// Commands and per-object events are evidence of a fixed business step, never new sibling steps.
export function businessStep(stage, key, plan, parentKey) {
  if (plan.has(key)) return key;
  if (plan.has(parentKey)) return parentKey;
  if (stage === 1) return /ledger|delivery-start/.test(key) ? 'delivery-start' : 'source-read';
  if (stage === 2) return key.startsWith('issue-') && plan.has('issue-create') ? 'issue-create' : 'candidate-build';
  if (stage === 3) return /probe|fetch|candidate-ref/.test(key) ? 'candidate-ref' : 'platform-pr';
  if (stage === 4) return 'platform-review';
  if (/execution-record/.test(key)) return 'execution-record';
  if (key.startsWith('issue-') && plan.has('issue-state')) return 'issue-state';
  if (/receipts-save|acceptance-save/.test(key)) return 'acceptance-save';
  return 'merge-verify';
}

export function projectStep(group) {
  const actual = group.entries.filter(({ step }) => step.startedAt || step.status !== 'PENDING');
  if (!actual.length) return { status: group.status, latest: null, actual };
  const lastTask = actual.at(-1).task;
  const entries = actual.filter((entry) => entry.task.id === lastTask.id);
  // Parent wrappers can span later stages. Prefer the actual business events where available.
  const primary = entries.filter(
    ({ step }) => step.key === group.key || (group.key === 'acceptance-save' && step.key === 'receipts-save'),
  );
  const evidence = primary.length ? primary : entries;
  const latestByObject = new Map();
  for (const entry of evidence) {
    const subject = entry.step.label?.match(/#\d+/)?.[0] ?? '';
    latestByObject.set(`${entry.step.key}:${subject}`, entry);
  }
  const states = [...latestByObject.values()];
  const latestEvidence = new Map();
  for (const entry of entries)
    latestEvidence.set(`${entry.step.key}:${entry.step.label?.match(/#\d+/)?.[0] ?? ''}`, entry);
  const failed = [...latestEvidence.values()].findLast((entry) => entry.step.status === 'FAILED');
  const running = states.findLast((entry) => entry.step.status === 'RUNNING');
  const latest = failed || running || states.at(-1);
  return { actual, latest, status: latest.step.status };
}
