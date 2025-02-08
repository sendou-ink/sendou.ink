import type { MetaFunction } from "@remix-run/node";
import { Form, useFetcher, useLoaderData } from "@remix-run/react";
import clsx from "clsx";
import Compressor from "compressorjs";
import * as React from "react";
import { useTranslation } from "react-i18next";
import type { AlertVariation } from "~/components/Alert";
import { Alert } from "~/components/Alert";
import { Badge } from "~/components/Badge";
import { Button } from "~/components/Button";
import { DateInput } from "~/components/DateInput";
import { Divider } from "~/components/Divider";
import { FormMessage } from "~/components/FormMessage";
import { Input } from "~/components/Input";
import { Label } from "~/components/Label";
import { Main } from "~/components/Main";
import { MapPoolSelector } from "~/components/MapPoolSelector";
import { RequiredHiddenInput } from "~/components/RequiredHiddenInput";
import { SubmitButton } from "~/components/SubmitButton";
import { CrossIcon } from "~/components/icons/Cross";
import { TrashIcon } from "~/components/icons/Trash";
import type { Tables } from "~/db/tables";
import type { Badge as BadgeType, CalendarEventTag } from "~/db/types";
import { useUser } from "~/features/auth/core/user";
import { MapPool } from "~/features/map-list-generator/core/map-pool";
import * as Progression from "~/features/tournament-bracket/core/Progression";
import { useIsMounted } from "~/hooks/useIsMounted";
import type { RankedModeShort } from "~/modules/in-game-lists";
import { isDefined } from "~/utils/arrays";
import {
	databaseTimestampToDate,
	getDateAtNextFullHour,
	getDateWithHoursOffset,
} from "~/utils/dates";
import invariant from "~/utils/invariant";
import type { SendouRouteHandle } from "~/utils/remix.server";
import { pathnameFromPotentialURL } from "~/utils/strings";
import { CREATING_TOURNAMENT_DOC_LINK, userSubmittedImage } from "~/utils/urls";
import {
	CALENDAR_EVENT,
	REG_CLOSES_AT_OPTIONS,
	type RegClosesAtOption,
} from "../calendar-constants";
import {
	calendarEventMaxDate,
	calendarEventMinDate,
	datesToRegClosesAt,
	regClosesAtToDisplayName,
} from "../calendar-utils";
import { canAddNewEvent } from "../calendar-utils";
import { BracketProgressionSelector } from "../components/BracketProgressionSelector";
import { Tags } from "../components/Tags";
import "~/styles/calendar-new.css";
import "~/styles/maps.css";
import { SendouSwitch } from "~/components/elements/Switch";
import { metaTags } from "~/utils/remix";
import { action } from "../actions/calendar.new.server";
import { loader } from "../loaders/calendar.new.server";
export { loader, action };

