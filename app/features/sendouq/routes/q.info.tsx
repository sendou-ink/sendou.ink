import { Link } from "@remix-run/react";
import { Main } from "~/components/Main";
import {
	CALENDAR_PAGE,
	FAQ_PAGE,
	SENDOUQ_RULES_PAGE,
	SENDOUQ_SETTINGS_PAGE,
	TIERS_PAGE,
	navIconUrl,
} from "~/utils/urls";
import "../q.css";
import type { MetaFunction } from "@remix-run/node";
import { Button } from "~/components/Button";
import { Image } from "~/components/Image";
import { MATCHES_COUNT_NEEDED_FOR_LEADERBOARD } from "~/features/leaderboards/leaderboards-constants";
import { USER_LEADERBOARD_MIN_ENTRIES_FOR_LEVIATHAN } from "~/features/mmr/mmr-constants";
import { metaTags } from "~/utils/remix";

export const meta: MetaFunction = (args) => {
	return metaTags({
		title: "SendouQ - Info",
		description: "SendouQ guide and information.",
		location: args.location,
	});
};

export default function SendouQInfoPage() {
	return (
		<Main className="q-info__container">
			<TableOfContents />
			<GeneralInfo />
			<BeforeJoining />
			<JoiningTheQueue />
			<FindingAGroup />
			<FindingAnOpponent />
			<PlayingTheMatch />
			<OtherTopics />
		</Main>
	);
}

function TableOfContents() {
	const handleTitleClick = (id: string) => () => {
		const element = document.getElementById(id);
		if (!element) return;

		const pos = element.getBoundingClientRect().top;
		const headerOffset = 45;
		window.scrollTo({
			top: pos + window.scrollY - headerOffset,
			behavior: "smooth",
		});
	};

	return (
		<nav className="q-info__table-of-contents">
			<h2>Table of contents</h2>
			<ul>
				<li>
					<Button onClick={handleTitleClick("general-info")} variant="minimal">
						General info
					</Button>
				</li>

				<li>
					<Button
						onClick={handleTitleClick("before-joining")}
						variant="minimal"
					>
						Before joining
					</Button>
				</li>
				<li>Make a sendou.ink account</li>
				<li>Select your map pool</li>
				<li>Weapon pool</li>
				<li>Voice chat</li>
				<li>Avoiding Splattercolor Screen</li>
				<li>Bio</li>
				<li>Friend code</li>
				<li>Reading rules</li>

				<li>
					<Button
						onClick={handleTitleClick("joining-the-queue")}
						variant="minimal"
					>
						Joining the queue
					</Button>
				</li>
				<li>Joining solo</li>
				<li>Joining with 1-3 mates</li>

				<li>
					<Button
						onClick={handleTitleClick("finding-a-group")}
						variant="minimal"
					>
						Finding a group
					</Button>
				</li>
				<li>Plus Server icons</li>
				<li>Adding a note</li>
				<li>Inactivity</li>
				<li>Group managers</li>

				<li>
					<Button
						onClick={handleTitleClick("finding-an-opponent")}
						variant="minimal"
					>
						Finding an opponent
					</Button>
				</li>
				<li>Rechallenging</li>

				<li>
					<Button
						onClick={handleTitleClick("playing-the-match")}
						variant="minimal"
					>
						Playing the match
					</Button>
				</li>
				<li>Canceling the match</li>
				<li>Enemy not reporting</li>
				<li>Private note</li>
				<li>Joining again with the same group</li>
				<li>Stats</li>

				<li>
					<Button onClick={handleTitleClick("other-topics")} variant="minimal">
						Other topics
					</Button>
				</li>
				<li>Ranking algorithm</li>
				<li>Ranking tiers</li>
				<li>Rank history</li>
				<li>Team ranking</li>
				<li>Ranked tournaments</li>
				<li>SendouQ Season Finale</li>
				<li>Off-season</li>
			</ul>
		</nav>
	);
}

