import * as React from "react";
import { SendouButton } from "~/components/elements/Button";
import { SendouDialog } from "~/components/elements/Dialog";
import type { TournamentDataTeam } from "~/features/tournament-bracket/core/Tournament.server";
import { databaseTimestampToDate } from "~/utils/dates";
import { teamPage, userPage } from "~/utils/urls";
import { useTournament } from "../routes/to.$id";
import styles from "./ExportDialog.module.css";

const BASE_URL = "https://sendou.ink";

// xxx: uppercase constants?
type ExportFormat = "list" | "csv";
type ExportStatus = "all" | "checkedIn" | "notCheckedIn";
type ExportSort = "name" | "seed" | "registration";

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
	teamName: "Team name",
	seed: "Seed",
	registeredAt: "Registration time",
	checkInStatus: "Check-in status",
	teamPageUrl: "Team page URL",
	memberUsername: "Member username",
	memberInGameName: "Member in-game name",
	memberDiscord: "Member Discord mention",
	memberProfileUrl: "Member profile URL",
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
		const teams = scopedAndSortedTeams({
			teams: tournament.ctx.teams,
			status,
			sort,
			bracketIdx,
			bracketParticipantIds:
				bracketIdx !== null
					? new Set(
							tournament.brackets[bracketIdx]?.participantTournamentTeamIds ??
								[],
						)
					: null,
		});
		const content = buildContent({
			teams,
			format,
			fields,
			bracketIdx,
			checkedInLabel: "Checked in",
			notCheckedInLabel: "Not checked in",
		});
		handleDownload({
			filename: `participants.${format === "csv" ? "csv" : "txt"}`,
			content,
		});
		close();
	};

	return (
		<SendouDialog heading="Export participants" onClose={close}>
			<div className="stack md">
				<RadioRow
					label="Format"
					value={format}
					onChange={(value) => setFormat(value as ExportFormat)}
					options={[
						{ value: "list", label: "List" },
						{ value: "csv", label: "CSV" },
					]}
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
					onChange={(value) => setStatus(value as ExportStatus)}
					options={[
						{ value: "all", label: "All teams" },
						{
							value: "checkedIn",
							label: "Checked in only",
						},
						{
							value: "notCheckedIn",
							label: "Not checked in",
						},
					]}
				/>

				<RadioRow
					label="Sort by"
					value={sort}
					onChange={(value) => setSort(value as ExportSort)}
					options={[
						{ value: "name", label: "Name" },
						{ value: "seed", label: "Seed" },
						{
							value: "registration",
							label: "Registration time",
						},
					]}
				/>

				<SendouButton onPress={onDownload} className="mx-auto">
					Download
				</SendouButton>
			</div>
		</SendouDialog>
	);
}

function RadioRow({
	label,
	value,
	onChange,
	options,
}: {
	label: string;
	value: string;
	onChange: (value: string) => void;
	options: Array<{ value: string; label: string }>;
}) {
	const groupName = React.useId();

	return (
		<div className="stack sm">
			<div className="text-sm font-bold">{label}</div>
			<div className="stack horizontal md flex-wrap">
				{options.map((option) => (
					<label key={option.value} className={styles.fieldLabel}>
						<input
							type="radio"
							name={groupName}
							checked={value === option.value}
							onChange={() => onChange(option.value)}
						/>
						{option.label}
					</label>
				))}
			</div>
		</div>
	);
}

function hasActiveCheckIn(team: TournamentDataTeam, bracketIdx: number | null) {
	const relevant = team.checkIns.filter(
		(checkIn) => checkIn.bracketIdx === bracketIdx,
	);
	return (
		relevant.some((checkIn) => !checkIn.isCheckOut) &&
		!relevant.some((checkIn) => checkIn.isCheckOut)
	);
}

function scopedAndSortedTeams({
	teams,
	status,
	sort,
	bracketIdx,
	bracketParticipantIds,
}: {
	teams: TournamentDataTeam[];
	status: ExportStatus;
	sort: ExportSort;
	bracketIdx: number | null;
	bracketParticipantIds: Set<number> | null;
}) {
	const filtered = teams.filter((team) => {
		if (bracketParticipantIds && !bracketParticipantIds.has(team.id)) {
			return false;
		}
		switch (status) {
			case "checkedIn":
				return hasActiveCheckIn(team, bracketIdx);
			case "notCheckedIn":
				return !hasActiveCheckIn(team, bracketIdx);
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
			return hasActiveCheckIn(team, opts.bracketIdx)
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
	checkedInLabel,
	notCheckedInLabel,
}: {
	teams: TournamentDataTeam[];
	format: ExportFormat;
	fields: Set<ExportField>;
	bracketIdx: number | null;
	checkedInLabel: string;
	notCheckedInLabel: string;
}) {
	const teamFields = TEAM_FIELDS.filter((field) => fields.has(field));
	const memberFields = MEMBER_FIELDS.filter((field) => fields.has(field));
	const labelOpts = { checkedInLabel, notCheckedInLabel, bracketIdx };

	if (format === "csv") {
		const maxRoster = Math.max(0, ...teams.map((team) => team.members.length));

		const header = [
			...teamFields,
			...Array.from({ length: maxRoster }).flatMap((_, i) =>
				memberFields.map((field) => `Member ${i + 1} ${field}`),
			),
		].join(",");

		const rows = teams.map((team) => {
			const teamValues = teamFields.map((field) =>
				csvCell(teamFieldValue(team, field, labelOpts)),
			);
			const memberValues = Array.from({ length: maxRoster }).flatMap((_, i) => {
				const member = team.members[i];
				return memberFields.map((field) =>
					member ? csvCell(memberFieldValue(member, field)) : "",
				);
			});
			return [...teamValues, ...memberValues].join(",");
		});

		return [header, ...rows].join("\n");
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

// xxx: make more robust
function csvCell(value: string) {
	if (value.includes(",") || value.includes('"') || value.includes("\n")) {
		return `"${value.replace(/"/g, '""')}"`;
	}
	return value;
}

function handleDownload({
	content,
	filename,
}: {
	content: string;
	filename: string;
}) {
	const element = document.createElement("a");
	const file = new Blob([content], { type: "text/plain" });
	element.href = URL.createObjectURL(file);
	element.download = filename;
	document.body.appendChild(element);
	element.click();
	document.body.removeChild(element);
}
