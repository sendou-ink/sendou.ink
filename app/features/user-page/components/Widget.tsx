import { Link } from "@remix-run/react";
import { useTranslation } from "react-i18next";
import { Placement } from "~/components/Placement";
import { BadgeDisplay } from "~/features/badges/components/BadgeDisplay";
import { useTimeFormat } from "~/hooks/useTimeFormat";
import { databaseTimestampToDate } from "~/utils/dates";
import type { SerializeFrom } from "~/utils/remix";
import { assertUnreachable } from "~/utils/types";
import {
	calendarEventPage,
	teamPage,
	tournamentBracketsPage,
	tournamentOrganizationPage,
} from "~/utils/urls";
import type { LoadedWidget } from "../core/widgets/types";
import styles from "./Widget.module.css";

export function Widget({ widget }: { widget: SerializeFrom<LoadedWidget> }) {
	const { t } = useTranslation(["user", "badges", "team", "org"]);
	const { formatDate } = useTimeFormat();

	const content = () => {
		switch (widget.id) {
			case "bio":
				return widget.data ? <article>{widget.data}</article> : null;
			case "badges-owned":
				return <BadgeDisplay badges={widget.data} />;
			case "badges-authored":
				return <BadgeDisplay badges={widget.data} />;
			case "teams":
				return (
					<Memberships
						memberships={widget.data.map((team) => ({
							id: team.id,
							url: teamPage(team.customUrl),
							name: team.name,
							logoUrl: team.logoUrl,
							roleDisplayName: team.role ? t(`team:roles.${team.role}`) : null,
						}))}
					/>
				);
			case "organizations":
				return (
					<Memberships
						memberships={widget.data.map((org) => ({
							id: org.id,
							url: tournamentOrganizationPage({
								organizationSlug: org.slug,
							}),
							name: org.name,
							logoUrl: org.logoUrl,
							roleDisplayName:
								org.roleDisplayName ?? t(`org:roles.${org.role}`),
						}))}
					/>
				);
			case "peak-sp":
				if (!widget.data) return null;
				return (
					<BigValue
						value={widget.data.peakSp}
						unit="SP"
						footer={`${widget.data.tierName}${widget.data.isPlus ? "+" : ""} / ${t("user:seasons.season.short")}${widget.data.season}`}
					/>
				);
			case "peak-xp":
				if (!widget.data) return null;
				return (
					<BigValue
						value={widget.data.peakXp}
						unit="XP"
						footer={`${widget.data.division}${widget.data.topRating ? ` / #${widget.data.topRating}` : ""}`}
					/>
				);
			case "highlighted-results":
				return widget.data.length === 0 ? null : (
					<HighlightedResults results={widget.data} />
				);
			case "patron-since":
				if (!widget.data) return null;
				return (
					<BigValue
						value={formatDate(databaseTimestampToDate(widget.data), {
							day: "numeric",
							month: "short",
							year: "numeric",
						})}
					/>
				);
			default:
				assertUnreachable(widget);
		}
	};

	return (
		<div className={styles.widget}>
			<h2 className={styles.header}>{t(`user:widget.${widget.id}`)}</h2>
			<div className={styles.content}>{content()}</div>
		</div>
	);
}

function BigValue({
	value,
	unit,
	footer,
}: {
	value: number | string;
	unit?: string;
	footer?: string;
}) {
	return (
		<div className={styles.peakValue}>
			<div className={styles.peakValueMain}>
				{value} {unit ? unit : null}
			</div>
			{footer ? <div className={styles.peakValueFooter}>{footer}</div> : null}
		</div>
	);
}

function Memberships({
	memberships,
}: {
	memberships: Array<{
		id: number;
		url: string;
		name: string;
		logoUrl: string | null;
		roleDisplayName: string | null;
	}>;
}) {
	return (
		<div className={styles.memberships}>
			{memberships.map((membership) => (
				<Link
					key={membership.id}
					to={membership.url}
					className={styles.membership}
				>
					{membership.logoUrl ? (
						<img
							alt=""
							src={membership.logoUrl}
							width={42}
							height={42}
							className="rounded-full"
						/>
					) : null}
					<div className={styles.membershipInfo}>
						<div className={styles.membershipName}>{membership.name}</div>
						{membership.roleDisplayName ? (
							<div className={styles.membershipRole}>
								{membership.roleDisplayName}
							</div>
						) : null}
					</div>
				</Link>
			))}
		</div>
	);
}

function HighlightedResults({
	results,
}: {
	results: Array<{
		eventId?: number;
		tournamentId?: number;
		placement: number;
		eventName: string;
		logoUrl: string | null;
		startTime: number;
	}>;
}) {
	const { formatDate } = useTimeFormat();

	return (
		<div className={styles.highlightedResults}>
			{results.map((result, i) => (
				<div key={i} className={styles.result}>
					<div className={styles.resultPlacement}>
						<Placement placement={result.placement} size={28} />
					</div>
					<div className={styles.resultInfo}>
						<div className={styles.resultName}>
							{result.eventId ? (
								<Link
									to={calendarEventPage(result.eventId)}
									className="text-main-forced"
								>
									{result.eventName}
								</Link>
							) : null}
							{result.tournamentId ? (
								<div className={styles.tournamentName}>
									{result.logoUrl ? (
										<img
											src={result.logoUrl}
											alt=""
											width={18}
											height={18}
											className="rounded-full"
										/>
									) : null}
									<Link
										to={tournamentBracketsPage({
											tournamentId: result.tournamentId,
										})}
										className="text-main-forced"
									>
										{result.eventName}
									</Link>
								</div>
							) : null}
						</div>
						<div className={styles.resultDate}>
							{formatDate(databaseTimestampToDate(result.startTime), {
								day: "numeric",
								month: "short",
								year: "numeric",
							})}
						</div>
					</div>
				</div>
			))}
		</div>
	);
}
