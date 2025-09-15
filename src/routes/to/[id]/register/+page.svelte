<script lang="ts">
	import Form from '$lib/components/form/Form.svelte';
	import FriendCodeGate from '$lib/components/FriendCodeGate.svelte';
	import Main from '$lib/components/layout/Main.svelte';
	import StatusCircle from './StatusCircle.svelte';
	import * as TournamentAPI from '$lib/api/tournament';
	import { createFieldValidator } from '$lib/components/form/utils';
	import FormField from '$lib/components/form/FormField.svelte';

	const schema = TournamentAPI.schemas.upsertTeamSchema;
	const validField = createFieldValidator(schema);
</script>

<Main>
	<FriendCodeGate>
		<div class="registration-flow">
			<StatusCircle status="OK" />
			<section>
				<div class="section-content">
					<Form {schema} action={TournamentAPI.actions.registerNewTeam} heading="Team info">
						<FormField name={validField('pickupName')} />
						<FormField name={validField('avatar')} />
					</Form>
				</div>
			</section>

			<StatusCircle status="MISSING" top={60} />
			<section>
				<div class="section-content"></div>
			</section>

			<StatusCircle status="WAIT" top={60 * 2} />
			<section>
				<div class="section-content"></div>
			</section>
		</div>
	</FriendCodeGate>
</Main>

<style>
	.registration-flow {
		display: grid;
		grid-template-columns: auto 1fr;
		gap: var(--s-6) var(--s-6);
		align-items: start;

		@media (max-width: 768px) {
			grid-template-columns: 1fr;
			gap: var(--s-4);
		}
	}

	section {
		border: var(--border-style);
		border-radius: var(--radius-box);
		padding: var(--s-6);
		background-color: var(--color-base-section);
		margin-bottom: var(--s-8);

		@media (max-width: 768px) {
			margin-bottom: var(--s-4);
		}
	}

	.section-content {
		min-height: 200px;
	}
</style>
