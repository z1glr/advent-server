<script setup lang="ts">
	import { inject } from "vue";

	import AppLayout from "@/components/AppLayout/AppLayout.vue";
	import BaseMarkdown from "@/components/BaseMarkdown.vue";

	const content_url = inject("content");
</script>

<template>
	<AppLayout>
		<BaseMarkdown v-if="typeof content_url === 'string'" id="markdown" :url="content_url" />
	</AppLayout>
</template>

<style scoped>
	#markdown:deep(h1:first-of-type) {
		text-align: center;
	}
</style>
