import type { MetaFunction } from "react-router";
import { useLoaderData } from "react-router";
import * as R from "remeda";
import { ActionButton } from "~/components/ActionButton";
import { LineChart } from "~/components/LineChart";
import { LocaleTime } from "~/components/LocaleTime";
import { Main } from "~/components/Main";
import { UserLink } from "~/components/UserLink";
import { metaTags } from "~/utils/remix";
import { action } from "../actions/admin.voice.server";
import { loader } from "../loaders/admin.voice.server";
import { VOICE_PLATFORMS } from "../voice-constants";
import { voiceDashboardActionSchema } from "../voice-schemas";
import styles from "./admin.voice.module.css";

export { action, loader };

export const meta: MetaFunction = (args) => {
	return metaTags({
		title: "Voice beta",
		location: args.location,
	});
};

type LoaderData = ReturnType<typeof useLoaderData<typeof loader>>;

export default function AdminVoicePage() {
	const data = useLoaderData<typeof loader>();

	return (
		<Main className="stack xl">
			<h1>Voice beta</h1>
			<Status data={data} />
			<Cost cost={data.cost} />
			<LiveRooms liveRooms={data.liveRooms} />
			<p className="text-lighter text-sm">
				The panels below cover the last {data.statsDays} days.
			</p>
			<Adoption adoption={data.adoption} />
			<Platforms platforms={data.platforms} />
			<LeaveReasons leaveReasons={data.leaveReasons} />
			<Errors errorCounts={data.errorCounts} latestErrors={data.latestErrors} />
			<Feedback
				ratings={data.ratings}
				feedbackComments={data.feedbackComments}
			/>
		</Main>
	);
}

function Status({ data }: { data: LoaderData }) {
	return (
		<section className="stack sm">
			<h2>Status</h2>
			<dl className={styles.facts}>
				<dt>Daily configured</dt>
				<dd>{data.isConfigured ? "Yes" : "No"}</dd>
				<dt>Kill switch</dt>
				<dd>{data.isDisabled ? "On (voice disabled)" : "Off"}</dd>
				<dt>Available to users</dt>
				<dd>{data.available ? "Yes" : "No"}</dd>
			</dl>
			<div>
				{data.isDisabled ? (
					<ActionButton schema={voiceDashboardActionSchema} action="ENABLE">
						Enable voice
					</ActionButton>
				) : (
					<ActionButton
						schema={voiceDashboardActionSchema}
						action="DISABLE"
						variant="destructive"
						confirm={{
							dialogHeading: "Disable voice for everyone?",
							description:
								"Nobody can join a call until it is enabled again. People already in a call stay until they leave.",
							submitButtonText: "Disable",
							submitButtonVariant: "destructive",
						}}
					>
						Disable voice
					</ActionButton>
				)}
			</div>
		</section>
	);
}

function Cost({ cost }: { cost: LoaderData["cost"] }) {
	const usedShare = Math.min(1, cost.monthCostUsd / cost.budgetUsd);

	return (
		<section className="stack sm">
			<h2>Cost this month</h2>
			<dl className={styles.facts}>
				<dt>Participant-minutes</dt>
				<dd>
					{formatNumber(cost.monthMinutes)} ({formatNumber(cost.freeMinutes)}{" "}
					free)
				</dd>
				<dt>Cost so far</dt>
				<dd>{formatUsd(cost.monthCostUsd)}</dd>
				<dt>Projected month end</dt>
				<dd>{formatUsd(cost.projectedCostUsd)}</dd>
				<dt>Budget</dt>
				<dd>{formatUsd(cost.budgetUsd)}, voice turns off once reached</dd>
			</dl>
			<meter
				className={styles.budgetMeter}
				min={0}
				max={1}
				low={0.6}
				high={0.85}
				optimum={0}
				value={usedShare}
				aria-label="Share of the monthly budget used"
			/>
		</section>
	);
}

