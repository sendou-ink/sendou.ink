import * as React from "react";
import type { Key } from "react-aria-components";
import { useTranslation } from "react-i18next";
import * as R from "remeda";
import type * as v from "valibot";
import { SendouSelect, SendouSelectItem } from "~/components/elements/Select";
import { UserSearch } from "~/components/elements/UserSearch";
import { FormMessage } from "~/components/FormMessage";
import { useUser } from "~/features/auth/core/user";
import { SCRIM } from "~/features/scrims/scrims-constants";
import {
	FormFieldWrapper,
	useTranslatedTexts,
} from "~/form/fields/FormFieldWrapper";
import { errorMessageId } from "~/form/utils";
import { nullFilledArray } from "~/utils/arrays";
import type { CommonUser } from "~/utils/kysely.server";
import type { fromSchema } from "../scrims-schemas";
import styles from "./WithFormField.module.css";

type FromValue = v.InferOutput<typeof fromSchema>;

const NEW_PICKUP_KEY = "PICKUP";
/** Keeps one long username from crowding out the rest of the pick-up */
const MAX_PICKUP_USERNAME_LENGTH = 12;
/** Fits an option showing a pick-up and its members on two lines */
const OPTION_HEIGHT = 46;

interface PickupRoster {
	id: number;
	users: Array<CommonUser>;
}

/** One entry of the select, carrying the form value selecting it results in. */
interface WithOption {
	key: string;
	label: string;
	/** Members of the pick-up, shown under the label */
	users?: string;
	textValue: string;
	value: FromValue;
}

interface WithFormFieldProps {
	usersTeams: Array<{
		id: number;
		name: string;
		members: Array<CommonUser>;
	}>;
	/** Pick-up rosters the user recently posted with, offered as ready made options */
	recentPickupRosters?: Array<PickupRoster>;
	name: string;
	value: unknown;
	onChange: (value: unknown) => void;
	error: string | undefined;
}

