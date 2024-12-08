import { Controller, useFormContext } from "react-hook-form";
import { Label } from "~/components/Label";
import type { CommonUser } from "~/utils/kysely.server";
import type { NewRequestFormFields } from "../routes/scrims";

interface FromFormFieldProps {
	usersTeams: Array<{
		id: number;
		name: string;
		members: Array<CommonUser>;
	}>;
}

export function FromFormField({ usersTeams }: FromFormFieldProps) {
	const methods = useFormContext<NewRequestFormFields>();

	return (
		<div>
			<Label>With</Label>
			<Controller
				control={methods.control}
				name="from"
				// xxx: on change is un typed
				render={({ field: { onChange, onBlur, value } }) => {
					const setTeam = (teamId: number) => {
						onChange({ teamId, mode: "TEAM" });
					};

					// xxx: if pickup, show team inputs
					return (
						<div>
							<select
								value={value.mode === "TEAM" ? value.teamId : ""}
								onChange={(e) => {
									if (e.target.value === "") {
										onChange({ mode: "PICKUP", users: [] });
									}

									setTeam(Number(e.target.value));
								}}
								onBlur={onBlur}
							>
								{usersTeams.map((team) => (
									<option key={team.id} value={team.id}>
										{team.name}
									</option>
								))}
								<option value="">Select a team</option>
							</select>
						</div>
					);
				}}
			/>
		</div>
	);
}
