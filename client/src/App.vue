<script setup lang="ts">
	import BaseHome from "./components/Post/BaseHome.vue";
	import BaseLogin from "./components/BaseLogin.vue";
	import AppLayout from "./components/AppLayout/AppLayout.vue";
	import Global from "./Global";
</script>

<template>
	<AppLayout>
		<BaseLogin v-if="!Global.user.value?.logged_in" />
		<BaseHome v-else />
	</AppLayout>
</template>

<style scoped></style>
