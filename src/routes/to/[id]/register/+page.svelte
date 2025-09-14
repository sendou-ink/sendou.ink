<script lang="ts">
	import FriendCodeGate from '$lib/components/FriendCodeGate.svelte';
	import Main from '$lib/components/layout/Main.svelte';
	import StatusCircle from './StatusCircle.svelte';
</script>

<Main>
	<FriendCodeGate>
		<div class="registration-flow">
			<StatusCircle status="OK" />
			<section>
				<div class="section-content">asdasdasd asddsa asd</div>
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
		background-color: var(--color-base-card);
		margin-bottom: var(--s-8);

		@media (max-width: 768px) {
			margin-bottom: var(--s-4);
		}
	}

	.section-content {
		min-height: 200px;
	}
</style>
