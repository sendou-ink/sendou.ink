import fs from "node:fs";
import path from "node:path";
import type { Argument, Expression, Node } from "oxc-parser";
import { lineOf, parseFile, ROOT } from "./ast.ts";

const ROUTES_FILE = "app/routes.ts";

export interface AppRoute {
	/** Full path pattern, e.g. `/scrims/:id`. */
	path: string;
	file: string;
	/** Line of the route's declaration in `app/routes.ts`. */
	line: number;
	isIndex: boolean;
	/** Wraps its child routes without a path segment of its own. */
	isLayout: boolean;
	/** Renders a page (as opposed to a resource route, only data or a file). */
	hasComponent: boolean;
	hasLoader: boolean;
	hasAction: boolean;
	/** Routes rendered around this one, outermost first. */
	parents: AppRoute[];
}

/** Every route of `app/routes.ts` with its full path, dev only routes left out. */
export function appRoutes(): AppRoute[] {
	const file = parseFile(ROUTES_FILE);
	const routes: AppRoute[] = [];

	const visit = (elements: Argument[], base: string, parents: AppRoute[]) => {
		for (const element of elements) {
			const isSpread = element.type === "SpreadElement";
			const node = unwrap(isSpread ? element.argument : element);
			if (node.type !== "CallExpression" || node.callee.type !== "Identifier") {
				continue;
			}
			const [first, second, third] = node.arguments;

			switch (node.callee.name) {
				case "route": {
					const route = describeRoute(
						joinPath(base, stringOf(first)),
						stringOf(second),
						lineOf(file, node.start),
						false,
						parents,
					);
					routes.push(route);
					visit(arrayOf(third), route.path, [...parents, route]);
					break;
				}
				case "index":
					routes.push(
						describeRoute(
							base || "/",
							stringOf(first),
							lineOf(file, node.start),
							true,
							parents,
						),
					);
					break;
				case "layout": {
					const layout = {
						...describeRoute(
							base || "/",
							stringOf(first),
							lineOf(file, node.start),
							false,
							parents,
						),
						isLayout: true,
					};
					routes.push(layout);
					visit(arrayOf(second), base, [...parents, layout]);
					break;
				}
				case "prefix":
					visit(arrayOf(second), joinPath(base, stringOf(first)), parents);
					break;
			}
		}
	};

	for (const statement of file.program.body) {
		if (statement.type !== "ExportDefaultDeclaration") continue;
		const declaration = unwrap(statement.declaration as Expression);
		if (declaration.type === "ArrayExpression") {
			visit(declaration.elements as Argument[], "", []);
		}
	}

	return routes;
}

/** The route rendering a pathname: the matching one with the most static segments, index routes winning over their layouts. */
export function matchRoute(routes: AppRoute[], pathname: string) {
	let best: { route: AppRoute; score: number } | null = null;

	for (const route of routes) {
		if (route.isLayout) continue;
		const score = matchScore(route.path, pathname);
		if (score === null) continue;
		const total = score + (route.isIndex ? 0.5 : 0);
		if (!best || total > best.score) best = { route, score: total };
	}

	return best?.route ?? null;
}

function matchScore(pattern: string, pathname: string): number | null {
	const patternSegments = pattern.split("/").filter(Boolean);
	const pathSegments = pathname.split("/").filter(Boolean);
	let score = 0;
	let index = 0;

	for (const segment of patternSegments) {
		if (segment === "*") return score;

		const pathSegment = pathSegments[index];
		const isOptional = segment.endsWith("?");
		if (pathSegment === undefined) {
			if (isOptional) continue;
			return null;
		}

		if (segment.startsWith(":")) {
			score += 1;
		} else if (segment.replace(/\?$/, "") === decodeURIComponent(pathSegment)) {
			score += 10;
		} else if (isOptional) {
			continue;
		} else {
			return null;
		}
		index++;
	}

	return index === pathSegments.length ? score : null;
}

function describeRoute(
	routePath: string,
	routeFile: string,
	line: number,
	isIndex: boolean,
	parents: AppRoute[],
): AppRoute {
	const file = `app/${routeFile}`;
	const source = fs.existsSync(path.join(ROOT, file))
		? fs.readFileSync(path.join(ROOT, file), "utf8")
		: "";
	const exports = (name: string) =>
		new RegExp(
			`export (async )?(const|function|let) ${name}\\b|export \\{[^}]*\\b${name}\\b[^}]*\\}`,
		).test(source);

	return {
		path: routePath,
		file,
		line,
		isIndex,
		isLayout: false,
		hasComponent: /export default\b/.test(source),
		hasLoader: exports("loader"),
		hasAction: exports("action"),
		parents,
	};
}

function joinPath(base: string, segment: string) {
	if (segment.startsWith("/")) return segment;
	return `${base.replace(/\/$/, "")}/${segment}`;
}

function arrayOf(node: Argument | undefined): Argument[] {
	const unwrapped = node ? unwrap(node as Expression) : null;
	return unwrapped?.type === "ArrayExpression"
		? (unwrapped.elements.filter(Boolean) as Argument[])
		: [];
}

function stringOf(node: Argument | undefined) {
	return node?.type === "Literal" && typeof node.value === "string"
		? node.value
		: "";
}

function unwrap(node: Node): Expression {
	const expression = node as Expression;
	if (
		expression.type === "TSAsExpression" ||
		expression.type === "TSSatisfiesExpression" ||
		expression.type === "ParenthesizedExpression"
	) {
		return unwrap(expression.expression);
	}
	return expression;
}
