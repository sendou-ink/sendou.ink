/**
 * `⇩ CSV` in a session header: `Matches` (one row per game, the rows the
 * cards render) or `Raw detections` (one row per event), for this session
 * or file. Settings has the same two shapes over everything.
 */
import { Download, FileText, ListTree } from "lucide-react";
import { SendouButton } from "~/components/elements/Button";
import { SendouMenu, SendouMenuItem } from "~/components/elements/Menu";
import { eventsToCsv } from "../core/csv/events";
import { type MatchCsvSource, matchesToCsv } from "../core/csv/matches";
import type { BuiltMatch } from "../core/match-builder";
import { downloadCsv } from "./download";
import type { ScanEvent } from "./session-data";

export function ExportMenu({
	built,
	events,
	source,
	clipCounts,
	fileBase,
}: {
	/** chronological */
	built: readonly BuiltMatch<ScanEvent>[];
	events: readonly ScanEvent[];
	source: MatchCsvSource;
	clipCounts: readonly number[];
	/** `scanner-matches-2026-09-16` / `sws26-finals` — the download's stem */
	fileBase: string;
}) {
	return (
		<SendouMenu
			trigger={
				<SendouButton
					variant="minimal"
					size="small"
					icon={<Download />}
					isDisabled={events.length === 0}
				>
					CSV
				</SendouButton>
			}
			placement="bottom end"
		>
			<SendouMenuItem
				icon={<FileText />}
				onAction={() =>
					downloadCsv(
						`${fileBase}-matches.csv`,
						matchesToCsv(
							built.map((b) => b.match),
							source,
							clipCounts,
						),
					)
				}
			>
				Matches
			</SendouMenuItem>
			<SendouMenuItem
				icon={<ListTree />}
				onAction={() =>
					downloadCsv(
						`${fileBase}-events.csv`,
						eventsToCsv(
							events.toSorted((a, b) => a.t - b.t),
							source.originT,
						),
					)
				}
			>
				Raw detections
			</SendouMenuItem>
		</SendouMenu>
	);
}
