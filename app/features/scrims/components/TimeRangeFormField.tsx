import * as React from "react";
import {
	type FieldPath,
	type FieldValues,
	get,
	useFormContext,
} from "react-hook-form";
import { useTranslation } from "react-i18next";
import { FormMessage } from "~/components/FormMessage";
import { Label } from "~/components/Label";

// xxx: actual design for TimeRangeFormField
export function TimeRangeFormField<T extends FieldValues>({
	label,
	name,
}: {
	label: string;
	name: FieldPath<T>;
}) {
	const { t } = useTranslation(["scrims"]);
	const methods = useFormContext();
	const id = React.useId();

	const value = methods.watch(name);
	const error = get(methods.formState.errors, name);

	const handleStartChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		const currentValue = methods.getValues(name);
		methods.setValue(name, {
			...currentValue,
			start: e.target.value,
		} as any);
	};

	const handleEndChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		const currentValue = methods.getValues(name);
		methods.setValue(name, {
			...currentValue,
			end: e.target.value,
		} as any);
	};

	const handleClear = () => {
		methods.setValue(name, null as any);
	};

	return (
		<div>
			<Label htmlFor={id}>{label}</Label>
			{value ? (
				<div className="stack xs">
					<div className="stack horizontal xs">
						<input
							type="time"
							value={value.start}
							onChange={handleStartChange}
							className="input input--small"
						/>
						<span className="text-lighter">-</span>
						<input
							type="time"
							value={value.end}
							onChange={handleEndChange}
							className="input input--small"
						/>
					</div>
					<button
						type="button"
						onClick={handleClear}
						className="text-xs text-theme underline"
					>
						{t("scrims:filters.clearTime")}
					</button>
				</div>
			) : (
				<button
					type="button"
					onClick={() => {
						methods.setValue(name, { start: "00:00", end: "23:59" } as any);
					}}
					className="text-xs text-theme underline"
				>
					{t("scrims:filters.setTime")}
				</button>
			)}
			{error && (
				<FormMessage type="error">{error.message as string}</FormMessage>
			)}
		</div>
	);
}
