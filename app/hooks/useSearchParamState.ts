import { useSearchParams } from "@remix-run/react";
import * as React from "react";
import { z } from "zod/v4";
import type * as z4 from "zod/v4/core";

/** State backed search params. Used when you want to update search params without triggering navigation (runs loaders, rerenders the whole page extra time) */
export function useSearchParamState<T>({
	defaultValue,
	name,
	revive,
}: {
	defaultValue: T;
	name: string;
	/** Function to revive string from search params to value. If returns a null or undefined value then defaultValue gets used. */
	revive: (value: string) => T | null | undefined;
}) {
	return useSearchParamStateEncoder({
		defaultValue: defaultValue,
		name: name,
		revive: revive,
		encode: (val) => String(val),
	});
}

/** State backed search params. Used when you want to update search params without triggering navigation
 ** (runs loaders, rerenders the whole page extra time)
 ** You can supply an `encode` function to reverse create the string representation of your value.
 */
export function useSearchParamStateEncoder<T>({
	defaultValue,
	name,
	revive,
	encode,
}: {
	defaultValue: T;
	name: string;
	/** Function to revive string from search params to value. If returns a null or undefined value then defaultValue gets used. */
	revive: (value: string) => T | null | undefined;
	/** Function to create the string for search params. */
	encode: (value: T) => string;
}) {
	const [initialSearchParams] = useSearchParams();
	const [state, setState] = React.useState<T>(resolveInitialState());

	const handleChange = React.useCallback(
		(newValue: T) => {
			setState(newValue);

			const searchParams = new URLSearchParams(window.location.search);
			const encoded = encode(newValue);
			searchParams.set(name, encoded);

			window.history.replaceState(
				{},
				"",
				`${window.location.pathname}?${String(searchParams)}`,
			);
		},
		[name, encode],
	);

	return [state, handleChange] as const;

	function resolveInitialState() {
		const value = initialSearchParams.get(name);
		if (value === null || value === undefined) {
			return defaultValue;
		}

		return revive(value) ?? defaultValue;
	}
}

// TODO: migrate every usage of useSearchParamState and useSearchParamStateEncoder to useSearchParamStateZod instead (and rename it to useSearchParamState)

/** State backed search params with Zod validation. Used when you want to update search params without triggering navigation
 ** (runs loaders, rerenders the whole page extra time)
 ** Supports Zod schemas and codecs for automatic serialization/deserialization.
 */
export function useSearchParamStateZod<S extends z4.$ZodType<unknown>>({
	key,
	defaultValue,
	schema,
	options,
}: {
	key: string;
	defaultValue: z.infer<S>;
	/** Zod schema to validate the parameter. Can be either a codec or a normal schema. */
	schema: S;
	options?: {
		/** Whether to replace the current history entry instead of pushing a new one. Defaults to true. */
		replaceState?: boolean;
	};
}) {
	const [initialSearchParams] = useSearchParams();
	// @ts-expect-error - Zod codec API
	const isCodec = Boolean(schema.def?.reverseTransform);
	const [state, setState] = React.useState<z.output<S>>(resolveInitialState());

	const handleChange = (newValue: z.output<S>) => {
		setState(newValue);

		const searchParams = new URLSearchParams(window.location.search);
		const encoded = isCodec
			? z.encode(schema, newValue)
			: typeof newValue === "string"
				? newValue
				: JSON.stringify(newValue);
		searchParams.set(key, encoded as string);

		const useReplace = options?.replaceState ?? true;
		const method = useReplace
			? window.history.replaceState
			: window.history.pushState;
		method.call(
			window.history,
			{},
			"",
			`${window.location.pathname}?${String(searchParams)}`,
		);
	};

	return [state, handleChange] as const;

	function resolveInitialState(): z.infer<S> {
		const rawValue = initialSearchParams.get(key);
		const decoded = isCodec
			? decodedValueViaCodec(rawValue)
			: decodedValueViaNormalSchema(rawValue);

		return decoded.success ? decoded.data : defaultValue;
	}

	function decodedValueViaCodec(rawValue: string | null) {
		// @ts-expect-error - Zod codec API
		return z.safeDecode(schema, rawValue);
	}

	function decodedValueViaNormalSchema(rawValue: string | null) {
		let valueToValidate: unknown;

		if (rawValue) {
			try {
				valueToValidate = JSON.parse(rawValue);
			} catch {
				valueToValidate = rawValue;
			}
		}

		return z.safeParse(schema, valueToValidate);
	}
}
