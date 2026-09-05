import * as React from "react";
import type {
	PersistedDefinition,
	PersistedMapDefinition,
} from "./persisted-state";
import * as PersistedState from "./persisted-state";

const SERVER_MAP_SNAPSHOT: Record<string, never> = {};

/** React state backed by a persisted definition, in sync across components and tabs. Setter takes a value or updater. */
export function usePersistedState<T>(
	definition: PersistedDefinition<T>,
): [T, (next: T | ((previous: T) => T)) => void] {
	const subscribeToDefinition = React.useCallback(
		(listener: () => void) => PersistedState.subscribe(definition, listener),
		[definition],
	);
	const value = React.useSyncExternalStore(
		subscribeToDefinition,
		() => PersistedState.read(definition),
		() => definition.default,
	);

	const setValue = (next: T | ((previous: T) => T)) => {
		PersistedState.write(
			definition,
			typeof next === "function"
				? (next as (previous: T) => T)(PersistedState.read(definition))
				: next,
		);
	};

	return [value, setValue];
}

/** Read-only React view of a persisted map definition; write entries via `PersistedState.writeMapEntry`. */
export function usePersistedMapState<T>(
	definition: PersistedMapDefinition<T>,
): Record<string, T> {
	const subscribeToDefinition = React.useCallback(
		(listener: () => void) => PersistedState.subscribeMap(definition, listener),
		[definition],
	);

	return React.useSyncExternalStore(
		subscribeToDefinition,
		() => PersistedState.readMap(definition),
		() => SERVER_MAP_SNAPSHOT,
	);
}
