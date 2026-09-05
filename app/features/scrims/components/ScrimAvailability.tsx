import { useTranslation } from "react-i18next";
import { useLoaderData } from "react-router";
import { SendouButton } from "~/components/elements/Button";
import { SendouPopover } from "~/components/elements/Popover";
import {
	AvailabilityMemberRow,
	type AvailabilityPanelUser,
	AvailabilityStatusDots,
	AvailabilitySummary,
	AvailabilityWindowText,
	availabilityRowStatus,
} from "~/features/availability/components/RegistrationAvailabilityPanel";
import * as Scrim from "../core/Scrim";
import type { loader as scrimsLoader } from "../loaders/scrims.server";
import type { ScrimPost } from "../scrims-types";
import { requestStarts } from "../scrims-utils";
import styles from "./ScrimAvailability.module.css";

export interface ScrimRosterFit {
	team: { id: number; name: string };
	roster: Array<AvailabilityPanelUser>;
	fit: Scrim.RosterFit;
}

/**
 * How one of the viewer's teams (`teamId`, main by default) fits a post, from the schedules the
 * page loaded; `at` narrows the fit to one start instead of the best on offer. Null when there
 * is nothing to show: no team, a post past the reportable horizon, or a week nobody filled in.
 */
export function useRosterFit({
	post,
	teamId,
	at,
}: {
	post: ScrimPost;
	teamId?: number;
	at?: number | null;
}): ScrimRosterFit | null {
	const data = useLoaderData<typeof scrimsLoader>();

	const team =
		teamId !== undefined
			? data.teams.find((team) => team.id === teamId)
			: (data.teams.find((team) => team.isMainTeam) ?? data.teams[0]);
	const schedules = data.availability.windows.find(
		(window) => window.id === post.id,
	);
	if (!team || !schedules) return null;

	const roster = Scrim.teamPlayers(team.members);
	const fit = Scrim.rosterFit({
		starts: at ? [at] : requestStarts({ post, now: data.availability.now }),
		members: roster.flatMap((member) => {
			const schedule = schedules.members.find(
				(schedule) => schedule.userId === member.id,
			);

			return schedule ? [schedule] : [];
		}),
	});
	if (!fit) return null;

	return { team, roster, fit };
}

/** The post card's fit stripe: how much of the viewer's roster could play it, details a click away. Left out when none could — a row of zeroes down the page is noise. */
export function ScrimFitStripe({ post }: { post: ScrimPost }) {
	const { t } = useTranslation(["schedule"]);
	const fit = useRosterFit({ post });

	if (!fit || fit.fit.availableCount === 0) return null;

	return (
		<SendouPopover
			trigger={
				<SendouButton
					variant="minimal"
					className={styles.stripe}
					testId="scrim-fit-indicator"
				>
					<span className={styles.stripeTeam}>{fit.team.name}</span>
					<AvailabilityStatusDots statuses={rosterStatuses(fit)} />
					<span className={styles.stripeCount}>
						{t("schedule:scrims.availableOfRoster", {
							amount: fit.fit.availableCount,
							total: fit.roster.length,
						})}
					</span>
				</SendouButton>
			}
		>
			<div className={styles.popover}>
				<AvailabilityWindowText window={fit.fit.window} />
				<ScrimAvailabilityRows fit={fit} />
			</div>
		</SendouPopover>
	);
}

/** The roster's members and how each of them relates to the scrim being requested. */
export function ScrimAvailabilityRows({ fit }: { fit: ScrimRosterFit }) {
	const entryByUserId = new Map(
		fit.fit.entries.map((entry) => [entry.userId, entry]),
	);

	return (
		<div className={styles.rowsSection}>
			<ul className={styles.rows}>
				{fit.roster.map((member) => (
					<AvailabilityMemberRow
						key={member.id}
						user={member}
						entry={entryByUserId.get(member.id)}
					/>
				))}
			</ul>
			<AvailabilitySummary
				statuses={fit.roster.map((member) =>
					availabilityRowStatus(entryByUserId.get(member.id)),
				)}
			/>
		</div>
	);
}

/** How each of the roster relates to the scrim, in roster order. */
function rosterStatuses(fit: ScrimRosterFit) {
	const entryByUserId = new Map(
		fit.fit.entries.map((entry) => [entry.userId, entry]),
	);

	return fit.roster.map((member) =>
		availabilityRowStatus(entryByUserId.get(member.id)),
	);
}
