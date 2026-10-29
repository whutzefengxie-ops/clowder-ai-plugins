# Feedback plugin

[Chinese guide](README.md)

The bottom sidebar entry opens a title, description and screenshot form. Prefer diagnosis with an existing configured Clowder Agent Client, inspect the sanitized material, then review the editable report. Direct submission works without an agent. Automatic submission returns the actual Issue URL after remote title/body verification. Manual creation remains available with inline text copy, binary PNG copy and original image downloads.

Requires Host PR #1732 for generic UI commands/panels in `activity-bar.bottom`. Analysis uses ordinary configured members, threads, messaging and optional `runtimeInfo.get()`, with no Client/provider changes. This candidate remains outside the release catalog and default installation list. Build with `pnpm --filter @clowder-ai/feedback build`, then install the packed archive through Plugin Settings.

The default target is the public `zts212653/clowder-ai` repository. Configure `githubToken` or `gitlabToken` using secret fields. Never put credentials in destination JSON or CLI arguments.

Set `destinations` to a JSON array. Each profile contains `id`, `label`, positive integer `revision`, `provider` (`github`, `gitlab`, `organization-cli`), `mode` (`both`, `manual`), `project` (`namespace/repository`), `apiBaseUrl`, `issueCreateUrl`, `visibility` (`public`, `private`, `unknown`), and `attachmentOrigins`. URLs require HTTPS, no credentials, query or fragment. The manual URL must identify the configured project's new Issue page. GitLab uses an API base such as `https://gitlab.example.test/api/v4`. Increment the revision whenever configuration changes. Every configured byte, report and image digest is bound to approval; edits revoke approval. Client/account/destination facts also have a confirmation revision. Native destinations that cannot be resolved are explicitly unknown. Internal profiles never fall back to a public service.

GitLab uploads approved image bytes through its project Markdown upload API and verifies remote SHA-256 before referencing them. Public project uploads may be directly accessible even when an Issue is confidential. GitHub image submission requires an organization-approved `attachmentCommand: { executable, args }` and allowed `attachmentOrigins`. Without this adapter the UI preserves all images and offers manual creation; text-only automatic submission still works. Independent attachment command URLs currently require credential-free HTTPS readback.

The organization CLI adapter uses `command: { executable, args }`, fixed argv and no shell. A wrapper may use existing `glab`, internal CLI or gateway tools. It reads one UTF-8 JSON request from stdin and writes one JSON response to stdout, within 30 seconds and 2 MB. Only OS paths, temporary directory and native authentication HOME directory environment variables are inherited. The wrapper owns authentication.

Requests contain `protocol: "clowder-feedback/v1"`, `op`, a target (`id`, `project`, `apiBaseUrl`, `visibility`) and `payload`. Supported operations:

| Operation | Payload | Response |
| --- | --- | --- |
| preflight | empty object | principal, project, visibility, canCreate, attachments |
| upload | submissionId, attachment with base64/mime/sha256 | url, sha256, visibility |
| create | submissionId, title, body including marker | id/iid/number, url, title, body/description |
| read | id | actual remote Issue content |
| reconcile | submissionId | object containing issues array, retaining submission markers |

Issue links must be actual server-returned URLs inside the configured project. Opening a page or a successful CLI exit is not publication evidence. Attachment URLs must match allowed origins and remote bytes must match the approved digest.

Up to four PNG/JPEG/WebP images, 4 MB each and 8 MB total. Images are decoded to PNG locally and metadata is removed again on the server. Preview and confirmation bind the actual send copy. Original bytes are retained separately for local downloads and never uploaded automatically. Images are not sent to the model. Inspect and obscure sensitive pixels yourself. Text filtering cannot guarantee removal of business secrets.

The versioned recipe is `src/recipe.ts` (`feedback-diagnosis/3`). Choose the analysis member explicitly; an optional project directory sets the diagnostic scope, rather than selecting an existing conversation. Starting analysis includes bounded recent error evidence after local redaction, with an explanation and expandable input preview instead of duplicate consent checkboxes. The configured Client may send that sanitized input to its cloud model. Raw log files are not uploaded as Issue attachments, though the final report may quote relevant evidence. Ordinary response history provides exact input association and durable completion, recovering missed live events and panel reopen without invoking again. New replies use readable Markdown title/body; legacy signed JSON is also accepted. Status polling updates progress in place. Results are sanitized again, previewed and edited before explicit publication; stopping the wait does not forcibly terminate the Client. Read-only guidance remains a prompt, not a sandbox.

Image bytes live in the Host-provisioned dataPath under content hashes; CAS records contain metadata only and stay within the real Host 1 MiB value limit. The durable journal fences writes before any remote mutation. Each upload receipt is checkpointed. Failures before Issue creation allow explicit edit recovery while retaining receipts; unknown creation is never resent. Known Issue links remain visible while readback is pending. Ambiguous results are reconciled without another create attempt; a missing match does not establish failure. Recovery examines up to 100 recent Issues. Disabling or uninstalling the plugin does not delete retained drafts, images or receipts.

Run `pnpm --filter @clowder-ai/feedback test`, `typecheck` and `build`. Synthetic transport tests do not replace real model, enterprise adapter or remote publication acceptance.
