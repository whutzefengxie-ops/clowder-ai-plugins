// Test-only lifecycle evidence; never print page contents, credentials or configuration.
export async function traceLifecycle(label, operation) {
  console.log(`[browser-test] ${label}: start`);
  try {
    const result = await operation();
    console.log(`[browser-test] ${label}: done`);
    return result;
  } catch (error) {
    console.error(`[browser-test] ${label}: failed (${error?.name ?? 'Error'})`);
    throw error;
  }
}

export async function launchOwnedBrowser(browserType, options = {}) {
  const server = await browserType.launchServer(options);
  const child = server.process();
  if (!child) throw new Error('Test browser server did not expose its owned child process');
  const releaseExitedPipes = () => {
    if (child.exitCode === null && child.signalCode === null) return;
    // Windows descendants can retain inherited stdio after the browser itself exits.
    // Only release this test-owned, confirmed-exited child's public Node streams.
    for (const stream of new Set([...(child.stdio ?? []), child.stdin, child.stdout, child.stderr]))
      stream?.destroy?.();
  };
  child.once('exit', releaseExitedPipes);
  releaseExitedPipes();
  let browser;
  try {
    browser = await browserType.connect(server.wsEndpoint());
  } catch (error) {
    await server.kill();
    throw error;
  }
  let closing;
  return {
    browser,
    close() {
      closing ??= (async () => {
        releaseExitedPipes();
        await traceLifecycle('owned-browser-server-kill', () => server.kill());
        await traceLifecycle('owned-browser-client-close', () => browser.close());
        if (child.exitCode === null && child.signalCode === null)
          throw new Error('Owned test browser cleanup returned before its process exited');
      })();
      return closing;
    },
  };
}
