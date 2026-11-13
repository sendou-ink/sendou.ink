import { ArrowLeft, Import, UserPlus } from "lucide-react";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { useFetcher, useLoaderData } from "react-router";
import { LinkButton, SendouButton } from "~/components/elements/Button";
import { SendouDialog } from "~/components/elements/Dialog";
import { Label } from "~/components/Label";
import { useUser } from "~/features/auth/core/user";
import {
	type CounterPickMapPool,
	CounterPickMapPoolPicker,
	MapPoolValidationStatusMessage,
	useCounterPickMapPoolValidationStatus,
} from "~/features/tournament/components/CounterPickMapPoolPicker";
import { useTournament } from "~/features/tournament/tournament-context";
import { tournamentAdminImportTeamsPage } from "~/features/tournament-admin/tournament-admin-urls";
import type { TournamentTeamFull } from "~/features/tournament-bracket/core/Tournament.server";
import { FormField } from "~/form/FormField";
import { FormFieldMessages } from "~/form/fields/FormFieldWrapper";
import { SendouForm, useFormFieldContext } from "~/form/SendouForm";
import type {
	ArrayItemRenderContext,
	CustomFieldRenderProps,
	SelectOption,
	TeamSearchFieldOptions,
	TournamentSearchFieldOptions,
	UserSearchFieldOptions,
} from "~/form/types";
import { useIsomorphicLayoutEffect } from "~/hooks/useIsomorphicLayoutEffect";
import { tournamentAdminPage } from "~/utils/urls";
import type { TournamentAdminRegistrationLoaderData } from "../loaders/to.$id.admin.registration.$tid.server";
import {
	ADMIN_REGISTRATION_MAX_MEMBERS,
	type AdminRegistrationFormValues,
	adminRegistrationFormSchema,
	type ImportTeamFormValues,
	importTeamFormSchema,
	newPlaceholderOwnerId,
} from "../tournament-admin-registration-schemas";
import type { ImportTeamsLoaderData } from "./to.$id.admin.import-teams";

export { action } from "../actions/to.$id.admin.registration.server";
export { loader } from "../loaders/to.$id.admin.registration.$tid.server";

type RosterMemberValue = {
	_key?: string;
	isPlaceholder?: boolean;
	userId?: number | null;
	placeholderName?: string | null;
	inGameName?: string | null;
	tournamentName?: string | null;
};

type ImportableTeam = ImportTeamsLoaderData["teams"][number];

type LinkedTeamPrefill = {
	id: number;
	name: string;
	avatarUrl?: string | null;
};

export default function TournamentAdminRegistrationPage() {
	const { t } = useTranslation(["common"]);
	const tournament = useTournament();
	const { team } = useLoaderData<TournamentAdminRegistrationLoaderData>();

	const adminPage = tournamentAdminPage(tournament.ctx.id);

	const owner = team?.members.find((member) => member.role === "OWNER");

	const defaultValues: Partial<AdminRegistrationFormValues> | undefined = team
		? {
				tournamentTeamId: team.id,
				linkedTeam: Boolean(team.team),
				pickUpName: team.team ? null : team.name,
				logo:
					!team.team &&
					team.pickupAvatarUrl &&
					typeof team.avatarImgId === "number"
						? {
								type: "EXISTING",
								imgId: team.avatarImgId,
								url: team.pickupAvatarUrl,
							}
						: null,
				teamId: team.team?.id ?? null,
				ownerId: owner ? String(owner.userId) : "",
				members: team.members.map((member) =>
					member.isPlaceholder
						? {
								isPlaceholder: true,
								userId: member.userId,
								placeholderName: member.username,
								inGameName: tournament.ctx.settings.requireInGameNames
									? (member.inGameName ?? null)
									: null,
								tournamentName: null,
							}
						: {
								isPlaceholder: false,
								userId: member.userId,
								placeholderName: null,
								inGameName: tournament.ctx.settings.requireInGameNames
									? (member.inGameName ?? null)
									: null,
								tournamentName: member.tournamentName ?? null,
							},
				),
				mapPool: team.mapPool ?? [],
			}
		: undefined;

	return (
		<div className="stack md">
			<LinkButton
				to={adminPage}
				variant="outlined"
				size="small"
				icon={<ArrowLeft />}
				className="mr-auto"
			>
				{t("common:actions.back")}
			</LinkButton>
			<SendouForm
				schema={adminRegistrationFormSchema}
				title={team ? "Edit registration" : "Add new team"}
				defaultValues={defaultValues}
			>
				<RegistrationFields team={team} />
			</SendouForm>
		</div>
	);
}

