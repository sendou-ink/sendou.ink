import clsx from "clsx";
import Compressor from "compressorjs";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { imageExtensionFromMagicBytes } from "~/features/img-upload/image-signature";
import type { CustomFieldRenderProps } from "~/form";
import { FormFieldWrapper } from "~/form/fields/FormFieldWrapper";
import { logger } from "~/utils/logger";
import { smallImageFileName } from "~/utils/urls";
import { ART } from "../art-constants";
import {
	ART_IMAGE_TOO_LARGE_ERROR,
	type ArtImageValue,
	isArtImageTooLarge,
} from "../art-image";
import styles from "./ArtImageFormField.module.css";

type ArtImageFormFieldProps = Omit<
	CustomFieldRenderProps<ArtImageValue>,
	"name"
>;

/**
 * Produces the full image (aspect ratio and format preserved) and a thumbnail as data URLs for
 * `SendouForm`'s JSON submit. Uploaded art can't be swapped, so `EXISTING` renders a plain preview.
 */
export function ArtImageFormField({
	value,
	onChange,
	error,
}: ArtImageFormFieldProps) {
	const id = React.useId();
	const [pickError, setPickError] = React.useState<string>();
	const { t } = useTranslation(["common"]);

	if (value?.type === "EXISTING") {
		return <img src={smallImageFileName(value.url)} alt="" />;
	}

	const handleFileChange = async (
		event: React.ChangeEvent<HTMLInputElement>,
	) => {
		setPickError(undefined);

		const uploadedFile = event.target.files?.[0];
		if (!uploadedFile) {
			onChange(null);
			return;
		}

		try {
			const formatOptions = await compressorFormatOptions(uploadedFile);
			const [dataUrl, thumbnailDataUrl] = await Promise.all([
				compressToDataUrl(uploadedFile, formatOptions),
				compressToDataUrl(uploadedFile, {
					...formatOptions,
					maxWidth: ART.THUMBNAIL_WIDTH,
				}),
			]);

			if (isArtImageTooLarge({ dataUrl, thumbnailDataUrl })) {
				setPickError(ART_IMAGE_TOO_LARGE_ERROR);
				onChange(null);
				return;
			}

			onChange({ type: "NEW", dataUrl, thumbnailDataUrl });
		} catch (err) {
			logger.error(err);
			setPickError("forms:errors.imageProcessingFailed");
			onChange(null);
		}
	};

	return (
		<FormFieldWrapper
			id={id}
			name="img"
			label={t("common:upload.imageToUpload")}
			error={pickError ?? error}
			required
		>
			<div className="stack sm items-start">
				<input
					id={id}
					type="file"
					accept="image/png, image/jpeg, image/jpg, image/webp"
					onChange={handleFileChange}
				/>
				{value ? (
					<img
						src={value.dataUrl}
						alt=""
						className={clsx(styles.preview, "rounded")}
					/>
				) : null}
			</div>
		</FormFieldWrapper>
	);
}

/** Compressor may pass the original bytes through under the extension-derived `file.type`, so target the real format to force a re-encode when they disagree (e.g. a GIF named `.png`). */
async function compressorFormatOptions(
	file: File,
): Promise<Compressor.Options> {
	const extension = imageExtensionFromMagicBytes(
		new Uint8Array(await file.slice(0, 16).arrayBuffer()),
	);

	if (!extension) return { mimeType: "image/png", strict: false };

	return { mimeType: `image/${extension}` };
}

function compressToDataUrl(
	file: File,
	options: Compressor.Options,
): Promise<string> {
	return new Promise((resolve, reject) => {
		// biome-ignore lint/correctness/noUnusedInstantiation: Compressor does its work through the success/error callbacks
		new Compressor(file, {
			...options,
			success(result) {
				const reader = new FileReader();
				reader.onload = () => resolve(reader.result as string);
				reader.onerror = () =>
					reject(new Error("Failed to read compressed image"));
				reader.readAsDataURL(result);
			},
			error: reject,
		});
	});
}
