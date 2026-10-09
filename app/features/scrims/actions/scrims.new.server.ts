import { add } from "date-fns";
import { redirect } from "react-router";
import type * as v from "valibot";
import { requireUser } from "~/features/auth/core/user.server";
import { userIsBanned } from "~/features/ban/core/banned.server";
import * as UserRepository from "~/features/user-page/UserRepository.server";
import { defineAction } from "~/form/define-action.server";
import { dateToDatabaseTimestamp } from "~/utils/dates";
import { invariant } from "~/utils/invariant";
import { errorToast, errorToastIfFalsy } from "~/utils/remix.server";
import { toDBBoolean } from "~/utils/sql";
import { scrimsPage } from "~/utils/urls";
import * as SQGroupRepository from "../../sendouq/SQGroupRepository.server";
import * as TeamRepository from "../../team/TeamRepository.server";
import { getMemberRoleType } from "../../team/team-utils";
import * as ScrimPickupRosterRepository from "../ScrimPickupRosterRepository.server";
import * as ScrimPostRepository from "../ScrimPostRepository.server";
import {
	LUTI_DIVS,
	RANGE_END_MINUTES,
	type RangeEndOption,
	SCRIM,
} from "../scrims-constants";
import { type fromSchema, scrimsNewFormSchema } from "../scrims-schemas";
import type { LutiDiv } from "../scrims-types";
import { serializeLutiDiv } from "../scrims-utils";

export const action = defineAction(
	{ body: scrimsNewFormSchema },
	async ({ body }) => {
		const user = requireUser();

		if (body.from.mode === "PICKUP") {
			const pickupUserError = await validatePickup(body.from.users, user.id);
			if (pickupUserError) {
				return { fieldErrors: { from: pickupUserError.error } };
			}
		}

		const rangeEndDate = body.rangeEnd
			? resolveRangeEndToDate(body.at, body.rangeEnd)
			: null;

		const resolvedDivs = body.divs ? resolveDivs(body.divs) : null;

		await ScrimPostRepository.insert({
			startsAt: dateToDatabaseTimestamp(body.at),
			rangeEndsAt: rangeEndDate ? dateToDatabaseTimestamp(rangeEndDate) : null,
			maxDiv: resolvedDivs?.[0] ? serializeLutiDiv(resolvedDivs[0]) : null,
			minDiv: resolvedDivs?.[1] ? serializeLutiDiv(resolvedDivs[1]) : null,
			text: body.postText,
			managedByAnyone: body.managedByAnyone,
			maps:
				body.maps === "NO_PREFERENCE" || body.maps === "TOURNAMENT"
					? null
					: body.maps,
			mapsTournamentId: body.mapsTournamentId,
			isScheduledForFuture:
				body.at >
				// 10 minutes is an arbitrary threshold
				add(new Date(), {
					minutes: 10,
				}),
			visibility:
				body.baseVisibility !== "PUBLIC"
					? {
							forAssociation: body.baseVisibility,
							notFoundInstructions: body.notFoundVisibility.at
								? [
										{
											at: dateToDatabaseTimestamp(body.notFoundVisibility.at),
											forAssociation:
												body.notFoundVisibility.forAssociation !== "PUBLIC"
													? body.notFoundVisibility.forAssociation
													: null,
										},
									]
								: undefined,
						}
					: null,
			teamId: body.from.mode === "TEAM" ? body.from.teamId : null,
			users: (
				await usersListForPost({ authorId: user.id, from: body.from })
			).map((userId) => ({
				userId,
				isOwner: toDBBoolean(user.id === userId),
			})),
		});

		if (body.from.mode === "PICKUP") {
			await ScrimPickupRosterRepository.upsertOwn(body.from.users);
		}

		return redirect(scrimsPage());
	},
);

export const usersListForPost = async ({
	from,
	authorId,
}: {
	from: v.InferOutput<typeof fromSchema>;
	authorId: number;
}) => {
	if (from.mode === "PICKUP") {
		return [authorId, ...from.users];
	}

	const teamId = from.teamId;
	const team = (await TeamRepository.findAllByMemberUserId(authorId)).find(
		(candidate) => candidate.id === teamId,
	);
	errorToastIfFalsy(team, "User is not a member of this team");

	const filteredMembers = team.members.filter(
		(member) => getMemberRoleType(member) !== "OTHER",
	);

	// falls back to everyone when too few members have a playing role
	const result = (
		filteredMembers.length >= SCRIM.MIN_MEMBERS_PER_TEAM
			? filteredMembers
			: team.members
	).map((member) => member.id);

	if (result.length < SCRIM.MIN_MEMBERS_PER_TEAM) {
		errorToast("Your team does not have enough members (4) to scrim");
	}

	// the author is included even with an excluded role
	return result.includes(authorId) ? result : [authorId, ...result];
};

/** Validates that a pickup roster can be put together by the author. */
export async function validatePickup(userIds: number[], authorId: number) {
	if (userIds.includes(authorId)) {
		return { error: "Don't add yourself to the pickup member list" };
	}

	const friendsError = await validatePickupFriends(userIds, authorId);
	if (friendsError) {
		return friendsError;
	}

	const unbannedError = await validatePickupAllUnbanned(userIds);
	if (unbannedError) {
		return unbannedError;
	}

	return null;
}

async function validatePickupFriends(userIds: number[], authorId: number) {
	const unconsentingUsers: string[] = [];

	const friendsData = await SQGroupRepository.findFriendsAndTeammates(authorId);

	for (const userId of userIds) {
		const user = await UserRepository.findLeanById(userId);
		invariant(user, "User not found");

		if (
			user.preferences?.disallowScrimPickupsFromUntrusted &&
			!friendsData.friends.some((friend) => friend.id === userId)
		) {
			unconsentingUsers.push(user.username);
		}
	}

	return unconsentingUsers.length === 0
		? null
		: {
				error: `Following users don't allow non-friends to add: ${unconsentingUsers.join(", ")}. Ask them to add you as a friend.`,
			};
}

async function validatePickupAllUnbanned(userIds: number[]) {
	const bannedUsers = userIds.filter((id) => userIsBanned(id));

	return bannedUsers.length === 0
		? null
		: {
				error: "Pickup includes banned users.",
			};
}

function resolveRangeEndToDate(
	startDate: Date,
	rangeEnd: RangeEndOption,
): Date {
	return add(startDate, { minutes: RANGE_END_MINUTES[rangeEnd] });
}

function resolveDivs(
	divs: [LutiDiv | null, LutiDiv | null],
): [LutiDiv | null, LutiDiv | null] {
	const [max, min] = divs;
	if (!max || !min) return divs;

	const maxIndex = LUTI_DIVS.indexOf(max);
	const minIndex = LUTI_DIVS.indexOf(min);

	if (minIndex < maxIndex) {
		return [min, max];
	}
	return divs;
}
