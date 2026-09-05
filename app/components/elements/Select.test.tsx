import { renderToString } from "react-dom/server";
import { describe, expect, test } from "vitest";
import {
	SendouSelect,
	SendouSelectItem,
	SendouSelectItemSection,
} from "./Select";

const SEASONS = [
	{ id: 2, name: "Season 2" },
	{ id: 1, name: "Season 1" },
];

function SeasonItem({ season }: { season: (typeof SEASONS)[number] }) {
	return <SendouSelectItem id={season.id}>{season.name}</SendouSelectItem>;
}

describe("SendouSelect", () => {
	test("server renders the selected item's content in the trigger", () => {
		const html = renderToString(
			<SendouSelect
				label="Season"
				items={SEASONS}
				selectedKey={1}
				placeholder="Pick a season"
			>
				{(season) => (
					<SendouSelectItem key={season.id} id={season.id}>
						{season.name}
					</SendouSelectItem>
				)}
			</SendouSelect>,
		);

		expect(html).toContain("Season 1");
		expect(html).not.toContain("data-placeholder");
		expect(html).not.toContain("Pick a season");
	});

	test("server renders the selection rendered through a wrapper component keyed by its id", () => {
		const html = renderToString(
			<SendouSelect label="Season" selectedKey={1} placeholder="Pick a season">
				{SEASONS.map((season) => (
					<SeasonItem key={season.id} season={season} />
				))}
			</SendouSelect>,
		);

		expect(html).toContain("Season 1");
		expect(html).not.toContain("Pick a season");
	});

	test("server renders the placeholder and no options without a selection", () => {
		const html = renderToString(
			<SendouSelect label="Season" items={SEASONS} placeholder="Pick a season">
				{(season) => (
					<SendouSelectItemSection heading="2023" key={season.id}>
						<SendouSelectItem id={season.id}>{season.name}</SendouSelectItem>
					</SendouSelectItemSection>
				)}
			</SendouSelect>,
		);

		expect(html).toContain("Pick a season");
		expect(html).not.toContain('role="option"');
		expect(html).not.toContain('role="group"');
	});
});
