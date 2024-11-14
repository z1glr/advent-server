<script setup lang="ts">
	import BaseStatic from '@/BaseStatic.vue';

</script>

<template>
	<BaseStatic>
		<h1>About</h1>
		<p>
			Dies Seite ist begleitend zum Adventsangebot von Alex Unverhau.
		</p>
		<p>
			Für weitere Informationen kontaktieren Sie <a href="mailto:advent@evkirchebuehl.de">advent@evkirchebuehl.de</a>.
		</p>
	</BaseStatic>	
</template>

<style scoped>
	p {
		margin-block: 0.55em;
	}

	p.container {
		margin-block: 1em;
	}

	a {
		color: var(--color-contrast);
	}

	h2, h3 {
		margin-top: 1em;
		margin-bottom: 0.25em;
	}

	ul {
		margin-block: 1em;
	}
</style>