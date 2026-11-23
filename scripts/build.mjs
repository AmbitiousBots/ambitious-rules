import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { isBuiltin } from 'node:module';
import { bundleOptions } from '@ambitious/kit/build/bundle-options';
import { build } from 'esbuild';

const root = join(import.meta.dirname, '..');
const notices = ['NOTICE', 'LICENSE', 'node_modules/zod/LICENSE'].map(path => readFileSync(join(root, path), 'utf8'));
const result = await build({
  ...bundleOptions({ root, module: 'rules' }),
  footer: { js: '/*\n' + notices.join('\n') + '\n*/' },
  metafile: true,
});
for (const output of Object.values(result.metafile.outputs)) {
  for (const dependency of output.imports) {
    if (dependency.external && !isBuiltin(dependency.path)) throw new Error(`The executable still depends on ${dependency.path}. Bundle every runtime dependency.`);
  }
}
