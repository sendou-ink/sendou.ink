import type * as React from "react";
import { useTranslation } from "react-i18next";
import { SendouButton } from "~/components/elements/Button";
import { FormMessage } from "~/components/FormMessage";
import { MinusIcon } from "~/components/icons/Minus";
import { PlusIcon } from "~/components/icons/Plus";
import type { FormFieldProps } from "../types";

type ArrayFormFieldProps = Omit<FormFieldProps<"array">, "field"> & {
	value: unknown[];
	onChange: (value: unknown[]) => void;
	renderItem: (index: number, name: string) => React.ReactNode;
};

export function ArrayFormField({
	label,
	name,
	bottomText,
	error,
	min,
	max,
	value,
	onChange,
	renderItem,
}: ArrayFormFieldProps) {
	const { t } = useTranslation(["common"]);

	const count = Math.max(value.length, 1);

	const handleAdd = () => {
		onChange([...value, undefined]);
	};

	const handleRemove = () => {
		onChange(value.slice(0, -1));
	};

	return (
		<fieldset
			style={{
				border: "var(--border-style)",
				borderRadius: "var(--radius-field)",
				backgroundColor: "var(--color-base-section)",
			}}
			className="stack md"
		>
			{label ? (
				<legend
					style={{
						fontSize: "var(--fonts-xs)",
						fontWeight: "var(--semi-bold)",
					}}
				>
					{label}
				</legend>
			) : null}
			{Array.from({ length: count }).map((_, idx) => (
				<div key={idx}>{renderItem(idx, `${name}[${idx}]`)}</div>
			))}
			{error ? <FormMessage type="error">{error}</FormMessage> : null}
			{bottomText && !error ? (
				<FormMessage type="info">{bottomText}</FormMessage>
			) : null}
			<div className="stack sm horizontal">
				<SendouButton
					size="small"
					icon={<PlusIcon />}
					onPress={handleAdd}
					isDisabled={count >= max}
				>
					{t("common:actions.add")}
				</SendouButton>
				<SendouButton
					size="small"
					icon={<MinusIcon />}
					variant="destructive"
					onPress={handleRemove}
					className={count <= min ? "invisible" : undefined}
				>
					{t("common:actions.remove")}
				</SendouButton>
			</div>
		</fieldset>
	);
}
