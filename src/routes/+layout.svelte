<script>
	import "../app.css";
</script>

<div class="container">
	<header>Header</header>
	<div class="left-sidebar">Left Sidebar</div>
	<main><slot /></main>
	<div class="right-sidebar">Right Sidebar</div>
	<footer>Footer</footer>
</div>

<style>
	.container {
		min-width: 100%;
		display: grid;
		column-gap: 50px;
		grid-template: auto 1fr auto / auto 1fr auto;
	}

	header {
		padding: 2rem;
		grid-column: 1 / 4;
	}

	.left-sidebar {
		grid-column: 1 / 2;
	}

	main {
		grid-column: 2 / 3;
	}

	.right-sidebar {
		grid-column: 3 / 4;
	}

	footer {
		grid-column: 1 / 4;
	}
</style>
