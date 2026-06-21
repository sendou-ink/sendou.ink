import * as React from "react";
import { SendouButton } from "~/components/elements/Button";
import {
	SendouChipRadio,
	SendouChipRadioGroup,
} from "~/components/elements/ChipRadio";
import { SendouDialog } from "~/components/elements/Dialog";
import { useTournament } from "~/features/tournament/routes/to.$id";
import type { TournamentDataTeam } from "~/features/tournament-bracket/core/Tournament.server";
import * as CSV from "~/modules/csv";
import { databaseTimestampToDate } from "~/utils/dates";
import { teamPage, userPage } from "~/utils/urls";
import styles from "./ExportDialog.module.css";

const BASE_URL = "https://sendou.ink";

const EXPORT_FORMATS = ["list", "csv"] as const;
const EXPORT_STATUSES = ["all", "checkedIn", "notCheckedIn"] as const;
const EXPORT_SORTS = ["name", "seed", "registration"] as const;

type ExportFormat = (typeof EXPORT_FORMATS)[number];
type ExportStatus = (typeof EXPORT_STATUSES)[number];
type ExportSort = (typeof EXPORT_SORTS)[number];

const FORMAT_LABELS: Record<ExportFormat, string> = {
	list: "List",
	csv: "CSV",
};
const STATUS_LABELS: Record<ExportStatus, string> = {
	all: "All teams",
	checkedIn: "Checked in only",
	notCheckedIn: "Not checked in",
};
const SORT_LABELS: Record<ExportSort, string> = {
	name: "Name",
	seed: "Seed",
	registration: "Registration time",
};

const TEAM_FIELDS = [
	"teamName",
	"seed",
	"registeredAt",
	"checkInStatus",
	"teamPageUrl",
] as const;
const MEMBER_FIELDS = [
	"memberUsername",
	"memberInGameName",
	"memberDiscord",
	"memberProfileUrl",
] as const;
type ExportField =
	| (typeof TEAM_FIELDS)[number]
	| (typeof MEMBER_FIELDS)[number];

const FIELD_LABELS: Record<ExportField, string> = {
	teamName: "Team",
	seed: "Seed",
	registeredAt: "Registration time",
	checkInStatus: "Check-in",
	teamPageUrl: "Team page URL",
	memberUsername: "Username",
	memberInGameName: "In-game name",
	memberDiscord: "Discord mention",
	memberProfileUrl: "Profile URL",
};

const DEFAULT_FIELDS: ExportField[] = [
	"teamName",
	"seed",
	"checkInStatus",
	"memberUsername",
];

export function ExportDialog({ close }: { close: () => void }) {
	const tournament = useTournament();

	const [format, setFormat] = React.useState<ExportFormat>("list");
	const [status, setStatus] = React.useState<ExportStatus>("all");
	const [bracketIdx, setBracketIdx] = React.useState<number | null>(null);
	const [sort, setSort] = React.useState<ExportSort>("seed");
	const [fields, setFields] = React.useState<Set<ExportField>>(
		new Set(DEFAULT_FIELDS),
	);

	const toggleField = (field: ExportField) =>
		setFields((prev) => {
			const next = new Set(prev);
			if (next.has(field)) {
				next.delete(field);
			} else {
				next.add(field);
			}
			return next;
		});

	const onDownload = () => {
		const selectedBracket =
			bracketIdx !== null ? tournament.brackets[bracketIdx] : null;
		const bracketRequiresOwnCheckIn = Boolean(selectedBracket?.requiresCheckIn);
		const teams = scopedAndSortedTeams({
			teams: tournament.ctx.teams,
			status,
			sort,
			bracketIdx,
			bracketRequiresOwnCheckIn,
			// A team belongs to a bracket whether or not it has checked in: the
			// checked-in teams populate the matches, the rest are pending check-in.
			// Both are scoped out of the export when they don't belong to the bracket.
			bracketParticipantIds: selectedBracket
				? new Set([
						...selectedBracket.participantTournamentTeamIds,
						...(selectedBracket.teamsPendingCheckIn ?? []),
					])
				: null,
		});
		const content = buildContent({
			teams,
			format,
			fields,
			bracketIdx,
			bracketRequiresOwnCheckIn,
			checkedInLabel: "Checked in",
			notCheckedInLabel: "Not checked in",
		});
		handleDownload({
			filename: `participants.${format === "csv" ? "csv" : "txt"}`,
			content,
			format,
		});
		close();
	};

	return (
		<SendouDialog heading="Export participants" onClose={close}>
			<div className="stack md">
				<RadioRow
					label="Format"
					value={format}
					onChange={setFormat}
					options={EXPORT_FORMATS.map((value) => ({
						value,
						label: FORMAT_LABELS[value],
					}))}
				/>

				<div className="stack sm">
					<div className="text-sm font-bold">Fields</div>
					<div className={styles.fieldGrid}>
						{[...TEAM_FIELDS, ...MEMBER_FIELDS].map((field) => (
							<label key={field} className={styles.fieldLabel}>
								<input
									type="checkbox"
									checked={fields.has(field)}
									onChange={() => toggleField(field)}
								/>
								{FIELD_LABELS[field]}
							</label>
						))}
					</div>
				</div>

				{tournament.brackets.length > 1 ? (
					<RadioRow
						label="Bracket"
						value={bracketIdx === null ? "all" : String(bracketIdx)}
						onChange={(value) =>
							setBracketIdx(value === "all" ? null : Number(value))
						}
						options={[
							{ value: "all", label: "All brackets" },
							...tournament.brackets.map((bracket, idx) => ({
								value: String(idx),
								label: bracket.name || `#${idx}`,
							})),
						]}
					/>
				) : null}

				<RadioRow
					label="Status"
					value={status}
					onChange={setStatus}
					options={EXPORT_STATUSES.map((value) => ({
						value,
						label: STATUS_LABELS[value],
					}))}
				/>

				<RadioRow
					label="Sort by"
					value={sort}
					onChange={setSort}
					options={EXPORT_SORTS.map((value) => ({
						value,
						label: SORT_LABELS[value],
					}))}
				/>

				<SendouButton onPress={onDownload} className="mx-auto">
					Download
				</SendouButton>
			</div>
		</SendouDialog>
	);
}

