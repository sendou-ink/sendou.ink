import { redirect } from "react-router";
import * as R from "remeda";
import * as ArtRepository from "~/features/art/ArtRepository.server";
import { userArtPage } from "~/features/art/art-urls";
import { requireUser } from "~/features/auth/core/user.server";
import { notify } from "~/features/notifications/core/notify.server";
import { defineAction } from "~/form/define-action.server";
import {
	requirePermission,
	requireRole,
} from "~/modules/permissions/guards.server";
import { databaseTimestampNow } from "~/utils/dates";
import { badRequestIfFalsy, errorToastIfFalsy } from "~/utils/remix.server";
import { ART_FORM_MAX_BODY_BYTES } from "../art-image";
import { uploadArtImage } from "../art-image.server";
import { artFormSchema } from "../art-schemas";

export const action = defineAction(
	{ body: artFormSchema, maxBodyBytes: ART_FORM_MAX_BODY_BYTES },
	async ({ body }) => {
		const user = requireUser();
		requireRole("ARTIST");

		const linkedUsers = R.unique(
			body.linkedUsers.filter((userId) => typeof userId === "number"),
		);

		if (body.artId) {
			const existingArt = badRequestIfFalsy(
				await ArtRepository.findById(body.artId),
			);
			requirePermission(existingArt, "EDIT");

			const editedArtId = await ArtRepository.update(body.artId, {
				description: body.description,
				isShowcase: body.isShowcase,
				linkedUsers,
				tags: body.tags,
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
			errorToastIfFalsy(body.img?.type === "NEW", "Art image is missing");

			const addedArt = await ArtRepository.insert({
				description: body.description,
				url: await uploadArtImage(body.img),
				validatedAt: user.patronTier ? databaseTimestampNow() : null,
				linkedUsers,
				tags: body.tags,
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
	},
);
