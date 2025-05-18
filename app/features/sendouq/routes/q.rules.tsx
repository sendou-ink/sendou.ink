import type { MetaFunction } from "@remix-run/react";
import { Main } from "~/components/Main";
import { metaTags } from "~/utils/remix";

export const meta: MetaFunction = (args) => {
	return metaTags({
		title: "SendouQ - Rules",
		description: "Rules everyone participating in SendouQ has to follow.",
		location: args.location,
	});
};

export default function SendouqRules() {
	return (
		<Main>
			<h1>SendouQ Rules</h1>
			<h2 className="text-lg">Disconnections</h2>
			<div>
				Each team is allowed one replay per set due to a team member
				disconnecting. Replay is only possible if ALL of the following are true:
				<ol>
					<li>
						More than half was left in the clock (the clock was 2:30 or higher
						at the time of the DC)
					</li>
					<li>
						The team without DC&apos;s objective counter had not reached 30 at
						the time of the disconnect
					</li>
					<li>Team with the disconnection stopped playing without delay</li>
					<li>Disconnection was unintentional</li>
				</ol>
				For the replay same weapons and gear must be used by both teams. The
				team who fails to do so loses the map. If players disconnect from both
				teams a replay can be played without using either team&apos;s one replay
				for the set (or even if there were no replays left to use from either
				team). <br /> <br /> The host disconnecting can be replayed with the
				same conditions as above (in this case the &quot;team with DC&quot; is
				the host&apos;s team). Host disconnecting can never mean that the
				hosting team wins the map off that. Only outcomes are that the map is
				replayed or the team that didn&apos;t host wins the map.
				<br />
				<br /> After the DC replay has been used by the team, further DC&apos;s
				should be played out.
			</div>

			<h2 className="text-lg mt-4">Unallowed weapons</h2>
			<div>
				If someone picks an unallowed weapon game can be canceled within 1
				minute by any player. For the replay everyone has to use the same
				weapons and gear except the player with unallowed weapon who should
				switch to the allowed variant of the weapon. For example had a player
				picked Foil Squeezer they need to play regular Squeezer in the replay.
			</div>

			<h2 className="text-lg mt-4">Subs</h2>
			<div>
				There are no subs. If a player is unavailable to play from either team
				then the set must be played with 3 players or forfeited.
			</div>

			<h2 className="text-lg mt-4">Canceling match</h2>
			<div>
				Match can be canceled if both group owners agree. If the groups
				don&apos;t agree then the match should be played out.
			</div>

			<h2 className="text-lg mt-4">Dodging</h2>
			<div>
				Canceling matches is to be used for special cases only. If used
				excessively for e.g. avoiding to play stronger opponents it can lead to
				a ban or potential Plus Server admissions being skipped for the season.
			</div>

			<h2 className="text-lg mt-4">Room hosting</h2>
			<div>
				By default the player who says the fastest in the match chat that they
				will host should do it. If a host can&apos;t be decided then Alpha
				chooses a player to host from their group.
			</div>

			<h2 className="text-lg mt-4">Alting</h2>
			<div>You can only play with one account.</div>

			<h2 className="text-lg mt-4">Player eligibility</h2>
			<div>
				Players banned by{" "}
				<a href="https://bsky.app/profile/splatsafety.bsky.social">
					Splatoon Competitive Community Safety
				</a>{" "}
				are not allowed to participate. Playing with banned players is not
				allowed.
			</div>

			<h2 className="text-lg mt-4">Time limits</h2>
			<div>
				After a team has all their members in the lobby then the other team has{" "}
				<b>10 minutes</b> to join the lobby. Failing to do so, the match can be
				started with the members currently in the room. If a player has problems
				connecting to the room it is advised to try switching the host.
			</div>

			<h2 className="text-lg mt-4">Spectators</h2>
			<div>There can be spectators if both teams agree to it.</div>

			<h2 className="text-lg mt-4">Intentional losing</h2>
			<div>
				Players are not allowed to intentionally lose a match. This includes
				(but is not limited to) tanking your own rank on purpose or boosting
				another player&apos;s/team&apos;s ranking.
			</div>

			<h2 className="text-lg mt-4">Unsportsmanlike conduct</h2>
			<div>
				It&apos;s not allowed to spawncamp the enemy without pushing the
				objective provided it can&apos;t be considered a viable strategy taking
				in account the game situation.
			</div>

			<h2 className="text-lg mt-4">Discriminatory language</h2>
			<div>
				Any kind of discriminatory language such as using slurs is strictly not
				allowed. This rule applies everywhere in SendouQ including (but not
				limited to) text chats, voice chats & in-game names.
			</div>

			<h2 className="text-lg mt-4">Repercussions</h2>
			<div>
				Players found breaking the rules can lose access to SendouQ and other
				sendou.ink features such as tournaments and the Plus Server.
			</div>
		</Main>
	);
}