function RadioRow<T extends string>({
	label,
	value,
	onChange,
	options,
}: {
	label: string;
	value: T;
	onChange: (value: T) => void;
	options: ReadonlyArray<{ value: T; label: string }>;
}) {
	const groupName = React.useId();

	return (
		<div className="stack sm">
			<div className="text-sm font-bold">{label}</div>
			<SendouChipRadioGroup wrap>
				{options.map((option) => (
					<SendouChipRadio
						key={option.value}
						name={groupName}
						value={option.value}
						checked={value === option.value}
						onChange={(value) => onChange(value as T)}
					>
						{option.label}
					</SendouChipRadio>
				))}
			</SendouChipRadioGroup>
		</div>
	);
}

function hasActiveCheckIn(
	team: TournamentDataTeam,
	bracketIdx: number | null,
	bracketRequiresOwnCheckIn: boolean,
) {
	if (bracketIdx !== null && bracketRequiresOwnCheckIn) {
		return team.checkIns.some(
			(checkIn) => checkIn.bracketIdx === bracketIdx && !checkIn.isCheckOut,
		);
	}

	const eventLevel = team.checkIns.filter(
		(checkIn) => checkIn.bracketIdx === null,
	);
	return (
		eventLevel.some((checkIn) => !checkIn.isCheckOut) &&
		!eventLevel.some((checkIn) => checkIn.isCheckOut)
	);
}

export function scopedAndSortedTeams({
	teams,
	status,
	sort,
	bracketIdx,
	bracketRequiresOwnCheckIn,
	bracketParticipantIds,
}: {
	teams: TournamentDataTeam[];
	status: ExportStatus;
	sort: ExportSort;
	bracketIdx: number | null;
	bracketRequiresOwnCheckIn: boolean;
	bracketParticipantIds: Set<number> | null;
}) {
	const filtered = teams.filter((team) => {
		if (bracketParticipantIds && !bracketParticipantIds.has(team.id)) {
			return false;
		}
		switch (status) {
			case "checkedIn":
				return hasActiveCheckIn(team, bracketIdx, bracketRequiresOwnCheckIn);
			case "notCheckedIn":
				return !hasActiveCheckIn(team, bracketIdx, bracketRequiresOwnCheckIn);
			default:
				return true;
		}
	});

	return [...filtered].sort((a, b) => {
		switch (sort) {
			case "name":
				return a.name.localeCompare(b.name);
			case "registration":
				return a.createdAt - b.createdAt;
			default: {
				const aSeed = a.seed ?? Number.POSITIVE_INFINITY;
				const bSeed = b.seed ?? Number.POSITIVE_INFINITY;
				if (aSeed !== bSeed) return aSeed - bSeed;
				return a.createdAt - b.createdAt;
			}
		}
	});
}

