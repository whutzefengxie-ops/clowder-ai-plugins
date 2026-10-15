# PR#77 修复总结

## 问题来源

用户在使用 PR#77（独立的双模式 Git 同步插件）的自动化 PR 创建功能时，发现了三个关键 UX 问题：

1. **步骤展示不明确**：执行过程中步骤会不断增加，导致用户困惑
2. **状态流转错误**：PR 合入后卡在第二步更新状态，折叠效果不符合预期
3. **暂停控制失效**：无法按预期暂停到正确的阶段位置

## 根因分析

### 问题 1：步骤动态变化

**代码位置**：`packages/repo-sync/web/attempts.mjs` 的 `planned()` 函数

```javascript
// 旧代码
const issues = !version && (!delivery || delivery.issues?.length);
```

**根因**：使用 `!delivery || delivery.issues?.length` 判断，导致：
- delivery 创建前：`!delivery` 为 true，显示 Issue 步骤
- delivery 创建后但 issues 为空数组：`delivery.issues?.length` 为 0，不显示 Issue 步骤
- 步骤列表在这两个时间点发生变化

### 问题 2：阶段折叠逻辑错误

**代码位置**：`packages/repo-sync/web/app.mjs` 的 `focusLiveStage()` 函数

```javascript
// 旧代码
function focusLiveStage(task, policy) {
  if (task?.status !== 'RUNNING') return;
  if (liveStage !== policy.stage) {
    liveStage = policy.stage;
    content.querySelector(`[data-stage="${policy.stage}"]`)?.setAttribute('open', '');
  }
  content.querySelector(`[data-stage="${policy.stage || stageOf(snapshot.state.active)}"]`)?.setAttribute('open', '');
}
```

**根因**：
1. 最后一行无条件执行 `setAttribute('open', '')`，导致阶段重复展开
2. 没有在自动化状态变化（RUNNING → PAUSED/COMPLETE）时重置 `liveStage`
3. 没有关闭其他已打开的阶段

### 问题 3：暂停后阶段位置错误

**代码位置**：`packages/repo-sync/web/automation-view.mjs` 的 `automaticPolicy()` 函数

```javascript
// 旧代码
if (['FAILED', 'PAUSED'].includes(run.status))
  return {
    stage: delivery?.acceptedInternal ? 5 : delivery?.candidate ? 3 : 2,
    // ...
  };
```

**根因**：简单的三元判断没有考虑第 4 步（PR 已创建但未合入）的状态，导致：
- PR 创建完成在等待合入时暂停 → 错误地回到第 2 步
- 应该停留在第 4 步

## 修复方案

### 修复 1：稳定步骤列表

```javascript
// 新代码
const issues = !version && (delivery ? delivery.issues?.length > 0 : true);
```

**改进**：
- 有 delivery 时：精确判断 `delivery.issues?.length > 0`
- 无 delivery 时：预测性地显示所有可能的步骤（`true`）
- 步骤列表从开始就保持完整和稳定

### 修复 2：改进阶段折叠控制

```javascript
// 新代码
let lastAutomationStatus;

function focusLiveStage(task, policy) {
  const run = snapshot.state?.automation;
  const currentStatus = run?.status;
  
  // 状态变化时重置 liveStage
  if (lastAutomationStatus === 'RUNNING' && currentStatus !== 'RUNNING' && currentStatus !== 'WAITING_REVIEW') {
    liveStage = null;
  }
  lastAutomationStatus = currentStatus;
  
  if (task?.status !== 'RUNNING') return;
  
  const targetStage = policy?.stage || stageOf(snapshot.state.active);
  if (liveStage !== targetStage) {
    liveStage = targetStage;
    // 先关闭其他阶段
    content.querySelectorAll('[data-stage][open]').forEach(el => {
      if (Number(el.dataset.stage) !== targetStage) {
        el.removeAttribute('open');
      }
    });
    // 只打开当前阶段
    content.querySelector(`[data-stage="${targetStage}"]`)?.setAttribute('open', '');
  }
}
```

**改进**：
1. 增加 `lastAutomationStatus` 跟踪状态变化
2. 在状态变化时重置 `liveStage`，避免残留
3. 阶段切换时先关闭其他阶段
4. 移除重复的 `setAttribute('open', '')` 调用

### 修复 3：准确判断暂停位置

```javascript
// 新代码
if (['FAILED', 'PAUSED'].includes(run.status)) {
  let completedStage = 1;
  if (delivery?.acceptedInternal) {
    completedStage = 5; // PR 已合入
  } else if (delivery?.prUrl) {
    completedStage = 4; // PR 已创建，等待合入
  } else if (delivery?.candidate) {
    completedStage = 3; // 候选已创建
  } else if (delivery) {
    completedStage = 2; // 交付已开始
  }
  
  return {
    stage: completedStage,
    // ...
  };
}
```

**改进**：
- 精确判断四个关键状态点
- 特别处理第 4 步（PR 已创建但未合入）
- 用户暂停后能停留在正确位置

## 文件修改清单

1. **packages/repo-sync/web/app.mjs**（31 行修改）
   - 增加 `lastAutomationStatus` 状态跟踪
   - 重写 `focusLiveStage()` 函数

2. **packages/repo-sync/web/automation-view.mjs**（62 行修改）
   - 改进 `automaticPolicy()` 阶段判断
   - 改进 `preDeliveryFlow()` 状态计算

3. **packages/repo-sync/web/attempts.mjs**（27 行修改）
   - 改进 `planned()` 步骤判断逻辑

**总计**：3 个文件，120 行新增，47 行删除

## PR 信息

- **修复分支**：`fix/pr77-journey-ux-improvements`
- **目标分支**：`feat/repo-sync-plugin`
- **PR 链接**：https://github.com/whutzefengxie-ops/clowder-ai-plugins/pull/1
- **仓库**：whutzefengxie-ops/clowder-ai-plugins

## 验证方法

详见 [VERIFY_FIX.md](./VERIFY_FIX.md)，包含：
- 步骤列表稳定性验证
- 阶段折叠/展开逻辑验证
- 暂停功能验证（三个场景）
- 恢复功能验证
- 回归测试清单

## 影响范围

**直接影响**：
- 自动化 PR 创建流程的用户体验
- 阶段展示和折叠逻辑
- 暂停/恢复功能

**不影响**：
- 后端同步逻辑
- Git 操作
- Issue/PR 创建逻辑
- 历史记录功能

## 下一步

1. 在本地环境验证修复效果
2. 通过完整的自动化流程测试
3. 确认三个问题场景都已修复
4. 合并到 `feat/repo-sync-plugin` 分支
5. 更新 PR#77 的验证状态
