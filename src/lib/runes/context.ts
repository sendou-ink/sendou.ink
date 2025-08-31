// Credit: https://github.com/svecosystem/runed/blob/main/packages/runed/src/lib/utilities/context/context.ts

import { getContext, hasContext, setContext } from 'svelte';

/**
 * Creates a type-safe context.
 *
 * @template TContext The type of the context value.
 */
export class Context<TContext> {
	readonly #name: string;
	readonly #key: symbol;

	/**
	 * Creates a type-safe context.
	 *
	 * @param name The name of the context.
	 *
	 * @example
	 * ```ts
	 * // Create context in a separate file
	 * export const theme = new Context<'light' | 'dark'>('theme');
	 *
	 * // Set context in a component
	 * theme.set('light');
	 *
	 * // Read context in a child component
	 * const theme = theme.get();
	 * ```
	 */
	constructor(name: string) {
		this.#name = name;
		this.#key = Symbol(name);
	}

	/**
	 * The key used to get and set the context value.
	 */
	get key(): symbol {
		return this.#key;
	}

	/**
	 * Returns true if the context value has been set by a parent.
	 */
	exists(): boolean {
		return hasContext(this.#key);
	}

	/**
	 * Gets the context value of the closest parent.
	 *
	 * @throws Error if the context does not exist.
	 */
	get(): TContext {
		const context: TContext | undefined = getContext(this.#key);
		if (context === undefined) {
			throw new Error(`Context "${this.#name}" not found`);
		}
		return context;
	}

	/**
	 * Gets the context value of the closest parent or the provided fallback value if the context does not exist.
	 */
	getOr<TFallback>(fallback: TFallback): TContext | TFallback {
		const context: TContext | undefined = getContext(this.#key);
		if (context === undefined) {
			return fallback;
		}
		return context;
	}

	/**
	 * Sets the context value for this key and returns it.
	 */
	set(context: TContext): TContext {
		return setContext(this.#key, context);
	}
}
