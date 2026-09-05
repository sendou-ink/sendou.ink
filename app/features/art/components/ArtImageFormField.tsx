import clsx from "clsx";
import Compressor from "compressorjs";
import * as React from "react";
import { useTranslation } from "react-i18next";
import type { CustomFieldRenderProps } from "~/form";
import { FormFieldWrapper } from "~/form/fields/FormFieldWrapper";
import { logger } from "~/utils/logger";
import { ART } from "../art-constants";
import {
	ART_IMAGE_TOO_LARGE_ERROR,
	type ArtImageValue,
	isArtImageTooLarge,
} from "../art-image";
import { previewUrl } from "../art-utils";
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
	const [tooLargeError, setTooLargeError] = React.useState<string>();
	const { t } = useTranslation(["common"]);

	if (value?.type === "EXISTING") {
		return <img src={previewUrl(value.url)} alt="" />;
	}

	const handleFileChange = async (
		event: React.ChangeEvent<HTMLInputElement>,
	) => {
		setTooLargeError(undefined);

		const uploadedFile = event.target.files?.[0];
		if (!uploadedFile) {
			onChange(null);
			return;
		}

		try {
			const [dataUrl, thumbnailDataUrl] = await Promise.all([
				compressToDataUrl(uploadedFile, {}),
				compressToDataUrl(uploadedFile, { maxWidth: ART.THUMBNAIL_WIDTH }),
			]);

			if (isArtImageTooLarge({ dataUrl, thumbnailDataUrl })) {
				setTooLargeError(ART_IMAGE_TOO_LARGE_ERROR);
				onChange(null);
				return;
			}

			onChange({ type: "NEW", dataUrl, thumbnailDataUrl });
		} catch (err) {
			logger.error(err);
			onChange(null);
		}
	};

	return (
		<FormFieldWrapper
			id={id}
			name="img"
			label={t("common:upload.imageToUpload")}
			error={tooLargeError ?? error}
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

function compressToDataUrl(
	file: File,
	options: Compressor.Options,
): Promise<string> {
	return new Promise((resolve, reject) => {
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
