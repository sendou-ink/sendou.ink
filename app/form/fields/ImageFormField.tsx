import * as React from "react";
import { useTranslation } from "react-i18next";
import { SendouButton } from "~/components/elements/Button";
import { FormMessage } from "~/components/FormMessage";
import { TrashIcon } from "~/components/icons/Trash";
import { Label } from "~/components/Label";
import type { FormFieldProps } from "../types";

type ImageFormFieldProps = Omit<FormFieldProps<"image">, "name"> & {
	value: File | string | null;
	onChange: (value: File | string | null) => void;
};

export function ImageFormField({
	label,
	error,
	dimensions,
	value,
	onChange,
}: ImageFormFieldProps) {
	const { t } = useTranslation(["common"]);
	const id = React.useId();

	const { width, height } =
		dimensions === "logo"
			? { width: 400, height: 400 }
			: { width: 1000, height: 500 };

	const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		const file = e.target.files?.[0];
		onChange(file ?? null);
	};

	const bottomText = `Recommended size is ${width}x${height}. Note that non-supporters need to wait for moderator validation before the image is shown to others.`;

	return (
		<div className="stack xs">
			{label ? <Label htmlFor={id}>{label}</Label> : null}
			{typeof value === "string" ? (
				<div className="stack md items-start">
					<img
						src={value}
						alt=""
						style={{
							width: width / 3,
							height: height / 3,
							borderRadius:
								dimensions === "logo" ? "100%" : "var(--radius-box)",
						}}
					/>
					<SendouButton
						size="miniscule"
						variant="destructive"
						icon={<TrashIcon />}
						onPress={() => onChange(null)}
					>
						{t("common:actions.delete")}
					</SendouButton>
				</div>
			) : (
				<input
					id={id}
					type="file"
					accept="image/webp"
					onChange={handleFileChange}
				/>
			)}
			{error ? <FormMessage type="error">{error}</FormMessage> : null}
			<FormMessage type="info">{bottomText}</FormMessage>
		</div>
	);
}
