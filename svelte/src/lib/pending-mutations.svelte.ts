/** Mutations in flight across the page, for the hydration marker the e2e helpers wait on. */
export const pendingMutations = $state({ count: 0 });

/** Counts the promise as a mutation in flight until it settles. */
export async function trackMutation<T>(run: () => Promise<T>): Promise<T> {
	pendingMutations.count++;
	try {
		return await run();
	} finally {
		pendingMutations.count--;
	}
}
