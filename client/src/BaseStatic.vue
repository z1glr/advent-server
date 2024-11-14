<script setup lang="ts">
	import AppLayout from './components/AppLayout/AppLayout.vue';
</script>

<template>
	<AppLayout>
		<div id="wrapper">
			<slot></slot>
		</div>
	</AppLayout>	
</template>

<style scoped>
	#wrapper {
		max-width: 40em;
		
		overflow-wrap: anywhere;
	}

	#wrapper:deep(h1:first-of-type) {
		text-align: center;
	}
</style>
