/**
 * Registry of "does a mounted form have unsaved changes" checkers, consumed by
 * `UnsavedChangesGuard.svelte` in the root layout. Forms register a checker on
 * mount instead of wiring navigation blocking themselves.
 */

const dirtyCheckers = new Set<() => boolean>();

export function registerDirtyChecker(checker: () => boolean) {
	dirtyCheckers.add(checker);
	return () => {
		dirtyCheckers.delete(checker);
	};
}

export function hasUnsavedChanges() {
	for (const checker of dirtyCheckers) {
		if (checker()) return true;
	}
	return false;
}
