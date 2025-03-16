import { sql } from "~/db/sql";
import type { UserSubmittedImage } from "~/db/types";
import type { ImageUploadType } from "../upload-types";

const addImgStm = sql.prepare(/* sql */ `
  insert into "UnvalidatedUserSubmittedImage"
    ("submitterUserId", "url", "validatedAt")
  values
    (@submitterUserId, @url, @validatedAt)
  returning *
`);

const updateTeamAvatarStm = sql.prepare(/* sql */ `
  update "AllTeam"
  set "avatarImgId" = @avatarImgId
  where "id" = @teamId
`);

const updateTeamBannerStm = sql.prepare(/* sql */ `
  update "AllTeam"
  set "bannerImgId" = @bannerImgId
  where "id" = @teamId
`);

const updateOrganizationAvatarStm = sql.prepare(/* sql */ `
  update "TournamentOrganization"
  set "avatarImgId" = @avatarImgId
  where "id" = @organizationId
`);

export const addNewImage = sql.transaction(
	({
		submitterUserId,
		url,
		validatedAt,
		teamId,
		organizationId,
		type,
	}: {
		submitterUserId: number;
		url: string;
		validatedAt: number | null;
		teamId?: number;
		organizationId?: number;
		type: ImageUploadType;
	}) => {
		const img = addImgStm.get({
			submitterUserId,
			url,
			validatedAt,
		}) as UserSubmittedImage;

		if (type === "team-pfp") {
			updateTeamAvatarStm.run({ avatarImgId: img.id, teamId: teamId ?? null });
		} else if (type === "team-banner") {
			updateTeamBannerStm.run({ bannerImgId: img.id, teamId: teamId ?? null });
		} else if (type === "org-pfp") {
			updateOrganizationAvatarStm.run({
				avatarImgId: img.id,
				organizationId: organizationId ?? null,
			});
		}

		return img;
	},
);
