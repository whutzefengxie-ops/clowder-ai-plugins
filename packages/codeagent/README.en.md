# CodeAgent

[中文](README.md)

Install and authenticate the native CodeAgent client on the Host computer first. This data-only package does not install the native client or copy credentials/history.

Install this package directory (`packages/codeagent`, not the repository root) or its packed tgz in Settings → Plugins. Enable the plugin, choose CodeAgent as a project member's tool, save the member, and send a message. Connection overrides are optional.

The default command is `codeagent --acp`. No preset or empty configuration save is needed. Several members can select the same client while keeping separate identities and sessions. The Host supplies project/session context and authorized Clowder MCP.

Use the existing plugin configuration to override the executable, arguments (one per line), bootstrap directory or ACP permission response. Find a native executable on the Host with `Get-Command codeagent -All | Select-Object Source`; enter its path without extra quotes. Overrides such as `{"command":"D:/Tools/CodeAgent/codeagent.exe"}` persist in the Host project and affect subsequent executions of members referencing this plugin. Unspecified fields inherit package defaults; member identities remain separate.

The bootstrap directory holds Host-generated startup files, not the native binary or the project. Leave it automatic or check an absolute directory on the Host computer. Inspection may create a private subdirectory; it does not change ancestor/system-drive ACLs. Windows trust and restricted audit recovery are Host deployment policies, outside plugin authority.

ACP permission requests default to `deny`. The matching Host currently has no interactive ACP approval channel; `auto_allow` requires an explicit owner choice. This is separate from native CodeAgent bypass, MCP grants and bootstrap trust. Native bypass is optional and explicit: arguments `--acp`, `--permission-mode`, `bypassPermission`, `--allow-dangerously-skip-permissions`. Arbitrary environment overrides are unsupported; never put secrets in argv or the package. Native account, endpoint, model and certificate configuration remain owned by CodeAgent.

Existing library (`plugin:official.acp-clients/<id>`) and native bindings are preserved. This plugin uses `plugin:official.codeagent/codeagent` and never merges bindings by executable name. Disable blocks new calls without deleting roles/configuration/history; re-enable or correct the same configuration to recover without reinstalling.

Version `0.1.0-beta.2` requires fixed ACP declarations with `configurationKey` overrides (paired Host branch `feat/codeagent-plugin-extension`, foundation `99d68baa8`). Older static-only Hosts reject it. This remains an unpublished candidate using an unstable Host contract. Packed-artifact and Host lifecycle evidence must be distinguished from real enterprise CodeAgent model/MCP/collaboration acceptance, which runs in the enterprise environment.
