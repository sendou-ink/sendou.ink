import type { FileUpload } from "@remix-run/form-data-parser";
import { parseFormData as parseMultipartFormData } from "@remix-run/form-data-parser";
import { nanoid } from "nanoid";
import type { ActionFunction } from "react-router";
import { redirect } from "react-router";
import * as ArtRepository from "~/features/art/ArtRepository.server";
import { requireUser } from "~/features/auth/core/user.server";
import { uploadStreamToS3 } from "~/features/img-upload/s3.server";
import { notify } from "~/features/notifications/core/notify.server";
import { requireRole } from "~/modules/permissions/guards.server";
import { dateToDatabaseTimestamp } from "~/utils/dates";
import invariant from "~/utils/invariant";
import {
	errorToastIfFalsy,
	parseFormData,
	parseRequestPayload,
} from "~/utils/remix.server";
import { userArtPage } from "~/utils/urls";
import { NEW_ART_EXISTING_SEARCH_PARAM_KEY } from "../art-constants";
import { editArtSchema, newArtSchema } from "../art-schemas.server";

export const action: ActionFunction = async ({ request }) => {
	const user = requireUser();
	requireRole(user, "ARTIST");

	const searchParams = new URL(request.url).searchParams;
	const artIdRaw = searchParams.get(NEW_ART_EXISTING_SEARCH_PARAM_KEY);

	// updating logic
	if (artIdRaw) {
		const artId = Number(artIdRaw);

		const userArts = await ArtRepository.findArtsByUserId(user.id, {
			includeTagged: false,
		});
		const existingArt = userArts.find((art) => art.id === artId);
		errorToastIfFalsy(existingArt, "Art author is someone else");

		const data = await parseRequestPayload({
			request,
			schema: editArtSchema,
		});

		const editedArtId = await ArtRepository.update(artId, {
			description: data.description,
			isShowcase: data.isShowcase,
			linkedUsers: data.linkedUsers,
			tags: data.tags,
		});

		const existingLinkedUserIds =
			existingArt.linkedUsers?.map((u) => u.id) ?? [];
		const newLinkedUsers = data.linkedUsers.filter(
			(userId) => !existingLinkedUserIds.includes(userId),
		);

		notify({
			userIds: newLinkedUsers,
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
		const preDecidedFilename = `art-${nanoid()}-${Date.now()}`;

		const uploadHandler = async (fileUpload: FileUpload) => {
			if (
				fileUpload.fieldName === "img" ||
				fileUpload.fieldName === "smallImg"
			) {
				const [, ending] = fileUpload.name.split(".");
				invariant(ending);
				const newFilename = `${preDecidedFilename}${fileUpload.fieldName === "smallImg" ? "-small" : ""}.${ending}`;

				const uploadedFileLocation = await uploadStreamToS3(
					fileUpload.stream(),
					newFilename,
				);
				return uploadedFileLocation;
			}
			return null;
		};

		const formData = await parseMultipartFormData(
			request,
			// 5MB
			{ maxFileSize: 5 * 1024 * 1024 },
			uploadHandler,
		);
		const imgSrc = formData.get("img") as string | null;
		invariant(imgSrc);

		const urlParts = imgSrc.split("/");
		const fileName = urlParts[urlParts.length - 1];
		invariant(fileName);

		const data = await parseFormData({
			formData,
			schema: newArtSchema,
		});

		const addedArt = await ArtRepository.insert({
			authorId: user.id,
			description: data.description,
			url: fileName,
			validatedAt: user.patronTier ? dateToDatabaseTimestamp(new Date()) : null,
			linkedUsers: data.linkedUsers,
			tags: data.tags,
		});

		notify({
			userIds: data.linkedUsers,
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
