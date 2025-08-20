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
	private key: string;
	private options: GotoOptions = {
		replaceState: false,
		noScroll: true,
		keepFocus: true,
		invalidateAll: false
	};

	constructor(args: { key: string; defaultValue: z.infer<S>; schema: S; options?: GotoOptions }) {
		const parsed = z.safeParse(args.schema, page.url.searchParams.get(args.key));

		if (parsed.success) {
			this.internalState = parsed.data;
		} else {
			this.internalState = args.defaultValue;
		}

		this.key = args.key;
		this.options = { ...this.options, ...args.options };

		afterNavigate((navigation) => {
			const value = navigation.to?.url.searchParams.get(args.key) as z.infer<S> | undefined;
			this.internalState = value ?? args.defaultValue;
		});
	}

	get state() {
		return this.internalState!;
	}

	update(newValues: z.infer<S>) {
		this.internalState = newValues;

		// eslint-disable-next-line svelte/prefer-svelte-reactivity
		const newParams = new URLSearchParams(page.url.searchParams);

		newParams.set(this.key, typeof newValues === 'string' ? newValues : JSON.stringify(newValues));

		goto(`?${newParams.toString()}`, this.options);
	}
}