function GeneralInfo() {
	return (
		<section>
			<h2 id="general-info">General info</h2>
			<p>
				SendouQ is a community made matchmaking system. It features leaderboards
				and a season system. Everyone is free to join no matter if they are new
				to competitive Splatoon or a top level player. The system aims to
				connect people with similar skill levels with each other. It&apos;s
				different from what the game offers (Anarchy Battle, X Rank etc.) in
				that the sets are best out of 7 and you choose your teammates.
			</p>
		</section>
	);
}

function BeforeJoining() {
	return (
		<section>
			<h2 id="before-joining">Before joining</h2>
			<h3>Make a sendou.ink account</h3>
			<p>
				Click “log in” on the front page (mobile) or top right (desktop). Agree
				to connecting your Discord account, you will be redirected and the
				account is made.
			</p>
			<h3>Select your map pool</h3>
			<p>
				Optional - if you don&apos;t have a preference then skip this step and
				other players in the lobby get to choose. On the{" "}
				<Link to={SENDOUQ_SETTINGS_PAGE}>settings page</Link> first select your
				preference of each of the five modes. Avoid means you&apos;d rather not
				play the mode. Neutral means you don&apos;t have strong feelings either
				way. Prefer means you like this mode over neutral modes. These choices
				later affect what modes you will be playing. In SendouQ you might play a
				set with SZ/TC/RM/CB or only TC or TC/RM or any other combination. It
				all depends on what players in that match have chosen.
			</p>
			<p>
				For each mode that you didn&apos;t avoid also choose 7 maps. Again the
				choices you make are in part deciding what map lists you will be playing
				on. You can&apos;t choose maps that are excluded from the map pool for
				the season (banned). Banned maps are typically those with least
				likelihood to appear in tournaments or generally have been very rarely
				picked based on the data of previous seasons.
			</p>
			<p>
				Finally hit save to save your preference (also do this for each step
				below).
			</p>
			<h3>Weapon pool</h3>
			<p>
				Choose up to 4 weapons that you will be playing. Don&apos;t skip this
				step as it&apos;s important for team building reasons.
			</p>
			<h3>Voice chat</h3>
			<p>
				Select whether you can voice chat, listen only or neither. Also select
				the languages you speak. Again this is an important step so don&apos;t
				skip this one. Note if you select that you can voice chat it&apos;s
				expected that you will join the voice chat when asked.
			</p>
			<h3>Avoiding Splattercolor Screen</h3>
			<p>
				You can select to avoid Splattercolor Screen. This option exists for
				accessibility reasons. Toggling this option means screen will be banned
				in all sets you play. But also note that groups challenging your group
				will see that screen would be banned in your set so it&apos;s not
				advised to select this option unnecessarily.
			</p>
			<h3>Bio</h3>
			<p>
				On your user profile page put a short description to your bio about your
				previous competitive experience etc. information you think would be
				useful for team building purposes.
			</p>
			<h3>Friend code</h3>
			<p>
				On the SendouQ front page enter your friend code. It&apos;s your
				responsibility to make sure it matches the account you will be playing
				on. Anything else will be considered alting by default which is against
				the rules. If you need to change friend code after setting it use the
				helpdesk on our Discord server.
			</p>
			<h3>Reading rules</h3>
			<p>
				Read the <Link to={SENDOUQ_RULES_PAGE}>rules</Link>. You agree to follow
				them when you play SendouQ.
			</p>
		</section>
	);
}

function JoiningTheQueue() {
	return (
		<section>
			<h2 id="joining-the-queue">Joining the queue</h2>
			<h3>Joining solo</h3> <p>Click “Join solo” on the SendouQ front page.</p>
			<h3>Joining with 1-3 mates</h3>
			<p>
				Click “Join with mates” on the SendouQ front page. On the following page
				share the invite link with your mates. You can also “Quick add” mates if
				they are in the same sendou.ink team or they played with you before and
				selected the option to let you do this.
			</p>
			<p>Click “Join the queue” after your mates have joined.</p>
		</section>
	);
}

