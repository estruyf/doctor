const esbuild = require('esbuild');

const production = process.env.NODE_ENV === 'production' || !process.argv.includes('--watch');
const watch = process.argv.includes('--watch');

const extensionConfig = {
  entryPoints: ['src/extension.ts'],
  bundle: true,
  outfile: 'dist/extension.js',
  external: ['vscode'],
  platform: 'node',
  target: 'node18',
  sourcemap: !production,
  minify: production,
  define: {
    'process.env.NODE_ENV': JSON.stringify(production ? 'production' : 'development')
  }
};

const panelConfig = {
  entryPoints: ['src/panel/index.tsx'],
  bundle: true,
  outfile: 'dist/panel.js',
  platform: 'browser',
  target: 'es2020',
  sourcemap: !production,
  minify: production,
  jsx: 'automatic',
  define: {
    'process.env.NODE_ENV': JSON.stringify(production ? 'production' : 'development')
  }
};

// The doctor.json editor is a separate page from the side panel, so it gets
// its own bundle rather than making the panel carry the form
const configEditorConfig = {
  ...panelConfig,
  entryPoints: ['src/config-editor/index.tsx'],
  outfile: 'dist/config-editor.js',
};

if (watch) {
  Promise.all([
    esbuild.context(extensionConfig).then(ctx => ctx.watch()),
    esbuild.context(panelConfig).then(ctx => ctx.watch()),
    esbuild.context(configEditorConfig).then(ctx => ctx.watch()),
  ]).then(() => console.log('Watching for changes...'));
} else {
  Promise.all([
    esbuild.build(extensionConfig),
    esbuild.build(panelConfig),
    esbuild.build(configEditorConfig),
  ]).then(() => console.log('Build complete')).catch(() => process.exit(1));
}

