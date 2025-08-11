import * as R from 'remeda';
import type { UserWithPlusTier } from '$lib/server/db/tables';

export function membersToCommonPlusTierRating(members: Pick<UserWithPlusTier, 'plusTier'>[]) {
	return R.sum(
		members
			.map((m) => m.plusTier ?? 100)
			.sort((a, b) => a - b)
			.slice(0, 4)
	);
}
