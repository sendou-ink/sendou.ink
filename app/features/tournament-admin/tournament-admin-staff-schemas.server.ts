import * as R from "remeda";
import * as v from "valibot";
import type { CastAccount } from "~/db/tables-json";
import * as LiveStream from "~/features/live-streams/core/LiveStream";
import { resolveCastAccount } from "~/features/live-streams/core/resolve-cast-account.server";
import * as StreamAccountInput from "~/features/live-streams/core/StreamAccountInput";
import { superTransformAsync } from "~/utils/schema";
import { adminStreamFormSchema } from "./tournament-admin-staff-schemas";

/** {@link adminStreamFormSchema} with the inputs resolved to unique cast accounts, unknown YouTube channels surfacing as field errors. */
export function adminStreamFormSchemaServer({
	currentCastAccounts,
}: {
	currentCastAccounts: CastAccount[];
}) {
	return v.pipeAsync(
		adminStreamFormSchema,
		superTransformAsync(async (data, ctx) => {
			const resolved = await Promise.all(
				data.castAccounts.map(async (input) => {
					const parsed = StreamAccountInput.parse(input);
					return parsed
						? resolveCastAccount(parsed, currentCastAccounts)
						: null;
				}),
			);

			const castAccounts: CastAccount[] = [];
			for (const [index, castAccount] of resolved.entries()) {
				if (!castAccount) {
					ctx.addIssue({
						message: "forms:errors.youtubeChannelNotFound",
						path: ["castAccounts", index],
					});
					continue;
				}

				castAccounts.push(castAccount);
			}

			return { castAccounts: R.uniqueBy(castAccounts, LiveStream.key) };
		}),
	);
}
