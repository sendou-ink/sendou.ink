import { ArrowLeft, Import } from "lucide-react";
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
import { tournamentAdminPage } from "~/utils/urls";
import type { TournamentAdminRegistrationLoaderData } from "../loaders/to.$id.admin.registration.$tid.server";
import {
	type AdminRegistrationFormValues,
	adminRegistrationFormSchema,
	type ImportTeamFormValues,
	importTeamFormSchema,
} from "../tournament-admin-registration-schemas";
import type { ImportTeamsLoaderData } from "./to.$id.admin.import-teams";

export { action } from "../actions/to.$id.admin.registration.server";
export { loader } from "../loaders/to.$id.admin.registration.$tid.server";

type RosterMemberValue = {
	userId?: number;
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
				members: team.members.map((member) => ({
					userId: member.userId,
					inGameName: tournament.ctx.settings.requireInGameNames
						? (member.inGameName ?? null)
						: null,
					tournamentName: member.tournamentName ?? null,
				})),
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
		importedValues.members = importedTeam.members.map((member) => ({
			userId: member.userId,
			inGameName: member.inGameName,
			tournamentName: member.tournamentName,
			// fresh key so the member rows remount and their user-search inputs
			// re-resolve when importing a different team over a previous import
			_key: crypto.randomUUID(),
		}));
		importedValues.ownerId = owner ? String(owner.userId) : "";

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

		// if the form was already submitted, recompute against the imported values
		// so stale "required" errors don't linger on now-filled fields; before any
		// submit there are no errors to surface yet
		if (hasSubmitted) {
			revalidateAll({ ...values, ...importedValues });
		}
	};

	const ownerOptions: SelectOption[] = members
		.filter(
			(member): member is { userId: number } =>
				typeof member.userId === "number",
		)
		.map((member, i) => ({
			value: String(member.userId),
			label: usernames[member.userId] ?? `${t("forms:labels.player")} ${i + 1}`,
		}));

	// the non-clearable Captain <select> always displays a member as selected, so
	// keep ownerId in sync with it: default to the first member and reset when the
	// current captain is no longer on the roster (e.g. their row was removed)
	const ownerOptionsKey = ownerOptions.map((option) => option.value).join(",");
	React.useEffect(() => {
		if (ownerOptions.length === 0) return;
		if (ownerOptions.some((option) => option.value === values.ownerId)) return;
		setValue("ownerId", ownerOptions[0].value);
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
					// remount the search when a different team is imported so it picks up
					// the new initialTeam instead of clearing its stale selection
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
				{({ itemName }: ArrayItemRenderContext) => (
					<div className="stack sm">
						<FormField
							name={`${itemName}.userId`}
							options={
								{
									// capture the picked user's name so the Captain dropdown can
									// label them instead of falling back to "Player N"
									onUserSelected: (user) => {
										if (!user) return;
										setUsernames((prev) => ({ ...prev, [user.id]: user.name }));
										// prefill the in-game name from the user's existing one
										if (requireInGameNames && user.inGameName) {
											setValue(`${itemName}.inGameName`, user.inGameName);
										}
										// the field is saved as is, so it has to show the name the
										// user already has or saving would clear it
										if (canEditTournamentNames) {
											setValue(
												`${itemName}.tournamentName`,
												user.tournamentName,
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
				)}
			</FormField>
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

	// the pickers are a group of buttons rather than one control, so there is no
	// input for the label to point at
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
				onPress={() => setIsOpen(true)}
			>
				{t("forms:regImportTeam")}
			</SendouButton>
			{isOpen ? (
				<SendouDialog
					heading={t("forms:regImportTeam")}
					onClose={() => setIsOpen(false)}
				>
					{/* The modal is portaled out of the registration <form> in the DOM,
					    but its submit event still bubbles through the React tree to the
					    outer form. Stop it here so importing doesn't submit registration. */}
					<div onSubmit={(e) => e.stopPropagation()}>
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
					</div>
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
	teamsRef.current = teams;

	// the non-clearable native select visually shows the first option, so keep the
	// form value in sync with it: default to the first team and reset when the
	// loaded set of teams changes (e.g. after picking a different tournament)
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