function FindingAGroup() {
	return (
		<section>
			<h2 id="finding-a-group">Finding a group</h2>
			<p>
				<p>
					If you didn&apos;t join with a full group of 4 next you will join a
					screen where the aim is to get a full group. You do this by getting
					other people join your group or merging with other groups. Click the
					“Invite” button for any group you would like to group up with
					considering the weapons, skill level and other factors. There is no
					downside in sending more invites so it&apos;s not advised to only send
					one invite at a time and waiting for them to accept but keep sending
					new invites till you find a match.
				</p>
				<p>
					Naturally other groups can also invite you in which case it&apos;s up
					to you to decide whether to accept or not. There is no explicit
					decline invite feature so if you don&apos;t want to group up then just
					don&apos;t click the “Group up” button.
				</p>
				<p>Repeat this grouping up process till you have a full group of 4.</p>
			</p>
			<h3>Plus Server icons</h3>
			<p>
				<Image alt="" path={navIconUrl("plus")} size={24} />
				<p>
					Icon above means that the player is a member of the Plus Server. See{" "}
					<Link to={FAQ_PAGE}>FAQ</Link> for more info.
				</p>
			</p>
			<h3>Adding a note</h3>
			<p>
				You can add a public note if you want to communicate something to other
				groups that might influence grouping up somehow. E.g. message that you
				will be streaming the set with VC so people who don&apos;t want to
				appear on stream can avoid your group.
			</p>
			<h3>Inactivity</h3>
			<p>
				If you don&apos;t do any actions for 30 minutes your group will be
				marked inactive and hidden. Click the prompt that you are still looking
				to be visible again.
			</p>
			<h3>Group managers</h3>
			<p>
				Only the group owner or manager can send invites. When groups merge then
				the previous owner and manager will have it in the new group as well.
				Group owner can give the manager role by clicking the star icon and
				selecting &quot;Give manager&quot;.
			</p>
		</section>
	);
}

function FindingAnOpponent() {
	return (
		<section>
			<h2 id="finding-an-opponent">Finding an opponent</h2>
			<p>
				Like with finding a group you will get presented a list of groups you
				can challenge. Typically choosing a group with similar skill level might
				result in the best match but you are free to challenge group of any
				level (and they are free to not accept). You will also see the modes the
				set would have before deciding on challenging/accepting.
			</p>
			<h3>Rechallenging</h3>
			<p>
				Sometimes it can take a while for a group to accept your challenge. If
				you don&apos;t have a strong preference about modes you might consider
				&quot;Rechallenging&quot; the team on their mode preferences. In some
				cases it might help you get into a match faster.
			</p>
		</section>
	);
}

function PlayingTheMatch() {
	return (
		<section>
			<h2 id="playing-the-match">Playing the match</h2>
			<p>
				When you have a match it&apos;s time to join the room. The person who
				first volunteers in the match chat will host the room. Use the pool and
				password provided. As host remember to use the Y button (letter icon) to
				send invites periodically as if people joined the pool after you by
				default they don&apos;t see the room. As a player joining the room the
				room will appear in the &quot;letter tab&quot;. Press X to refresh the
				view and if you are not seeing it then ask the host to send you an
				invite.
			</p>
			<p>
				Then just play matches till either team has reached 4 wins and report
				the score. Your SP will be adjusted after both teams report the score.
			</p>
			<h3>Canceling the match</h3>
			<p>
				Match can be canceled if both teams agree to (read the rules). Click the
				cancel button to request canceling the match. If the other team agrees
				then they can also click it to confirm and lock the match.
			</p>
			<h3>Enemy not reporting</h3>
			<p>
				As the first measure contact the opponent and politely remind them to.
				If that is not working then come to the helpdesk channel on our Discord
				to get help from admin.
			</p>
			<h3>Private note</h3>
			<p>
				After the set you can leave private notes about your teammates. If you
				had good experience with someone why not leave a positive reminder so
				you remember to group up with them in future as well? Likewise if you
				did not have such a good time playing with someone you can leave a
				negative note. The sentiment affects their sorting in the group up
				phase. Clicking their avatar in the group up phase will show what you
				wrote about them.
			</p>
			<h3>Joining again with the same group</h3>
			<p>
				As a group owner you can use the &quot;Look again with same group&quot;
				to instantly join the queue with the same roster. Note that this button
				should only be used if you checked with all your mates that they can
				still play another set.
			</p>
			<h3>Stats</h3>
			<p>
				While reporting the score you can also report weapons. You can view
				statistics on your user profile. You can for example see your win rate
				with different weapons on each stage by clicking its row on the
				&quot;Stages&quot; tab or view your winrates with different mates on the
				&quot;Teammates&quot; tab.
			</p>
		</section>
	);
}

