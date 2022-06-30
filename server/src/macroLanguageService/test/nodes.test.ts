/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Simon Waelti. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as assert from 'assert';
import * as nodes from '../parser/macroNodes';

export class PrintingVisitor implements nodes.IVisitor {

	public tree: string[] = [];

	public visitNode(node: nodes.Node): boolean {
		this.tree.push(nodes.NodeType[node.type].toLowerCase());
		return true;
	}
}

export function assertNodes(fn: (input: string) => nodes.Node, input: string, expected: string): void {
	let node = fn(input);
	let visitor = new PrintingVisitor();

	node.acceptVisitor(visitor);

	let actual = visitor.tree.join(',') + ',';
	let segments = expected.split(',');
	let oldIndex: number | undefined = undefined;
	let index = -1;

	while (segments.length > 0) {
		let segment = segments.shift()!;
		if (segment === '...') {
			continue;
		}
		index = actual.indexOf(segment + ',', oldIndex);
		if (oldIndex && index <= oldIndex) {
			assert.ok(false, segment + ' NOT found in ' + actual);
		}
		oldIndex = index + segment.length;
	}

	assert.ok(true);
}

suite('Macro - Nodes', () => {

	test('Test Node', function () {

		let node = new nodes.Node();
		assert.strictEqual(node.offset, -1);
		assert.strictEqual(node.length, -1);
		assert.strictEqual(node.parent, null);
		assert.strictEqual(node.getChildren().length, 0);

		let c = 0;
		node.accept((n: nodes.Node) => {
			assert.ok(n === node);
			c += 1;
			return true;
		});
		assert.strictEqual(c, 1);

		let child = new nodes.Node();
		node.adoptChild(child);

		c = 0;
		let expects = [node, child];
		node.accept((n: nodes.Node) => {
			assert.ok(n === expects[c]);
			c += 1;
			return true;
		});
		assert.strictEqual(c, 2);
	});

	test('Test Adopting', function () {

		let child = new nodes.Node();
		let p1 = new nodes.Node();
		let p2 = new nodes.Node();

		assert.ok(child.parent === null);
		assert.strictEqual(p1.getChildren().length, 0);
		assert.strictEqual(p2.getChildren().length, 0);

		p1.adoptChild(child);
		assert.ok(child.parent === p1);
		
		assert.strictEqual(p1.getChildren().length, 1);
		assert.strictEqual(p2.getChildren().length, 0);

		p2.adoptChild(child);
		assert.ok(child.parent === p2);
		assert.strictEqual(p1.getChildren().length, 0);
		assert.strictEqual(p2.getChildren().length, 1);
	});
});