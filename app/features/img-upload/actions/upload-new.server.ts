import type { FileUpload } from "@remix-run/form-data-parser";
import type { ActionFunctionArgs } from "react-router";
import { requireUser } from "~/features/auth/core/user.server";
import { dateToDatabaseTimestamp } from "~/utils/dates";
import invariant from "~/utils/invariant";
import {
	errorToastIfFalsy,
	safeParseMultipartFormData,
} from "~/utils/remix.server";
import * as ImageRepository from "../ImageRepository.server";
import { uploadStreamToS3 } from "../s3.server";
import {
	ALLOWED_IMAGE_EXTENSIONS,
	MAX_UNVALIDATED_IMG_COUNT,
} from "../upload-constants";

export const action = async ({ request }: ActionFunctionArgs) => {
	const user = requireUser();

	errorToastIfFalsy(
		(await ImageRepository.countUnvalidatedBySubmitterUserId(user.id)) <
			MAX_UNVALIDATED_IMG_COUNT,
		"Too many unvalidated images",
	);

	const uploadHandler = async (fileUpload: FileUpload) => {
		if (fileUpload.fieldName === "img") {
			const ending = fileUpload.name.split(".").pop()?.toLowerCase();
			invariant(ending && ending !== fileUpload.name);
			invariant(
				ALLOWED_IMAGE_EXTENSIONS.includes(ending),
				`Invalid file extension: "${ending}"`,
			);
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

	const insertedImage = await ImageRepository.insert({
		submitterUserId: user.id,
		url: fileName,
		validatedAt: user.roles.includes("SUPPORTER")
			? dateToDatabaseTimestamp(new Date())
			: null,
	});

	return { imgId: insertedImage.id };
};
