import type { LoaderFunctionArgs } from "@remix-run/node";
import { requireUser } from "~/features/auth/core/user.server";
import * as QRepository from "~/features/sendouq/QRepository.server";
import { cachedStreams } from "~/features/sendouq-streams/core/streams.server";
import { SQManager } from "../core/SQManager.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
	const user = await requireUser(request);

	const isPreview =
		new URL(request.url).searchParams.get("preview") === "true" &&
		user.roles.includes("SUPPORTER");

	const privateNotes = await QRepository.allPrivateUserNotesByAuthorUserId(
		user.id,
	);

	const groups = isPreview
		? SQManager.previewGroups()
		: SQManager.lookingGroups(user.id, privateNotes);
	const ownGroup = SQManager.findOwnGroup(user.id);

	return {
		groups,
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
