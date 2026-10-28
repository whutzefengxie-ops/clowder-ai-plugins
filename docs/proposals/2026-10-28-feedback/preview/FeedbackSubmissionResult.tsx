/** 体验稿返回对象；正式版本由 provider adapter 返回实际 Issue URL。 */
export interface FeedbackSubmissionResult {
  readonly id: string;
  readonly displayNumber: string;
  readonly issueUrl: string;
  readonly simulated: true;
}

export function createPreviewSubmissionResult(): FeedbackSubmissionResult {
  const id = crypto.randomUUID();
  const url = new URL('/', window.location.origin);
  url.searchParams.set('feedbackIssue', id);
  return { id, displayNumber: `PREVIEW-${id.slice(0, 8).toUpperCase()}`, issueUrl: url.href, simulated: true };
}

export function FeedbackSubmissionResultCard({ result }: { result: FeedbackSubmissionResult }) {
  return <div className="fb-submission-result" data-testid="feedback-submission-result">
    <p className="fb-result-label">Issue 链接（模拟） · {result.displayNumber}</p>
    <a className="fb-result-url" href={result.issueUrl} aria-label="返回的 Issue 链接" target="_blank" rel="noopener noreferrer">{result.issueUrl}</a>
    <a className="fb-open-issue" href={result.issueUrl} target="_blank" rel="noopener noreferrer" title="打开本地模拟 Issue 页面">打开 Issue</a>
    <p className="fb-note">这是本地模拟链接。真实接入后，将显示目标平台创建结果返回的 Issue 链接。</p>
  </div>;
}

export function FeedbackIssuePreview({ id }: { id: string }) {
  return <main className="fb-issue-preview">
    <p className="fb-eyebrow">CLOWDER · 本地模拟页面</p>
    <h1>模拟 Issue PREVIEW-{id.slice(0, 8).toUpperCase()}</h1>
    <p data-testid="feedback-preview-issue-id">{id}</p>
    <p>此页面用于体验自动提交后的链接跳转，没有创建真实 Issue，也没有向目标平台上传报告。</p>
    <a href="/">返回反馈预览</a>
  </main>;
}
