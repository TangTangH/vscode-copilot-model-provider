const esbuild = require('esbuild');
const fs = require('fs');

async function build() {
	fs.rmSync('dist/webview', { recursive: true, force: true });

	await esbuild.build({
		entryPoints: ['webview-src/modelManagementApp.tsx'],
		outdir: 'dist/webview',
		bundle: true,
		format: 'iife',
		platform: 'browser',
		target: ['chrome120'],
		entryNames: '[name]',
		assetNames: '[name]',
		minify: true,
		jsx: 'automatic',
		legalComments: 'none',
		define: {
			'process.env.NODE_ENV': '"production"',
		},
	});
}

build().catch((error) => {
	console.error(error);
	process.exitCode = 1;
});
