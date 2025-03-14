import { useLoaderData } from "@remix-run/react";
import { Controller, useFormContext } from "react-hook-form";
import type { z } from "zod";
import { Label } from "~/components/Label";
import { DateTimeFormField } from "~/components/form/DateTimeFormField";
import { MyForm } from "~/components/form/MyForm";
import { TextAreaFormField } from "~/components/form/TextAreaFormField";
import { FormMessage } from "../../../components/FormMessage";
import { Main } from "../../../components/Main";
import { action } from "../actions/scrims.new.server";
import { FromFormField } from "../components/FromFormField";
import { loader } from "../loaders/scrims.new.server";
import { LUTI_DIVS } from "../scrims-constants";
import {
	MAX_SCRIM_POST_TEXT_LENGTH,
	scrimsNewActionSchema,
} from "../scrims-schemas";
import type { LutiDiv } from "../scrims-types";
export { loader, action };

type FormFields = z.infer<typeof scrimsNewActionSchema>;

export default function NewScrimPage() {
	const data = useLoaderData<typeof loader>();

	return (
		<Main>
			<MyForm
				schema={scrimsNewActionSchema}
				title="Creating a new scrim post"
				defaultValues={{
					postText: "",
					at: new Date(),
					divs: null,
					from:
						data.teams.length > 0
							? { mode: "TEAM", teamId: data.teams[0].id }
							: {
									mode: "PICKUP",
									users: [],
								},
				}}
			>
				<FromFormField usersTeams={data.teams} />

				<DateTimeFormField<FormFields> label="When" name="at" />

				<LutiDivsFormField />

				<TextAreaFormField<FormFields>
					label="Text"
					name="postText"
					maxLength={MAX_SCRIM_POST_TEXT_LENGTH}
				/>
			</MyForm>
		</Main>
	);
}

function LutiDivsFormField() {
	const methods = useFormContext<FormFields>();

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
				<Label htmlFor="min-div">Min div</Label>
				<select id="min-div" onChange={onChangeMin} onBlur={onBlur}>
					<option value="">—</option>
					{LUTI_DIVS.map((div) => (
						<option key={div} value={div}>
							{div}
						</option>
					))}
				</select>
			</div>

			<div>
				<Label htmlFor="max-div">Max div</Label>
				<select id="max-div" onChange={onChangeMax} onBlur={onBlur}>
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
