import { type ActionFunctionArgs, redirect } from "@remix-run/node";
import type { z } from "zod";
import type { Tables } from "~/db/tables";
import { requireUser } from "~/features/auth/core/user.server";
import { userIsBanned } from "~/features/ban/core/banned.server";
import * as UserRepository from "~/features/user-page/UserRepository.server";
import { dateToDatabaseTimestamp } from "~/utils/dates";
import invariant from "~/utils/invariant";
import {
	actionError,
	errorToastIfFalsy,
	parseRequestPayload,
} from "~/utils/remix.server";
import { scrimsPage } from "~/utils/urls";
import * as QRepository from "../../sendouq/QRepository.server";
import * as TeamRepository from "../../team/TeamRepository.server";
import * as ScrimPostRepository from "../ScrimPostRepository.server";
import {
	type fromSchema,
	type newRequestSchema,
	scrimsNewActionSchema,
} from "../scrims-schemas";
import { serializeLutiDiv } from "../scrims-utils";

export const action = async ({ request }: ActionFunctionArgs) => {
	const user = await requireUser(request);
	const data = await parseRequestPayload({
		request,
		schema: scrimsNewActionSchema,
	});

	if (data.from.mode === "PICKUP") {
		if (data.from.users.includes(user.id)) {
			return actionError<typeof newRequestSchema>({
				msg: "Don't add yourself to the pickup member list",
				field: "from.root",
			});
		}

		const pickupUserError = await validatePickup(data.from.users, user.id);
		if (pickupUserError) {
			return actionError<typeof newRequestSchema>({
				msg: pickupUserError.error,
				field: "from.root",
			});
		}
	}

	await ScrimPostRepository.insert({
		at: dateToDatabaseTimestamp(data.at),
		maxDiv: data.divs ? serializeLutiDiv(data.divs.max!) : null,
		minDiv: data.divs ? serializeLutiDiv(data.divs.min!) : null,
		text: data.postText,
		visibility: data.baseVisibility // xxx: add notFoundInstructions
			? {
					forAssociation: data.baseVisibility,
				}
			: null,
		teamId: data.from.mode === "TEAM" ? data.from.teamId : null,
		users: (await usersListForPost({ authorId: user.id, from: data.from })).map(
			(userId) => ({
				userId,
				isOwner: Number(user.id === userId),
			}),
		),
	});

	return redirect(scrimsPage());
};

const ROLES_TO_EXCLUDE: Tables["TeamMember"]["role"][] = [
	"CHEERLEADER",
	"COACH",
	"SUB",
];

export const usersListForPost = async ({
	from,
	authorId,
}: { from: z.infer<typeof fromSchema>; authorId: number }) => {
	if (from.mode === "PICKUP") {
		return [authorId, ...from.users];
	}

	const teamId = from.teamId;
	const team = (await TeamRepository.teamsByMemberUserId(authorId)).find(
		(team) => team.id === teamId,
	);
	errorToastIfFalsy(team, "User is not a member of this team");

	return team.members
		.filter((member) => !ROLES_TO_EXCLUDE.includes(member.role))
		.map((member) => member.id);
};

async function validatePickup(userIds: number[], authorId: number) {
	const trustError = await validatePickupTrust(userIds, authorId);
	if (trustError) {
		return trustError;
	}

	const unbannedError = await validatePickupAllUnbanned(userIds);
	if (unbannedError) {
		return unbannedError;
	}

	return null;
}

async function validatePickupTrust(userIds: number[], authorId: number) {
	const unconsentingUsers: string[] = [];

	const trustedBy = await QRepository.usersThatTrusted(authorId);

	for (const userId of userIds) {
		const user = await UserRepository.findLeanById(userId);
		invariant(user, "User not found");

		if (
			user.preferences?.disallowScrimPickupsFromUntrusted &&
			!trustedBy.trusters.some((truster) => truster.id === userId)
		) {
			unconsentingUsers.push(user.username);
		}
	}

	return unconsentingUsers.length === 0
		? null
		: {
				error: `Following users don't allow untrusted to add: ${unconsentingUsers.join(", ")}. Ask them to add you to their trusted list.`,
			};
}

async function validatePickupAllUnbanned(userIds: number[]) {
	const bannedUsers = userIds.filter(userIsBanned);

	return bannedUsers.length === 0
		? null
		: {
				error: "Pickup includes banned users.",
			};
}
