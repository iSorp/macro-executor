const gulp = require('gulp');
const ts = require('gulp-typescript');
const typescript = require('typescript');
const sourcemaps = require('gulp-sourcemaps');
const del = require('del');
const es = require('event-stream');
const vsce = require('@vscode/vsce');
const nls = require('vscode-nls-dev');
const sourceMap = require('source-map');

const clientProject = ts.createProject('./client/tsconfig.json', { typescript });
const serverProject = ts.createProject('./server/tsconfig.json', { typescript });

const inlineMap = true;
const inlineSource = false;
const clientOutDest = 'client/out';
const serverOutDest = 'server/out';

const languages = [
	{ id: 'de',		folderName: 'deu' }, 
	{ id: 'zh-cn', 	folderName: 'chs', transifexId: 'zh-hans' },
	{ id: 'zh-tw', 	folderName: 'cht', transifexId: 'zh-hant' }
];

sourceMap.SourceMapConsumer.initialize({
	'lib/mappings.wasm': require.resolve('source-map/lib/mappings.wasm')
});

const cleanTask = function() {
	return del(['client/out/**', 'server/out/**', 'package.nls.*.json', 'macro-executor*.vsix']);
};

const compileClientTask = function() {
	return doCompile(false, clientProject, clientOutDest);
};

const compileServerTask = function() {
	return doCompile(false, serverProject, serverOutDest);
};

const compileClientNlsTask = function() {
	return doCompile(true, clientProject, clientOutDest);
};

const compileServerNlsTask = function() {
	return doCompile(true, serverProject, serverOutDest);
};

const addI18nTask = function() {
	return gulp.src(['package.nls.json'])
		.pipe(nls.createAdditionalLanguageFiles(languages, 'i18n'))
		.pipe(gulp.dest('.'));
};

const buildTask = gulp.series(cleanTask, compileClientNlsTask, compileServerNlsTask, addI18nTask);

const doCompile = function (buildNls, project, out) {
	var r = project.src()
		.pipe(sourcemaps.init())
		.pipe(project()).js
		.pipe(buildNls ? nls.rewriteLocalizeCalls() : es.through())
		.pipe(buildNls ? nls.createAdditionalLanguageFiles(languages, 'i18n', out) : es.through());

	if (inlineMap && inlineSource) {
		r = r.pipe(sourcemaps.write());
	} else {
		r = r.pipe(sourcemaps.write('../out', {
			// no inlined source
			includeContent: inlineSource,
			// Return relative source map root directories per file.
			sourceRoot: '../src'
		}));
	}

	return r.pipe(gulp.dest(out));
};

const vscePublishTask = function() {
	return vsce.publish();
};

const vscePackageTask = function() {
	return vsce.createVSIX();
};

gulp.task('default', buildTask);

gulp.task('clean', cleanTask);

gulp.task('compile', gulp.series(cleanTask, compileClientTask, compileServerTask));

gulp.task('build', buildTask);

gulp.task('publish', gulp.series(buildTask, vscePublishTask));

gulp.task('package', gulp.series(buildTask, vscePackageTask));