export function WithFormField({
	usersTeams,
	recentPickupRosters = [],
	name,
	value,
	onChange,
	error,
}: WithFormFieldProps) {
	const { t } = useTranslation(["scrims"]);
	const user = useUser();
	const id = React.useId();
	const { translatedError } = useTranslatedTexts({ error });
	/** Remounts the pick-up fields so they reload their initial users */
	const [pickupFieldsKey, setPickupFieldsKey] = React.useState(NEW_PICKUP_KEY);

	const fromValue = value as FromValue | null;

	const options: Array<WithOption> = [
		...usersTeams.map((team) => ({
			key: `TEAM_${team.id}`,
			label: team.name,
			textValue: team.name,
			value: { mode: "TEAM" as const, teamId: team.id },
		})),
		{
			key: NEW_PICKUP_KEY,
			label:
				recentPickupRosters.length > 0
					? t("scrims:forms.with.pick-up-new")
					: t("scrims:forms.with.pick-up"),
			textValue:
				recentPickupRosters.length > 0
					? t("scrims:forms.with.pick-up-new")
					: t("scrims:forms.with.pick-up"),
			value: {
				mode: "PICKUP" as const,
				users: nullFilledArray(
					SCRIM.MAX_PICKUP_SIZE_EXCLUDING_OWNER,
				) as unknown as number[],
			},
		},
		...recentPickupRosters.map((roster) => {
			const usernames = roster.users.map((rosterUser) => rosterUser.username);

			return {
				key: `PICKUP_${roster.id}`,
				label: t("scrims:forms.with.pick-up"),
				users: usernames.map(truncateUsername).join(", "),
				textValue: t("scrims:forms.with.pick-up-recent", {
					users: usernames.join(", "),
				}),
				value: { mode: "PICKUP" as const, users: rosterUsers(roster) },
			};
		}),
	];

	const handleSelectionChange = (key: Key | null) => {
		const option = options.find((option) => option.key === key);
		if (!option) return;

		setPickupFieldsKey(option.key);
		onChange(option.value);
	};

	const handleUserChange = React.useCallback(
		(selectedUser: { id: number } | null, index: number) => {
			if (fromValue?.mode !== "PICKUP") return;

			onChange({
				mode: "PICKUP",
				users: fromValue.users.map((u, j) =>
					j === index ? selectedUser?.id : u,
				),
			});
		},
		[fromValue, onChange],
	);

	const selectedKey = () => {
		if (fromValue?.mode === "TEAM") return `TEAM_${fromValue.teamId}`;

		const matchingRoster =
			fromValue?.mode === "PICKUP"
				? recentPickupRosters.find((roster) =>
						hasSameUsers(roster, fromValue.users),
					)
				: undefined;

		return matchingRoster ? `PICKUP_${matchingRoster.id}` : NEW_PICKUP_KEY;
	};

	return (
		<FormFieldWrapper
			id={id}
			name={name}
			error={fromValue?.mode === "TEAM" ? error : undefined}
		>
			<SendouSelect
				label={t("scrims:forms.with.title")}
				items={options}
				selectedKey={selectedKey()}
				onSelectionChange={handleSelectionChange}
				estimatedRowHeight={OPTION_HEIGHT}
			>
				{(option) => (
					<SendouSelectItem id={option.key} textValue={option.textValue}>
						<div className={styles.option}>
							{option.label}
							{option.users ? (
								<span className={styles.optionUsers}>{option.users}</span>
							) : null}
						</div>
					</SendouSelectItem>
				)}
			</SendouSelect>
			{fromValue?.mode === "PICKUP" ? (
				<div className="stack md mt-4">
					<UserSearch
						initialUserId={user!.id}
						isDisabled
						label={t("scrims:forms.with.user", { nth: 1 })}
					/>
					{fromValue.users.map((userId, i) => (
						<PickupUserSearch
							key={`${pickupFieldsKey}-${i}`}
							index={i}
							initialUserId={userId}
							isRequired={i < 3}
							label={t("scrims:forms.with.user", { nth: i + 2 })}
							onUserChange={handleUserChange}
						/>
					))}
					{translatedError ? (
						<FormMessage type="error" id={errorMessageId(name)}>
							{translatedError}
						</FormMessage>
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

/** Whether the pick-up as it stands still matches the roster it was filled from */
function hasSameUsers(roster: PickupRoster, userIds: Array<number | null>) {
	const selectedUserIds = userIds.filter(
		(userId) => typeof userId === "number",
	);

	return (
		R.unique(selectedUserIds).length ===
			R.unique(roster.users.map((user) => user.id)).length &&
		selectedUserIds.every((userId) =>
			roster.users.some((rosterUser) => rosterUser.id === userId),
		)
	);
}

function truncateUsername(username: string) {
	return username.length > MAX_PICKUP_USERNAME_LENGTH
		? `${username.slice(0, MAX_PICKUP_USERNAME_LENGTH).trimEnd()}…`
		: username;
}

function rosterUsers(roster: PickupRoster) {
	return [
		...roster.users.map((user) => user.id),
		...nullFilledArray(
			SCRIM.MAX_PICKUP_SIZE_EXCLUDING_OWNER - roster.users.length,
		),
	] as unknown as number[];
}

function PickupUserSearch({
	index,
	initialUserId,
	isRequired,
	label,
	onUserChange,
}: {
	index: number;
	initialUserId: number | null | undefined;
	isRequired: boolean;
	label: string;
	onUserChange: (selectedUser: { id: number } | null, index: number) => void;
}) {
	const handleChange = React.useCallback(
		(selectedUser: { id: number } | null) => {
			onUserChange(selectedUser, index);
		},
		[index, onUserChange],
	);

	return (
		<UserSearch
			initialUserId={initialUserId ?? undefined}
			onChange={handleChange}
			isRequired={isRequired}
			label={label}
		/>
	);
}
