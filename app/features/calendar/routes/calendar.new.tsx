import clsx from "clsx";
import { SquareArrowOutUpRight, Trash } from "lucide-react";
import * as React from "react";
import { useTranslation } from "react-i18next";
import type { MetaFunction } from "react-router";
import { Link, useLoaderData, useNavigate } from "react-router";
import { Alert } from "~/components/Alert";
import { SendouButton } from "~/components/elements/Button";
import { SendouSection } from "~/components/elements/Section";
import { FormMessage } from "~/components/FormMessage";
import { ModeImage } from "~/components/Image";
import { Label } from "~/components/Label";
import { LocaleTime } from "~/components/LocaleTime";
import { Main } from "~/components/Main";
import { useMapPoolQuickFill } from "~/components/MapPoolPicker";
import { MapPool } from "~/features/map-list-generator/core/map-pool";
import * as TeamPick from "~/features/tournament/core/TeamPick";
import type {
	TeamPickPool,
	TournamentMapPickingStyle,
} from "~/features/tournament/tournament-constants";
import { Trophy } from "~/features/trophies/components/Trophy";
import { type CustomFieldRenderProps, FormField } from "~/form/FormField";
import { getFormFieldMetadata } from "~/form/fields";
import { existingImage } from "~/form/image-field";
import {
	FormStep,
	SendouForm,
	useFormFieldContext,
	useFormSteps,
} from "~/form/SendouForm";
import { errorMessageId } from "~/form/utils";
import { useDateTimeFormat } from "~/hooks/intl/useDateTimeFormat";
import { rankedModesShort } from "~/modules/in-game-lists/modes";
import type { ModeShort } from "~/modules/in-game-lists/types";
import { useHasRole } from "~/modules/permissions/hooks";
import { databaseTimestampToDate, getDateAtNextFullHour } from "~/utils/dates";
import { metaTags } from "~/utils/remix";
import type { SendouRouteHandle } from "~/utils/remix.server";
import {
	CALENDAR_NEW_PAGE,
	CREATING_TOURNAMENT_DOC_LINK,
	FAQ_PAGE,
} from "~/utils/urls";
import { action } from "../actions/calendar.new.server";
import type { RegClosesAtOption } from "../calendar-constants";
import styles from "../calendar-new.module.css";
import {
	calendarNewBaseSchema,
	calendarNewSchema,
	customTeamPickPool,
	type TeamPickCountsFormValue,
	TOURNAMENT_FORM_STEPS,
	teamPickSettingsFromFormValues,
} from "../calendar-new-schemas";
import {
	type BracketFormValue,
	defaultBracketsFormValues,
	progressionToFormValues,
	shiftBracketStartTimes,
} from "../calendar-progression-form";
import { calendarNewSearchParams } from "../calendar-search-params";
import type { CalendarEventTag } from "../calendar-types";
import { datesToRegClosesAt } from "../calendar-utils";
import { BracketProgressionBuilder } from "../components/BracketProgressionBuilder";
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

