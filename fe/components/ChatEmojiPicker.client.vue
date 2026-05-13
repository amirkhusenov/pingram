<script setup lang="ts">
import EmojiPicker from "vue3-emoji-picker"
import "vue3-emoji-picker/css"

defineProps<{
  native?: boolean
  theme?: "dark" | "light"
}>()

defineEmits<{
  select: [emoji: unknown]
}>()
</script>

<template>
  <EmojiPicker
    :native="native"
    :theme="theme"
    @select="$emit('select', $event)"
  />
</template>
