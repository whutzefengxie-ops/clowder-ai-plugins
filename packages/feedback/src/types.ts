export interface Storage {
  get(key: string): Promise<{ revision: number; value: unknown } | undefined>;
  compareAndSet(key: string, expected: number | null, value: unknown): Promise<{ applied: boolean; revision?: number }>;
}
export interface OwnerContext {
  kind: 'owner-http-request'; userId: string; pluginInstanceId: string; operation: 'read' | 'write';
  requestIdentity?: { requestId: string }; signal: AbortSignal; assertCurrent(): Promise<void>;
}
/** Versioned optional Host seam. Older Hosts fail closed while direct/manual feedback remains usable. */
export interface Diagnostics {
  describe(): Promise<{ environment: string; projectRoot: string; clients: Client[] }>;
  collect(): Promise<string>;
  analyze(input: { clientId: string; prompt: string; instructions: string; signal: AbortSignal }): Promise<string>;
}
export interface Client { id: string; label: string; provider: string; model: string }
export interface Host {
  pluginInstanceId: string; dataPath: string; storage: Storage;
  config: { get(key: string): Promise<unknown> }; secrets: { get(key: string): Promise<string | undefined> };
  diagnostics?: Diagnostics;
}
export interface Command { executable: string; args: string[] }
export interface Profile {
  id: string; label: string; revision: number; provider: 'github' | 'gitlab' | 'organization-cli';
  mode: 'manual' | 'both'; project: string; apiBaseUrl: string; issueCreateUrl: string;
  visibility: 'public' | 'private' | 'unknown'; tokenRef: 'githubToken' | 'gitlabToken';
  command?: Command; attachmentCommand?: Command; attachmentOrigins: string[];
}
export interface Attachment { id: string; name: string; mime: 'image/png' | 'image/jpeg' | 'image/webp'; base64: string; sha256: string }
export interface Report { title: string; body: string; attachments: Attachment[] }
export interface RemoteIssue { id: string; url: string; title: string; body: string }
export interface Journal {
  version: 1; id: string; owner: string; report: Report; target: Profile; digest: string;
  state: 'draft' | 'approved' | 'writing' | 'unknown' | 'published'; issue?: RemoteIssue; safeError?: string;
}
export interface Provider {
  preflight(signal: AbortSignal): Promise<{ principal: string; visibility: string; attachments: boolean }>;
  upload(attachment: Attachment, id: string, signal: AbortSignal): Promise<string>;
  create(report: Report, id: string, signal: AbortSignal): Promise<RemoteIssue>;
  reconcile(id: string, signal: AbortSignal): Promise<RemoteIssue | undefined>;
  read(issue: RemoteIssue, signal: AbortSignal): Promise<RemoteIssue>;
}
