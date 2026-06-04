import clsx from "clsx";
import {
	Check,
	Download,
	LogIn,
	LogOut,
	MoreHorizontal,
	Pencil,
	Plus,
	RotateCcw,
	Search,
	Trash2,
	X,
} from "lucide-react";
import * as React from "react";
import { useFetcher } from "react-router";
import { Avatar } from "~/components/Avatar";
import { SendouButton } from "~/components/elements/Button";
import { SendouMenu, SendouMenuItem } from "~/components/elements/Menu";
import { FormWithConfirm } from "~/components/FormWithConfirm";
import { Input } from "~/components/Input";
import {
	SortableTableHeader,
	type SortState,
} from "~/components/SortableTableHeader";
import { Table } from "~/components/Table";
import type { TournamentDataTeam } from "~/features/tournament-bracket/core/Tournament.server";
import { teamPage } from "~/utils/urls";
import { queryToUserIdentifier } from "~/utils/users";
import { ExportDialog } from "../components/ExportDialog";
import { RegistrationFormDialog } from "../components/RegistrationForm";
import { useTournament } from "./to.$id";
import styles from "./to.$id.admin.index.module.css";

export { action } from "../actions/to.$id.admin.index.server";

type SortKey = "name" | "checkIn";

type DialogState =
	| { type: "add" }
	| { type: "edit"; teamId: number }
	| { type: "export" }
	| null;

export default function TournamentAdminTeamsPage() {
	const tournament = useTournament();

	const [search, setSearch] = React.useState("");
	const [sort, setSort] = React.useState<SortState<SortKey>>(null);
	const [dialog, setDialog] = React.useState<DialogState>(null);

	const maxRosterSize = Math.max(
		1,
		...tournament.ctx.teams.map((team) => team.members.length),
	);

	const filteredTeams = tournament.ctx.teams.filter((team) =>
		teamMatchesQuery(team, search),
	);
	const sortedTeams = sortTeams(filteredTeams, sort);

	const editingTeam =
		dialog?.type === "edit" ? tournament.teamById(dialog.teamId) : undefined;

	return (
		<div className="stack md">
			<div className={styles.toolbar}>
				<div className={styles.toolbarActions}>
					<SendouButton
						size="small"
						variant="outlined"
						icon={<Download />}
						onPress={() => setDialog({ type: "export" })}
					>
						Export
					</SendouButton>
					<SendouButton
						size="small"
						icon={<Plus />}
						onPress={() => setDialog({ type: "add" })}
					>
						Add new team
					</SendouButton>
				</div>
				<Input
					className={styles.searchInput}
					value={search}
					onChange={(e) => setSearch(e.target.value)}
					aria-label="Search teams"
					placeholder="Search teams"
					icon={<Search aria-hidden />}
				/>
			</div>

			<Table>
				<thead>
					<tr>
						<SortableTableHeader
							label="Team"
							sortKey="name"
							sort={sort}
							onChange={setSort}
						/>
						<th>Actions</th>
						<SortableTableHeader
							label="Check-in"
							sortKey="checkIn"
							sort={sort}
							onChange={setSort}
						/>
						{Array.from({ length: maxRosterSize }).map((_, i) => (
							<th key={`player-${i}`}>Player {i + 1}</th>
						))}
					</tr>
				</thead>
				<tbody>
					{sortedTeams.map((team) => (
						<TeamRow
							key={team.id}
							team={team}
							maxRosterSize={maxRosterSize}
							onEdit={() => setDialog({ type: "edit", teamId: team.id })}
						/>
					))}
					{sortedTeams.length === 0 ? (
						<tr>
							<td colSpan={maxRosterSize + 3} className={styles.noResults}>
								No teams found
							</td>
						</tr>
					) : null}
				</tbody>
			</Table>

			{dialog?.type === "add" ? (
				<RegistrationFormDialog close={() => setDialog(null)} />
			) : null}
			{dialog?.type === "edit" && editingTeam ? (
				<RegistrationFormDialog
					team={editingTeam}
					close={() => setDialog(null)}
				/>
			) : null}
			{dialog?.type === "export" ? (
				<ExportDialog close={() => setDialog(null)} />
			) : null}
		</div>
	);
}

