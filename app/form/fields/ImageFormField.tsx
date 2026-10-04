import clsx from "clsx";
import * as React from "react";
import { Trans, useTranslation } from "react-i18next";
import { Dropzone, DropzoneAction } from "~/components/Dropzone";
import { SendouButton } from "~/components/elements/Button";
import { logger } from "~/utils/logger";
import * as ImageCrop from "../image-crop/ImageCrop";
import { ImageCropDialog } from "../image-crop/ImageCropDialog";
import {
	type ImageFieldValue,
	resolveImageFieldDimensions,
} from "../image-field";
import type { FormFieldProps } from "../types";
import { FormFieldWrapper, useTranslatedTexts } from "./FormFieldWrapper";
import styles from "./ImageFormField.module.css";

const IMAGE_QUALITY = 0.8;

type ImageFormFieldProps = Omit<FormFieldProps<"image">, "onBlur"> & {
	value: ImageFieldValue;
	onChange: (value: ImageFieldValue) => void;
	disabled?: boolean;
};

export function ImageFormField({
	name,
	label,
	bottomText,
	dimensions,
	autoValidate,
	error,
	value,
	onChange,
	disabled,
}: ImageFormFieldProps) {
	const id = React.useId();
	const [processingError, setProcessingError] = React.useState<string>();
	const [pickedImage, setPickedImage] = React.useState<{
		url: string;
		image: HTMLImageElement;
	} | null>(null);
	const { t } = useTranslation(["common", "forms"]);
	const resolvedDimensions = resolveImageFieldDimensions(dimensions);

	const { translatedBottomText } = useTranslatedTexts({
		bottomText:
			bottomText ??
			(autoValidate ? undefined : "forms:bottomTexts.imageModeration"),
	});
	const bottomTexts = [
		t("forms:bottomTexts.imageDimensions", {
			width: resolvedDimensions.width,
			height: resolvedDimensions.height,
		}),
		translatedBottomText,
	].filter(Boolean);

	const previewUrl =
		value?.type === "EXISTING"
			? value.url
			: value?.type === "NEW"
				? value.dataUrl
				: null;

	const handleFile = async (file: File) => {
		setProcessingError(undefined);

		try {
			setPickedImage(await loadImage(file));
		} catch (err) {
			logger.error(err);
			setProcessingError("forms:errors.imageProcessingFailed");
		}
	};

	const closeCropDialog = () => {
		if (pickedImage) URL.revokeObjectURL(pickedImage.url);
		setPickedImage(null);
	};

	const handleCropApply = async (crop: ImageCrop.Crop) => {
		if (!pickedImage) return;

		try {
			const dataUrl = await cropToDataUrl(
				pickedImage.image,
				crop,
				resolvedDimensions,
			);
			onChange({ type: "NEW", dataUrl });
		} catch (err) {
			logger.error(err);
			setProcessingError("forms:errors.imageProcessingFailed");
		}
		closeCropDialog();
	};

	const isBanner =
		dimensions === "thick-banner" ||
		(typeof dimensions === "object" && dimensions.width > dimensions.height);

	return (
		<FormFieldWrapper
			id={id}
			name={name}
			label={label}
			error={processingError ?? error}
			bottomText={bottomTexts.join(" ")}
		>
			<div className="stack sm items-start">
				{previewUrl ? (
					<img
						src={previewUrl}
						alt=""
						className={clsx(styles.preview, { [styles.banner]: isBanner })}
					/>
				) : null}
				{value ? (
					<SendouButton
						variant="minimal-destructive"
						size="small"
						onClick={() => onChange(null)}
						isDisabled={disabled}
					>
						{t("common:actions.remove")}
					</SendouButton>
				) : (
					<Dropzone
						id={id}
						accept="image/png, image/jpeg, image/webp"
						onFile={handleFile}
						disabled={disabled}
					>
						<Trans
							t={t}
							i18nKey="forms:imageDropzone"
							components={{ action: <DropzoneAction /> }}
						/>
					</Dropzone>
				)}
			</div>
			{pickedImage ? (
				<ImageCropDialog
					imageUrl={pickedImage.url}
					imageSize={{
						width: pickedImage.image.naturalWidth,
						height: pickedImage.image.naturalHeight,
					}}
					aspectRatio={resolvedDimensions.width / resolvedDimensions.height}
					shape={isBanner ? "rounded" : "circle"}
					onApply={handleCropApply}
					onClose={closeCropDialog}
				/>
			) : null}
		</FormFieldWrapper>
	);
}

function loadImage(file: File) {
	const url = URL.createObjectURL(file);
	const image = new Image();
	image.src = url;

	return image.decode().then(
		() => ({ url, image }),
		(err) => {
			URL.revokeObjectURL(url);
			throw err;
		},
	);
}

/** Draws the cropped part of `image` at exactly `width`x`height` as webp (png where the browser can't encode webp). */
async function cropToDataUrl(
	image: HTMLImageElement,
	crop: ImageCrop.Crop,
	{ width, height }: { width: number; height: number },
) {
	const imageSize = { width: image.naturalWidth, height: image.naturalHeight };
	const visible = ImageCrop.sourceRect(crop, {
		imageSize,
		aspectRatio: width / height,
	});
	const oriented = ImageCrop.orientedSize(imageSize, crop.rotation);

	const canvas = document.createElement("canvas");
	canvas.width = width;
	canvas.height = height;

	const context = canvas.getContext("2d");
	if (!context) throw new Error("Canvas 2D context not available");

	context.imageSmoothingQuality = "high";
	context.translate(width / 2, height / 2);
	context.scale(width / visible.width, width / visible.width);
	context.translate(
		-(visible.x + visible.width / 2) + oriented.width / 2,
		-(visible.y + visible.height / 2) + oriented.height / 2,
	);
	context.rotate((crop.rotation * Math.PI) / 180);
	context.drawImage(image, -imageSize.width / 2, -imageSize.height / 2);

	const blob = await new Promise<Blob | null>((resolve) =>
		canvas.toBlob(resolve, "image/webp", IMAGE_QUALITY),
	);
	if (!blob) throw new Error("Failed to encode cropped image");

	return new Promise<string>((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = () => resolve(reader.result as string);
		reader.onerror = () => reject(new Error("Failed to read cropped image"));
		reader.readAsDataURL(blob);
	});
}
