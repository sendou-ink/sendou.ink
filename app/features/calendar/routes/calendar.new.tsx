import { Trash } from "lucide-react";
import * as React from "react";
import { useTranslation } from "react-i18next";
import type { MetaFunction } from "react-router";
import { Form, Link, useLoaderData } from "react-router";
import { Alert } from "~/components/Alert";
import { Divider } from "~/components/Divider";
import { SendouButton } from "~/components/elements/Button";
import { FormMessage } from "~/components/FormMessage";
import { ModeImage } from "~/components/Image";
import { Label } from "~/components/Label";
import { Main } from "~/components/Main";
import { MapPoolSelector } from "~/components/MapPoolSelector";
import { SubmitButton } from "~/components/SubmitButton";
import { MapPool } from "~/features/map-list-generator/core/map-pool";
import * as TeamPick from "~/features/tournament/core/TeamPick";
import type {
	TeamPickPool,
	TournamentMapPickingStyle,
} from "~/features/tournament/tournament-constants";
import { Trophy } from "~/features/trophies/components/Trophy";
import { type CustomFieldRenderProps, FormField } from "~/form/FormField";
import { existingImage } from "~/form/image-field";
import { SendouForm, useFormFieldContext } from "~/form/SendouForm";
import { errorMessageId } from "~/form/utils";
import { useDateTimeFormat } from "~/hooks/intl/useDateTimeFormat";
import { rankedModesShort } from "~/modules/in-game-lists/modes";
import type { ModeShort } from "~/modules/in-game-lists/types";
import { useHasRole } from "~/modules/permissions/hooks";
import { databaseTimestampToDate, getDateAtNextFullHour } from "~/utils/dates";
import { metaTags } from "~/utils/remix";
import type { SendouRouteHandle } from "~/utils/remix.server";
import { CREATING_TOURNAMENT_DOC_LINK, FAQ_PAGE } from "~/utils/urls";
import { action } from "../actions/calendar.new.server";
import type { RegClosesAtOption } from "../calendar-constants";
import styles from "../calendar-new.module.css";
import {
	calendarNewBaseSchema,
	customTeamPickPool,
	type TeamPickCountsFormValue,
	teamPickSettingsFromFormValues,
} from "../calendar-new-schemas";
import {
	defaultBracketsFormValues,
	progressionToFormValues,
} from "../calendar-progression-form";
import type { CalendarEventTag } from "../calendar-types";
import { datesToRegClosesAt } from "../calendar-utils";
import { BracketProgressionFormFields } from "../components/BracketProgressionFormFields";
import { loader } from "../loaders/calendar.new.server";

export { action, loader };

export const meta: MetaFunction<typeof loader> = (args) => {
	if (!args.loaderData) return [];

	const what = args.loaderData.isAddingTournament
		? "tournament"
		: "calendar event";

	return metaTags({
		title: args.loaderData.eventToEdit ? `Editing ${what}` : `New ${what}`,
		location: args.location,
	});
};

export const handle: SendouRouteHandle = {
	i18n: ["calendar", "game-misc", "tournament"],
};

const useBaseEvent = () => {
	const { eventToEdit, eventToCopy } = useLoaderData<typeof loader>();

	return eventToCopy ?? eventToEdit;
};

