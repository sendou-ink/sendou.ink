import { Controller, useFormContext } from "react-hook-form";
import { FormMessage } from "~/components/FormMessage";
import { Label } from "~/components/Label";
import { UserSearch } from "~/components/UserSearch";
import { useUser } from "~/features/auth/core/user";
import { SCRIM } from "~/features/scrims/scrims-constants";
import { nullFilledArray } from "~/utils/arrays";
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
	const user = useUser();
	const methods = useFormContext<NewRequestFormFields>();

	return (
		<div>
			<Label>With</Label>
			<Controller
				control={methods.control}
				name="from"
				render={({ field: { onChange, onBlur, value }, fieldState }) => {
					const setTeam = (teamId: number) => {
						onChange({ teamId, mode: "TEAM" });
					};

					const error =
						(fieldState.error as any)?.users ?? fieldState.error?.root;
					return (
						<div>
							<select
								className="w-max"
								value={value.mode === "TEAM" ? value.teamId : "PICKUP"}
								onChange={(e) => {
									if (e.target.value === "PICKUP") {
										onChange({
											mode: "PICKUP",
											users: nullFilledArray(
												SCRIM.MAX_PICKUP_SIZE_EXCLUDING_OWNER,
											),
										});
										return;
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
								<option value="PICKUP">Pick-up</option>
							</select>
							{value.mode === "PICKUP" ? (
								<div className="stack md mt-4">
									<div>
										<Label required>User 1</Label>
										<UserSearch initialUserId={user!.id} disabled />
									</div>
									{value.users.map((userId, i) => (
										<div key={i}>
											<Label required={i < 3}>User {i + 2}</Label>
											<UserSearch
												// TODO: changing it like this triggers useEffect -> dropdown stays open, need to use "value" not "defaultValue"
												initialUserId={userId ?? undefined}
												onChange={(user) =>
													onChange({
														mode: "PICKUP",
														users: value.users.map((u, j) =>
															j === i ? user.id : u,
														),
													})
												}
											/>
										</div>
									))}
									{error ? (
										<FormMessage type="error">
											{error.message as string}
										</FormMessage>
									) : (
										<FormMessage type="info">
											You can search for users with username, Discord ID or
											sendou.ink profile URL.
										</FormMessage>
									)}
								</div>
							) : null}
						</div>
					);
				}}
			/>
		</div>
	);
}
