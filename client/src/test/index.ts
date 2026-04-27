/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
import * as path from 'path';
import * as Mocha from 'mocha';
import { glob } from 'glob';

export function run(): Promise<void> {
	// Create the mocha test
	const mocha = new Mocha({
		ui: 'tdd',
	});
	mocha.timeout(100000);

	const testsRoot = __dirname;

	return new Promise(async (resolve, reject) => {
		try {
			const files = await glob('**.test.js', { cwd: testsRoot });
			files.forEach(f => mocha.addFile(path.resolve(testsRoot, f as string)));
			mocha.run(failures => {
					if (failures > 0) {
						reject(new Error(`${failures} tests failed.`));
					} else {
						resolve();
					}
				});
		} catch (err) {
        	console.error(err);
        	reject(err);
    	}
	});
}