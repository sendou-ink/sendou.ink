import type { FileUpload } from "@remix-run/form-data-parser";
import type { ActionFunctionArgs } from "react-router";
import { redirect } from "react-router";
import { z } from "zod";
import { requireUser } from "~/features/auth/core/user.server";
import * as TeamRepository from "~/features/team/TeamRepository.server";
import { isTeamManager } from "~/features/team/team-utils";
import * as TournamentOrganizationRepository from "~/features/tournament-organization/TournamentOrganizationRepository.server";
import { requirePermission } from "~/modules/permissions/guards.server";
import { dateToDatabaseTimestamp } from "~/utils/dates";
import invariant from "~/utils/invariant";
import {
	badRequestIfFalsy,
	errorToastIfFalsy,
	parseSearchParams,
	safeParseMultipartFormData,
} from "~/utils/remix.server";
import { teamPage, tournamentOrganizationPage } from "~/utils/urls";
import * as ImageRepository from "../ImageRepository.server";
import { uploadStreamToS3 } from "../s3.server";
import { MAX_UNVALIDATED_IMG_COUNT } from "../upload-constants";
import { requestToImgType } from "../upload-utils";

export const action = async ({ request }: ActionFunctionArgs) => {
	const user = requireUser();

	const validatedType = requestToImgType(request);
	errorToastIfFalsy(validatedType, "Invalid image type");

	const team =
		validatedType === "team-pfp" || validatedType === "team-banner"
			? await validatedTeam({ user, request })
			: undefined;
	const organization =
		validatedType === "org-pfp"
			? await requireEditableOrganization(request)
			: undefined;

	errorToastIfFalsy(
		(await ImageRepository.countUnvalidatedBySubmitterUserId(user.id)) <
			MAX_UNVALIDATED_IMG_COUNT,
		"Too many unvalidated images",
	);

	const uploadHandler = async (fileUpload: FileUpload) => {
		if (fileUpload.fieldName === "img") {
			const [, ending] = fileUpload.name.split(".");
			invariant(ending);
			const newFilename = `img-${Date.now()}.${ending}`;

			const uploadedFileLocation = await uploadStreamToS3(
				fileUpload.stream(),
				newFilename,
			);
			return uploadedFileLocation;
		}
		return null;
	};

	const formData = await safeParseMultipartFormData(request, uploadHandler);
	const imgSrc = formData.get("img") as string | null;
	invariant(imgSrc);

	const urlParts = imgSrc.split("/");
	const fileName = urlParts[urlParts.length - 1];
	invariant(fileName);

	const shouldAutoValidate =
		user.roles.includes("SUPPORTER") || validatedType === "org-pfp";

	await ImageRepository.addNewImage({
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
}: {
	user: { id: number };
	request: Request;
}) {
	const { team: teamCustomUrl } = parseSearchParams({
		request,
		schema: z.object({ team: z.string() }),
	});
	const team = await TeamRepository.findByCustomUrl(teamCustomUrl);

	errorToastIfFalsy(team, "Team not found");
	errorToastIfFalsy(
		isTeamManager({ team, user }),
		"You must be the team manager to upload images",
	);

	return team;
}

async function requireEditableOrganization(request: Request) {
	const { slug } = parseSearchParams({
		request,
		schema: z.object({ slug: z.string() }),
	});
	const organization = badRequestIfFalsy(
		await TournamentOrganizationRepository.findBySlug(slug),
	);

	requirePermission(organization, "EDIT");

	return organization;
}
