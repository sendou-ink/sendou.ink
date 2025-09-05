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

// xxx: add option for the back button to navigate to the previous path
// 		instead of going through the search param changes

/**
 * Creates a state that is synchronized with a URL search parameter.
 * @template S Zod schema type for the state
 */
export class SearchParamState<S extends z4.$ZodType<unknown>> {
	private internalState = $state<z.output<S>>();
	private defaultValue: z.infer<S>;
	private key: string;
	/** @link https://zod.dev/codecs */
	private isCodec: boolean;
	private schema: S;
	private options: GotoOptions = {
		replaceState: false,
		noScroll: true,
		keepFocus: true,
		invalidateAll: false
	};

	/**
	 * Creates a state that is synchronized with a URL search parameter. Default serialization is JSON.stringify (except for strings), but this can be customized via a Zod codec
	 *
	 * @param args Configuration options.
	 * @param args.key The name of the search parameter.
	 * @param args.defaultValue Default value to use when parameter is missing or invalid.
	 * @param args.schema Zod schema to validate the parameter. Can be either a codec or a normal schema.
	 * @param args.options Navigation options.
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
		/** @ts-expect-error TODO: figure out the correct type */
		this.isCodec = Boolean(args.schema.def.reverseTransform);

		this.updateStateFromParams(page.url.searchParams);

		afterNavigate((navigation) => {
			const current = navigation.from?.url.searchParams.get(this.key);
			const next = navigation.to?.url.searchParams.get(this.key);
			if (current === next) return;

			// eslint-disable-next-line svelte/prefer-svelte-reactivity
			this.updateStateFromParams(navigation.to?.url.searchParams ?? new URLSearchParams());
		});
	}

	/**
	 * The current state.
	 */
	get state() {
		return this.internalState!;
	}

	/**
	 * Updates the states value and synchronizes it with the URL search parameter.
	 *
	 * @param newValues The new state value to set.
	 */
	update(newValues: z.output<S>) {
		this.internalState = newValues;

		// eslint-disable-next-line svelte/prefer-svelte-reactivity
		const newParams = new URLSearchParams(page.url.searchParams);

		const encoded = this.isCodec
			? // not safeEncode because we should be able to trust the value we encode unlike decoding
				z.encode(this.schema, newValues)
			: typeof newValues === 'string'
				? // no need to encode, it's already a string
					newValues
				: // default to JSON.stringify if no other way of encoding specified as a codec
					JSON.stringify(newValues);
		newParams.set(this.key, encoded as string); // xxx: can we constrain the value?

		// eslint-disable-next-line svelte/no-navigation-without-resolve
		goto(`?${newParams.toString()}`, this.options);
	}

	private updateStateFromParams(params: URLSearchParams) {
		const rawValue = params.get(this.key);
		const decoded = this.isCodec
			? this.decodedValueViaCodec(rawValue)
			: this.decodedValueViaNormalSchema(rawValue);

		if (decoded.success) {
			this.internalState = decoded.data;
		} else {
			this.internalState = this.defaultValue;
		}
	}

	private decodedValueViaCodec(rawValue: string | null) {
		return z.safeDecode(this.schema, rawValue as any);
	}

	private decodedValueViaNormalSchema(rawValue: string | null) {
		let valueToValidate;

		if (rawValue) {
			try {
				valueToValidate = JSON.parse(rawValue);
			} catch {
				valueToValidate = rawValue;
			}
		}

		return z.safeParse(this.schema, valueToValidate);
	}
}
