import { basename } from "node:path";
import { Readable } from "node:stream";
import type { AuthenticatedUser } from "~/features/auth/core/user.server";
import type { ImageFieldValue } from "~/form/image-field";
import { dateToDatabaseTimestamp } from "~/utils/dates";
import { shortNanoid } from "~/utils/id";
import invariant from "~/utils/invariant";
import { errorToastIfFalsy } from "~/utils/remix.server";
import * as ImageRepository from "./ImageRepository.server";
import { uploadStreamToS3 } from "./s3.server";
import { MAX_UNVALIDATED_IMG_COUNT } from "./upload-constants";

/**
 * Resolves a SendouForm `image` field value to the image id to store on the consuming FK column.
 *
 * - `null` → `null` (image removed / none)
 * - `EXISTING` → the unchanged `imgId` (no bytes are re-uploaded)
 * - `NEW` → decodes the base64 webp, uploads it to S3 and inserts an unvalidated image row,
 *   auto-validating it for supporters, then returns the new id.
 *
 * The consuming action is responsible for writing the returned value to its own FK column.
 */
export async function imageFieldValueToImgId({
	value,
	user,
}: {
	value: ImageFieldValue;
	user: AuthenticatedUser;
}): Promise<number | null> {
	if (!value) return null;
	if (value.type === "EXISTING") return value.imgId;

	errorToastIfFalsy(
		(await ImageRepository.countAllUnvalidatedBySubmitterUserId(user.id)) <
			MAX_UNVALIDATED_IMG_COUNT,
		"Too many unvalidated images",
	);

	const buffer = dataUrlToWebpBuffer(value.dataUrl);

	const uploadedFileLocation = await uploadStreamToS3(
		Readable.from(buffer),
		`img-${Date.now()}-${shortNanoid()}.webp`,
	);
	invariant(uploadedFileLocation, "Image upload failed");
	const fileName = basename(uploadedFileLocation);

	const shouldAutoValidate = user.roles.includes("SUPPORTER");

	const img = await ImageRepository.insert({
		submitterUserId: user.id,
		url: fileName,
		validatedAt: shouldAutoValidate
			? dateToDatabaseTimestamp(new Date())
			: null,
	});

	return img.id;
}

function dataUrlToWebpBuffer(dataUrl: string) {
	const base64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
	const buffer = Buffer.from(base64, "base64");

	invariant(isWebp(buffer), "Submitted image is not a valid webp");

	return buffer;
}

/** Verifies the buffer's magic bytes match the webp container (`RIFF....WEBP`). */
function isWebp(buffer: Buffer) {
	return (
		buffer.length > 12 &&
		buffer.toString("ascii", 0, 4) === "RIFF" &&
		buffer.toString("ascii", 8, 12) === "WEBP"
	);
}
