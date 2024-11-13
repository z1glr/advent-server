<script setup lang="ts">
	import { ref, watch } from "vue";

	import AppLayout from "@/components/AppLayout/AppLayout.vue";
	import AdminPosts from "./AdminPosts.vue";
	import AdminComments from "./AdminComments.vue";
	import AdminUsers from "./AdminUsers.vue";
	import AdminFiles from "./AdminFiles.vue";

	import Global from "@/Global";

	enum State {
		"Login" = 1,
		"Posts",
		"Files",
		"Comments",
		"Users"
	}

	const window_state = ref<State>(State.Login);

	watch(
		() => Global.user.value?.logged_in,
		() => {
			if (!Global.user.value || !Global.user.value.logged_in || !Global.user.value.admin) {
				window_state.value = State.Login;
			} else {
				window_state.value = State.Posts;
			}
		},
		{ immediate: true }
	);

	function on_logout() {
		window.location.href = window.location.origin;
	}
</script>

<template>
	<AppLayout @logout="on_logout">
		<template #header>
			<template v-if="window_state != State.Login">
				<a :class="{ active: window_state === State.Posts }" @click="window_state = State.Posts"
					>Posts</a
				>
				<a :class="{ active: window_state === State.Files }" @click="window_state = State.Files"
					>Files</a
				>
				<a
					:class="{ active: window_state === State.Comments }"
					@click="window_state = State.Comments"
					>Comments</a
				>
				<a :class="{ active: window_state === State.Users }" @click="window_state = State.Users"
					>Users</a
				>
			</template>
		</template>

		<AdminPosts v-if="window_state === State.Posts" />
		<AdminFiles v-else-if="window_state === State.Files" />
		<AdminComments v-else-if="window_state === State.Comments" />
		<AdminUsers v-else-if="window_state === State.Users" />
	</AppLayout>
</template>

<style scoped>
	a:hover {
		color: var(--color-text-hover);
	}

	a.active {
		color: var(--color-contrast);
	}

	a.active:hover {
		color: var(--color-contrast-hover);
	}
</style>
