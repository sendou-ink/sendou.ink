import { z } from 'zod';
import type * as z4 from 'zod/v4/core';
import { page } from '$app/state';
import { goto } from '$app/navigation';
import { afterNavigate } from '$app/navigation';

interface GotoOptions {
	replaceState?: boolean;
	noScroll?: boolean;
	keepFocus?: boolean;
	invalidateAll?: boolean;
	invalidate?: (string | URL | ((url: URL) => boolean))[] | undefined;
}

// xxx: add encoding (option to JSON.stringify)
// xxx: add option for the back button to navigate to the previous path
// 		instead of going through the search param changes
export class SearchParamState<S extends z4.$ZodType<unknown>> {
	private internalState = $state<z.infer<S>>();
	private defaultValue: z.infer<S>;
	private key: string;
	private schema: S;
	private options: GotoOptions = {
		replaceState: false,
		noScroll: true,
		keepFocus: true,
		invalidateAll: false
	};

	/**
	 * Creates a state that is synchronized with a URL search parameter
	 *
	 * @param args Configuration options
	 * @param args.key The name of the search parameter
	 * @param args.defaultValue Default value to use when parameter is missing or invalid
	 * @param args.schema Zod schema to validate the parameter
	 * @param args.options Navigation options
	 *
	 * @example
	 * ```ts
	 * // Create a state synchronized with the 'tab' search parameter
	 * const currentTab = new SearchParamState({
	 *   key: 'tab',
	 *   schema: z.enum(['home', 'search', 'settings']),
	 *   defaultValue: 'home'
	 * });
	 *
	 * // Access the current state
	 * console.log(currentTab.state);
	 *
	 * // Update the state and 'tab' search parameter
	 * currentTab.update('search');
	 * ```
	 */
	constructor(args: { key: string; defaultValue: z.infer<S>; schema: S; options?: GotoOptions }) {
		this.key = args.key;
		this.options = { ...this.options, ...args.options };
		this.schema = args.schema;
		this.defaultValue = args.defaultValue;

		this.updateStateFromParams(page.url.searchParams);

		afterNavigate((navigation) => {
			// eslint-disable-next-line svelte/prefer-svelte-reactivity
			this.updateStateFromParams(navigation.to?.url.searchParams ?? new URLSearchParams());
		});
	}

	/**
	 * Gets the current state
	 * @returns The current state that matches the schema type
	 */
	get state() {
		return this.internalState!;
	}

	/**
	 * Updates the state and synchronizes it with the URL search parameter
	 * @param newValues The new state values to set
	 */
	update(newValues: z.infer<S>) {
		this.internalState = newValues;

		// eslint-disable-next-line svelte/prefer-svelte-reactivity
		const newParams = new URLSearchParams(page.url.searchParams);

		newParams.set(this.key, typeof newValues === 'string' ? newValues : JSON.stringify(newValues));

		goto(`?${newParams.toString()}`, this.options);
	}

	private updateStateFromParams(params: URLSearchParams) {
		const rawValue = params.get(this.key);
		let valueToValidate: unknown = rawValue;

		if (rawValue) {
			try {
				valueToValidate = JSON.parse(rawValue);
			} catch {
				valueToValidate = rawValue;
			}
		}

		const parsed = z.safeParse(this.schema, valueToValidate);

		if (parsed.success) {
			this.internalState = parsed.data;
		} else {
			this.internalState = this.defaultValue;
		}
	}
}