export const meta: MetaFunction<typeof loader> = (args) => {
	if (!args.data) return [];

	const what = args.data.isAddingTournament ? "tournament" : "calendar event";

	return metaTags({
		title: args.data.eventToEdit ? `Editing ${what}` : `New ${what}`,
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
	const user = useUser();
	const data = useLoaderData<typeof loader>();

	if (!user || !canAddNewEvent(user)) {
		return (
			<Main className="stack items-center">
				<Alert variation="WARNING">
					You can't add a new event at this time (Discord account too young)
				</Alert>
			</Main>
		);
	}

	if (data.isAddingTournament && !user.isTournamentOrganizer) {
		return (
			<Main className="stack items-center">
				<Alert variation="WARNING">
					No permissions to add tournaments. Tournaments are in beta, accessible
					by Patreon supporters and established TO&apos;s.
				</Alert>
			</Main>
		);
	}

	return (
		<Main className="calendar-new__container">
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
				<EventForm key={baseEvent?.eventId} />
			</div>
		</Main>
	);
}

function TemplateTournamentForm() {
	const { recentTournaments } = useLoaderData<typeof loader>();
	const [eventId, setEventId] = React.useState("");

	if (!recentTournaments) return null;

	return (
		<>
			<div>
				<Form className="stack horizontal sm flex-wrap">
					<select
						className="w-max"
						name="copyEventId"
						onChange={(event) => {
							setEventId(event.target.value);
						}}
					>
						<option value="">Select a template</option>
						{recentTournaments.map((event) => (
							<option key={event.id} value={event.id} suppressHydrationWarning>
								{event.name} (
								{databaseTimestampToDate(event.startTime).toLocaleDateString(
									"en-US",
									{ month: "numeric", day: "numeric" },
								)}
								)
							</option>
						))}
					</select>
					<SubmitButton disabled={!eventId}>Use template</SubmitButton>
				</Form>
			</div>
			<hr />
		</>
	);
}

function EventForm() {
	const fetcher = useFetcher();
	const { t } = useTranslation();
	const { eventToEdit, eventToCopy } = useLoaderData<typeof loader>();
	const ref = React.useRef<HTMLFormElement>(null);
	const [avatarImg, setAvatarImg] = React.useState<File | null>(null);
	const baseEvent = useBaseEvent();
	const [isInvitational, setIsInvitational] = React.useState(
		baseEvent?.tournament?.ctx.settings.isInvitational ?? false,
	);
	const data = useLoaderData<typeof loader>();
	const [bracketProgressionErrored, setBracketProgressionErrored] =
		React.useState(false);

	const handleSubmit = () => {
		const isValid = ref.current?.checkValidity();
		if (!isValid) {
			ref.current?.reportValidity();
			return;
		}

		const formData = new FormData(ref.current!);

		// if "avatarImgId" it means they want to reuse an existing avatar
		const includeImage = avatarImg && !formData.has("avatarImgId");

		if (includeImage) {
			// replace with the compressed version
			formData.delete("img");
			formData.append("img", avatarImg, avatarImg.name);
		}

		fetcher.submit(formData, {
			encType: includeImage ? "multipart/form-data" : undefined,
			method: "post",
		});
	};

	const submitButtonDisabled = () => {
		if (fetcher.state !== "idle") return true;
		if (bracketProgressionErrored) return true;

		return false;
	};

	return (
		<Form className="stack md items-start" ref={ref}>
			{eventToEdit && (
				<input type="hidden" name="eventToEditId" value={eventToEdit.eventId} />
			)}
			{eventToCopy?.tournamentId ? (
				<input
					type="hidden"
					name="tournamentToCopyId"
					value={eventToCopy.tournamentId}
				/>
			) : null}
			{data.isAddingTournament ? (
				<input type="hidden" name="toToolsEnabled" value="on" />
			) : null}
			<NameInput />
			<DescriptionTextarea supportsMarkdown={data.isAddingTournament} />
			<OrganizationSelect />
			{data.isAddingTournament ? <RulesTextarea supportsMarkdown /> : null}
			<DatesInput allowMultiDate={!data.isAddingTournament} />
			{!data.isAddingTournament ? <BracketUrlInput /> : null}
			<DiscordLinkInput />
			<TagsAdder />
			<BadgesAdder />
			{data.isAddingTournament ? (
				<AvatarImageInput avatarImg={avatarImg} setAvatarImg={setAvatarImg} />
			) : null}
			{data.isAddingTournament ? (
				<>
					<Divider>Tournament settings</Divider>
					<MemberCountSelect />
					<RegClosesAtSelect />
					<RankedToggle />
					<EnableNoScreenToggle />
					<EnableSubsToggle />
					<AutonomousSubsToggle />
					<RequireIGNToggle />
					<InvitationalToggle
						isInvitational={isInvitational}
						setIsInvitational={setIsInvitational}
					/>
					<StrictDeadlinesToggle />
				</>
			) : null}
			{data.isAddingTournament ? (
				<TournamentMapPickingStyleSelect />
			) : (
				<MapPoolSection />
			)}
			{data.isAddingTournament ? (
				<div className="stack md w-full">
					<Divider>Tournament format</Divider>
					<BracketProgressionSelector
						initialBrackets={
							baseEvent?.tournament?.ctx.settings.bracketProgression
								? Progression.validatedBracketsToInputFormat(
										baseEvent.tournament?.ctx.settings.bracketProgression,
									)
								: undefined
						}
						isInvitationalTournament={isInvitational}
						setErrored={setBracketProgressionErrored}
						isTournamentInProgress={false}
					/>
				</div>
			) : null}
			<Button
				className="mt-4"
				onClick={handleSubmit}
				disabled={submitButtonDisabled()}
				testId="submit-button"
			>
				{t("actions.submit")}
			</Button>
		</Form>
	);
}

function NameInput() {
	const { t } = useTranslation();
	const { eventToEdit } = useLoaderData<typeof loader>();

	return (
		<div>
			<Label htmlFor="name" required>
				{t("forms.name")}
			</Label>
			<input
				name="name"
				required
				minLength={CALENDAR_EVENT.NAME_MIN_LENGTH}
				maxLength={CALENDAR_EVENT.NAME_MAX_LENGTH}
				defaultValue={eventToEdit?.name}
			/>
		</div>
	);
}

function DescriptionTextarea({
	supportsMarkdown,
}: {
	supportsMarkdown?: boolean;
}) {
	const { t } = useTranslation();
	const baseEvent = useBaseEvent();
	const [value, setValue] = React.useState(baseEvent?.description ?? "");

	return (
		<div>
			<Label
				htmlFor="description"
				valueLimits={{
					current: value.length,
					max: CALENDAR_EVENT.DESCRIPTION_MAX_LENGTH,
				}}
			>
				{t("forms.description")}
			</Label>
			<textarea
				id="description"
				name="description"
				value={value}
				onChange={(e) => setValue(e.target.value)}
				maxLength={CALENDAR_EVENT.DESCRIPTION_MAX_LENGTH}
			/>
			{supportsMarkdown ? (
				<FormMessage type="info">Supports Markdown</FormMessage>
			) : null}
		</div>
	);
}

function OrganizationSelect() {
	const id = React.useId();
	const data = useLoaderData<typeof loader>();
	const baseEvent = useBaseEvent();

	if (data.organizations.length === 0) return null;

	return (
		<div>
			<Label htmlFor={id}>Organization</Label>
			<select
				id={id}
				name="organizationId"
				defaultValue={baseEvent?.organization?.id}
			>
				<option>Select an organization</option>
				{data.organizations.map((org) => (
					<option key={org.id} value={org.id}>
						{org.name}
					</option>
				))}
			</select>
		</div>
	);
}

function RulesTextarea({ supportsMarkdown }: { supportsMarkdown?: boolean }) {
	const baseEvent = useBaseEvent();
	const [value, setValue] = React.useState(
		baseEvent?.tournament?.ctx.rules ?? "",
	);

	return (
		<div>
			<Label
				htmlFor="rules"
				valueLimits={{
					current: value.length,
					max: CALENDAR_EVENT.RULES_MAX_LENGTH,
				}}
			>
				Rules
			</Label>
			<textarea
				id="rules"
				name="rules"
				value={value}
				onChange={(e) => setValue(e.target.value)}
				maxLength={CALENDAR_EVENT.RULES_MAX_LENGTH}
			/>
			{supportsMarkdown ? (
				<FormMessage type="info">Supports Markdown</FormMessage>
			) : null}
		</div>
	);
}

function AddButton({ onAdd, id }: { onAdd: () => void; id?: string }) {
	const { t } = useTranslation();

	return (
		<Button size="tiny" variant="outlined" onClick={onAdd} id={id}>
			{t("actions.add")}
		</Button>
	);
}

function DatesInput({ allowMultiDate }: { allowMultiDate?: boolean }) {
	const { t } = useTranslation(["common", "calendar"]);
	const { eventToEdit } = useLoaderData<typeof loader>();

	// Using array index as a key can mess up internal state, especially when
	// removing elements from the middle. So we just count up for every date we
	// create.
	const keyCounter = React.useRef(0);
	const getKey = () => ++keyCounter.current;

	// React hook that keeps track of child DateInput's dates
	// (necessary for determining additional Date's defaultValues)
	const [_datesInputState, setDatesInputState] = React.useState<
		Array<{
			key: number;
			date: Date | null;
		}>
	>(() => {
		// Initialize datesInputState by retrieving pre-existing events if they exist
		if (eventToEdit?.startTimes) {
			return eventToEdit.startTimes.map((t) => ({
				key: getKey(),
				date: databaseTimestampToDate(t),
			}));
		}

		// Initial date rounded to next full hour from now
		return [{ key: getKey(), date: getDateAtNextFullHour(new Date()) }];
	});

	const datesInputState = allowMultiDate
		? _datesInputState
		: _datesInputState.filter((_, i) => i === 0);

	const datesCount = datesInputState.length;

	const isMounted = useIsMounted();
	const usersTimeZone = isMounted
		? Intl.DateTimeFormat().resolvedOptions().timeZone
		: "";
	const NEW_CALENDAR_EVENT_HOURS_OFFSET = 24;

	const addDate = () =>
		setDatesInputState((current) => {
			// .reverse() is mutating, but map/filter returns a new array anyway.
			const lastValidDate = current
				.map((e) => e.date)
				.filter(isDefined)
				.reverse()[0];

			const addedDate = lastValidDate
				? getDateWithHoursOffset(lastValidDate, NEW_CALENDAR_EVENT_HOURS_OFFSET)
				: getDateAtNextFullHour(new Date());

			return [...current, { key: getKey(), date: addedDate }];
		});

	return (
		<div className="stack md items-start">
			<fieldset>
				<legend>
					{t("calendar:forms.dates")} <span className="text-error">*</span>
				</legend>
				<div className="stack sm items-start">
					<div className="stack sm">
						{datesInputState.map(({ date, key }, i) => {
							return (
								<div key={key} className="stack horizontal sm items-center">
									<label
										id={`date-input-${key}-label`}
										className="calendar-new__day-label"
										htmlFor={`date-input-${key}`}
									>
										{t("calendar:day", {
											number: i + 1,
										})}
									</label>
									<DateInput
										id={`date-input-${key}`}
										name="date"
										suppressHydrationWarning
										defaultValue={eventToEdit && date ? date : undefined}
										min={calendarEventMinDate()}
										max={calendarEventMaxDate()}
										required
										onChange={(newDate: Date | null) => {
											setDatesInputState((current) =>
												current.map((entry) =>
													entry.key === key
														? { ...entry, date: newDate }
														: entry,
												),
											);
										}}
									/>
									{/* "Remove" button */}
									{datesCount > 1 && (
										<Button
											size="tiny"
											onClick={() => {
												setDatesInputState((current) =>
													current.filter((e) => e.key !== key),
												);
											}}
											aria-controls={`date-input-${key}`}
											aria-label={t("common:actions.remove")}
											aria-describedby={`date-input-${key}-label`}
											title={t("common:actions.remove")}
											icon={<CrossIcon />}
											variant="minimal-destructive"
										/>
									)}
								</div>
							);
						})}
					</div>
					{datesCount < CALENDAR_EVENT.MAX_AMOUNT_OF_DATES &&
						allowMultiDate && <AddButton onAdd={addDate} />}
					<FormMessage type="info" className={clsx({ invisible: !isMounted })}>
						{t("calendar:inYourTimeZone")} {usersTimeZone}
					</FormMessage>
				</div>
			</fieldset>
		</div>
	);
}

function BracketUrlInput() {
	const { t } = useTranslation("calendar");
	const { eventToEdit } = useLoaderData<typeof loader>();

	return (
		<div>
			<Label htmlFor="bracketUrl" required>
				{t("forms.bracketUrl")}
			</Label>
			<input
				name="bracketUrl"
				type="url"
				required
				maxLength={CALENDAR_EVENT.BRACKET_URL_MAX_LENGTH}
				defaultValue={eventToEdit?.bracketUrl}
			/>
		</div>
	);
}

function DiscordLinkInput() {
	const { t } = useTranslation("calendar");
	const baseEvent = useBaseEvent();
	const [value, setValue] = React.useState(baseEvent?.discordInviteCode ?? "");

	return (
		<div className="stack items-start">
			<Label htmlFor="discordInviteCode">{t("forms.discordInvite")}</Label>
			<Input
				name="discordInviteCode"
				leftAddon="https://discord.gg/"
				maxLength={CALENDAR_EVENT.DISCORD_INVITE_CODE_MAX_LENGTH}
				value={value}
				onChange={(e) => setValue(pathnameFromPotentialURL(e.target.value))}
			/>
		</div>
	);
}

function TagsAdder() {
	const { t } = useTranslation(["common", "calendar"]);
	const baseEvent = useBaseEvent();
	const [tags, setTags] = React.useState(baseEvent?.tags ?? []);
	const id = React.useId();

	const tagsForSelect = CALENDAR_EVENT.PERSISTED_TAGS.filter(
		(tag) => !tags.includes(tag),
	);

	return (
		<div className="stack sm">
			<input
				type="hidden"
				name="tags"
				value={JSON.stringify(tags.length > 0 ? tags : null)}
			/>
			<div>
				<label htmlFor={id}>{t("calendar:forms.tags")}</label>
				<select
					id={id}
					className="calendar-new__select"
					onChange={(e) =>
						// @ts-expect-error TODO: fix this (5.5 version)
						setTags([...tags, e.target.value as CalendarEventTag])
					}
				>
					<option value="">{t("calendar:forms.tags.placeholder")}</option>
					{tagsForSelect.map((tag) => (
						<option key={tag} value={tag}>
							{t(`common:tag.name.${tag}`)}
						</option>
					))}
				</select>
				<FormMessage type="info">{t("calendar:forms.tags.info")}</FormMessage>
			</div>
			<Tags
				tags={tags}
				onDelete={(tagToDelete) =>
					setTags(tags.filter((tag) => tag !== tagToDelete))
				}
			/>
		</div>
	);
}

function BadgesAdder() {
	const { t } = useTranslation("calendar");
	const baseEvent = useBaseEvent();
	const { managedBadges } = useLoaderData<typeof loader>();
	const [badges, setBadges] = React.useState(baseEvent?.badgePrizes ?? []);
	const id = React.useId();

	const input = (
		<input
			type="hidden"
			name="badges"
			value={JSON.stringify(badges.length > 0 ? badges.map((b) => b.id) : null)}
		/>
	);

	if (managedBadges.length === 0) return input;

	const handleBadgeDelete = (badgeId: BadgeType["id"]) => {
		setBadges(badges.filter((badge) => badge.id !== badgeId));
	};

	const badgesForSelect = managedBadges.filter(
		(badge) => !badges.some((b) => b.id === badge.id),
	);

	return (
		<div className="stack md">
			{input}
			<div>
				<label htmlFor={id}>{t("forms.badges")}</label>
				<select
					id={id}
					className="calendar-new__select"
					onChange={(e) => {
						setBadges([
							...badges,
							managedBadges.find(
								(badge) => badge.id === Number(e.target.value),
							)!,
						]);
					}}
				>
					<option value="">{t("forms.badges.placeholder")}</option>
					{badgesForSelect.map((badge) => (
						<option key={badge.id} value={badge.id}>
							{badge.displayName}
						</option>
					))}
				</select>
			</div>
			{badges.length > 0 && (
				<div className="calendar-new__badges">
					{badges.map((badge) => (
						<div className="stack horizontal md items-center" key={badge.id}>
							<Badge badge={badge} isAnimated size={32} />
							<span>{badge.displayName}</span>
							<Button
								className="ml-auto"
								onClick={() => handleBadgeDelete(badge.id)}
								icon={<TrashIcon />}
								variant="minimal-destructive"
								aria-label="Remove badge"
							/>
						</div>
					))}
				</div>
			)}
		</div>
	);
}

function AvatarImageInput({
	avatarImg,
	setAvatarImg,
}: {
	avatarImg: File | null;
	setAvatarImg: (img: File | null) => void;
}) {
	const baseEvent = useBaseEvent();
	const [showPrevious, setShowPrevious] = React.useState(true);

	if (
		baseEvent?.avatarImgId &&
		baseEvent?.tournament?.ctx.logoUrl &&
		showPrevious
	) {
		const logoImgUrl = userSubmittedImage(baseEvent.tournament.ctx.logoUrl);

		return (
			<div className="stack horizontal md flex-wrap">
				<input type="hidden" name="avatarImgId" value={baseEvent.avatarImgId} />
				<div className="stack md items-center">
					<img
						src={logoImgUrl}
						alt=""
						className="calendar-new__avatar-preview"
					/>
					<Button
						variant="outlined"
						size="tiny"
						onClick={() => setShowPrevious(false)}
					>
						Edit logo
					</Button>
				</div>
			</div>
		);
	}

	const hasPreviousAvatar = Boolean(baseEvent?.avatarImgId);

	return (
		<div>
			<Label htmlFor="avatarImage">Logo</Label>
			<input
				id="avatarImage"
				className="plain"
				type="file"
				name="img"
				accept="image/png, image/jpeg, image/jpg, image/webp"
				onChange={(e) => {
					const uploadedFile = e.target.files?.[0];
					if (!uploadedFile) {
						setAvatarImg(null);
						return;
					}

					new Compressor(uploadedFile, {
						width: CALENDAR_EVENT.AVATAR_SIZE,
						height: CALENDAR_EVENT.AVATAR_SIZE,
						maxHeight: CALENDAR_EVENT.AVATAR_SIZE,
						maxWidth: CALENDAR_EVENT.AVATAR_SIZE,
						resize: "cover",
						success(result) {
							invariant(result instanceof Blob);
							const file = new File([result], "img.webp", {
								type: "image/webp",
							});

							setAvatarImg(file);
						},
						error(err) {
							console.error(err.message);
						},
					});
				}}
			/>
			{avatarImg && (
				<div className="mt-4 stack horizontal md flex-wrap">
					<img
						src={URL.createObjectURL(avatarImg)}
						alt=""
						className="calendar-new__avatar-preview"
					/>
				</div>
			)}
			<FormMessage type="info">
				Note that for non-patrons there is a validation process before avatar is
				shown.
			</FormMessage>
			{hasPreviousAvatar && (
				<Button
					variant="minimal-destructive"
					size="tiny"
					onClick={() => setShowPrevious(true)}
					className="mt-2"
				>
					Cancel changing avatar image
				</Button>
			)}
		</div>
	);
}

function RankedToggle() {
	const baseEvent = useBaseEvent();
	const [isRanked, setIsRanked] = React.useState(
		baseEvent?.tournament?.ctx.settings.isRanked ?? true,
	);
	const id = React.useId();

	return (
		<div>
			<label htmlFor={id} className="w-max">
				Ranked
			</label>
			<SendouSwitch
				name="isRanked"
				id={id}
				size="small"
				isSelected={isRanked}
				onChange={setIsRanked}
			/>
			<FormMessage type="info">
				Ranked tournaments affect SP. Tournaments that don&apos;t have open
				registration (skill capped) or &quot;gimmick tournaments&quot; must
				always be hosted as unranked. Any tournament hosted during off-season is
				always unranked no matter what is chosen here.
			</FormMessage>
		</div>
	);
}

function EnableNoScreenToggle() {
	const baseEvent = useBaseEvent();
	const [enableNoScreen, setEnableNoScreen] = React.useState(
		baseEvent?.tournament?.ctx.settings.enableNoScreenToggle ?? true,
	);
	const id = React.useId();

	return (
		<div>
			<label htmlFor={id} className="w-max">
				Splattercolor Screen toggle
			</label>
			<SendouSwitch
				name="enableNoScreenToggle"
				id={id}
				size="small"
				isSelected={enableNoScreen}
				onChange={setEnableNoScreen}
			/>
			<FormMessage type="info">
				When registering ask teams if they want to play without Splattercolor
				Screen.
			</FormMessage>
		</div>
	);
}

function EnableSubsToggle() {
	const baseEvent = useBaseEvent();
	const [enableSubs, setEnableSubs] = React.useState(
		baseEvent?.tournament?.ctx.settings.enableSubs ?? true,
	);
	const id = React.useId();

	return (
		<div>
			<label htmlFor={id} className="w-max">
				Subs tab
			</label>
			<SendouSwitch
				name="enableSubs"
				id={id}
				size="small"
				isSelected={enableSubs}
				onChange={setEnableSubs}
			/>
			<FormMessage type="info">
				Allow users to sign up as "subs" in addition to the normal event
				sign-up.
			</FormMessage>
		</div>
	);
}

function AutonomousSubsToggle() {
	const baseEvent = useBaseEvent();
	const [autonomousSubs, setAutonomousSubs] = React.useState(
		baseEvent?.tournament?.ctx.settings.autonomousSubs ?? true,
	);
	const id = React.useId();

	return (
		<div>
			<label htmlFor={id} className="w-max">
				Autonomous subs
			</label>
			<SendouSwitch
				name="autonomousSubs"
				id={id}
				size="small"
				isSelected={autonomousSubs}
				onChange={setAutonomousSubs}
			/>
			<FormMessage type="info">
				If enabled teams can add subs on their own while the tournament is in
				progress. When disabled needs to be done by the TO&apos;s.
			</FormMessage>
		</div>
	);
}

function RequireIGNToggle() {
	const baseEvent = useBaseEvent();
	const [requireIGNs, setRequireIGNs] = React.useState(
		baseEvent?.tournament?.ctx.settings.requireInGameNames ?? false,
	);
	const id = React.useId();

	return (
		<div>
			<label htmlFor={id} className="w-max">
				Require in-game names
			</label>
			<SendouSwitch
				name="requireInGameNames"
				id={id}
				size="small"
				isSelected={requireIGNs}
				onChange={setRequireIGNs}
			/>
			<FormMessage type="info">
				If enabled players can&apos;t join the tournament without an in-game
				name (e.g. Sendou#1234). Players can&apos;t change the IGNs after the
				registration closes.
			</FormMessage>
		</div>
	);
}

function InvitationalToggle({
	isInvitational,
	setIsInvitational,
}: {
	isInvitational: boolean;
	setIsInvitational: (value: boolean) => void;
}) {
	const id = React.useId();

	return (
		<div>
			<label htmlFor={id} className="w-max">
				Invitational
			</label>
			<SendouSwitch
				name="isInvitational"
				id={id}
				size="small"
				isSelected={isInvitational}
				onChange={setIsInvitational}
			/>
			<FormMessage type="info">
				No open registration or subs list. All teams must be added by the
				organizer.
			</FormMessage>
		</div>
	);
}

function StrictDeadlinesToggle() {
	const baseEvent = useBaseEvent();
	const [strictDeadlines, setStrictDeadlines] = React.useState(
		baseEvent?.tournament?.ctx.settings.deadlines === "STRICT",
	);
	const id = React.useId();

	return (
		<div>
			<label htmlFor={id} className="w-max">
				Strict deadlines
			</label>
			<SendouSwitch
				name="strictDeadline"
				id={id}
				size="small"
				isSelected={strictDeadlines}
				onChange={setStrictDeadlines}
			/>
			<FormMessage type="info">
				Strict deadlines has 5 minutes less for the target time of each round
				(25min Bo3, 35min Bo5 compared to 30min Bo3, 40min Bo5 normal).
			</FormMessage>
		</div>
	);
}

function RegClosesAtSelect() {
	const baseEvent = useBaseEvent();
	const [regClosesAt, setRegClosesAt] = React.useState<RegClosesAtOption>(
		baseEvent?.tournament?.ctx.settings.regClosesAt
			? datesToRegClosesAt({
					startTime: databaseTimestampToDate(
						baseEvent.tournament.ctx.startTime,
					),
					regClosesAt: databaseTimestampToDate(
						baseEvent.tournament.ctx.settings.regClosesAt,
					),
				})
			: "0",
	);
	const id = React.useId();

	return (
		<div>
			<label htmlFor={id} className="w-max">
				Registration closes at
			</label>
			<select
				name="regClosesAt"
				value={regClosesAt}
				onChange={(e) => setRegClosesAt(e.target.value as RegClosesAtOption)}
				className="w-max"
			>
				{REG_CLOSES_AT_OPTIONS.map((option) => (
					<option key={option} value={option}>
						{regClosesAtToDisplayName(option)}
					</option>
				))}
			</select>
			<FormMessage type="info">
				All times relative to the reported tournament start time e.g. &quot;30
				minutes&quot; means &quot;30 minutes before event start time&quot;.
				After registration closes only TO&apos;s can make changes to team
				rosters.
			</FormMessage>
		</div>
	);
}

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
function TournamentMapPickingStyleSelect() {
	const { t } = useTranslation(["common"]);
	const id = React.useId();
	const { eventToEdit, recentEventsWithMapPools } =
		useLoaderData<typeof loader>();
	const baseEvent = useBaseEvent();
	const [mode, setMode] = React.useState<"ALL" | "TO" | RankedModeShort>(
		baseEvent?.mapPickingStyle
			? mapPickingStyleToShort[baseEvent.mapPickingStyle]
			: "ALL",
	);
	const [mapPool, setMapPool] = React.useState<MapPool>(
		baseEvent?.mapPool ? new MapPool(baseEvent.mapPool) : MapPool.EMPTY,
	);

	// can't change toToolsMode in editing
	// and also can't change tiebreaker maps in editing
	// because otherwise some team's picks that they already made
	// might start to overlap with tiebreaker maps
	if (eventToEdit && mode !== "TO") {
		return null;
	}

	return (
		<div className="stack md w-full items-start">
			<Divider>Tournament maps</Divider>
			<div>
				<label htmlFor={id}>Map picking style</label>
				<select
					onChange={(e) => setMode(e.target.value as RankedModeShort)}
					name="toToolsMode"
					defaultValue={mode}
					id={id}
					disabled={Boolean(eventToEdit)}
				>
					<option value="ALL">Prepicked by teams - All modes</option>
					<option value="SZ">Prepicked by teams - SZ only</option>
					<option value="TC">Prepicked by teams - TC only</option>
					<option value="RM">Prepicked by teams - RM only</option>
					<option value="CB">Prepicked by teams - CB only</option>
					<option value="TO">Picked by TO</option>
				</select>
			</div>
			{mode === "ALL" ? <CounterPickMapPoolSection /> : null}
			{mode === "TO" ? (
				<>
					<input type="hidden" name="pool" value={mapPool.serialized} />

					<MapPoolSelector
						className="w-full"
						mapPool={mapPool}
						title={t("common:maps.mapPool")}
						handleMapPoolChange={setMapPool}
						recentEvents={recentEventsWithMapPools}
						allowBulkEdit
					/>
				</>
			) : null}
		</div>
	);
}

function MapPoolSection() {
	const { t } = useTranslation(["game-misc", "common"]);

	const baseEvent = useBaseEvent();
	const { recentEventsWithMapPools } = useLoaderData<typeof loader>();
	const [mapPool, setMapPool] = React.useState<MapPool>(
		baseEvent?.mapPool ? new MapPool(baseEvent.mapPool) : MapPool.EMPTY,
	);
	const [includeMapPool, setIncludeMapPool] = React.useState(
		Boolean(baseEvent?.mapPool),
	);

	const id = React.useId();

	return includeMapPool ? (
		<>
			<input type="hidden" name="pool" value={mapPool.serialized} />

			<MapPoolSelector
				className="w-full"
				mapPool={mapPool}
				title={t("common:maps.mapPool")}
				handleRemoval={() => setIncludeMapPool(false)}
				handleMapPoolChange={setMapPool}
				recentEvents={recentEventsWithMapPools}
				allowBulkEdit
			/>
		</>
	) : (
		<div>
			<label htmlFor={id}>{t("common:maps.mapPool")}</label>
			<AddButton onAdd={() => setIncludeMapPool(true)} id={id} />
		</div>
	);
}

function CounterPickMapPoolSection() {
	const { t } = useTranslation(["common"]);
	const baseEvent = useBaseEvent();
	const [mapPool, setMapPool] = React.useState<MapPool>(
		baseEvent?.tieBreakerMapPool
			? new MapPool(baseEvent.tieBreakerMapPool)
			: MapPool.EMPTY,
	);

	return (
		<>
			<RequiredHiddenInput
				value={mapPool.serialized}
				name="pool"
				isValid={validateTiebreakerMapPool(mapPool) === "VALID"}
			/>

			<MapPoolSelector
				className="w-full"
				mapPool={mapPool}
				handleMapPoolChange={setMapPool}
				title={t("common:maps.tieBreakerMapPool")}
				modesToInclude={["SZ", "TC", "RM", "CB"]}
				hideBanned
				info={
					<div>
						<MapPoolValidationStatusMessage
							status={validateTiebreakerMapPool(mapPool)}
						/>
					</div>
				}
			/>
		</>
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
			<Alert alertClassName="w-max" variation={alertVariation} tiny>
				{t(`common:maps.validation.${status}`)}
			</Alert>
		</div>
	);
}

function MemberCountSelect() {
	const baseEvent = useBaseEvent();
	const id = React.useId();

	return (
		<div>
			<label htmlFor={id} className="w-max">
				Players count
			</label>
			<select
				name="minMembersPerTeam"
				defaultValue={
					baseEvent?.tournament?.ctx.settings.minMembersPerTeam ?? 4
				}
				className="w-max"
			>
				{[4, 3, 2, 1].map((count) => (
					<option key={count} value={count}>
						{`${count}v${count}`}
					</option>
				))}
			</select>
		</div>
	);
}
