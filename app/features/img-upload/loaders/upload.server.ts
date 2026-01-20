import type { LoaderFunctionArgs } from "react-router";
import { redirect } from "react-router";
import { requireUser } from "~/features/auth/core/user.server";
import * as TeamRepository from "~/features/team/TeamRepository.server";
import { isTeamManager } from "~/features/team/team-utils";
import * as ImageRepository from "../ImageRepository.server";
import { requestToImgType } from "../upload-utils";

export const loader = async ({ request }: LoaderFunctionArgs) => {
	const user = requireUser();
	const validatedType = requestToImgType(request);

	if (!validatedType) {
		throw redirect("/");
	}

	if (validatedType === "team-pfp" || validatedType === "team-banner") {
		const teamCustomUrl = new URL(request.url).searchParams.get("team") ?? "";
		const team = await TeamRepository.findByCustomUrl(teamCustomUrl);

		if (!team || !isTeamManager({ team, user })) {
			throw redirect("/");
		}
	}

	return {
		type: validatedType,
		unvalidatedImages: await ImageRepository.countUnvalidatedBySubmitterUserId(
			user.id,
		),
	};
};
