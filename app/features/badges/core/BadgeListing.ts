/**
 * The badge list of `/badges`: narrowed down by the name searched for and split into the badges the viewer
 * manages and every other badge.
 */

interface ListedBadge {
	displayName: string;
	permissions: { MANAGE: number[] };
}

/**
 * The badges whose name contains `search` (ignoring case, an empty search matching all), split into the ones
 * `viewerId` manages and the rest. Without a viewer every badge is in `other`.
 */
export function split<T extends ListedBadge>(
	badges: T[],
	{ viewerId, search }: { viewerId: number | undefined; search: string },
) {
	const normalizedSearch = search.toLowerCase();
	const managed: T[] = [];
	const other: T[] = [];

	for (const badge of badges) {
		if (!badge.displayName.toLowerCase().includes(normalizedSearch)) continue;

		if (viewerId !== undefined && badge.permissions.MANAGE.includes(viewerId)) {
			managed.push(badge);
		} else {
			other.push(badge);
		}
	}

	return { managed, other };
}
