import { z } from 'zod';
import type * as z4 from 'zod/v4/core';
import { page } from '$app/state';
import { goto } from '$app/navigation';

// xxx: add encoding (option to JSON.stringify)
export class SearchParamState<S extends z4.$ZodType<unknown>> {
	private internalState = $state<z.infer<S>>();
	private noScroll;
	private key;

	constructor(args: { key: string; defaultValue: z.infer<S>; schema: S; noScroll?: boolean }) {
		const parsed = z.safeParse(args.schema, page.url.searchParams.get(args.key));

		if (parsed.success) {
			this.internalState = parsed.data;
		} else {
			this.internalState = args.defaultValue;
		}

		this.key = args.key;
		this.noScroll = args.noScroll ?? true;
	}

	get state() {
		return this.internalState!;
	}

	update(newValues: z.infer<S>) {
		this.internalState = newValues;

		// eslint-disable-next-line svelte/prefer-svelte-reactivity
		const newParams = new URLSearchParams(page.url.searchParams);
		newParams.set(this.key, JSON.stringify(newValues));

		goto(`?${newParams.toString()}`, {
			noScroll: this.noScroll
		});
	}
}
