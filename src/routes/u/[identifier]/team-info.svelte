<script lang="ts">
	// <div class="stack horizontal sm">
	// 				<a href={teamPage(data.user.team.customUrl)} class="u__team" data-testid="main-team-link">
	// 					{#if data.user.team.avatarUrl}
	// 						<img
	// 							alt=""
	// 							src={userSubmittedImage(data.user.team.avatarUrl)}
	// 							width="32"
	// 							height="32"
	// 							class="rounded-full"
	// 						/>
	// 					{/if}
	// 					<div>
	// 						{data.user.team.name}
	// 						{#if data.user.team.userTeamRole}
	// 							<div class="text-xxs text-lighter font-bold">
	// 								{$_(`team:roles.${data.user.team.userTeamRole}`)}
	// 							</div>
	// 						{/if}
	// 					</div>
	// 				</a>

	// 				<!-- SecondaryTeamsPopover component inline -->
	// 				{#if data.user.secondaryTeams.length > 0}
	// 					<SendouPopover>
	// 						<SendouButton
	// 							slot="trigger"
	// 							class="focus-text-decoration self-start"
	// 							variant="minimal"
	// 							size="small"
	// 						>
	// 							<span
	// 								class="text-sm font-bold text-main-forced"
	// 								data-testid="secondary-team-trigger"
	// 							>
	// 								+{data.user.secondaryTeams.length}
	// 							</span>
	// 						</SendouButton>

	// 						<div class="stack sm">
	// 							{#each data.user.secondaryTeams as team (team.customUrl)}
	// 								<div class="stack horizontal md items-center">
	// 									<a href={teamPage(team.customUrl)} class="u__team text-main-forced">
	// 										{#if team.avatarUrl}
	// 											<img
	// 												alt=""
	// 												src={userSubmittedImage(team.avatarUrl)}
	// 												width="24"
	// 												height="24"
	// 												class="rounded-full"
	// 											/>
	// 										{/if}
	// 										{team.name}
	// 									</a>
	// 									{#if team.userTeamRole}
	// 										<div class="text-xxs text-lighter font-bold">
	// 											{$_(`team:roles.${team.userTeamRole}`)}
	// 										</div>
	// 									{/if}
	// 								</div>
	// 							{/each}
	// 						</div>
	// 					</SendouPopover>
	// 				{/if}
	// 			</div>
</script>
