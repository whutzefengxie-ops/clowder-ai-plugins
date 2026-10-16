export async function openHistory(page) {
  const history = page.locator('.history-disclosure');
  await history.waitFor({ state: 'attached' });
  if (!(await history.evaluate((node) => node.open))) await history.locator(':scope > summary').click();
}
