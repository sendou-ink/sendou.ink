import clsx from "clsx";
import type { BroadcastTeam } from "../broadcast-types";
import styles from "./TeamLogo.module.css";

/** The team's logo, or its initial on the team's color for a team without one. */
export function TeamLogo({
	team,
	className,
	"data-part": dataPart,
}: {
	team: Pick<BroadcastTeam, "name" | "logoUrl"> | null;
	className?: string;
	"data-part"?: string;
}) {
	if (team?.logoUrl) {
		return (
			<img
				className={clsx(styles.logo, className)}
				src={team.logoUrl}
				alt=""
				data-part={dataPart}
			/>
		);
	}

	return (
		<div
			className={clsx(styles.logo, styles.monogram, className)}
			data-part={dataPart}
		>
			<span>{team ? Array.from(team.name.trim())[0]?.toUpperCase() : "?"}</span>
		</div>
	);
}
