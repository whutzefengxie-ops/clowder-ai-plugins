# CodeAgent

[中文](README.md)

Install and authenticate the native CodeAgent client on the Host computer first. The environment starting the Host must resolve `codeagent` on PATH.

Install this package directory (`packages/codeagent`, not the repository root) or its packed tgz in Settings → Plugins. Enable the plugin, choose CodeAgent as a project member's tool, save the member, and send a message. There is no preset or plugin configuration to save.

The static launch command is `codeagent --acp`. The Host supplies project/session context and Clowder MCP. This package neither installs the native client nor copies credentials, and does not sandbox the native client.

For an explicitly chosen bypass profile, retain or create a separate entry in the ACP client library using command `codeagent` and arguments `--acp`, `--permission-mode`, `bypassPermission`, `--allow-dangerously-skip-permissions`. The static default does not enable bypass.

Existing library bindings (`plugin:official.acp-clients/<id>`), arguments and bootstrap roots are preserved. This plugin uses `plugin:official.codeagent/codeagent` and does not migrate existing roles. This is a local candidate, not a published marketplace release. Windows bootstrap trust and audit policies are separate Host deployment settings.
