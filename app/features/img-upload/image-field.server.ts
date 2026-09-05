import { basename } from "node:path";
import { Readable } from "node:stream";
import type { AuthenticatedUser } from "~/features/auth/core/user.server";
import type { ImageFieldValue } from "~/form/image-field";
import { dateToDatabaseTimestamp } from "~/utils/dates";
import { shortNanoid } from "~/utils/id";
import invariant from "~/utils/invariant";
import { errorToastIfFalsy } from "~/utils/remix.server";
import * as ImageRepository from "./ImageRepository.server";
import { dataUrlToImageBuffer } from "./image-bytes.server";
import { uploadStreamToS3 } from "./s3.server";
import { MAX_UNVALIDATED_IMG_COUNT } from "./upload-constants";

/**
 * Resolves a SendouForm `image` field value to the image id the caller stores on its FK column:
 * `null` → `null`, `EXISTING` → the unchanged `imgId`, `NEW` → uploads to S3 and inserts an
 * unvalidated image row (auto-validated for supporters or when `autoValidate` is set).
 */
export async function imageFieldValueToImgId({
	value,
	user,
	autoValidate = false,
}: {
	value: ImageFieldValue;
	user: AuthenticatedUser;
	/** Bypass the moderator queue (e.g. trusted org logos). */
	autoValidate?: boolean;
}): Promise<number | null> {
	if (!value) return null;
	if (value.type === "EXISTING") return value.imgId;

	const shouldAutoValidate = autoValidate || user.roles.includes("SUPPORTER");

	if (!shouldAutoValidate) {
		errorToastIfFalsy(
			(await ImageRepository.countUnvalidatedBySubmitterUserId(user.id)) <
				MAX_UNVALIDATED_IMG_COUNT,
			"Too many unvalidated images",
		);
	}

	// the client compresses to webp, but browsers without canvas webp encoding fall back to png
	const { buffer, extension } = dataUrlToImageBuffer(value.dataUrl, [
		"webp",
		"png",
	]);

	const uploadedFileLocation = await uploadStreamToS3(
		Readable.from(buffer),
		`img-${Date.now()}-${shortNanoid()}.${extension}`,
	);
	invariant(uploadedFileLocation, "Image upload failed");
	const fileName = basename(uploadedFileLocation);

	const img = await ImageRepository.insert({
		submitterUserId: user.id,
		url: fileName,
		validatedAt: shouldAutoValidate
			? dateToDatabaseTimestamp(new Date())
			: null,
	});

	return img.id;
}