export default function CalendarNewEventPage() {
	const baseEvent = useBaseEvent();
	const isCalendarEventAdder = useHasRole("CALENDAR_EVENT_ADDER");
	const data = useLoaderData<typeof loader>();
	const defaultValues = useDefaultValues();

	if (!data.eventToEdit && !isCalendarEventAdder) {
		return (
			<Main halfWidth className="stack items-center">
				<Alert variation="WARNING">
					You can't add a new event at this time (Discord account too young)
				</Alert>
			</Main>
		);
	}

	if (
		!data.eventToEdit &&
		data.isAddingTournament &&
		data.organizations.length === 0
	) {
		return (
			<Main halfWidth className="stack items-center">
				<Alert variation="WARNING">
					No permissions to add tournaments. Tournaments are in beta, accessible
					by Patreon supporters and established TO&apos;s. See{" "}
					<Link to={FAQ_PAGE}>FAQ</Link> for more info.
				</Alert>
			</Main>
		);
	}

	return (
		<Main halfWidth>
			<div className="stack md">
				<div className="stack horizontal md items-center">
					<h1 className="text-lg">
						{data.isAddingTournament ? "New tournament" : "New calendar event"}
					</h1>
					{data.isAddingTournament ? (
						<a
							href={CREATING_TOURNAMENT_DOC_LINK}
							className="text-lg text-bold"
							title="Documentation about creating tournaments"
							target="_blank"
							rel="noopener noreferrer"
						>
							?
						</a>
					) : null}
				</div>
				{data.isAddingTournament ? <TemplateTournamentForm /> : null}
				<SendouForm
					key={baseEvent?.eventId}
					schema={calendarNewBaseSchema}
					defaultValues={defaultValues}
					submitButtonTestId="submit-button"
					fullWidth
				>
					<CalendarNewFields />
				</SendouForm>
			</div>
		</Main>
	);
}

function useDefaultValues() {
	const data = useLoaderData<typeof loader>();
	const baseEvent = useBaseEvent();
	const tournamentCtx = baseEvent?.tournament?.ctx;
	const settings = tournamentCtx?.settings;

	const regClosesAt: RegClosesAtOption = tournamentCtx?.settings.regClosesAt
		? datesToRegClosesAt({
				startTime: databaseTimestampToDate(tournamentCtx.startsAt),
				regClosesAt: databaseTimestampToDate(
					tournamentCtx.settings.regClosesAt,
				),
			})
		: "0";

	const mapPickingStyle: TournamentMapPickingStyle =
		baseEvent?.mapPickingStyle ?? "AUTO";
	const teamPick =
		settings?.teamPick ?? TeamPick.defaultSettings([...rankedModesShort]);

	const pool = baseEvent?.mapPool
		? new MapPool(baseEvent.mapPool).serialized
		: "";

	const bracketProgressionValues = settings?.bracketProgression
		? progressionToFormValues(settings.bracketProgression)
		: data.isAddingTournament
			? defaultBracketsFormValues()
			: { brackets: [], progression: [] };

	return {
		toToolsEnabled: data.isAddingTournament,
		eventToEditId: data.eventToEdit?.eventId,
		tournamentToCopyId: data.eventToCopy?.tournamentId ?? undefined,
		name: data.eventToEdit?.name ?? "",
		description: baseEvent?.description ?? "",
		organizationId: baseEvent?.organization?.id
			? String(baseEvent.organization.id)
			: null,
		rules: baseEvent?.rules ?? "",
		date: data.isAddingTournament
			? []
			: (data.eventToEdit?.startTimes?.map((t) =>
					databaseTimestampToDate(t),
				) ?? [getDateAtNextFullHour(new Date())]),
		startTime: data.isAddingTournament
			? data.eventToEdit?.startTimes?.[0]
				? databaseTimestampToDate(data.eventToEdit.startTimes[0])
				: getDateAtNextFullHour(new Date())
			: null,
		// tournaments hide this field, the action coalesces the empty value to the default
		bracketUrl: data.isAddingTournament
			? ""
			: (data.eventToEdit?.bracketUrl ?? ""),
		discordInviteCode: baseEvent?.discordInviteCode ?? "",
		tags: (baseEvent?.tags ?? []).filter(isPickableTag),
		badges: baseEvent?.badgePrizes?.map((b) => b.id) ?? [],
		trophyId: baseEvent?.trophy?.id ?? null,
		avatarImgId: existingImage(
			baseEvent?.avatarImgId,
			baseEvent?.tournament?.ctx.logoUrl,
		),
		regClosesAt,
		minMembersPerTeam: String(settings?.minMembersPerTeam ?? 4) as
			| "1"
			| "2"
			| "3"
			| "4",
		maxMembersPerTeam: settings?.maxMembersPerTeam ?? undefined,
		mapPickingStyle,
		teamPickModes: TeamPick.pickedModes(teamPick),
		teamPickCounts: teamPick.modes,
		teamPickPool: teamPick.pool,
		pool,
		brackets: bracketProgressionValues.brackets,
		progression: bracketProgressionValues.progression,
		isRanked: settings?.isRanked ?? true,
		enableNoScreenToggle: settings?.enableNoScreenToggle ?? true,
		enableSubs: settings?.enableSubs ?? true,
		autonomousSubs: settings?.autonomousSubs ?? true,
		requireInGameNames: settings?.requireInGameNames ?? false,
		isInvitational: settings?.isInvitational ?? false,
		isTest: settings?.isTest ?? false,
		isLeague: settings?.isLeague ?? false,
		isDraft: settings?.isDraft ?? false,
		requireSendouQParticipation: settings?.requireSendouQParticipation ?? false,
	};
}

