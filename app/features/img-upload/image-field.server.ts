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
 * - `NEW` → decodes the base64 image, uploads it to S3 and inserts an unvalidated image row,
 *   auto-validating it for supporters (or always when `autoValidate` is set), then returns the
 *   new id.
 *
 * The consuming action is responsible for writing the returned value to its own FK column.
 */
export async function imageFieldValueToImgId({
	value,
	user,
	autoValidate = false,
}: {
	value: ImageFieldValue;
	user: AuthenticatedUser;
	/** Validate the image immediately, bypassing the moderator queue (e.g. trusted org logos). */
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

	const { buffer, extension } = dataUrlToImageBuffer(value.dataUrl);

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

function dataUrlToImageBuffer(dataUrl: string) {
	const base64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
	const buffer = Buffer.from(base64, "base64");

	const extension = imageExtensionFromMagicBytes(buffer);
	invariant(extension, "Submitted image is not a valid webp or png");

	return { buffer, extension };
}

/**
 * Resolves the image format from the buffer's magic bytes. The client compresses to webp,
 * but browsers without canvas webp encoding silently fall back to png.
 */
function imageExtensionFromMagicBytes(buffer: Buffer): "webp" | "png" | null {
	if (
		buffer.length > 12 &&
		buffer.toString("ascii", 0, 4) === "RIFF" &&
		buffer.toString("ascii", 8, 12) === "WEBP"
	) {
		return "webp";
	}

	if (
		buffer.length > 8 &&
		buffer[0] === 0x89 &&
		buffer.toString("ascii", 1, 4) === "PNG"
	) {
		return "png";
	}

	return null;
}