function TeamRow({
	team,
	maxRosterSize,
	onEdit,
}: {
	team: TournamentDataTeam;
	maxRosterSize: number;
	onEdit: () => void;
}) {
	const tournament = useTournament();

	const members = sortedMembers(team);
	const logoSrc = tournament.tournamentTeamLogoSrc(team);

	return (
		<tr className={clsx({ [styles.droppedOut]: team.droppedOut })}>
			<td>
				<div className="stack horizontal sm items-center">
					<Avatar size="xxs" url={logoSrc} identiconInput={team.name} />
					{team.team ? (
						<a
							href={teamPage(team.team.customUrl ?? "")}
							className={styles.teamName}
						>
							{team.name}
						</a>
					) : (
						<span className={styles.teamName}>{team.name}</span>
					)}
				</div>
			</td>
			<td>
				<TeamRowMenu team={team} onEdit={onEdit} />
			</td>
			<td>
				<CheckInCell team={team} />
			</td>
			{Array.from({ length: maxRosterSize }).map((_, i) => {
				const member = members[i];
				return (
					<td key={`player-${i}`}>
						{member ? (
							<span
								className={clsx("stack horizontal xxs items-center", {
									"font-bold": member.role === "OWNER",
								})}
							>
								{member.role === "OWNER" ? "(C) " : null}
								{member.username}
							</span>
						) : null}
					</td>
				);
			})}
		</tr>
	);
}

function CheckInCell({ team }: { team: TournamentDataTeam }) {
	const tournament = useTournament();

	const labels = activeCheckInLabels(team, (key) =>
		key === null ? "Tournament" : (tournament.brackets[key]?.name ?? `#${key}`),
	);

	if (labels.length === 0) {
		return <X className={styles.checkInCross} aria-label="Not checked in" />;
	}

	return (
		<span className={styles.checkInMarks} title={labels.join(", ")}>
			{labels.map((label) => (
				<Check key={label} className={styles.checkInMark} aria-label={label} />
			))}
		</span>
	);
}

function TeamRowMenu({
	team,
	onEdit,
}: {
	team: TournamentDataTeam;
	onEdit: () => void;
}) {
	const tournament = useTournament();
	const fetcher = useFetcher();
	const [confirming, setConfirming] = React.useState<
		"DELETE_TEAM" | "DROP_TEAM_OUT" | null
	>(null);

	const submit = (body: Record<string, string | number>) =>
		fetcher.submit(body, { method: "post", encType: "application/json" });

	const checkInOpen = tournament.regularCheckInStartInThePast;
	const checkedIn = isTournamentCheckedIn(team);

	return (
		<div className="stack horizontal xs items-center">
			<SendouButton
				size="miniscule"
				icon={<Pencil />}
				onPress={onEdit}
				aria-label="Edit registration"
			/>
			<SendouMenu
				trigger={
					<SendouButton
						size="miniscule"
						variant="outlined"
						icon={<MoreHorizontal />}
						aria-label="Actions"
					/>
				}
			>
				{checkInOpen && !tournament.hasStarted ? (
					checkedIn ? (
						<SendouMenuItem
							icon={<LogOut />}
							onAction={() =>
								submit({ _action: "CHECK_OUT", teamId: team.id, bracketIdx: 0 })
							}
						>
							Check out
						</SendouMenuItem>
					) : (
						<SendouMenuItem
							icon={<LogIn />}
							onAction={() =>
								submit({ _action: "CHECK_IN", teamId: team.id, bracketIdx: 0 })
							}
						>
							Check in
						</SendouMenuItem>
					)
				) : null}
				{tournament.hasStarted ? (
					team.droppedOut ? (
						<SendouMenuItem
							icon={<RotateCcw />}
							onAction={() =>
								submit({ _action: "UNDO_DROP_TEAM_OUT", teamId: team.id })
							}
						>
							Undo drop out
						</SendouMenuItem>
					) : (
						<SendouMenuItem
							icon={<LogOut />}
							isDestructive
							onAction={() => setConfirming("DROP_TEAM_OUT")}
						>
							Drop out
						</SendouMenuItem>
					)
				) : (
					<SendouMenuItem
						icon={<Trash2 />}
						isDestructive
						onAction={() => setConfirming("DELETE_TEAM")}
					>
						Unregister
					</SendouMenuItem>
				)}
			</SendouMenu>
			<FormWithConfirm
				isOpen={confirming === "DELETE_TEAM"}
				onOpenChange={(isOpen) => !isOpen && setConfirming(null)}
				fields={[
					["_action", "DELETE_TEAM"],
					["teamId", team.id],
				]}
				dialogHeading={`Unregister "${team.name}" and delete its registration info?`}
				submitButtonText="Unregister"
			/>
			<FormWithConfirm
				isOpen={confirming === "DROP_TEAM_OUT"}
				onOpenChange={(isOpen) => !isOpen && setConfirming(null)}
				fields={[
					["_action", "DROP_TEAM_OUT"],
					["teamId", team.id],
				]}
				dialogHeading={`Drop "${team.name}" out of the tournament?`}
				submitButtonText="Drop out"
			/>
		</div>
	);
}

