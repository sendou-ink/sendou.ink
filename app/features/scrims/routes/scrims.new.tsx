import { useLoaderData } from "@remix-run/react";
import type { z } from "zod";
import { MyForm } from "~/components/form/MyForm";
import { Main } from "../../../components/Main";
import { FromFormField } from "../components/FromFormField";
import {
	MAX_SCRIM_POST_TEXT_LENGTH,
	scrimsNewActionSchema,
} from "../scrims-schemas";

import { DateFormField } from "~/components/form/DateFormField";
import { TextAreaFormField } from "~/components/form/TextAreaFormField";
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

				<TextAreaFormField<FormFields>
					label="Text"
					name="postText"
					maxLength={MAX_SCRIM_POST_TEXT_LENGTH}
				/>
			</MyForm>
		</Main>
	);
}
