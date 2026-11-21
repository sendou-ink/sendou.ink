import { describe, expect, test } from "vitest";
import * as PlanDocument from "./core/PlanDocument";
import * as PlanEncoding from "./core/PlanEncoding";
import { plansSearchParams } from "./plans-search-params";
import { planLinkPath } from "./plans-urls";
import { typicalPlan } from "./tests/fixtures";

describe("planLinkPath", () => {
	test("links to the planner with the plan in it", () => {
		const path = planLinkPath(typicalPlan());

		const params = plansSearchParams.parse(
			new URL(path!, "https://sendou.ink"),
		);
		expect(PlanEncoding.fromUrlParam(params.plan!)).toEqual({
			ok: true,
			document: typicalPlan(),
		});
	});

	test("is null for a plan too big for a link", () => {
		const plan = PlanDocument.empty({ stageId: 0, mode: "SZ" });
		let seed = 1;
		const random = () => {
			seed = (seed * 16807) % 2147483647;
			return seed % 1000;
		};
		plan.drawings = Array.from({ length: 200 }, (_, index) => ({
			id: `stroke${index}`,
			type: "stroke",
			color: "#ffffff",
			size: "M",
			points: Array.from(
				{ length: 30 },
				(): PlanDocument.Point => [random(), random()],
			),
		}));

		expect(planLinkPath(plan)).toBeNull();
	});
});