function LiveRooms({ liveRooms }: { liveRooms: LoaderData["liveRooms"] }) {
	return (
		<section className="stack sm">
			<h2>Live now</h2>
			{liveRooms.length === 0 ? (
				<p className="text-lighter">Nobody is in a voice call.</p>
			) : (
				<table className={styles.table}>
					<thead>
						<tr>
							<th>Room</th>
							<th>Type</th>
							<th>People</th>
						</tr>
					</thead>
					<tbody>
						{liveRooms.map((room) => (
							<tr key={room.roomId}>
								<td>{room.roomId}</td>
								<td>{room.type ?? "?"}</td>
								<td>{room.userIds.length}</td>
							</tr>
						))}
					</tbody>
				</table>
			)}
		</section>
	);
}

function Adoption({ adoption }: { adoption: LoaderData["adoption"] }) {
	const byType = R.groupBy(adoption, (row) => row.type);
	const series = Object.entries(byType).map(([type, rows]) => ({
		label: type,
		points: rows.map((row) => ({
			x: new Date(`${row.day}T00:00:00Z`).getTime(),
			y: Math.round((row.voiceRoomCount / row.roomCount) * 100),
		})),
	}));
	const canChart = series.some((entry) => entry.points.length >= 2);

	return (
		<section className="stack sm">
			<h2>Adoption</h2>
			<p className="text-lighter text-sm">
				Share of new rooms where at least one person connected to voice.
			</p>
			{canChart ? (
				<LineChart
					series={series}
					xAxis={{ type: "date" }}
					formatValue={(value) => `${value}%`}
					interactive
					ariaLabel="Share of rooms with voice per day"
				/>
			) : null}
			<table className={styles.table}>
				<thead>
					<tr>
						<th>Day</th>
						<th>Type</th>
						<th>Rooms</th>
						<th>With voice</th>
					</tr>
				</thead>
				<tbody>
					{adoption.map((row) => (
						<tr key={`${row.day}-${row.type}`}>
							<td>{row.day}</td>
							<td>{row.type}</td>
							<td>{row.roomCount}</td>
							<td>
								{row.voiceRoomCount} (
								{percent(row.voiceRoomCount, row.roomCount)})
							</td>
						</tr>
					))}
				</tbody>
			</table>
		</section>
	);
}

function Platforms({ platforms }: { platforms: LoaderData["platforms"] }) {
	return (
		<section className="stack sm">
			<h2>Join funnel and quality</h2>
			<div className="overflow-x-auto">
				<table className={styles.table}>
					<thead>
						<tr>
							<th>Platform</th>
							<th>Joins</th>
							<th>Connected</th>
							<th>Stayed &gt; 1 min</th>
							<th>Users</th>
							<th>Avg length</th>
							<th>Low quality</th>
							<th>Bad network</th>
							<th>Push-to-talk</th>
						</tr>
					</thead>
					<tbody>
						{platforms.map((row) => (
							<tr key={row.platform}>
								<td>{row.platform}</td>
								<td>{row.joinCount}</td>
								<td>{percent(row.connectedCount, row.joinCount)}</td>
								<td>{percent(row.stayedCount, row.joinCount)}</td>
								<td>{row.uniqueUserCount}</td>
								<td>{formatMinutes(row.averageSeconds)}</td>
								<td>{formatMinutes(row.lowQualitySeconds)}</td>
								<td>{percent(row.badNetworkCount, row.connectedCount)}</td>
								<td>{percent(row.pushToTalkCount, row.connectedCount)}</td>
							</tr>
						))}
					</tbody>
				</table>
			</div>
		</section>
	);
}

