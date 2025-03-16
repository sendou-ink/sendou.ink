import { useSearchParams } from "@remix-run/react";
import * as React from "react";

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