function TemplateTournamentForm() {
	const { recentTournaments } = useLoaderData<typeof loader>();
	const [eventId, setEventId] = React.useState("");
	const { formatter } = useDateTimeFormat({
		month: "numeric",
		day: "numeric",
	});

	if (!recentTournaments) return null;

	return (
		<>
			<div>
				<Form className="stack horizontal sm flex-wrap">
					<select
						name="copyEventId"
						onChange={(event) => {
							setEventId(event.target.value);
						}}
					>
						<option value="">Select a template</option>
						{recentTournaments.map((event) => (
							<option key={event.id} value={event.id}>
								{event.name} ({formatter.format(event.startsAt) ?? ""})
							</option>
						))}
					</select>
					<SubmitButton isDisabled={!eventId} testId="use-template-button">
						Use template
					</SubmitButton>
				</Form>
			</div>
			<hr />
		</>
	);
}

function CalendarNewFields() {
	const data = useLoaderData<typeof loader>();
	const { values } = useFormFieldContext();
	const isAdmin = useHasRole("ADMIN");

	const isTournament = Boolean(values.toToolsEnabled);
	const isEditing = Boolean(data.eventToEdit);

	const organizationOptions = data.organizations
		.filter(
			(org): org is Exclude<(typeof data.organizations)[number], string> =>
				typeof org !== "string",
		)
		.map((org) => ({ value: String(org.id), label: org.name }));

	return (
		<div className="stack md">
			<FormField name="name" />
			<DescriptionField isTournament={isTournament} />
			{data.organizations.length > 0 ? (
				<FormField name="organizationId" options={organizationOptions} />
			) : null}
			{isTournament ? <FormField name="rules" /> : null}
			{isTournament ? (
				<FormField name="startTime" />
			) : (
				<FormField name="date" />
			)}
			{!isTournament ? <FormField name="bracketUrl" /> : null}
			<FormField name="discordInviteCode" />
			<FormField name="tags" />
			{data.badgeOptions.length > 0 ? (
				<FormField name="badges" options={data.badgeOptions} />
			) : null}
			{isTournament ? <TrophyField /> : null}
			{isTournament ? <FormField name="avatarImgId" /> : null}
			{isTournament ? (
				<>
					<Divider smallText className="mt-4">
						Tournament settings
					</Divider>
					<MemberCountFields />
					<FormField name="regClosesAt" />
					<FormField name="isRanked" />
					<FormField name="enableNoScreenToggle" />
					<FormField name="enableSubs" />
					<FormField name="autonomousSubs" />
					<FormField name="requireInGameNames" />
					<FormField name="isInvitational" />
					{!isEditing ? <FormField name="isTest" /> : null}
					<FormField name="isLeague" />
					<DraftField />
					{isAdmin ? <FormField name="requireSendouQParticipation" /> : null}
				</>
			) : null}
			<MapsSection isTournament={isTournament} />
			{isTournament ? <BracketProgressionField /> : null}
		</div>
	);
}

function DescriptionField({ isTournament }: { isTournament: boolean }) {
	const { t } = useTranslation(["forms"]);

	return (
		<div className="stack xs">
			<FormField name="description" />
			{isTournament ? (
				<FormMessage type="info">
					{t("forms:bottomTexts.bioMarkdown")}
				</FormMessage>
			) : null}
		</div>
	);
}

