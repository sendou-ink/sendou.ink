import clsx from "clsx";
import Compressor from "compressorjs";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { SendouButton } from "~/components/elements/Button";
import { logger } from "~/utils/logger";
import {
	type ImageFieldValue,
	resolveImageFieldDimensions,
} from "../image-field";
import type { FormFieldProps } from "../types";
import { FormFieldWrapper } from "./FormFieldWrapper";
import styles from "./ImageFormField.module.css";

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
	const { t } = useTranslation(["common"]);
	const resolvedDimensions = resolveImageFieldDimensions(dimensions);

	const previewUrl =
		value?.type === "EXISTING"
			? value.url
			: value?.type === "NEW"
				? value.dataUrl
				: null;

	const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
		const uploadedFile = event.target.files?.[0];
		if (!uploadedFile) return;

		new Compressor(uploadedFile, {
			width: resolvedDimensions.width,
			height: resolvedDimensions.height,
			maxWidth: resolvedDimensions.width,
			maxHeight: resolvedDimensions.height,
			resize: "cover",
			mimeType: "image/webp",
			success(result) {
				const reader = new FileReader();
				reader.onload = () =>
					onChange({ type: "NEW", dataUrl: reader.result as string });
				reader.onerror = () => logger.error("Failed to read compressed image");
				reader.readAsDataURL(result);
			},
			error(err) {
				logger.error(err.message);
			},
		});
	};

	const isBanner =
		dimensions === "thick-banner" ||
		(typeof dimensions === "object" && dimensions.width > dimensions.height);

	return (
		<FormFieldWrapper
			id={id}
			name={name}
			label={label}
			error={error}
			bottomText={
				bottomText ??
				(autoValidate ? undefined : "forms:bottomTexts.imageModeration")
			}
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
						onPress={() => onChange(null)}
						isDisabled={disabled}
					>
						{t("common:actions.remove")}
					</SendouButton>
				) : (
					<input
						id={id}
						type="file"
						accept="image/png, image/jpeg, image/webp"
						onChange={handleFileChange}
						disabled={disabled}
					/>
				)}
			</div>
		</FormFieldWrapper>
	);
}
