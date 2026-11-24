const fs = require('node:fs/promises');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

// One renderer source for the web assistant and the packaged desktop app.
// electron-builder calls this hook even when invoked directly through npx.
const rendererFiles = ['index.html', 'styles.css', 'app.js', 'assistant-data.js', 'assistant-catalog.js', 'local-tools.js', 'totp-qr.js'];
async function syncRenderer(options = {}) {
  const electronDir = options?.electronDir ? path.resolve(options.electronDir) : __dirname;
  const source = options?.sourceDir ? path.resolve(options.sourceDir) : path.resolve(electronDir, '..');
  const trustModuleUrl = pathToFileURL(path.join(__dirname, 'production-trust.mjs')).href;
  const { preflightProductionTrustAssets } = await import(trustModuleUrl);
  // Check source assets before copying so forbidden test keys never land in electron/assets.
  await preflightProductionTrustAssets({
    electronDir,
    rootAssetsDir: path.join(source, 'assets'),
  });
  for (const file of rendererFiles) await fs.copyFile(path.join(source, file), path.join(electronDir, file));
  await fs.cp(path.join(source, 'assets'), path.join(electronDir, 'assets'), { recursive: true });
  const result = await preflightProductionTrustAssets({
    electronDir,
    rootAssetsDir: path.join(source, 'assets'),
  });
  if (options?.silent !== true) {
    process.stdout.write(`${result.notice}\n`);
  }
  return result;
}
module.exports = syncRenderer;
if (require.main === module) {
  syncRenderer().catch(error => {
    const reason = error?.reason || error?.code || 'SYNC_RENDERER_FAILED';
    process.stderr.write(`[sync-renderer] 预检或同步失败 (${reason}): ${error?.message || '未知错误'}\n`);
    process.exitCode = 1;
  });
}
