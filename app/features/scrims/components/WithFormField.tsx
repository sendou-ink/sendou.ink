import * as React from "react";
import { useTranslation } from "react-i18next";
import type { z } from "zod";
import { UserSearch } from "~/components/elements/UserSearch";
import { FormMessage } from "~/components/FormMessage";
import { useUser } from "~/features/auth/core/user";
import { SCRIM } from "~/features/scrims/scrims-constants";
import { FormFieldWrapper } from "~/form/fields/FormFieldWrapper";
import { nullFilledArray } from "~/utils/arrays";
import type { CommonUser } from "~/utils/kysely.server";
import type { fromSchema } from "../scrims-schemas";

type FromValue = z.infer<typeof fromSchema>;

interface WithFormFieldProps {
	usersTeams: Array<{
		id: number;
		name: string;
		members: Array<CommonUser>;
	}>;
	name: string;
	value: unknown;
	onChange: (value: unknown) => void;
	error: string | undefined;
}

export function WithFormField({
	usersTeams,
	name,
	value,
	onChange,
	error,
}: WithFormFieldProps) {
	const { t } = useTranslation(["scrims"]);
	const user = useUser();
	const id = React.useId();

	const fromValue = value as FromValue | null;

	const handleSelectChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
		if (e.target.value === "PICKUP") {
			onChange({
				mode: "PICKUP",
				users: nullFilledArray(SCRIM.MAX_PICKUP_SIZE_EXCLUDING_OWNER),
			});
			return;
		}

		onChange({ teamId: Number(e.target.value), mode: "TEAM" });
	};

	const handleUserChange = (
		selectedUser: { id: number } | null,
		index: number,
	) => {
		if (!fromValue || fromValue.mode !== "PICKUP") return;

		onChange({
			mode: "PICKUP",
			users: fromValue.users.map((u, j) =>
				j === index ? selectedUser?.id : u,
			),
		});
	};

	const selectValue = fromValue?.mode === "TEAM" ? fromValue.teamId : "PICKUP";

	return (
		<FormFieldWrapper
			id={id}
			name={name}
			label={t("scrims:forms.with.title")}
			error={fromValue?.mode === "TEAM" ? error : undefined}
		>
			<select id={id} value={selectValue} onChange={handleSelectChange}>
				{usersTeams.map((team) => (
					<option key={team.id} value={team.id}>
						{team.name}
					</option>
				))}
				<option value="PICKUP">{t("scrims:forms.with.pick-up")}</option>
			</select>
			{fromValue?.mode === "PICKUP" ? (
				<div className="stack md mt-4">
					<UserSearch
						initialUserId={user!.id}
						isDisabled
						label={t("scrims:forms.with.user", { nth: 1 })}
					/>
					{fromValue.users.map((userId, i) => (
						<UserSearch
							key={i}
							initialUserId={userId}
							onChange={(selectedUser) => handleUserChange(selectedUser, i)}
							isRequired={i < 3}
							label={t("scrims:forms.with.user", { nth: i + 2 })}
						/>
					))}
					{error ? (
						<FormMessage type="error">{error}</FormMessage>
					) : (
						<FormMessage type="info">
							{t("scrims:forms.with.explanation")}
						</FormMessage>
					)}
				</div>
			) : null}
		</FormFieldWrapper>
	);
}
