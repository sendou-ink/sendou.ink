import { useTranslation } from "react-i18next";
import { Link, useLoaderData, useSearchParams } from "react-router";
import { Avatar } from "~/components/Avatar";
import { Label } from "~/components/Label";
import { LocaleTime } from "~/components/LocaleTime";
import { Pagination } from "~/components/Pagination";
import { Table } from "~/components/Table";
import { TOURNAMENT_AUDIT_LOG_TYPES } from "~/db/tables";
import type { CommonUser } from "~/utils/kysely.server";
import { tournamentTeamPage, userPage } from "~/utils/urls";
import type { TournamentAdminPageLoader } from "../loaders/to.$id.admin.server";
import { useTournament } from "../routes/to.$id";
import styles from "./TournamentAdminAuditLog.module.css";

const WHEN_FORMAT_OPTIONS = {
	day: "numeric",
	month: "numeric",
	year: "numeric",
	hour: "numeric",
	minute: "numeric",
} as const;

// xxx: data not loaded before full page refresh

export function TournamentAdminAuditLog() {
	const { t } = useTranslation(["tournament"]);
	const data = useLoaderData<TournamentAdminPageLoader>();
	const [, setSearchParams] = useSearchParams();

	const auditLog = data?.auditLog;
	if (!auditLog) return null;

	const setPage = (page: number) => {
		setSearchParams((params) => {
			params.set("page", String(page));
			return params;
		});
	};

	return (
		<div className="stack md">
			<AuditLogFilters teams={auditLog.teams} />
			{auditLog.events.length === 0 ? (
				<div className="text-lighter text-sm">
					{t("tournament:admin.audit.empty")}
				</div>
			) : (
				<>
					<Table>
						<thead>
							<tr>
								<th>{t("tournament:admin.audit.column.when")}</th>
								<th>{t("tournament:admin.audit.column.event")}</th>
								<th>{t("tournament:admin.audit.column.team")}</th>
								<th>{t("tournament:admin.audit.column.actor")}</th>
								<th>{t("tournament:admin.audit.column.subject")}</th>
							</tr>
						</thead>
						<tbody>
							{auditLog.events.map((event) => (
								<AuditLogRow key={event.id} event={event} />
							))}
						</tbody>
					</Table>
					{auditLog.pagesCount > 1 ? (
						<Pagination
							currentPage={auditLog.currentPage}
							pagesCount={auditLog.pagesCount}
							nextPage={() => setPage(auditLog.currentPage + 1)}
							previousPage={() => setPage(auditLog.currentPage - 1)}
							setPage={setPage}
						/>
					) : null}
				</>
			)}
		</div>
	);
}

type AuditLogEvent = NonNullable<
	NonNullable<
		ReturnType<typeof useLoaderData<TournamentAdminPageLoader>>
	>["auditLog"]
>["events"][number];

function AuditLogRow({ event }: { event: AuditLogEvent }) {
	const { t } = useTranslation(["tournament"]);
	const tournament = useTournament();

	const bracketName =
		typeof event.metadata?.bracketIdx === "number"
			? tournament.brackets[event.metadata.bracketIdx]?.name
			: undefined;

	return (
		<tr>
			<td>
				<LocaleTime
					date={event.createdAt}
					options={WHEN_FORMAT_OPTIONS}
					inline
				/>
			</td>
			<td>
				{t(`tournament:admin.audit.event.${event.type}`)}
				{bracketName ? (
					<div className="text-lighter text-xs">{bracketName}</div>
				) : null}
			</td>
			<td>
				{event.team ? (
					tournament.teamById(event.team.id) ? (
						<Link
							to={tournamentTeamPage({
								tournamentId: tournament.ctx.id,
								tournamentTeamId: event.team.id,
							})}
						>
							{event.team.name}
						</Link>
					) : (
						event.team.name
					)
				) : (
					"-"
				)}
			</td>
			<td>
				<UserCell user={event.actor} />
			</td>
			<td>
				<UserCell user={event.subject} />
			</td>
		</tr>
	);
}

function UserCell({ user }: { user: CommonUser | null }) {
	if (!user) return <>-</>;

	return (
		<Link to={userPage(user)} className={styles.userCell}>
			<Avatar user={user} size="xxs" />
			{user.username}
		</Link>
	);
}

function AuditLogFilters({
	teams,
}: {
	teams: Array<{ id: number; name: string }>;
}) {
	const { t } = useTranslation(["tournament"]);
	const [searchParams, setSearchParams] = useSearchParams();

	const setFilter = (key: string, value: string) => {
		setSearchParams((params) => {
			if (value) {
				params.set(key, value);
			} else {
				params.delete(key);
			}
			params.delete("page");
			return params;
		});
	};

	return (
		<div className="stack horizontal sm flex-wrap">
			<div>
				<Label htmlFor="auditType">
					{t("tournament:admin.audit.filter.event")}
				</Label>
				<select
					id="auditType"
					value={searchParams.get("auditType") ?? ""}
					onChange={(e) => setFilter("auditType", e.target.value)}
				>
					<option value="">
						{t("tournament:admin.audit.filter.allEvents")}
					</option>
					{TOURNAMENT_AUDIT_LOG_TYPES.map((type) => (
						<option key={type} value={type}>
							{t(`tournament:admin.audit.event.${type}`)}
						</option>
					))}
				</select>
			</div>
			<div>
				<Label htmlFor="auditTeam">
					{t("tournament:admin.audit.filter.team")}
				</Label>
				<select
					id="auditTeam"
					value={searchParams.get("auditTeam") ?? ""}
					onChange={(e) => setFilter("auditTeam", e.target.value)}
				>
					<option value="">
						{t("tournament:admin.audit.filter.allTeams")}
					</option>
					{teams.map((team) => (
						<option key={team.id} value={team.id}>
							{team.name}
						</option>
					))}
				</select>
			</div>
		</div>
	);
}
