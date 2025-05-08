import { Controller, useFormContext } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { FormMessage } from "~/components/FormMessage";
import { Label } from "~/components/Label";
import { UserSearch } from "~/components/elements/UserSearch";
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

export function WithFormField({ usersTeams }: FromFormFieldProps) {
	const { t } = useTranslation(["scrims"]);

	const user = useUser();
	const methods = useFormContext<NewRequestFormFields>();

	return (
		<div>
			<Label htmlFor="with">{t("scrims:forms.with.title")}</Label>
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
								id="with"
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
								<option value="PICKUP">{t("scrims:forms.with.pick-up")}</option>
							</select>
							{value.mode === "PICKUP" ? (
								<div className="stack md mt-4">
									<UserSearch
										initialUserId={user!.id}
										isDisabled
										label={t("scrims:forms.with.user", { nth: 1 })}
									/>
									{value.users.map((userId, i) => (
										<UserSearch
											key={i}
											initialUserId={userId}
											onChange={(user) =>
												onChange({
													mode: "PICKUP",
													users: value.users.map((u, j) =>
														j === i ? user.id : u,
													),
												})
											}
											isRequired={i < 3}
											label={t("scrims:forms.with.user", { nth: i + 2 })}
										/>
									))}
									{error ? (
										<FormMessage type="error">
											{error.message as string}
										</FormMessage>
									) : (
										<FormMessage type="info">
											{t("scrims:forms.with.explanation")}
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
