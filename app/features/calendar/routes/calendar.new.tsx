import * as React from "react";
import { useTranslation } from "react-i18next";
import type { MetaFunction } from "react-router";
import { Form, Link, useLoaderData } from "react-router";
import type { AlertVariation } from "~/components/Alert";
import { Alert } from "~/components/Alert";
import { Divider } from "~/components/Divider";
import { SendouButton } from "~/components/elements/Button";
import { FormMessage } from "~/components/FormMessage";
import { Main } from "~/components/Main";
import { MapPoolSelector } from "~/components/MapPoolSelector";
import { SubmitButton } from "~/components/SubmitButton";
import type { Tables } from "~/db/tables";
import { MapPool } from "~/features/map-list-generator/core/map-pool";
import * as Progression from "~/features/tournament-bracket/core/Progression";
import { type CustomFieldRenderProps, FormField } from "~/form/FormField";
import { existingImage } from "~/form/image-field";
import { SendouForm, useFormFieldContext } from "~/form/SendouForm";
import { errorMessageId } from "~/form/utils";
import { useDateTimeFormat } from "~/hooks/intl/useDateTimeFormat";
import type { RankedModeShort } from "~/modules/in-game-lists/types";
import { useHasRole } from "~/modules/permissions/hooks";
import { databaseTimestampToDate, getDateAtNextFullHour } from "~/utils/dates";
import { metaTags } from "~/utils/remix";
import type { SendouRouteHandle } from "~/utils/remix.server";
import { CREATING_TOURNAMENT_DOC_LINK, FAQ_PAGE } from "~/utils/urls";
import { action } from "../actions/calendar.new.server";
import type { RegClosesAtOption } from "../calendar-constants";
import { calendarNewBaseSchema } from "../calendar-new-schemas";
import { datesToRegClosesAt } from "../calendar-utils";
import { BracketProgressionSelector } from "../components/BracketProgressionSelector";
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

const mapPickingStyleToShort: Record<
	Tables["Tournament"]["mapPickingStyle"],
	"ALL" | "TO" | RankedModeShort
> = {
	TO: "TO",
	AUTO_ALL: "ALL",
	AUTO_SZ: "SZ",
	AUTO_TC: "TC",
	AUTO_RM: "RM",
	AUTO_CB: "CB",
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
				startTime: databaseTimestampToDate(tournamentCtx.startTime),
				regClosesAt: databaseTimestampToDate(
					tournamentCtx.settings.regClosesAt,
				),
			})
		: "0";

	const toToolsMode = baseEvent?.mapPickingStyle
		? mapPickingStyleToShort[baseEvent.mapPickingStyle]
		: "ALL";

	const pool = (() => {
		if (!baseEvent) return "";
		if (!data.isAddingTournament || toToolsMode === "TO") {
			return baseEvent.mapPool ? new MapPool(baseEvent.mapPool).serialized : "";
		}
		if (toToolsMode === "ALL") {
			return baseEvent.tieBreakerMapPool
				? new MapPool(baseEvent.tieBreakerMapPool).serialized
				: "";
		}
		return "";
	})();

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
		// tournaments hide this field, so seed a valid URL to satisfy the url-format
		// validation (the action coalesces to the same default)
		bracketUrl: data.isAddingTournament
			? "https://sendou.ink"
			: (data.eventToEdit?.bracketUrl ?? ""),
		discordInviteCode: baseEvent?.discordInviteCode ?? "",
		tags: baseEvent?.tags ?? [],
		badges: baseEvent?.badgePrizes?.map((b) => b.id) ?? [],
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
		toToolsMode,
		pool,
		bracketProgression: settings?.bracketProgression ?? null,
		isRanked: settings?.isRanked ?? true,
		enableNoScreenToggle: settings?.enableNoScreenToggle ?? true,
		enableSubs: settings?.enableSubs ?? true,
		autonomousSubs: settings?.autonomousSubs ?? true,
		requireInGameNames: settings?.requireInGameNames ?? false,
		isInvitational: settings?.isInvitational ?? false,
		isTest: settings?.isTest ?? false,
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
								{event.name} ({formatter.format(event.startTime) ?? ""})
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

function DraftField() {
	const data = useLoaderData<typeof loader>();

	// once a tournament is published, it can't be flipped back to draft (users may have already saved it)
	if (data.eventToEdit && !data.eventToEdit.tournament?.ctx.settings.isDraft) {
		return null;
	}

	return <FormField name="isDraft" />;
}

