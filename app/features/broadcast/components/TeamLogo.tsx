import clsx from "clsx";
import type * as React from "react";
import type { BroadcastTeam } from "../broadcast-types";
import { combineStyles } from "../broadcast-utils";
import layout from "./TeamLogo.layout.module.css";
import look from "./TeamLogo.module.css";

const styles = combineStyles(look, layout);

/**
 * The team's logo, or for a team without one its initial on the color of its side, or off a side on a color of
 * its own picked from its name.
 */
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
			style={
				team
					? ({ "--monogram-hue": hueOf(team.name) } as React.CSSProperties)
					: undefined
			}
			data-part={dataPart}
		>
			<span>{team ? Array.from(team.name.trim())[0]?.toUpperCase() : "?"}</span>
		</div>
	);
}

function hueOf(name: string) {
	let hash = 0;
	for (const char of name) {
		hash = (hash * 31 + char.codePointAt(0)!) % 360;
	}

	return hash;
}