function TrophyField() {
	const { t } = useTranslation("calendar");
	const data = useLoaderData<typeof loader>();
	const { values, setValue } = useFormFieldContext();
	const id = React.useId();

	const organizationId = values.organizationId
		? Number(values.organizationId)
		: null;
	const trophyId = typeof values.trophyId === "number" ? values.trophyId : null;
	const badgeCount = (values.badges as number[]).length;

	// clear the trophy when the selected organization or badges make it invalid
	React.useEffect(() => {
		if (!trophyId) return;
		const trophyStillValid =
			badgeCount === 0 &&
			data.trophies.some(
				(trophy) =>
					trophy.id === trophyId && trophy.organizationId === organizationId,
			);
		if (!trophyStillValid) {
			setValue("trophyId", null);
		}
	}, [trophyId, badgeCount, organizationId, data.trophies, setValue]);

	const availableTrophies = organizationId
		? data.trophies.filter((trophy) => trophy.organizationId === organizationId)
		: [];

	if (availableTrophies.length === 0 && trophyId === null) return null;

	const selectedTrophy = trophyId
		? data.trophies.find((trophy) => trophy.id === trophyId)
		: null;

	return (
		<FormField name="trophyId">
			{({ onChange }: CustomFieldRenderProps) => {
				const handleChange = (newTrophyId: number | null) => {
					onChange(newTrophyId);
					if (newTrophyId) {
						setValue("badges", []);
					}
				};

				return (
					<div className="stack md">
						<div>
							<label htmlFor={id}>{t("forms.trophy")}</label>
							<select
								id={id}
								value={trophyId ?? ""}
								onChange={(e) => {
									const value = e.target.value;
									handleChange(value === "" ? null : Number(value));
								}}
							>
								<option value="">{t("forms.trophy.placeholder")}</option>
								{availableTrophies.map((trophy) => (
									<option key={trophy.id} value={trophy.id}>
										{trophy.name}
									</option>
								))}
							</select>
						</div>
						{selectedTrophy ? (
							<div className="stack md items-center">
								<Trophy model={selectedTrophy.model} />
								<div className="stack horizontal md items-center">
									<span>{selectedTrophy.name}</span>
									<SendouButton
										className="ml-auto"
										onClick={() => handleChange(null)}
										icon={<Trash />}
										variant="minimal-destructive"
										aria-label="Remove trophy"
									/>
								</div>
							</div>
						) : null}
					</div>
				);
			}}
		</FormField>
	);
}

function MemberCountFields() {
	const { values } = useFormFieldContext();

	return (
		<>
			<FormField name="minMembersPerTeam" />
			{values.minMembersPerTeam === "4" ? (
				<FormField name="maxMembersPerTeam" />
			) : null}
		</>
	);
}

/** The league tag is derived from the league setting, so the picker never holds it. */
function isPickableTag(
	tag: CalendarEventTag,
): tag is Exclude<CalendarEventTag, "LEAGUE"> {
	return tag !== "LEAGUE";
}

function DraftField() {
	const data = useLoaderData<typeof loader>();

	// once a tournament is published, it can't be flipped back to draft (users may have already saved it)
	if (data.eventToEdit && !data.eventToEdit.tournament?.ctx.settings.isDraft) {
		return null;
	}

	return <FormField name="isDraft" />;
}

function MapsSection({ isTournament }: { isTournament: boolean }) {
	const { t } = useTranslation(["forms"]);
	const { values, setValue } = useFormFieldContext();
	const data = useLoaderData<typeof loader>();

	if (!isTournament) {
		return <CalendarMapPoolField />;
	}

	const mapPickingStyle = values.mapPickingStyle as TournamentMapPickingStyle;

	return (
		<div className="stack md w-full">
			<Divider smallText className="mt-4">
				Tournament maps
			</Divider>
			{/* reset the (polymorphic) pool when switching map picking style so a
			previous style's maps don't leak into the new one */}
			<FormField
				name="mapPickingStyle"
				onValueChange={() => setValue("pool", "")}
			/>
			{mapPickingStyle === "AUTO" ? (
				<TeamPickFields />
			) : (
				<TournamentMapPoolField />
			)}
			{data.eventToEdit?.teamsHavePickedMaps ? (
				<div className="text-warning text-sm">
					{t("forms:bottomTexts.teamPickReset")}
				</div>
			) : null}
		</div>
	);
}

