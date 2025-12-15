import type { LoaderFunctionArgs } from "@remix-run/node";
import { requireUser } from "~/features/auth/core/user.server";
import * as QRepository from "~/features/sendouq/QRepository.server";
import { cachedStreams } from "~/features/sendouq-streams/core/streams.server";
import { groupExpiryStatus } from "../core/groups";
import { SQManager } from "../core/SQManager.server";
import * as PrivateUserNoteRepository from "../PrivateUserNoteRepository.server";
import { sqRedirectIfNeeded } from "../q-utils.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
	const user = await requireUser(request);

	const isPreview =
		new URL(request.url).searchParams.get("preview") === "true" &&
		user.roles.includes("SUPPORTER");

	const privateNotes = await PrivateUserNoteRepository.byAuthorUserId(
		user.id,
		SQManager.usersInQueue,
	);

	const groups = isPreview
		? SQManager.previewGroups(privateNotes)
		: SQManager.lookingGroups(user.id, privateNotes);
	const ownGroup = SQManager.findOwnGroup(user.id);

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
			? await QRepository.allLikesByGroupId(ownGroup.id)
			: {
					given: [],
					received: [],
				},
		lastUpdated: Date.now(),
		streamsCount: (await cachedStreams()).length,
	};
};