function RegistrationFields({ team }: { team: TournamentTeamFull | null }) {
	const { t } = useTranslation(["forms"]);
	const tournament = useTournament();
	const user = useUser();
	const { values, setValue, revalidateAll, hasSubmitted } =
		useFormFieldContext();

	const [usernames, setUsernames] = React.useState<Record<number, string>>(
		() => {
			const initial: Record<number, string> = {};
			for (const member of team?.members ?? []) {
				initial[member.userId] = member.username;
			}
			return initial;
		},
	);
	const [importedLinkedTeam, setImportedLinkedTeam] =
		React.useState<LinkedTeamPrefill | null>(null);

	const linkedTeam = Boolean(values.linkedTeam);
	const members = (values.members as RosterMemberValue[]) ?? [];
	const requireInGameNames = tournament.ctx.settings.requireInGameNames;
	const canEditTournamentNames = tournament.canEditTournamentNames(user);

	const handleImport = (importedTeam: ImportableTeam) => {
		setUsernames((prev) => {
			const next = { ...prev };
			for (const member of importedTeam.members) {
				next[member.userId] = member.username;
			}
			return next;
		});

		const owner =
			importedTeam.members.find((member) => member.isOwner) ??
			importedTeam.members[0];

		const importedValues: Record<string, unknown> = importedTeam.linkedTeam
			? { linkedTeam: true, teamId: importedTeam.linkedTeam.id }
			: {
					linkedTeam: false,
					pickUpName: importedTeam.name,
					logo:
						typeof importedTeam.avatarImgId === "number" &&
						importedTeam.pickupAvatarUrl
							? {
									type: "EXISTING",
									imgId: importedTeam.avatarImgId,
									url: importedTeam.pickupAvatarUrl,
								}
							: null,
				};
		// a player without an account belongs to their own tournament, so a new one is created in their place
		const importedMembers = importedTeam.members.filter(
			(member) => !member.isPlaceholder || tournament.isLan,
		);
		importedValues.members = importedMembers.map((member) => ({
			...(member.isPlaceholder
				? { isPlaceholder: true, placeholderName: member.username }
				: { userId: member.userId, tournamentName: member.tournamentName }),
			inGameName: member.inGameName,
			// fresh key so member rows remount and re-resolve their user search when importing over a previous import
			_key: crypto.randomUUID(),
		}));
		importedValues.ownerId = !owner
			? ""
			: owner.isPlaceholder
				? newPlaceholderOwnerId(owner.username)
				: String(owner.userId);

		setImportedLinkedTeam(
			importedTeam.linkedTeam
				? {
						id: importedTeam.linkedTeam.id,
						name: importedTeam.name,
						avatarUrl: importedTeam.linkedTeam.logoUrl,
					}
				: null,
		);

		for (const [name, value] of Object.entries(importedValues)) {
			setValue(name, value);
		}

		// after a submit, recompute against the imported values so stale "required" errors don't linger
		if (hasSubmitted) {
			revalidateAll({ ...values, ...importedValues });
		}
	};

	const ownerOptions: Array<SelectOption & { rowKey?: string }> =
		members.flatMap((member, i) => {
			if (typeof member.userId === "number") {
				return {
					rowKey: member._key,
					value: String(member.userId),
					label:
						(member.isPlaceholder && member.placeholderName) ||
						usernames[member.userId] ||
						`${t("forms:labels.player")} ${i + 1}`,
				};
			}

			const placeholderName = member.placeholderName?.trim();
			if (!member.isPlaceholder || !placeholderName) return [];

			return {
				rowKey: member._key,
				value: newPlaceholderOwnerId(placeholderName),
				label: placeholderName,
			};
		});

	const addPlaceholder = () => {
		const placeholderRow = {
			isPlaceholder: true,
			placeholderName: "",
			_key: crypto.randomUUID(),
		};
		setValue("members", [...members, placeholderRow]);
	};

	// the non-clearable Captain <select> always shows a member as selected, so keep ownerId in sync:
	// default to the first member, follow a new placeholder captain's row when their name is edited,
	// reset when the current captain left the roster
	const ownerOptionsKey = ownerOptions.map((option) => option.value).join(",");
	const previousOwnerRowKeys = React.useRef(new Map<string, string>());
	React.useEffect(() => {
		const previousRowKeys = previousOwnerRowKeys.current;
		previousOwnerRowKeys.current = new Map(
			ownerOptions.flatMap((option) =>
				option.rowKey ? [[option.value, option.rowKey]] : [],
			),
		);

		if (ownerOptions.length === 0) return;
		if (ownerOptions.some((option) => option.value === values.ownerId)) return;

		const ownerRowKey =
			typeof values.ownerId === "string"
				? previousRowKeys.get(values.ownerId)
				: undefined;
		const sameRowOption = ownerRowKey
			? ownerOptions.find((option) => option.rowKey === ownerRowKey)
			: undefined;
		setValue("ownerId", (sameRowOption ?? ownerOptions[0]).value);
	}, [ownerOptionsKey]);

	return (
		<>
			{!team ? (
				<ImportTeamSection
					currentTournamentId={tournament.ctx.id}
					onImport={handleImport}
				/>
			) : null}
			<FormField name="linkedTeam" />
			{linkedTeam ? (
				<FormField
					// remount on import so the search picks up the new initialTeam instead of clearing
					key={team?.team?.id ?? importedLinkedTeam?.id ?? "new"}
					name="teamId"
					options={
						{
							initialTeam: team?.team
								? {
										id: team.team.id,
										name: team.name,
										avatarUrl: team.team.logoUrl,
									}
								: (importedLinkedTeam ?? undefined),
							onTeamSelected: (selected) => {
								if (!selected) return;
								setUsernames((prev) => {
									const next = { ...prev };
									for (const member of selected.members) {
										next[member.id] = member.username;
									}
									return next;
								});
								setValue(
									"members",
									selected.members.map((member) => ({
										userId: member.id,
										inGameName: null,
										tournamentName: member.tournamentName,
									})),
								);
								setValue("ownerId", String(selected.members[0]?.id ?? ""));
							},
						} satisfies TeamSearchFieldOptions
					}
				/>
			) : (
				<>
					<FormField name="pickUpName" />
					<FormField name="logo" />
				</>
			)}
			<FormField name="members">
				{({ itemName, values: member }: ArrayItemRenderContext) =>
					member.isPlaceholder ? (
						<div className="stack sm">
							<FormField name={`${itemName}.placeholderName`} />
							{requireInGameNames ? (
								<FormField name={`${itemName}.inGameName`} />
							) : null}
						</div>
					) : (
						<div className="stack sm">
							<FormField
								name={`${itemName}.userId`}
								options={
									{
										// the Captain dropdown labels by name instead of "Player N"
										onUserSelected: (selectedUser) => {
											if (!selectedUser) return;
											setUsernames((prev) => ({
												...prev,
												[selectedUser.id]: selectedUser.name,
											}));
											if (requireInGameNames && selectedUser.inGameName) {
												setValue(
													`${itemName}.inGameName`,
													selectedUser.inGameName,
												);
											}
											// saved as is, so it must show the user's current name or saving would clear it
											if (canEditTournamentNames) {
												setValue(
													`${itemName}.tournamentName`,
													selectedUser.tournamentName,
												);
											}
										},
									} satisfies UserSearchFieldOptions
								}
							/>
							{requireInGameNames ? (
								<FormField name={`${itemName}.inGameName`} />
							) : null}
							{canEditTournamentNames ? (
								<FormField name={`${itemName}.tournamentName`} />
							) : null}
						</div>
					)
				}
			</FormField>
			{tournament.isLan ? (
				<SendouButton
					size="small"
					variant="outlined"
					icon={<UserPlus />}
					onClick={addPlaceholder}
					isDisabled={members.length >= ADMIN_REGISTRATION_MAX_MEMBERS}
					className="m-0-auto"
				>
					{t("forms:regAddPlaceholder")}
				</SendouButton>
			) : null}
			<FormField name="ownerId" options={ownerOptions} />
			{tournament.teamsPrePickMaps && !tournament.hasStarted ? (
				<FormField name="mapPool">
					{(props: CustomFieldRenderProps) => (
						<MapPoolField
							{...props}
							value={props.value as CounterPickMapPool}
						/>
					)}
				</FormField>
			) : null}
		</>
	);
}

