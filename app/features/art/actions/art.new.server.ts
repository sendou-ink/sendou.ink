import type { ActionFunction } from "react-router";
import { redirect } from "react-router";
import * as R from "remeda";
import * as ArtRepository from "~/features/art/ArtRepository.server";
import { userArtPage } from "~/features/art/art-urls";
import { requireUser } from "~/features/auth/core/user.server";
import { notify } from "~/features/notifications/core/notify.server";
import { parseFormData } from "~/form/parse.server";
import {
	requirePermission,
	requireRole,
} from "~/modules/permissions/guards.server";
import { dateToDatabaseTimestamp } from "~/utils/dates";
import { badRequestIfFalsy, errorToastIfFalsy } from "~/utils/remix.server";
import { toDBBoolean } from "~/utils/sql";
import { ART_FORM_MAX_BODY_BYTES } from "../art-image";
import { uploadArtImage } from "../art-image.server";
import { artFormSchema } from "../art-schemas";

export const action: ActionFunction = async ({ request }) => {
	const user = requireUser();
	requireRole("ARTIST");

	const result = await parseFormData({
		request,
		schema: artFormSchema,
		maxBodyBytes: ART_FORM_MAX_BODY_BYTES,
	});

	if (!result.success) {
		return { fieldErrors: result.fieldErrors };
	}

	const data = result.data;
	const linkedUsers = R.unique(
		data.linkedUsers.filter((userId) => typeof userId === "number"),
	);

	if (data.artId) {
		const existingArt = badRequestIfFalsy(
			await ArtRepository.findById(data.artId),
		);
		requirePermission(existingArt, "EDIT");

		const editedArtId = await ArtRepository.update(data.artId, {
			description: data.description,
			isShowcase: toDBBoolean(data.isShowcase),
			linkedUsers,
			tags: data.tags,
		});

		notify({
			userIds: R.difference(linkedUsers, existingArt.linkedUserIds),
			notification: {
				type: "TAGGED_TO_ART",
				meta: {
					adderUsername: user.username,
					adderDiscordId: user.discordId,
					artId: editedArtId,
				},
			},
		});
	} else {
		errorToastIfFalsy(data.img?.type === "NEW", "Art image is missing");

		const addedArt = await ArtRepository.insert({
			description: data.description,
			url: await uploadArtImage(data.img),
			validatedAt: user.patronTier ? dateToDatabaseTimestamp(new Date()) : null,
			linkedUsers,
			tags: data.tags,
		});

		notify({
			userIds: linkedUsers,
			notification: {
				type: "TAGGED_TO_ART",
				meta: {
					adderUsername: user.username,
					adderDiscordId: user.discordId,
					artId: addedArt.id,
				},
			},
		});
	}

	throw redirect(userArtPage(user));
};
