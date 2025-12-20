import { Link } from "@remix-run/react";
import { useTranslation } from "react-i18next";
import { BadgeDisplay } from "~/features/badges/components/BadgeDisplay";
import type { SerializeFrom } from "~/utils/remix";
import { assertUnreachable } from "~/utils/types";
import { teamPage, tournamentOrganizationPage } from "~/utils/urls";
import type { LoadedWidget } from "../core/widgets/types";
import styles from "./Widget.module.css";

export function Widget({ widget }: { widget: SerializeFrom<LoadedWidget> }) {
	const { t } = useTranslation(["user", "badges", "team", "org"]);

	const content = () => {
		switch (widget.id) {
			case "bio":
				return widget.data ? <article>{widget.data}</article> : null;
			case "badges-owned":
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
					<PeakValue
						value={widget.data.peakSp}
						unit="SP"
						footer={`${widget.data.tierName}${widget.data.isPlus ? "+" : ""} / ${t("user:seasons.season.short")}${widget.data.season}`}
					/>
				);
			case "peak-xp":
				if (!widget.data) return null;
				return (
					<PeakValue
						value={widget.data.peakXp}
						unit="XP"
						footer={`${widget.data.division}${widget.data.topRating ? ` / #${widget.data.topRating}` : ""}`}
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

function PeakValue({
	value,
	unit,
	footer,
}: {
	value: number;
	unit: string;
	footer: string;
}) {
	return (
		<div className={styles.peakValue}>
			<div className={styles.peakValueMain}>
				{value} {unit}
			</div>
			<div className={styles.peakValueFooter}>{footer}</div>
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
