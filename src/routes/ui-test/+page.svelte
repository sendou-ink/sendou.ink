<script>
	import Button from "$lib/components/button.svelte";
</script>

hello

<Button>primary</Button>
<Button variant="outline">outlined</Button>

<div class="card card-border border-base-300 card-sm bg-base-200 overflow-hidden">
	<div class="border-base-300 border-b border-dashed">
		<div class="flex items-center gap-2 p-4">
			<div class="grow">
				<div class="flex items-center gap-2 text-sm font-medium">
					<svg
						xmlns="http://www.w3.org/2000/svg"
						fill="none"
						viewBox="0 0 24 24"
						stroke-width="1.5"
						stroke="currentColor"
						class="size-5 opacity-40"
						><path
							stroke-linecap="round"
							stroke-linejoin="round"
							d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10"
						></path></svg
					> Write a new post
				</div>
			</div>
		</div>
	</div>
	<div class="card-body gap-4">
		<div class="flex items-center justify-between">
			<div class="join">
				<input
					class="join-item btn btn-xs px-3 font-bold"
					type="checkbox"
					name="options"
					aria-label="B"
				/>
				<input
					class="join-item btn btn-xs px-3 font-mono italic"
					type="checkbox"
					name="options"
					aria-label="I"
				/>
				<input
					class="join-item btn btn-xs px-3 underline"
					type="checkbox"
					name="options"
					aria-label="U"
				/>
			</div>
			<button class="btn btn-xs">Add files</button>
		</div>
		<textarea
			class="textarea textarea-border max-w-none resize-none"
			placeholder="What's happening?"
		></textarea>
		<p class="px-2 text-xs opacity-40">1200 characters remaining</p>
		<div class="card-actions grid grid-cols-2">
			<button class="btn">Draft</button> <button class="btn btn-primary">Publish</button>
		</div>
	</div>
</div>

<div class="card card-border border-base-300 card-sm bg-base-200 mt-12 overflow-hidden">
	<div class="card-body gap-4">
		<div class="border-b-base-300 grid grid-cols-7 border-b border-dashed pb-3">
			<div class="rounded-field flex flex-col items-center px-2 py-1">
				<span class="text-sm font-semibold">12</span>
				<span class="text-[10px] font-semibold opacity-50">M</span>
			</div>
			<div class="rounded-field flex flex-col items-center px-2 py-1">
				<span class="text-sm font-semibold">13</span>
				<span class="text-[10px] font-semibold opacity-50">T</span>
			</div>
			<div
				class="rounded-field bg-primary text-primary-content flex flex-col items-center px-2 py-1"
			>
				<span class="text-sm font-semibold">14</span>
				<span class="text-[10px] font-semibold opacity-50">W</span>
			</div>
			<div class="rounded-field flex flex-col items-center px-2 py-1">
				<span class="text-sm font-semibold">15</span>
				<span class="text-[10px] font-semibold opacity-50">T</span>
			</div>
			<div class="rounded-field flex flex-col items-center px-2 py-1">
				<span class="text-sm font-semibold">16</span>
				<span class="text-[10px] font-semibold opacity-50">F</span>
			</div>
			<div class="rounded-field flex flex-col items-center px-2 py-1">
				<span class="text-sm font-semibold">17</span>
				<span class="text-[10px] font-semibold opacity-50">S</span>
			</div>
			<div class="rounded-field flex flex-col items-center px-2 py-1">
				<span class="text-sm font-semibold">18</span>
				<span class="text-[10px] font-semibold opacity-50">S</span>
			</div>
		</div>
		<div>
			<label class="input input-sm input-border flex w-auto items-center gap-2"
				><svg
					xmlns="http://www.w3.org/2000/svg"
					viewBox="0 0 16 16"
					fill="currentColor"
					class="size-4"
					><path
						fill-rule="evenodd"
						d="M9.965 11.026a5 5 0 1 1 1.06-1.06l2.755 2.754a.75.75 0 1 1-1.06 1.06l-2.755-2.754ZM10.5 7a3.5 3.5 0 1 1-7 0 3.5 3.5 0 0 1 7 0Z"
						clip-rule="evenodd"
					></path></svg
				> <input type="text" placeholder="Search for events" /></label
			>
		</div>
		<div class="flex flex-col gap-2">
			<label class="flex cursor-pointer items-center gap-2"
				><input type="checkbox" class="toggle toggle-sm toggle-primary" checked />
				<span class="text-xs">Show all day events</span></label
			>
		</div>
	</div>
	<div class="bg-base-300">
		<div class="flex items-center gap-2 p-4">
			<div class="grow">
				<div class="text-sm font-medium">Team Sync Meeting</div>
				<div class="text-xs opacity-60">
					Weekly product review with design and development teams
				</div>
			</div>
			<div class="shrink-0"><span class="badge badge-sm badge-neutral">1h</span></div>
		</div>
	</div>
</div>
