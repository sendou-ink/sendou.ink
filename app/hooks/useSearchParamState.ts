import * as React from "react";
import { useSearchParams } from "react-router";

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
	const [searchParams] = useSearchParams();
	const rawValue = searchParams.get(name);

	const [state, setState] = React.useState<T>(resolveStateFromUrl);

	// Sync state when the URL search param changes externally (e.g. via <Link>
	// navigation). Internal updates use history.replaceState which bypasses
	// react-router, so they don't trigger this branch.
	const previousRawValueRef = React.useRef(rawValue);
	if (rawValue !== previousRawValueRef.current) {
		previousRawValueRef.current = rawValue;
		setState(resolveStateFromUrl());
	}

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

	function resolveStateFromUrl() {
		if (rawValue === null || rawValue === undefined) {
			return defaultValue;
		}

		return revive(rawValue) ?? defaultValue;
	}
}
