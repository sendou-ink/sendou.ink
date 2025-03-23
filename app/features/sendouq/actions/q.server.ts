import type { ActionFunction } from "@remix-run/node";
import { redirect } from "@remix-run/node";
import { sql } from "~/db/sql";
import { requireUser } from "~/features/auth/core/user.server";
import { currentSeason } from "~/features/mmr/season";
import * as QRepository from "~/features/sendouq/QRepository.server";
import { giveTrust } from "~/features/tournament/queries/giveTrust.server";
import * as UserRepository from "~/features/user-page/UserRepository.server";
import invariant from "~/utils/invariant";
import { errorToastIfFalsy, parseRequestPayload } from "~/utils/remix.server";
import { assertUnreachable } from "~/utils/types";
import { SENDOUQ_LOOKING_PAGE, SENDOUQ_PREPARING_PAGE } from "~/utils/urls";
import { FULL_GROUP_SIZE, JOIN_CODE_SEARCH_PARAM_KEY } from "../q-constants";
import { frontPageSchema } from "../q-schemas.server";
import { userCanJoinQueueAt } from "../q-utils";
import { addMember } from "../queries/addMember.server";
import { deleteLikesByGroupId } from "../queries/deleteLikesByGroupId.server";
import { findCurrentGroupByUserId } from "../queries/findCurrentGroupByUserId.server";
import { findGroupByInviteCode } from "../queries/findGroupByInviteCode.server";

export const action: ActionFunction = async ({ request }) => {
	const user = await requireUser(request);
	const data = await parseRequestPayload({
		request,
		schema: frontPageSchema,
	});

	switch (data._action) {
		case "JOIN_QUEUE": {
			await validateCanJoinQ(user);

			await QRepository.createGroup({
				status: data.direct === "true" ? "ACTIVE" : "PREPARING",
				userId: user.id,
			});

			return redirect(
				data.direct === "true" ? SENDOUQ_LOOKING_PAGE : SENDOUQ_PREPARING_PAGE,
			);
		}
		case "JOIN_TEAM_WITH_TRUST":
		case "JOIN_TEAM": {
			await validateCanJoinQ(user);

			const code = new URL(request.url).searchParams.get(
				JOIN_CODE_SEARCH_PARAM_KEY,
			);

			const groupInvitedTo =
				code && user ? findGroupByInviteCode(code) : undefined;
			errorToastIfFalsy(
				groupInvitedTo,
				"Invite code doesn't match any active team",
			);
			errorToastIfFalsy(
				groupInvitedTo.members.length < FULL_GROUP_SIZE,
				"Team is full",
			);

			sql.transaction(() => {
				addMember({
					groupId: groupInvitedTo.id,
					userId: user.id,
					role: "MANAGER",
				});
				deleteLikesByGroupId(groupInvitedTo.id);

				if (data._action === "JOIN_TEAM_WITH_TRUST") {
					const owner = groupInvitedTo.members.find((m) => m.role === "OWNER");
					invariant(owner, "Owner not found");

					giveTrust({
						trustGiverUserId: user.id,
						trustReceiverUserId: owner.id,
					});
				}
			})();

			return redirect(
				groupInvitedTo.status === "PREPARING"
					? SENDOUQ_PREPARING_PAGE
					: SENDOUQ_LOOKING_PAGE,
			);
		}
		case "ADD_FRIEND_CODE": {
			errorToastIfFalsy(
				!(await UserRepository.currentFriendCodeByUserId(user.id)),
				"Friend code already set",
			);

			await UserRepository.insertFriendCode({
				userId: user.id,
				friendCode: data.friendCode,
				submitterUserId: user.id,
			});

			return null;
		}
		default: {
			assertUnreachable(data);
		}
	}
};

async function validateCanJoinQ(user: { id: number; discordId: string }) {
	const friendCode = await UserRepository.currentFriendCodeByUserId(user.id);
	errorToastIfFalsy(friendCode, "No friend code");
	const canJoinQueue = userCanJoinQueueAt(user, friendCode) === "NOW";

	errorToastIfFalsy(currentSeason(new Date()), "Season is not active");
	errorToastIfFalsy(!findCurrentGroupByUserId(user.id), "Already in a group");
	errorToastIfFalsy(canJoinQueue, "Can't join queue right now");
}
