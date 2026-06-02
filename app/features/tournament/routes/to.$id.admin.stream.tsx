import * as React from "react";
import { useFetcher } from "react-router";
import { FormMessage } from "~/components/FormMessage";
import { Label } from "~/components/Label";
import { SubmitButton } from "~/components/SubmitButton";
import { useTournament } from "./to.$id";

export { action } from "../actions/to.$id.admin.stream.server";

export default function TournamentAdminStreamPage() {
	const id = React.useId();
	const fetcher = useFetcher();
	const tournament = useTournament();

	return (
		<fetcher.Form method="post" className="stack sm">
			<div className="stack horizontal sm items-end">
				<div className="flex-same-size">
					<Label htmlFor={id}>Twitch accounts</Label>
					<input
						id={id}
						placeholder="dappleproductions"
						name="castTwitchAccounts"
						defaultValue={tournament.ctx.castTwitchAccounts?.join(",")}
					/>
				</div>
				<SubmitButton
					testId="save-cast-twitch-accounts-button"
					state={fetcher.state}
					_action="UPDATE_CAST_TWITCH_ACCOUNTS"
				>
					Save
				</SubmitButton>
			</div>
			<FormMessage type="info">
				Twitch account where the tournament is casted. Player streams are added
				automatically based on their profile data. You can also enter multiple
				accounts, just separate them with a comma e.g.
				&quot;sendouc,leanny&quot;
			</FormMessage>
		</fetcher.Form>
	);
}
