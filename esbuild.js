const esbuild = require('esbuild');

async function build() {
    const options = {
        bundle: true,
        external: ['vscode'],
        format: 'cjs',
        platform: 'node',
        minify: false,
        sourcemap: true,
    };

    await esbuild.build({
        ...options,
        entryPoints: ['./client/src/extension.ts'],
        outfile: './client/out/extension.js',
    });

    await esbuild.build({
        ...options,
        entryPoints: ['./server/src/server.ts'],
        outfile: './server/out/server.js',
    });
}

build().catch(() => process.exit(1));
