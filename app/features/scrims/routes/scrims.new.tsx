import { useLoaderData } from "@remix-run/react";
import type { z } from "zod";
import { Label } from "~/components/Label";
import { DateFormField } from "~/components/form/DateFormField";
import { MyForm } from "~/components/form/MyForm";
import { TextAreaFormField } from "~/components/form/TextAreaFormField";
import { Main } from "../../../components/Main";
import { FromFormField } from "../components/FromFormField";
import { LUTI_DIVS } from "../scrims-constants";
import {
	MAX_SCRIM_POST_TEXT_LENGTH,
	scrimsNewActionSchema,
} from "../scrims-schemas";
import type { LutiDiv } from "../scrims-types";

import { action } from "../actions/scrims.new.server";
import { loader } from "../loaders/scrims.new.server";
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

				<DateFormField<FormFields> label="When" name="at" />

				<LutiDivsFormField
					value={null}
					onChange={(newVal) => console.log(newVal)}
				/>

				<TextAreaFormField<FormFields>
					label="Text"
					name="postText"
					maxLength={MAX_SCRIM_POST_TEXT_LENGTH}
				/>
			</MyForm>
		</Main>
	);
}

type LutiDivEdit = {
	max: LutiDiv | null;
	min: LutiDiv | null;
};

function LutiDivsFormField({
	value,
	onChange,
}: { value: LutiDivEdit; onChange: (value: LutiDivEdit) => void }) {
	const onChangeMin = (e: React.ChangeEvent<HTMLSelectElement>) => {
		const newValue = e.target.value === "" ? null : (e.target.value as LutiDiv);

		onChange({ min: newValue, max: value.max });
	};

	const onChangeMax = (e: React.ChangeEvent<HTMLSelectElement>) => {
		const newValue = e.target.value === "" ? null : (e.target.value as LutiDiv);

		onChange({ max: newValue, min: value.min });
	};

	return (
		<div className="stack horizontal sm">
			<div>
				<Label>Min div</Label>
				<select onChange={onChangeMin}>
					<option value="">—</option>
					{LUTI_DIVS.map((div) => (
						<option key={div} value={div}>
							{div}
						</option>
					))}
				</select>
			</div>

			<div>
				<Label>Max div</Label>
				<select onChange={onChangeMax}>
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