// xxx: polish styles and overall flow
export default function CalendarNewEventPage() {
	const { t } = useTranslation(["calendar"]);
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
		<Main halfWidth={!data.isAddingTournament} bigger={data.isAddingTournament}>
			<div className="stack md">
				<div className="stack horizontal md items-center">
					<h1 className="text-lg">
						{data.isAddingTournament ? "New tournament" : "New calendar event"}
					</h1>
					{data.isAddingTournament ? (
						<a
							href={CREATING_TOURNAMENT_DOC_LINK}
							className={styles.helpLink}
							target="_blank"
							rel="noopener noreferrer"
						>
							{t("calendar:newTournament.help")}
							<SquareArrowOutUpRight className={styles.helpLinkIcon} />
						</a>
					) : null}
				</div>
				<SendouForm
					key={baseEvent?.eventId}
					schema={calendarNewSchema}
					defaultValues={defaultValues}
					submitButtonTestId="submit-button"
					fullWidth
					steps={data.isAddingTournament ? TOURNAMENT_FORM_STEPS : undefined}
				>
					{data.isAddingTournament ? (
						<TournamentSteps />
					) : (
						<CalendarEventFields />
					)}
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

	const startTime = data.isAddingTournament
		? data.eventToEdit?.startTimes?.[0]
			? databaseTimestampToDate(data.eventToEdit.startTimes[0])
			: getDateAtNextFullHour(new Date())
		: null;

	const bracketProgressionValues = settings?.bracketProgression
		? progressionToFormValues(settings.bracketProgression)
		: data.isAddingTournament
			? defaultBracketsFormValues()
			: { brackets: [], progression: [] };
	// a copy starts at a new time, follow-up brackets keep their distance to it
	const brackets =
		data.eventToCopy && tournamentCtx && startTime
			? shiftBracketStartTimes(
					bracketProgressionValues.brackets,
					startTime.getTime() -
						databaseTimestampToDate(tournamentCtx.startsAt).getTime(),
				)
			: bracketProgressionValues.brackets;

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
		startTime,
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
		brackets,
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

function CopyTournamentPicker() {
	const { t } = useTranslation(["calendar"]);
	const { recentTournaments, eventToCopy } = useLoaderData<typeof loader>();
	const navigate = useNavigate();
	const [eventId, setEventId] = React.useState(() =>
		eventToCopy &&
		recentTournaments?.some((event) => event.id === eventToCopy.eventId)
			? String(eventToCopy.eventId)
			: "",
	);
	const id = React.useId();
	const { formatter } = useDateTimeFormat({
		month: "numeric",
		day: "numeric",
	});

	if (!recentTournaments || recentTournaments.length === 0) return null;

	return (
		<SendouSection gap="lg" title={t("calendar:newTournament.copy")}>
			<div className="stack sm">
				<label htmlFor={id}>{t("calendar:newTournament.copyLabel")}</label>
				<div className="stack horizontal sm flex-wrap">
					<select
						id={id}
						value={eventId}
						onChange={(event) => setEventId(event.target.value)}
					>
						<option value="">
							{t("calendar:newTournament.copyPlaceholder")}
						</option>
						{recentTournaments.map((event) => (
							<option key={event.id} value={event.id}>
								{event.name} ({formatter.format(event.startsAt) ?? ""})
							</option>
						))}
					</select>
					<SendouButton
						variant="outlined"
						isDisabled={!eventId}
						testId="use-template-button"
						onClick={() =>
							navigate(
								calendarNewSearchParams.href(CALENDAR_NEW_PAGE, {
									copyEventId: Number(eventId),
								}),
							)
						}
					>
						{t("calendar:newTournament.copyButton")}
					</SendouButton>
				</div>
				<FormMessage type="info">
					{t("calendar:newTournament.copyInfo")}
				</FormMessage>
			</div>
		</SendouSection>
	);
}

function CalendarEventFields() {
	const data = useLoaderData<typeof loader>();
	const organizationOptions = useOrganizationOptions();
	const mapPoolQuickFill = useMapPoolQuickFill();

	return (
		<div className="stack md">
			<FormField name="name" />
			<DescriptionField isTournament={false} />
			{data.organizations.length > 0 ? (
				<FormField name="organizationId" options={organizationOptions} />
			) : null}
			<FormField name="date" />
			<FormField name="bracketUrl" />
			<FormField name="discordInviteCode" />
			<FormField name="tags" />
			{data.badgeOptions.length > 0 ? (
				<FormField name="badges" options={data.badgeOptions} />
			) : null}
			<FormField name="pool" options={{ quickFill: mapPoolQuickFill }} />
		</div>
	);
}

function TournamentSteps() {
	const { t } = useTranslation(["calendar"]);
	const data = useLoaderData<typeof loader>();
	const { values } = useFormFieldContext();
	const isAdmin = useHasRole("ADMIN");
	const organizationOptions = useOrganizationOptions();

	const isEditing = Boolean(data.eventToEdit);
	const isInvitational = Boolean(values.isInvitational);

	return (
		<>
			<FormStep name="basics">
				<div className={styles.stepColumn}>
					{isEditing ? null : <CopyTournamentPicker />}
					<FormField name="name" />
					<FormField name="startTime" />
					{data.organizations.length > 0 ? (
						<FormField name="organizationId" options={organizationOptions} />
					) : null}
					<DescriptionField isTournament />
					<FormField name="rules" />
					<FormField name="avatarImgId" />
					<FormField name="discordInviteCode" />
					<FormField name="tags" />
				</div>
			</FormStep>

			<FormStep name="teams">
				<div className={styles.stepColumn}>
					<SendouSection
						gap="lg"
						title={t("calendar:newTournament.section.teamSize")}
					>
						<div className="stack md">
							<MemberCountFields />
						</div>
					</SendouSection>
					<SendouSection
						gap="lg"
						title={t("calendar:newTournament.section.registration")}
					>
						<div className="stack md">
							<FormField name="isInvitational" />
							{isInvitational ? null : (
								<>
									<FormField name="regClosesAt" />
									<FormField name="requireInGameNames" />
									<FormField name="enableSubs" />
								</>
							)}
						</div>
					</SendouSection>
					<SendouSection
						gap="lg"
						title={t("calendar:newTournament.section.duringTournament")}
					>
						<div className="stack md">
							<FormField name="autonomousSubs" />
							<FormField name="enableNoScreenToggle" />
						</div>
					</SendouSection>
					<SendouSection
						gap="lg"
						title={t("calendar:newTournament.section.typeAndVisibility")}
					>
						<div className="stack md">
							<FormField name="isRanked" />
							<FormField name="isLeague" />
							{isEditing ? null : <FormField name="isTest" />}
							<DraftField />
							{isAdmin ? (
								<FormField name="requireSendouQParticipation" />
							) : null}
						</div>
					</SendouSection>
				</div>
			</FormStep>

			<FormStep name="maps">
				<div className={clsx(styles.stepColumn, styles.stepColumnWide)}>
					<TournamentMapsFields />
				</div>
			</FormStep>

			<FormStep name="format">
				<BracketProgressionBuilder isInvitational={isInvitational} />
			</FormStep>

			<FormStep name="prizes">
				<div className={styles.stepColumn}>
					<SendouSection
						gap="lg"
						title={t("calendar:newTournament.section.prizes")}
					>
						<div className="stack md">
							{data.badgeOptions.length > 0 ? (
								<FormField name="badges" options={data.badgeOptions} />
							) : null}
							<TrophyField />
							{data.badgeOptions.length === 0 && data.trophies.length === 0 ? (
								<FormMessage type="info">
									{t("calendar:newTournament.noPrizes")}
								</FormMessage>
							) : null}
						</div>
					</SendouSection>
					<TournamentReview />
				</div>
			</FormStep>
		</>
	);
}

function useOrganizationOptions() {
	const data = useLoaderData<typeof loader>();

	return data.organizations
		.filter(
			(org): org is Exclude<(typeof data.organizations)[number], string> =>
				typeof org !== "string",
		)
		.map((org) => ({ value: String(org.id), label: org.name }));
}

/** What the earlier steps were filled with, each with a way back to its step. */
function TournamentReview() {
	const { t } = useTranslation(["calendar", "forms", "common"]);
	const { values } = useFormFieldContext();
	const { steps, goToStep } = useFormSteps();
	const organizationOptions = useOrganizationOptions();

	const fieldLabel = (
		fieldName: keyof typeof calendarNewBaseSchema.entries,
	) => {
		const metadata = getFormFieldMetadata(
			calendarNewBaseSchema.entries[fieldName],
		);
		const label = metadata && "label" in metadata ? metadata.label : undefined;
		return label ? t(label as never) : fieldName;
	};
	const enabledToggleLabels = (
		fieldNames: Array<keyof typeof calendarNewBaseSchema.entries>,
	) => fieldNames.filter((fieldName) => values[fieldName]).map(fieldLabel);

	const brackets = values.brackets as BracketFormValue[];
	const startTime = values.startTime instanceof Date ? values.startTime : null;
	const organizationName = organizationOptions.find(
		(option) => option.value === values.organizationId,
	)?.label;
	const playersCount = String(values.minMembersPerTeam);

	const summaries: Record<string, React.ReactNode[]> = {
		basics: [
			(values.name as string) || t("calendar:newTournament.review.noName"),
			startTime ? (
				<LocaleTime
					key="startTime"
					date={startTime}
					options={{
						day: "numeric",
						month: "short",
						hour: "numeric",
						minute: "numeric",
					}}
				/>
			) : null,
			organizationName ?? null,
		],
		teams: [
			`${playersCount}v${playersCount}`,
			...enabledToggleLabels([
				"isInvitational",
				"requireInGameNames",
				"enableSubs",
				"autonomousSubs",
				"isRanked",
				"isLeague",
				"isTest",
				"isDraft",
			]),
		],
		maps: [
			t(
				`forms:options.mapPickingStyle.${values.mapPickingStyle as "TO" | "AUTO"}`,
			),
			values.mapPickingStyle === "TO"
				? t("calendar:newTournament.review.mapCount", {
						count: values.pool
							? MapPool.toDbList(values.pool as string).length
							: 0,
					})
				: null,
		],
		format: brackets.map(
			(bracket) => bracket.name || t("calendar:builder.unnamed"),
		),
	};

	return (
		<SendouSection gap="lg" title={t("calendar:newTournament.review")}>
			<dl className={styles.review}>
				{steps.flatMap((step) => {
					const summary = summaries[step.name]?.filter(Boolean);
					if (!summary) return [];

					return (
						<div key={step.name} className={styles.reviewRow}>
							<dt className={styles.reviewStep}>{t(`forms:${step.label}`)}</dt>
							<dd className={styles.reviewValues}>
								{summary.map((item, idx) => (
									<span key={idx} className={styles.reviewValue}>
										{item}
									</span>
								))}
							</dd>
							<SendouButton
								size="small"
								variant="minimal"
								onClick={() => goToStep(step.name)}
							>
								{t("common:actions.edit")}
							</SendouButton>
						</div>
					);
				})}
			</dl>
		</SendouSection>
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

function TournamentMapsFields() {
	const { t } = useTranslation(["forms"]);
	const { values, setValue } = useFormFieldContext();
	const data = useLoaderData<typeof loader>();
	const mapPoolQuickFill = useMapPoolQuickFill();

	const mapPickingStyle = values.mapPickingStyle as TournamentMapPickingStyle;

	return (
		<>
			{/* reset the (polymorphic) pool when switching map picking style so a
			previous style's maps don't leak into the new one */}
			<FormField
				name="mapPickingStyle"
				onValueChange={() => setValue("pool", "")}
			/>
			{mapPickingStyle === "AUTO" ? (
				<TeamPickFields />
			) : (
				<FormField name="pool" options={{ quickFill: mapPoolQuickFill }} />
			)}
			{data.eventToEdit?.teamsHavePickedMaps ? (
				<div className="text-warning text-sm">
					{t("forms:bottomTexts.teamPickReset")}
				</div>
			) : null}
		</>
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
	const { t } = useTranslation(["calendar", "game-misc"]);
	const { values } = useFormFieldContext();
	const quickFill = useMapPoolQuickFill();

	if (pickedModes.length === 0) return null;

	const teamPick = teamPickSettingsFromFormValues({
		teamPickModes: pickedModes,
		teamPickCounts: values.teamPickCounts as TeamPickCountsFormValue,
		teamPickPool: "CUSTOM",
	});
	const shortfalls = TeamPick.poolShortfalls(
		teamPick,
		new MapPool(
			customTeamPickPool({
				teamPickModes: pickedModes,
				pool: values.pool as string | undefined,
			}),
		),
	);

	return (
		<div className="stack lg">
			<FormField name="pool" options={{ modes: pickedModes, quickFill }} />
			<Alert variation={shortfalls.length === 0 ? "SUCCESS" : "WARNING"} tiny>
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
	);
}
