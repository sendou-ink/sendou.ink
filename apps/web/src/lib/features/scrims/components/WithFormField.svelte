<script lang="ts">
import { Select, SelectItem } from "@sendou/components";
import * as R from "remeda";
import * as v from "valibot";
import FormMessage from "#lib/components/FormMessage.svelte";
import UserSearch from "#lib/components/UserSearch.svelte";
import { loggedInUser } from "#lib/features/auth/user-state.ts";
import FormFieldWrapper from "#lib/form/fields/FormFieldWrapper.svelte";
import { errorMessageId, translateFormText } from "#lib/form/form-utils.ts";
import { m } from "#lib/paraglide/messages.js";
import type { CommonUser } from "#lib/server/kysely.ts";
import { SCRIM } from "../scrims-constants.ts";
import type { fromSchema } from "../scrims-schemas.ts";

type FromValue = v.InferOutput<typeof fromSchema>;

const NEW_PICKUP_KEY = "PICKUP";
/** Keeps one long username from crowding out the rest of the pick-up */
const MAX_PICKUP_USERNAME_LENGTH = 12;

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

interface Props {
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

let {
	usersTeams,
	recentPickupRosters = [],
	name,
	value,
	onChange,
	error,
}: Props = $props();

const user = $derived(loggedInUser());
const translatedError = $derived(translateFormText(error));

/** Remounts the pick-up fields so they reload their initial users */
let pickupFieldsKey = $state(NEW_PICKUP_KEY);

const fromValue = $derived(value as FromValue | null);

function nullFilledArray(length: number) {
	return Array.from({ length }, () => null);
}

const options = $derived<Array<WithOption>>([
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
				? m.scrims_forms_with_pick_up_new()
				: m.scrims_forms_with_pick_up(),
		textValue:
			recentPickupRosters.length > 0
				? m.scrims_forms_with_pick_up_new()
				: m.scrims_forms_with_pick_up(),
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
			label: m.scrims_forms_with_pick_up(),
			users: usernames.map(truncateUsername).join(", "),
			textValue: m.scrims_forms_with_pick_up_recent({
				users: usernames.join(", "),
			}),
			value: { mode: "PICKUP" as const, users: rosterUsers(roster) },
		};
	}),
]);

function handleSelectionChange(key: string | number | null) {
	const option = options.find((candidate) => candidate.key === key);
	if (!option) return;

	pickupFieldsKey = option.key;
	onChange(option.value);
}

function handleUserChange(
	selectedUser: { id: number } | null,
	index: number,
) {
	if (fromValue?.mode !== "PICKUP") return;

	onChange({
		mode: "PICKUP",
		users: fromValue.users.map((memberId, j) =>
			j === index ? selectedUser?.id : memberId,
		),
	});
}

const selectedKey = $derived.by(() => {
	if (fromValue?.mode === "TEAM") return `TEAM_${fromValue.teamId}`;

	const matchingRoster =
		fromValue?.mode === "PICKUP"
			? recentPickupRosters.find((roster) =>
					hasSameUsers(roster, fromValue.users),
				)
			: undefined;

	return matchingRoster ? `PICKUP_${matchingRoster.id}` : NEW_PICKUP_KEY;
});

/** Whether the pick-up as it stands still matches the roster it was filled from */
function hasSameUsers(roster: PickupRoster, userIds: Array<number | null>) {
	const selectedUserIds = userIds.filter(
		(userId) => typeof userId === "number",
	);

	return (
		R.unique(selectedUserIds).length ===
			R.unique(roster.users.map((rosterUser) => rosterUser.id)).length &&
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
		...roster.users.map((rosterUser) => rosterUser.id),
		...nullFilledArray(
			SCRIM.MAX_PICKUP_SIZE_EXCLUDING_OWNER - roster.users.length,
		),
	] as unknown as number[];
}

const fieldId = $props.id();
</script>

<FormFieldWrapper
	id={fieldId}
	{name}
	error={fromValue?.mode === "TEAM" ? error : undefined}
>
	<div class="withSelect">
		<Select
			label={m.scrims_forms_with_title()}
			{selectedKey}
			onSelectionChange={handleSelectionChange}
		>
			{#each options as option (option.key)}
				<SelectItem id={option.key} textValue={option.textValue}>
					<div class="option">
						{option.label}
						{#if option.users}
							<span class="optionUsers">{option.users}</span>
						{/if}
					</div>
				</SelectItem>
			{/each}
		</Select>
	</div>
	{#if fromValue?.mode === "PICKUP" && user}
		<div class="stack md mt-4">
			<UserSearch
				initialUserId={user.id}
				isDisabled
				label={m.scrims_forms_with_user({ nth: 1 })}
			/>
			{#each fromValue.users as userId, i (`${pickupFieldsKey}-${i}`)}
				<UserSearch
					initialUserId={userId ?? undefined}
					onChange={(selectedUser) => handleUserChange(selectedUser, i)}
					isRequired={i < 3}
					label={m.scrims_forms_with_user({ nth: i + 2 })}
				/>
			{/each}
			{#if translatedError}
				<FormMessage type="error" id={errorMessageId(name)}>
					{translatedError}
				</FormMessage>
			{:else}
				<FormMessage type="info">
					{m.scrims_forms_with_explanation()}
				</FormMessage>
			{/if}
		</div>
	{/if}
</FormFieldWrapper>

<style>
	.option {
		display: flex;
		flex-direction: column;
		justify-content: center;
		min-width: 0;
		line-height: 1.25;
	}

	.optionUsers {
		font-size: var(--font-xs);
		font-weight: var(--weight-semi);
		color: var(--color-text-high);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	/* the closed select has room for one line only */
	.withSelect :global(button .option),
	.withSelect :global(.selectValue .option) {
		flex-direction: row;
		align-items: center;
		gap: var(--s-2);
	}
</style>