function MapPoolField({
	name,
	value,
	error,
	onChange,
	disabled,
}: CustomFieldRenderProps<CounterPickMapPool>) {
	const { t } = useTranslation(["common"]);
	const validationStatus = useCounterPickMapPoolValidationStatus(value);

	// the pickers are a group of buttons, so there is no input for the label to point at
	return (
		<div className="stack sm">
			<Label spaced={false}>{t("common:maps.mapPool")}</Label>
			<div className="stack lg">
				<CounterPickMapPoolPicker
					mapPool={value}
					onChange={onChange}
					disabled={disabled}
				/>
				<MapPoolValidationStatusMessage status={validationStatus} />
			</div>
			<FormFieldMessages name={name} error={error} />
		</div>
	);
}

function ImportTeamSection({
	currentTournamentId,
	onImport,
}: {
	currentTournamentId: number;
	onImport: (team: ImportableTeam) => void;
}) {
	const { t } = useTranslation(["forms"]);
	const [isOpen, setIsOpen] = React.useState(false);
	const teamsRef = React.useRef<ImportableTeam[]>([]);

	const handleApply = (values: ImportTeamFormValues) => {
		const importedTeam = teamsRef.current.find(
			(team) => String(team.id) === values.sourceTournamentTeamId,
		);
		if (importedTeam) {
			onImport(importedTeam);
		}
		setIsOpen(false);
	};

	return (
		<div className="mr-auto">
			<SendouButton
				variant="outlined"
				size="small"
				icon={<Import />}
				onClick={() => setIsOpen(true)}
			>
				{t("forms:regImportTeam")}
			</SendouButton>
			{isOpen ? (
				<SendouDialog
					heading={t("forms:regImportTeam")}
					onClose={() => setIsOpen(false)}
				>
					<SendouForm
						schema={importTeamFormSchema}
						onApply={handleApply}
						submitButtonText={t("forms:regImportTeam")}
					>
						<ImportTeamFields
							currentTournamentId={currentTournamentId}
							teamsRef={teamsRef}
						/>
					</SendouForm>
				</SendouDialog>
			) : null}
		</div>
	);
}

