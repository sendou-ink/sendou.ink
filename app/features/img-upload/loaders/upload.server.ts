import type { LoaderFunctionArgs } from "@remix-run/node";
import { redirect } from "@remix-run/node";
import { requireUser } from "~/features/auth/core/user.server";
import * as TeamRepository from "~/features/team/TeamRepository.server";
import { isTeamManager } from "~/features/team/team-utils";
import { countUnvalidatedImg } from "../queries/countUnvalidatedImg.server";
import { requestToImgType } from "../upload-utils";

export const loader = async ({ request }: LoaderFunctionArgs) => {
	const user = await requireUser(request);
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
		unvalidatedImages: countUnvalidatedImg(user.id),
	};
};
