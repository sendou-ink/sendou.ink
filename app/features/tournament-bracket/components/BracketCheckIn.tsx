import { sub } from "date-fns";
import { useTranslation } from "react-i18next";
import { ActionButton } from "~/components/ActionButton";
import { LocaleTimeRange } from "~/components/LocaleTimeRange";
import { useUser } from "~/features/auth/core/user";
import { useTournament } from "~/features/tournament/tournament-context";
import { bracketSchema } from "~/features/tournament-bracket/tournament-bracket-schemas";
import styles from "./BracketCheckIn.module.css";

/** Prompts the viewer's team to check in to a follow-up bracket; other progress states live in the header status indicator. */
export function BracketCheckIn({ bracketIdx }: { bracketIdx: number }) {
	const { t } = useTranslation(["tournament"]);
	const tournament = useTournament();
	const user = useUser();

	const bracket = tournament.bracketMetaByIdx(bracketIdx);
	if (!bracket) return null;

	return (
		<div className={styles.checkIn} data-testid="bracket-check-in">
			{t("tournament:bracket.checkIn.title", { bracket: bracket.name })}
			{tournament.canCheckInToBracket(bracket.idx, user) ? (
				<ActionButton
					schema={bracketSchema}
					action="BRACKET_CHECK_IN"
					fields={{ bracketIdx: bracket.idx }}
					size="small"
					variant="minimal"
					testId="check-in-bracket-button"
				>
					{t("tournament:pre.checkIn.button")}
				</ActionButton>
			) : bracket.startTime && bracket.startTime > new Date() ? (
				<span className="text-lighter text-xxs">
					{t("tournament:bracket.checkIn.opens")}{" "}
					<LocaleTimeRange
						from={sub(bracket.startTime, { hours: 1 })}
						to={bracket.startTime}
						options={{
							hour: "numeric",
							minute: "numeric",
							weekday: "short",
						}}
						inline
					/>
				</span>
			) : bracket.startTime && bracket.startTime < new Date() ? (
				<span className="text-warning">
					{t("tournament:bracket.checkIn.over")}
				</span>
			) : null}
		</div>
	);
}
