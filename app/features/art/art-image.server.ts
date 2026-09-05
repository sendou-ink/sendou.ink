import { basename } from "node:path";
import { Readable } from "node:stream";
import { dataUrlToImageBuffer } from "~/features/img-upload/image-bytes.server";
import { uploadStreamToS3 } from "~/features/img-upload/s3.server";
import { shortNanoid } from "~/utils/id";
import invariant from "~/utils/invariant";
import { previewUrl } from "./art-utils";

const ALLOWED_ART_IMAGE_EXTENSIONS = ["png", "jpeg", "webp"] as const;

/** Uploads the full image and its `<name>-small.<ext>` thumbnail ({@link previewUrl}); returns the full image's file name. */
export async function uploadArtImage({
	dataUrl,
	thumbnailDataUrl,
}: {
	dataUrl: string;
	thumbnailDataUrl: string;
}): Promise<string> {
	const image = dataUrlToImageBuffer(dataUrl, ALLOWED_ART_IMAGE_EXTENSIONS);
	const thumbnail = dataUrlToImageBuffer(
		thumbnailDataUrl,
		ALLOWED_ART_IMAGE_EXTENSIONS,
	);

	invariant(
		image.extension === thumbnail.extension,
		"Art image and its thumbnail are of a different format",
	);

	const fileName = `art-${Date.now()}-${shortNanoid()}.${image.extension}`;

	const [uploadedLocation] = await Promise.all([
		uploadStreamToS3(Readable.from(image.buffer), fileName),
		uploadStreamToS3(Readable.from(thumbnail.buffer), previewUrl(fileName)),
	]);
	invariant(uploadedLocation, "Art image upload failed");

	return basename(uploadedLocation);
}