function sortedMembers(team: TournamentDataTeam) {
	return [...team.members].sort((a, b) => {
		if (a.role === "OWNER" && b.role !== "OWNER") return -1;
		if (b.role === "OWNER" && a.role !== "OWNER") return 1;
		return a.createdAt - b.createdAt;
	});
}

function isTournamentCheckedIn(team: TournamentDataTeam) {
	const tournamentLevel = team.checkIns.filter(
		(checkIn) => checkIn.bracketIdx === null,
	);
	return (
		tournamentLevel.some((checkIn) => !checkIn.isCheckOut) &&
		!tournamentLevel.some((checkIn) => checkIn.isCheckOut)
	);
}

function activeCheckInLabels(
	team: TournamentDataTeam,
	labelFor: (bracketIdx: number | null) => string,
) {
	const byBracket = new Map<number | null, { in: boolean; out: boolean }>();
	for (const checkIn of team.checkIns) {
		const entry = byBracket.get(checkIn.bracketIdx) ?? {
			in: false,
			out: false,
		};
		if (checkIn.isCheckOut) {
			entry.out = true;
		} else {
			entry.in = true;
		}
		byBracket.set(checkIn.bracketIdx, entry);
	}

	const labels: string[] = [];
	for (const [bracketIdx, entry] of byBracket) {
		if (entry.in && !entry.out) {
			labels.push(labelFor(bracketIdx));
		}
	}
	return labels;
}

function activeCheckInCount(team: TournamentDataTeam) {
	return activeCheckInLabels(team, () => "").length;
}

function teamMatchesQuery(team: TournamentDataTeam, search: string) {
	const query = search.trim();
	if (!query) return true;

	const lowerQuery = query.toLowerCase();
	if (team.name.toLowerCase().includes(lowerQuery)) return true;
	if (
		team.members.some((member) =>
			member.username.toLowerCase().includes(lowerQuery),
		)
	) {
		return true;
	}

	const identifier = queryToUserIdentifier(query);
	if (identifier) {
		return team.members.some((member) => {
			if ("id" in identifier) return member.userId === identifier.id;
			if ("discordId" in identifier) {
				return member.discordId === identifier.discordId;
			}
			return (
				member.customUrl?.toLowerCase() === identifier.customUrl.toLowerCase()
			);
		});
	}

	return false;
}

function sortTeams(teams: TournamentDataTeam[], sort: SortState<SortKey>) {
	const bySeed = [...teams].sort((a, b) => {
		const aSeed = a.seed ?? Number.POSITIVE_INFINITY;
		const bSeed = b.seed ?? Number.POSITIVE_INFINITY;
		if (aSeed !== bSeed) return aSeed - bSeed;
		return a.createdAt - b.createdAt;
	});

	if (!sort) return bySeed;

	const sorted = bySeed.sort((a, b) =>
		sort.key === "name"
			? a.name.localeCompare(b.name)
			: activeCheckInCount(a) - activeCheckInCount(b),
	);

	return sort.dir === "asc" ? sorted : sorted.reverse();
}