function TeamPickFields() {
	const { values, setValue } = useFormFieldContext();
	// counts the organizer set by hand keep their value when the mode set changes
	const [touchedModes, setTouchedModes] = React.useState<
		ReadonlySet<ModeShort>
	>(new Set());

	const teamPickPool = values.teamPickPool as TeamPickPool;
	const pickedModes = TeamPick.sortModes(values.teamPickModes as ModeShort[]);

	const handleModesChange = (newValue: unknown) => {
		const modes = TeamPick.sortModes(newValue as ModeShort[]);
		const counts = values.teamPickCounts as TeamPickCountsFormValue;
		const defaultCount = TeamPick.defaultCount(modes.length);

		setValue(
			"teamPickCounts",
			modes.map((mode) => ({
				mode,
				count: touchedModes.has(mode)
					? (counts.find((count) => count.mode === mode)?.count ?? defaultCount)
					: defaultCount,
			})),
		);

		if (typeof values.pool === "string" && values.pool) {
			setValue(
				"pool",
				new MapPool(
					customTeamPickPool({ teamPickModes: modes, pool: values.pool }),
				).serialized,
			);
		}
	};

	return (
		<>
			<FormField name="teamPickModes" onValueChange={handleModesChange} />
			<FormField name="teamPickCounts">
				{({ value, onChange, error }: CustomFieldRenderProps) => (
					<TeamPickCountInputs
						value={value as TeamPickCountsFormValue}
						onChange={(newValue, touchedMode) => {
							setTouchedModes(new Set([...touchedModes, touchedMode]));
							onChange(newValue);
						}}
						error={error}
					/>
				)}
			</FormField>
			<FormField
				name="teamPickPool"
				onValueChange={() => setValue("pool", "")}
			/>
			{teamPickPool === "CUSTOM" ? (
				<CustomTeamPickPoolField pickedModes={pickedModes} />
			) : null}
		</>
	);
}

function TeamPickCountInputs({
	value,
	onChange,
	error,
}: {
	value: TeamPickCountsFormValue;
	onChange: (value: TeamPickCountsFormValue, touchedMode: ModeShort) => void;
	error?: string;
}) {
	const { t } = useTranslation(["forms", "game-misc"]);
	const { values } = useFormFieldContext();
	const id = React.useId();

	const pickedModes = TeamPick.sortModes(values.teamPickModes as ModeShort[]);
	if (pickedModes.length === 0) return null;

	const pool = TeamPick.effectivePool(
		teamPickSettingsFromFormValues({
			teamPickModes: pickedModes,
			teamPickCounts: value,
			teamPickPool: values.teamPickPool as TeamPickPool,
		}),
		customTeamPickPool({
			teamPickModes: pickedModes,
			pool: values.pool as string | undefined,
		}),
	);

	return (
		<div className="stack xs">
			<Label>{t("forms:labels.teamPickCounts")}</Label>
			<div className="stack horizontal md flex-wrap">
				{pickedModes.map((mode) => {
					const count = value.find((c) => c.mode === mode)?.count ?? "";

					return (
						<div key={mode} className="stack horizontal xs items-center">
							<label htmlFor={`${id}-${mode}`}>
								<ModeImage
									mode={mode}
									size={24}
									title={t(`game-misc:MODE_LONG_${mode}`)}
								/>
							</label>
							<input
								id={`${id}-${mode}`}
								type="number"
								className={styles.countInput}
								min={1}
								max={TeamPick.maxCount(pool, mode)}
								value={count}
								onChange={(e) =>
									onChange(
										// an emptied input drops the entry so the mode falls back to the default count
										pickedModes.flatMap((m) => {
											const newCount =
												m === mode
													? Number.parseInt(e.target.value, 10)
													: value.find((c) => c.mode === m)?.count;

											return typeof newCount === "number" &&
												!Number.isNaN(newCount)
												? [{ mode: m, count: newCount }]
												: [];
										}),
										mode,
									)
								}
							/>
						</div>
					);
				})}
			</div>
			<FormMessage type="info">
				{t("forms:bottomTexts.teamPickCounts")}
			</FormMessage>
			{error ? (
				<FormMessage id={errorMessageId("teamPickCounts")} type="error">
					{t(error as never)}
				</FormMessage>
			) : null}
		</div>
	);
}

