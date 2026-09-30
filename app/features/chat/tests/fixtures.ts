import * as SQMatchFactory from "~/db/seed/factories/SQMatchFactory";
import type * as UserFactory from "~/db/seed/factories/UserFactory";

/** SendouQ match between pool users 2-5 (alpha) and 6-9 (bravo), the owner of the chat rooms the tests exercise. */
export async function setupSqMatch(users: ReturnType<typeof UserFactory.pool>) {
	const alphaUserIds = [users.id(2), users.id(3), users.id(4), users.id(5)];
	const bravoUserIds = [users.id(6), users.id(7), users.id(8), users.id(9)];

	const match = await SQMatchFactory.create({ alphaUserIds, bravoUserIds });

	return { match, alphaUserIds, bravoUserIds };
}