function MapsSection({ isTournament }: { isTournament: boolean }) {
	const { values, setValue } = useFormFieldContext();
	const data = useLoaderData<typeof loader>();
	const mode = values.toToolsMode as "ALL" | "TO" | RankedModeShort;

	// reset the (polymorphic) pool when switching map picking style so a previous
	// mode's maps don't leak into the new one
	const previousMode = React.useRef(mode);
	React.useEffect(() => {
		if (previousMode.current === mode) return;
		previousMode.current = mode;
		setValue("pool", "");
	}, [mode, setValue]);

	if (!isTournament) {
		return <CalendarMapPoolField />;
	}

	const isEditing = Boolean(data.eventToEdit);

	// can't change map picking style after creation
	if (isEditing) {
		if (mode !== "TO") return null;

		return (
			<div className="stack md w-full">
				<Divider smallText className="mt-4">
					Tournament maps
				</Divider>
				<TournamentMapPoolField />
			</div>
		);
	}

	return (
		<div className="stack md w-full">
			<Divider smallText className="mt-4">
				Tournament maps
			</Divider>
			<FormField name="toToolsMode" />
			{mode === "ALL" ? <TiebreakerMapPoolField /> : null}
			{mode === "TO" ? <TournamentMapPoolField /> : null}
		</div>
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
								onPress={() => setInclude(true)}
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

function TiebreakerMapPoolField() {
	const { t } = useTranslation(["common"]);

	return (
		<FormField name="pool">
			{({ value, onChange, error }: CustomFieldRenderProps) => {
				const mapPool = value ? new MapPool(value as string) : MapPool.EMPTY;
				const status = validateTiebreakerMapPool(mapPool);

				return (
					<>
						<MapPoolSelector
							className="w-full"
							mapPool={mapPool}
							title={t("common:maps.tieBreakerMapPool")}
							modesToInclude={["SZ", "TC", "RM", "CB"]}
							hideBanned
							handleMapPoolChange={(newPool) => onChange(newPool.serialized)}
							info={<MapPoolValidationStatusMessage status={status} />}
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

function BracketProgressionField() {
	const { t } = useTranslation();
	const { values } = useFormFieldContext();
	const baseEvent = useBaseEvent();

	const initialBrackets = baseEvent?.tournament?.ctx.settings.bracketProgression
		? Progression.validatedBracketsToInputFormat(
				baseEvent.tournament.ctx.settings.bracketProgression,
			)
		: undefined;

	return (
		<div className="stack md w-full">
			<Divider smallText className="mt-4">
				Tournament format
			</Divider>
			<FormField name="bracketProgression">
				{({ onChange, error }: CustomFieldRenderProps) => (
					<>
						<BracketProgressionSelector
							initialBrackets={initialBrackets}
							isInvitationalTournament={Boolean(values.isInvitational)}
							onChange={onChange}
							isTournamentInProgress={false}
						/>
						{error ? (
							<FormMessage
								id={errorMessageId("bracketProgression")}
								type="error"
							>
								{t(error as never)}
							</FormMessage>
						) : null}
					</>
				)}
			</FormField>
		</div>
	);
}

type CounterPickValidationStatus =
	| "PICKING"
	| "VALID"
	| "NOT_ONE_MAP_PER_MODE"
	| "MAP_REPEATED"
	| "MODE_REPEATED";

function validateTiebreakerMapPool(
	mapPool: MapPool,
): CounterPickValidationStatus {
	if (mapPool.stages.length !== new Set(mapPool.stages).size) {
		return "MAP_REPEATED";
	}
	if (
		mapPool.parsed.SZ.length > 1 ||
		mapPool.parsed.TC.length > 1 ||
		mapPool.parsed.RM.length > 1 ||
		mapPool.parsed.CB.length > 1
	) {
		return "MODE_REPEATED";
	}
	if (
		mapPool.parsed.SZ.length < 1 ||
		mapPool.parsed.TC.length < 1 ||
		mapPool.parsed.RM.length < 1 ||
		mapPool.parsed.CB.length < 1
	) {
		return "PICKING";
	}

	return "VALID";
}

function MapPoolValidationStatusMessage({
	status,
}: {
	status: CounterPickValidationStatus;
}) {
	const { t } = useTranslation(["common"]);

	const alertVariation: AlertVariation =
		status === "VALID" ? "SUCCESS" : status === "PICKING" ? "INFO" : "WARNING";

	return (
		<div>
			<Alert variation={alertVariation} tiny>
				{t(`common:maps.validation.${status}`)}
			</Alert>
		</div>
	);
}