function CustomTeamPickPoolField({
	pickedModes,
}: {
	pickedModes: ModeShort[];
}) {
	const { t } = useTranslation(["common", "calendar", "game-misc"]);
	const { values } = useFormFieldContext();

	return (
		<FormField name="pool">
			{({ value, onChange, error }: CustomFieldRenderProps) => {
				const mapPool = new MapPool(
					customTeamPickPool({
						teamPickModes: pickedModes,
						pool: value as string | undefined,
					}),
				);
				const teamPick = teamPickSettingsFromFormValues({
					teamPickModes: pickedModes,
					teamPickCounts: values.teamPickCounts as TeamPickCountsFormValue,
					teamPickPool: "CUSTOM",
				});
				const shortfalls = TeamPick.poolShortfalls(teamPick, mapPool);

				return (
					<>
						<MapPoolSelector
							className="w-full"
							mapPool={mapPool}
							title={t("common:maps.mapPool")}
							modesToInclude={pickedModes}
							handleMapPoolChange={(newPool) =>
								onChange(
									new MapPool(
										customTeamPickPool({
											teamPickModes: pickedModes,
											pool: newPool.serialized,
										}),
									).serialized,
								)
							}
							allowBulkEdit
							info={
								<div>
									<Alert
										variation={shortfalls.length === 0 ? "SUCCESS" : "WARNING"}
										tiny
									>
										{shortfalls.length === 0
											? t("calendar:forms.teamPick.poolOk")
											: shortfalls
													.map(({ mode, required, has }) =>
														t("calendar:forms.teamPick.poolShortfall", {
															mode: t(`game-misc:MODE_SHORT_${mode}`),
															required,
															has,
														}),
													)
													.join(", ")}
									</Alert>
								</div>
							}
						/>
						{error ? (
							<FormMessage id={errorMessageId("pool")} type="error">
								{t(error as never)}
							</FormMessage>
						) : null}
					</>
				);
			}}
		</FormField>
	);
}

function CalendarMapPoolField() {
	const { t } = useTranslation(["common"]);
	const baseEvent = useBaseEvent();
	const [include, setInclude] = React.useState(Boolean(baseEvent?.mapPool));
	const id = React.useId();

	return (
		<FormField name="pool">
			{({ value, onChange }: CustomFieldRenderProps) => {
				if (!include) {
					return (
						<div>
							<label htmlFor={id}>{t("common:maps.mapPool")}</label>
							<SendouButton
								size="small"
								variant="outlined"
								id={id}
								onClick={() => setInclude(true)}
							>
								{t("common:actions.add")}
							</SendouButton>
						</div>
					);
				}

				const mapPool = value ? new MapPool(value as string) : MapPool.EMPTY;

				return (
					<MapPoolSelector
						className="w-full"
						mapPool={mapPool}
						title={t("common:maps.mapPool")}
						handleRemoval={() => {
							onChange("");
							setInclude(false);
						}}
						handleMapPoolChange={(newPool) => onChange(newPool.serialized)}
						allowBulkEdit
					/>
				);
			}}
		</FormField>
	);
}

function TournamentMapPoolField() {
	const { t } = useTranslation(["common"]);

	return (
		<FormField name="pool">
			{({ value, onChange }: CustomFieldRenderProps) => {
				const mapPool = value ? new MapPool(value as string) : MapPool.EMPTY;

				return (
					<MapPoolSelector
						className="w-full"
						mapPool={mapPool}
						title={t("common:maps.mapPool")}
						handleMapPoolChange={(newPool) => onChange(newPool.serialized)}
						allowBulkEdit
					/>
				);
			}}
		</FormField>
	);
}

function BracketProgressionField() {
	const { values } = useFormFieldContext();

	return (
		<div className="stack md w-full">
			<Divider smallText className="mt-4">
				Tournament format
			</Divider>
			<BracketProgressionFormFields
				isInvitational={Boolean(values.isInvitational)}
			/>
		</div>
	);
}
