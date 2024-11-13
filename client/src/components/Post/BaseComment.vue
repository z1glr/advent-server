<script setup lang="ts">
	import { ref, watch } from "vue";
	import { FontAwesomeIcon } from "@fortawesome/vue-fontawesome";
	import { faPaperPlane, faTrashCan } from "@fortawesome/free-regular-svg-icons";

	import Global, { type Comment, type Post } from "@/Global";
	import { api_call } from "@/Lib";
	import BaseButton from "../BaseButton.vue";

	const props = defineProps<{
		comment: Comment;
		pid: number;
	}>();

	const emit = defineEmits<{
		answer: [comment: Comment];
		delete: [];
	}>();

	const answer_user_input = ref<string>("");

	watch(
		() => props.comment.answer,
		() => {
			if (props.comment.answer !== undefined) {
				answer_user_input.value = props.comment.answer;
			}
		},
		{ immediate: true }
	);

	async function add_answer(cid: number) {
		const response = await api_call<Comment>(
			"POST",
			"comments/answer",
			{ cid },
			{ answer: answer_user_input.value }
		);

		if (response.ok) {
			emit("answer", response.data);
		}
	}

	async function delete_comment(cid: number) {
		if (window.confirm("Do you really want to delete this comment?")) {
			const response = await api_call<Post>("DELETE", "comments", { cid });

			if (response.ok) {
				emit("delete");
			}
		}
	}
</script>

<template>
	<div class="comment">
		<div class="comment-text">
			{{ comment.text }}
			<BaseButton @click="delete_comment(comment.cid)">
				<FontAwesomeIcon :icon="faTrashCan" />
			</BaseButton>
		</div>
		<div v-if="Global.user.value?.admin" id="answer-text">
			<textarea placeholder="Antwort" v-model="answer_user_input" />
			<BaseButton @click="add_answer(comment.cid)"
				><FontAwesomeIcon :icon="faPaperPlane"
			/></BaseButton>
		</div>
		<div v-else-if="!!comment.answer" id="answer-text">{{ comment.answer }}</div>
	</div>
</template>

<style scoped>
	.comment > * {
		padding: 0.25em;
	}

	.comment {
		border: 0.075em solid var(--color-text);
		border-radius: 0.125em;

		box-shadow: 1px 1px 1px #999;
	}

	.comment > div {
		display: flex;
		gap: 0.25em;

		justify-content: space-between;
		align-items: center;

		text-wrap: wrap;
		overflow-wrap: anywhere;
	}

	#answer-text {
		border: inherit;
		border-radius: inherit;

		margin: 0.25em;
	}

	#answer-text > textarea {
		flex: 1;

		font-size: unset;
		font-family: Signika;

		resize: vertical;
		width: 100%;

		border: unset;
		background-color: transparent;

		color: var(--color-contrast);
	}

	#answer-text > textarea:focus {
		outline: unset;
	}

	#answer-text > textarea::placeholder {
		color: var(--color-contrast-hover);
	}
</style>
