import type { LoaderFunctionArgs } from "@remix-run/node";
import { requireUser } from "~/features/auth/core/user.server";
import * as SQGroupRepository from "~/features/sendouq/SQGroupRepository.server";
import { cachedStreams } from "~/features/sendouq-streams/core/streams.server";
import { groupExpiryStatus } from "../core/groups";
import { SendouQ } from "../core/SendouQ.server";
import * as PrivateUserNoteRepository from "../PrivateUserNoteRepository.server";
import { sqRedirectIfNeeded } from "../q-utils.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
	const user = await requireUser(request);

	const isPreview =
		new URL(request.url).searchParams.get("preview") === "true" &&
		user.roles.includes("SUPPORTER");

	const privateNotes = await PrivateUserNoteRepository.byAuthorUserId(
		user.id,
		SendouQ.usersInQueue,
	);

	const groups = isPreview
		? SendouQ.previewGroups(privateNotes)
		: SendouQ.lookingGroups(user.id, privateNotes);
	const ownGroup = SendouQ.findOwnGroup(user.id);

	sqRedirectIfNeeded({
		ownGroup,
		currentLocation: "looking",
	});

	return {
		groups:
			ownGroup && groupExpiryStatus(ownGroup.latestActionAt) === "EXPIRED"
				? []
				: groups,
		ownGroup,
		likes: ownGroup
			? await SQGroupRepository.allLikesByGroupId(ownGroup.id)
			: {
					given: [],
					received: [],
				},
		lastUpdated: Date.now(),
		streamsCount: (await cachedStreams()).length,
	};
};
