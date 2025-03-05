import type { ActionFunctionArgs, UploadHandler } from "@remix-run/node";
import {
	unstable_composeUploadHandlers as composeUploadHandlers,
	unstable_createMemoryUploadHandler as createMemoryUploadHandler,
	unstable_parseMultipartFormData as parseMultipartFormData,
	redirect,
} from "@remix-run/node";
import { z } from "zod";
import { requireUser } from "~/features/auth/core/user.server";
import * as TeamRepository from "~/features/team/TeamRepository.server";
import { isTeamManager } from "~/features/team/team-utils";
import * as TournamentOrganizationRepository from "~/features/tournament-organization/TournamentOrganizationRepository.server";
import { canEditTournamentOrganization } from "~/features/tournament-organization/tournament-organization-utils";
import { dateToDatabaseTimestamp } from "~/utils/dates";
import invariant from "~/utils/invariant";
import {
	badRequestIfFalsy,
	parseSearchParams,
	unauthorizedIfFalsy,
	validate,
} from "~/utils/remix.server";
import { teamPage, tournamentOrganizationPage } from "~/utils/urls";
import { addNewImage } from "../queries/addNewImage";
import { countUnvalidatedImg } from "../queries/countUnvalidatedImg.server";
import { s3UploadHandler } from "../s3.server";
import { MAX_UNVALIDATED_IMG_COUNT } from "../upload-constants";
import { requestToImgType } from "../upload-utils";

export const action = async ({ request }: ActionFunctionArgs) => {
	const user = await requireUser(request);

	const validatedType = requestToImgType(request);
	validate(validatedType, "Invalid image type");

	const team =
		validatedType === "team-pfp" || validatedType === "team-banner"
			? await validatedTeam({ user, request })
			: undefined;
	const organization =
		validatedType === "org-pfp"
			? await validatedOrg({ user, request })
			: undefined;

	// TODO: graceful error handling when uploading many images
	validate(
		countUnvalidatedImg(user.id) < MAX_UNVALIDATED_IMG_COUNT,
		"Too many unvalidated images",
	);

	const uploadHandler: UploadHandler = composeUploadHandlers(
		s3UploadHandler(),
		createMemoryUploadHandler(),
	);
	const formData = await parseMultipartFormData(request, uploadHandler);
	const imgSrc = formData.get("img") as string | null;
	invariant(imgSrc);

	const urlParts = imgSrc.split("/");
	const fileName = urlParts[urlParts.length - 1];
	invariant(fileName);

	const shouldAutoValidate =
		Boolean(user.patronTier) || validatedType === "org-pfp";

	addNewImage({
		submitterUserId: user.id,
		teamId: team?.id,
		organizationId: organization?.id,
		type: validatedType,
		url: fileName,
		validatedAt: shouldAutoValidate
			? dateToDatabaseTimestamp(new Date())
			: null,
	});

	if (shouldAutoValidate) {
		if (team) {
			throw redirect(teamPage(team?.customUrl));
		}
		if (organization) {
			throw redirect(
				tournamentOrganizationPage({ organizationSlug: organization.slug }),
			);
		}
	}

	return null;
};

async function validatedTeam({
	user,
	request,
}: { user: { id: number }; request: Request }) {
	const { team: teamCustomUrl } = parseSearchParams({
		request,
		schema: z.object({ team: z.string() }),
	});
	const team = await TeamRepository.findByCustomUrl(teamCustomUrl);

	validate(team, "Team not found");
	validate(
		isTeamManager({ team, user }),
		"You must be the team manager to upload images",
	);

	return team;
}

async function validatedOrg({
	user,
	request,
}: { user: { id: number }; request: Request }) {
	const { slug } = parseSearchParams({
		request,
		schema: z.object({ slug: z.string() }),
	});
	const organization = badRequestIfFalsy(
		await TournamentOrganizationRepository.findBySlug(slug),
	);

	unauthorizedIfFalsy(canEditTournamentOrganization({ user, organization }));

	return organization;
}
