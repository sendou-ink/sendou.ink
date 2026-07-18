import type {
	KyselyPlugin,
	PluginTransformQueryArgs,
	PluginTransformResultArgs,
	QueryResult,
	RootOperationNode,
	UnknownRow,
} from "kysely";

/**
 * Drop-in replacement for Kysely's `ParseJSONResultsPlugin`. Produces the same
 * results but skips the per-node reviver callback, jsonPath string building and
 * double tree walk of the original, making large JSON result sets several times
 * faster to transform.
 */
export class FastParseJSONResultsPlugin implements KyselyPlugin {
	transformQuery(args: PluginTransformQueryArgs): RootOperationNode {
		return args.node;
	}

	async transformResult(
		args: PluginTransformResultArgs,
	): Promise<QueryResult<UnknownRow>> {
		for (const row of args.result.rows) {
			parseObjectInPlace(row, false);
		}

		return args.result;
	}
}

function maybeJson(value: string) {
	return (
		(value.startsWith("{") && value.endsWith("}")) ||
		(value.startsWith("[") && value.endsWith("]"))
	);
}

function parseValue(value: unknown): unknown {
	if (typeof value === "string" && maybeJson(value)) {
		let parsed: unknown;
		try {
			parsed = JSON.parse(value);
		} catch {
			return value;
		}
		return parseValue(parsed);
	}

	if (Array.isArray(value)) {
		for (let i = 0; i < value.length; i++) {
			value[i] = parseValue(value[i]);
		}
		return value;
	}

	if (isPlainObject(value)) {
		parseObjectInPlace(value, true);
		return value;
	}

	return value;
}

function parseObjectInPlace(
	obj: Record<string, unknown>,
	isParsedJson: boolean,
) {
	for (const key of Object.keys(obj)) {
		// prevent prototype pollution
		if (key === "__proto__") {
			if (isParsedJson) delete obj[key];
			continue;
		}

		const parsed = parseValue(obj[key]);

		// prevent prototype pollution
		if (
			key === "constructor" &&
			isPlainObject(parsed) &&
			Object.hasOwn(parsed, "prototype")
		) {
			delete parsed.prototype;
		}

		obj[key] = parsed;
	}
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
	if (typeof value !== "object" || value === null) return false;

	const proto = Object.getPrototypeOf(value);
	return proto === null || proto === Object.prototype;
}