function OtherTopics() {
	return (
		<section>
			<h2 id="other-topics">Other topics</h2>
			<h3>Ranking algorithm</h3>
			<p>
				The ranking algorithm used is called OpenSkill. Most common question
				people have is how is it possible that their higher ranked mate loses
				less points than they do. This is possible because of “confidence
				rating” which is an internal value that goes down when you perform as
				the algorithm expects you to perform and goes up when it&apos;s the
				opposite.
			</p>
			<p>
				Only the whole set&apos;s result matters so points gained/lost are the
				same whether the set ends 4-3 or 4-0.
			</p>
			<h3>Ranking tiers</h3>
			<p>
				<Link to={TIERS_PAGE}>
					View full list of tiers and current SP criteria
				</Link>
			</p>
			<p>
				You will see your ranking tier for the season after completing{" "}
				{MATCHES_COUNT_NEEDED_FOR_LEADERBOARD} sets (calculation).
			</p>
			<p>
				Unlike most other games in SendouQ ranking tiers are strictly based on
				percentage. This means that e.g. Leviathan is always the top 5% of the
				players. This also means that your ranking tier might go up or down
				without playing when other players&apos; rankings change.
			</p>
			<p>
				There is also a tier recalculation in the first week of the season that
				can change your ranking tier significantly. When there are less than{" "}
				{USER_LEADERBOARD_MIN_ENTRIES_FOR_LEVIATHAN} entries on the leaderboard
				tiers are calculated based on everyone&apos;s powers. After crossing
				that threshold tiers switch being calculated based on players on the
				leaderboard only.
			</p>
			<h3>Rank history</h3>
			<p>
				You can see your ranking history graph on your user profile&apos;s
				“Seasons” page. Note that to to view your rank history, two conditions
				must be met: 1. You have completed a minimum of 7 sets. 2. These sets
				were played across 3 separate days, according to server time.
			</p>
			<h3>Team ranking</h3>
			<p>
				Team ranking is just ranking of unique rosters of 4. This means that If
				your team has 5 members (A, B, C, D, E) then you would potentially have
				different rankings with A-B-C-D, B-C-D-E, A-C-D-E etc. You don&apos;t
				need to do anything special such as creating a team on sendou.ink to
				start playing for a team ranking. The system automatically tracks team
				ranking for each unique roster that plays.
			</p>
			<p>
				Note that the default team leaderboard only shows the highest team
				ranking per player so you might not show up at all if the mates of your
				rankings have higher rankings with other players.
			</p>
			<h3>Ranked tournaments</h3>
			<p>
				In addition to SendouQ, tournaments can also affect your ranking. Check
				the <Link to={CALENDAR_PAGE}>calendar</Link> to find tournaments hosted
				on sendou.ink. If on the registration page it has the “Ranked” badge
				then you know it is a ranked tournament. In ranked tournaments each set
				is counted as a SendouQ set. Ranking changes are applied when the
				tournament ends and is finalized by the TO.
			</p>
			<p>
				If you sub around then note that only the people who played in the set
				have their ranking changed. If you sub in the middle of a set then
				it&apos;s counted based on people who played the majority of the set.
			</p>
			<h3>SendouQ Season Finale</h3>
			<p>
				Top 12 teams are invited to a SendouQ Season Finale event that typically
				happens 1 week after season ending. It has a price pot of $750 and is
				Splat Zones only.
			</p>
			<h3>Off-season</h3>
			<p>
				For off-season (usually around 2 weeks between seasons) SendouQ is not
				available.
			</p>
		</section>
	);
}
