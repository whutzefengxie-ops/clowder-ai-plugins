export type FeedbackStage = 'edit' | 'scope' | 'analyzing' | 'review' | 'handoff';

export function FeedbackProgress({ stage, direct }: { stage: FeedbackStage; direct: boolean }) {
  const current = stage === 'edit' ? 1 : stage === 'scope' || stage === 'analyzing' ? 2 : stage === 'review' ? 3 : 4;
  const labels = ['填写问题', '补充分析', '检查报告', '手动创建'];
  return <nav className="fb-steps" aria-label="反馈流程">
    <ol>{labels.map((label, index) => {
      const step = index + 1;
      const skipped = step === 2 && direct && current > 2;
      return <li key={label} data-testid={`feedback-step-${step}`}
        data-state={skipped ? 'skipped' : step < current ? 'done' : step === current ? 'current' : 'next'}
        aria-current={step === current ? 'step' : undefined}>
        <span aria-hidden="true">{skipped ? '−' : step < current ? '✓' : step}</span>
        <strong>{label}{skipped ? '（已跳过）' : ''}</strong>
      </li>;
    })}</ol>
  </nav>;
}
