# Feedback plugin

[Chinese guide](README.md)

The bottom sidebar entry opens a title, description and screenshot form. Prefer diagnosis with an existing configured Clowder Agent Client, inspect the sanitized material, then review the editable report. Direct submission works without an agent. Automatic submission returns the actual Issue URL after remote title/body verification. Manual creation remains available with inline text copy, binary PNG copy and original image downloads.

Requires the companion Host implementation for UI commands in `activity-bar.bottom` and the optional diagnostics port. This candidate is intentionally outside the release catalog and default installation list. Build with `pnpm --filter @clowder-ai/feedback build`, run `npm pack --ignore-scripts` inside the package, then install the archive through Plugin Settings.

The default target is the public `zts212653/clowder-ai` repository. Configure `githubToken` or `gitlabToken` using secret fields. Never put credentials in destination JSON or CLI arguments.

Set `destinations` to a JSON array. Each profile contains `id`, `label`, positive integer `revision`, `provider` (`github`, `gitlab`, `organization-cli`), `mode` (`both`, `manual`), `project` (`namespace/repository`), `apiBaseUrl`, `issueCreateUrl`, `visibility` (`public`, `private`, `unknown`), and `attachmentOrigins`. URLs require HTTPS, no credentials, query or fragment. The manual URL must identify the configured project's new Issue page. GitLab uses an API base such as `https://gitlab.example.test/api/v4`. Increment the revision whenever configuration changes. Every configured byte, report and image digest is bound to approval; edits revoke approval. Internal profiles never fall back to a public service.

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

Up to four PNG/JPEG/WebP images, 4 MB each and 8 MB total. Images are not sent to the model. Inspect and obscure sensitive pixels yourself. Text filtering cannot guarantee removal of business secrets.

The versioned investigation recipe is `src/recipe.ts`. The Host supplies bounded environment facts and optional recent structured warning/error summaries from its current instance only. No source tree traversal, credential/config dumps or session database reads. Materials are sanitized before the configured client receives them, and the client may use a cloud model. Diagnosis uses an empty scratch directory, no tools, read-only policy, no business session resume and no native session persistence. Results are filtered again and reviewed by the owner before upload.

The durable journal fences writes before any remote mutation. Ambiguous results are reconciled without another create attempt; a missing match does not establish failure. Recovery examines up to 100 recent Issues. Disabling or uninstalling the plugin does not delete retained drafts, images or receipts.

Run `pnpm --filter @clowder-ai/feedback test`, `typecheck` and `build`. Synthetic transport tests do not replace real model, enterprise adapter or remote publication acceptance.
