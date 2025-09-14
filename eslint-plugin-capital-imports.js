/**
 * ESLint plugin to enforce * as import syntax for files starting with capital letters and repositories.
 */

import path from 'path';

const capitalImportsRule = {
	meta: {
		type: 'problem',
		docs: {
			description: 'enforce * as import syntax for capital files and repositories',
			category: 'Stylistic Issues',
			recommended: false
		},
		fixable: null,
		schema: []
	},
	create(context) {
		return {
			ImportDeclaration(node) {
				const source = node.source.value;

				// Skip external packages (but allow relative imports and $lib imports)
				if (!source.startsWith('./') && !source.startsWith('../') && !source.startsWith('$lib/')) {
					return;
				}

				// Extract filename from the import path
				const filename = path.basename(source);

				const isCapitalFile = /^[A-Z][a-zA-Z0-9]*$/.test(filename);
				const isRepository = source.includes('/repositories/');

				if (isCapitalFile || isRepository) {
					// Check if it's using namespace import (* as syntax)
					const hasNamespaceSpecifier = node.specifiers.some(
						(spec) => spec.type === 'ImportNamespaceSpecifier'
					);

					if (!hasNamespaceSpecifier) {
						let message;
						if (isRepository) {
							message = `Repository files should be imported using "* as" syntax: e.g. import * as UserRepository from '$lib/server/db/repositories/user'`;
						} else {
							message = `Files starting with capital letters should be imported using "* as" syntax: e.g. import * as Module from "./Module"`;
						}

						context.report({
							node,
							message
						});
					}
				}
			}
		};
	}
};

export default {
	rules: {
		'capital-imports': capitalImportsRule
	},
	configs: {
		recommended: {
			rules: {
				'capital-imports/capital-imports': 'error'
			}
		}
	}
};