function teamFieldValue(
	team: TournamentDataTeam,
	field: (typeof TEAM_FIELDS)[number],
	opts: {
		checkedInLabel: string;
		notCheckedInLabel: string;
		bracketIdx: number | null;
		bracketRequiresOwnCheckIn: boolean;
	},
) {
	switch (field) {
		case "teamName":
			return team.name;
		case "seed":
			return team.seed != null ? String(team.seed) : "";
		case "registeredAt":
			return databaseTimestampToDate(team.createdAt).toISOString();
		case "checkInStatus":
			return hasActiveCheckIn(
				team,
				opts.bracketIdx,
				opts.bracketRequiresOwnCheckIn,
			)
				? opts.checkedInLabel
				: opts.notCheckedInLabel;
		case "teamPageUrl":
			return team.team?.customUrl
				? `${BASE_URL}${teamPage(team.team.customUrl)}`
				: "";
	}
}

function memberFieldValue(
	member: TournamentDataTeam["members"][number],
	field: (typeof MEMBER_FIELDS)[number],
) {
	switch (field) {
		case "memberUsername":
			return member.username;
		case "memberInGameName":
			return member.inGameName ?? "";
		case "memberDiscord":
			return member.discordId ? `<@${member.discordId}>` : "";
		case "memberProfileUrl":
			return `${BASE_URL}${userPage(member)}`;
	}
}

function buildContent({
	teams,
	format,
	fields,
	bracketIdx,
	bracketRequiresOwnCheckIn,
	checkedInLabel,
	notCheckedInLabel,
}: {
	teams: TournamentDataTeam[];
	format: ExportFormat;
	fields: Set<ExportField>;
	bracketIdx: number | null;
	bracketRequiresOwnCheckIn: boolean;
	checkedInLabel: string;
	notCheckedInLabel: string;
}) {
	const teamFields = TEAM_FIELDS.filter((field) => fields.has(field));
	const memberFields = MEMBER_FIELDS.filter((field) => fields.has(field));
	const labelOpts = {
		checkedInLabel,
		notCheckedInLabel,
		bracketIdx,
		bracketRequiresOwnCheckIn,
	};

	if (format === "csv") {
		const maxRoster = Math.max(0, ...teams.map((team) => team.members.length));

		const header = [
			...teamFields.map((field) => FIELD_LABELS[field]),
			...Array.from({ length: maxRoster }).flatMap((_, i) =>
				memberFields.map((field) => `Player ${i + 1} ${FIELD_LABELS[field]}`),
			),
		];

		const rows = teams.map((team) => {
			const teamValues = teamFields.map((field) =>
				teamFieldValue(team, field, labelOpts),
			);
			const memberValues = Array.from({ length: maxRoster }).flatMap((_, i) => {
				const member = team.members[i];
				return memberFields.map((field) =>
					member ? memberFieldValue(member, field) : "",
				);
			});
			return [...teamValues, ...memberValues];
		});

		return CSV.serialize([header, ...rows]);
	}

	// list: members grouped under each team (omitted when no member fields chosen,
	// so a team-name-only export is just a plain list of names)
	const hasMemberFields = memberFields.length > 0;

	const entries = teams.map((team) => {
		const teamLine = teamFields
			.map((field) => teamFieldValue(team, field, labelOpts))
			.filter(Boolean)
			.join(" - ");
		if (!hasMemberFields) return teamLine;
		const memberLines = team.members.map(
			(member) =>
				`  ${memberFields
					.map((field) => memberFieldValue(member, field))
					.filter(Boolean)
					.join(" - ")}`,
		);
		return [teamLine, ...memberLines].join("\n");
	});

	return entries.join(hasMemberFields ? "\n\n" : "\n");
}

function handleDownload({
	content,
	filename,
	format,
}: {
	content: string;
	filename: string;
	format: ExportFormat;
}) {
	const isCsv = format === "csv";
	const element = document.createElement("a");
	const file = new Blob(isCsv ? [CSV.BOM, content] : [content], {
		type: isCsv ? "text/csv;charset=utf-8" : "text/plain;charset=utf-8",
	});
	element.href = URL.createObjectURL(file);
	element.download = filename;
	document.body.appendChild(element);
	element.click();
	document.body.removeChild(element);
}