function ImportTeamFields({
	currentTournamentId,
	teamsRef,
}: {
	currentTournamentId: number;
	teamsRef: React.RefObject<ImportableTeam[]>;
}) {
	const { values, setValue } = useFormFieldContext();
	const fetcher = useFetcher<ImportTeamsLoaderData>();

	const teams = fetcher.data?.teams ?? [];
	useIsomorphicLayoutEffect(() => {
		teamsRef.current = teams;
	});

	// the non-clearable native select shows the first option, so keep the form value in sync:
	// default to the first team, reset when the loaded teams change
	const teamIdsKey = teams.map((team) => team.id).join(",");
	React.useEffect(() => {
		if (teams.length === 0) return;
		const current = values.sourceTournamentTeamId;
		if (
			typeof current === "string" &&
			teams.some((team) => String(team.id) === current)
		) {
			return;
		}
		setValue("sourceTournamentTeamId", String(teams[0].id));
	}, [teamIdsKey]);

	const teamOptions: SelectOption[] = teams.map((team) => ({
		value: String(team.id),
		label: team.name,
	}));

	return (
		<>
			<FormField
				name="sourceTournamentId"
				options={
					{
						pastOnly: true,
						onTournamentSelected: (tournament) => {
							if (!tournament) return;

							fetcher.load(
								tournamentAdminImportTeamsPage({
									tournamentId: currentTournamentId,
									fromTournamentId: tournament.id,
								}),
							);
						},
					} satisfies TournamentSearchFieldOptions
				}
			/>
			<FormField name="sourceTournamentTeamId" options={teamOptions} />
		</>
	);
}
