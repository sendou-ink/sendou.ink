import type * as React from "react";
import { Controller, useFormContext } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { Label } from "~/components/Label";
import { FormMessage } from "../../../components/FormMessage";
import { LUTI_DIVS } from "../scrims-constants";
import type { LutiDiv } from "../scrims-types";

export function LutiDivsFormField() {
	const methods = useFormContext();

	const error = methods.formState.errors.divs;

	return (
		<div>
			<Controller
				control={methods.control}
				name="divs"
				render={({ field: { onChange, onBlur, value } }) => (
					<LutiDivsSelector value={value} onChange={onChange} onBlur={onBlur} />
				)}
			/>

			{error && (
				<FormMessage type="error">{error.message as string}</FormMessage>
			)}
		</div>
	);
}

type LutiDivEdit = {
	max: LutiDiv | null;
	min: LutiDiv | null;
};

function LutiDivsSelector({
	value,
	onChange,
	onBlur,
}: {
	value: LutiDivEdit | null;
	onChange: (value: LutiDivEdit | null) => void;
	onBlur: () => void;
}) {
	const { t } = useTranslation(["scrims"]);

	const onChangeMin = (e: React.ChangeEvent<HTMLSelectElement>) => {
		const newValue = e.target.value === "" ? null : (e.target.value as LutiDiv);

		onChange(
			newValue || value?.max
				? { min: newValue, max: value?.max ?? null }
				: null,
		);
	};

	const onChangeMax = (e: React.ChangeEvent<HTMLSelectElement>) => {
		const newValue = e.target.value === "" ? null : (e.target.value as LutiDiv);

		onChange(
			newValue || value?.min
				? { max: newValue, min: value?.min ?? null }
				: null,
		);
	};

	return (
		<div className="stack horizontal sm">
			<div>
				<Label htmlFor="max-div">{t("scrims:forms.divs.maxDiv.title")}</Label>
				<select
					id="max-div"
					value={value?.max ?? ""}
					onChange={onChangeMax}
					onBlur={onBlur}
				>
					<option value="">—</option>
					{LUTI_DIVS.map((div) => (
						<option key={div} value={div}>
							{div}
						</option>
					))}
				</select>
			</div>

			<div>
				<Label htmlFor="min-div">{t("scrims:forms.divs.minDiv.title")}</Label>
				<select
					id="min-div"
					value={value?.min ?? ""}
					onChange={onChangeMin}
					onBlur={onBlur}
				>
					<option value="">—</option>
					{LUTI_DIVS.map((div) => (
						<option key={div} value={div}>
							{div}
						</option>
					))}
				</select>
			</div>
		</div>
	);
}
