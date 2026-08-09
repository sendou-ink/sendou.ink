import { redirect } from "react-router";
import { requireUser } from "~/features/auth/core/user.server";
import * as SQGroupRepository from "~/features/sendouq/SQGroupRepository.server";
import * as UserCardRepository from "~/features/user-card/UserCardRepository.server";
import { dateToDatabaseTimestamp } from "~/utils/dates";
import { SENDOUQ_LOOKING_PAGE } from "~/utils/urls";
import * as ReadyCheck from "../core/ready-check.server";
import { SendouQ } from "../core/SendouQ.server";
import { sqRedirectIfNeeded } from "../q-utils.server";

export const loader = async () => {
	const user = requireUser();

	const ownGroup = SendouQ.findOwnGroup(user.id);

	sqRedirectIfNeeded({
		ownGroup,
		currentLocation: "ready",
	});

	const readyCheck = await SQGroupRepository.findReadyCheckByGroupId(
		ownGroup!.id,
	);
	if (!readyCheck) throw redirect(SENDOUQ_LOOKING_PAGE);

	if (ReadyCheck.hasExpired(readyCheck)) {
		await ReadyCheck.expire(readyCheck);

		throw redirect(SENDOUQ_LOOKING_PAGE);
	}

	const theirMembers = readyCheck.members.filter(
		(member) => member.groupId !== ownGroup!.id,
	);

	return {
		...(await UserCardRepository.findAllByUserIdsCached({
			userIds: ownGroup!.members.map((member) => member.id),
		})),
		group: ownGroup!,
		expiresAt: dateToDatabaseTimestamp(ReadyCheck.expiresAt(readyCheck)),
		readyUserIds: readyCheck.members
			.filter((member) => member.groupId === ownGroup!.id && member.confirmedAt)
			.map((member) => member.userId),
		// who they are is only revealed once the match is created, so they are
		// shown as a count of anonymous members
		theirGroup: {
			memberCount: theirMembers.length,
			readyCount: theirMembers.filter((member) => member.confirmedAt).length,
		},
	};
};