function LeaveReasons({
	leaveReasons,
}: {
	leaveReasons: LoaderData["leaveReasons"];
}) {
	const reasons = R.unique(leaveReasons.map((row) => row.leaveReason));
	const countOf = (reason: string | null, platform: string) =>
		leaveReasons.find(
			(row) => row.leaveReason === reason && row.platform === platform,
		)?.count ?? 0;

	return (
		<section className="stack sm">
			<h2>Leave reasons</h2>
			<table className={styles.table}>
				<thead>
					<tr>
						<th>Reason</th>
						{VOICE_PLATFORMS.map((platform) => (
							<th key={platform}>{platform}</th>
						))}
					</tr>
				</thead>
				<tbody>
					{reasons.map((reason) => (
						<tr key={reason}>
							<td>{reason}</td>
							{VOICE_PLATFORMS.map((platform) => (
								<td key={platform}>{countOf(reason, platform)}</td>
							))}
						</tr>
					))}
				</tbody>
			</table>
		</section>
	);
}

function Errors({
	errorCounts,
	latestErrors,
}: {
	errorCounts: LoaderData["errorCounts"];
	latestErrors: LoaderData["latestErrors"];
}) {
	return (
		<section className="stack sm">
			<h2>Client errors</h2>
			<table className={styles.table}>
				<thead>
					<tr>
						<th>Kind</th>
						<th>Platform</th>
						<th>Count</th>
					</tr>
				</thead>
				<tbody>
					{errorCounts.map((row) => (
						<tr key={`${row.kind}-${row.platform}`}>
							<td>{row.kind}</td>
							<td>{row.platform}</td>
							<td>{row.count}</td>
						</tr>
					))}
				</tbody>
			</table>
			<h3>Latest</h3>
			<ul className="stack sm">
				{latestErrors.map((error) => (
					<li key={error.id} className={styles.listRow}>
						<UserLink user={error.user} />
						<span>
							{error.kind} · {error.platform}
						</span>
						<span className="text-lighter text-xs">
							<LocaleTime
								date={error.createdAt}
								inline
								options={{
									month: "numeric",
									day: "numeric",
									hour: "numeric",
									minute: "numeric",
								}}
							/>
						</span>
						{error.detail ? (
							<span className="text-lighter text-xs">{error.detail}</span>
						) : null}
					</li>
				))}
			</ul>
		</section>
	);
}

function Feedback({
	ratings,
	feedbackComments,
}: {
	ratings: LoaderData["ratings"];
	feedbackComments: LoaderData["feedbackComments"];
}) {
	const total = R.sumBy(ratings, (row) => row.count);
	const average =
		total === 0
			? null
			: R.sumBy(ratings, (row) => row.rating * row.count) / total;

	return (
		<section className="stack sm">
			<h2>Feedback</h2>
			<p>
				{total} answers
				{average === null ? null : `, average ${average.toFixed(2)} / 5`}
			</p>
			<table className={styles.table}>
				<thead>
					<tr>
						<th>Rating</th>
						<th>Answers</th>
					</tr>
				</thead>
				<tbody>
					{ratings.map((row) => (
						<tr key={row.rating}>
							<td>{row.rating}</td>
							<td>{row.count}</td>
						</tr>
					))}
				</tbody>
			</table>
			<h3>Latest comments</h3>
			<ul className="stack sm">
				{feedbackComments.map((feedback) => (
					<li key={feedback.id} className="stack xs">
						<div className={styles.listRow}>
							<UserLink user={feedback.user} />
							<span>
								{feedback.rating} / 5 · {feedback.roomType} ·{" "}
								{feedback.platform}
							</span>
						</div>
						<p className="whitespace-pre-wrap">{feedback.comment}</p>
					</li>
				))}
			</ul>
		</section>
	);
}

function percent(count: number, total: number) {
	if (total === 0) return "-";

	return `${Math.round((count / total) * 100)}%`;
}

function formatMinutes(seconds: number | null) {
	if (seconds === null) return "-";

	return `${(seconds / 60).toFixed(1)} min`;
}

function formatNumber(value: number) {
	return String(Math.round(value));
}

function formatUsd(value: number) {
	return `$${value.toFixed(2)}`;
}
