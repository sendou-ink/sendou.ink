import { add } from "date-fns";
import { beforeEach, describe, expect, test } from "vitest";
import * as ScrimPostFactory from "~/db/seed/factories/ScrimPostFactory";
import * as UserFactory from "~/db/seed/factories/UserFactory";
import { db } from "~/db/sql";
import { dateToDatabaseTimestamp } from "~/utils/dates";
import { toDBBoolean } from "~/utils/sql";
import { wrappedAction } from "~/utils/Test";
import { action } from "../actions/scrims.server";
import type { scrimsActionSchema } from "../scrims-schemas";

const scrimsAction = wrappedAction<typeof scrimsActionSchema>({
	action,
	isJsonSubmission: true,
});

describe("Scrims NEW_REQUEST action", () => {
	let postId: number;
	let requesterPickupUserIds: number[];
	const postStartsAt = add(new Date(), { days: 1 });

	beforeEach(async () => {
		const postOwner = await UserFactory.createRegular();
		const postMembers = await UserFactory.createMany(3);
		await UserFactory.createAdmin();
		requesterPickupUserIds = (await UserFactory.createMany(3)).map(
			(user) => user.id,
		);

		const post = await ScrimPostFactory.create({
			startsAt: dateToDatabaseTimestamp(postStartsAt),
			users: [
				{ userId: postOwner.id, isOwner: toDBBoolean(true) },
				...postMembers.map((member) => ({
					userId: member.id,
					isOwner: toDBBoolean(false),
				})),
			],
		});
		postId = post.id;
	});

	test("doesn't store a requester-chosen time for a post without a flexible time range", async () => {
		await scrimsAction(
			{
				_action: "NEW_REQUEST",
				scrimPostId: postId,
				from: { mode: "PICKUP", users: requesterPickupUserIds },
				message: null,
				at: add(postStartsAt, { hours: 5 }),
			},
			{ user: "admin" },
		);

		const request = await db
			.selectFrom("ScrimPostRequest")
			.selectAll()
			.executeTakeFirstOrThrow();

		expect(request.startsAt).toBeNull();
	});
});
