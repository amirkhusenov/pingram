<script lang="ts" setup>
type FriendOption = {
  value: number
  label: string
}

const props = defineProps<{
  open: boolean
  friendOptions: FriendOption[]
  preselectedFriends?: number[]
}>()

const emit = defineEmits<{ (e: "update:open", value: boolean): void }>()
const { callApi } = useApi()
const backendBaseUrl = useRuntimeConfig().public.BACKEND_BASE_URL

const internalOpen = ref(props.open)
const selectedFriendIds = ref<number[]>([])
const groupName = ref("")
const groupImage = ref("")
const uploadPending = ref(false)
const imageInput = ref<HTMLInputElement | null>(null)

watch(
  () => props.open,
  (newValue) => {
    internalOpen.value = newValue
  }
)

watch(internalOpen, (newValue) => {
  emit("update:open", newValue)
})

watch(
  () => props.preselectedFriends,
  (newValue) => {
    if (!newValue) return

    selectedFriendIds.value = newValue
      .map((id) => props.friendOptions.find((option) => option.value === id))
      .filter(Boolean)
      .map((option) => option!.value)
  },
  { immediate: true }
)

const imagePreview = computed(() => {
  if (!groupImage.value) return ""
  if (groupImage.value.startsWith("http://") || groupImage.value.startsWith("https://")) {
    return groupImage.value
  }
  if (groupImage.value.includes("/")) return `${backendBaseUrl}/storage/${groupImage.value}`
  return `${backendBaseUrl}/storage/chatMedia/${groupImage.value}`
})

function triggerImageInput() {
  imageInput.value?.click()
}

async function onImageSelected(event: Event) {
  const target = event.target as HTMLInputElement
  if (!target.files?.length) return

  const formData = new FormData()
  formData.append("file", target.files[0])
  uploadPending.value = true

  try {
    const data = await callApi<{ storedFilename: string }>("/chats/upload", {
      method: "POST",
      body: formData,
      credentials: "include",
    })
    groupImage.value = data.storedFilename
  } finally {
    uploadPending.value = false
    target.value = ""
  }
}

const { mutateAsync, isPending, error } = useCreateGroupChat()

async function onCreateGroupChat() {
  await mutateAsync({
    friendIds: selectedFriendIds.value,
    name: groupName.value.trim() || undefined,
    image: groupImage.value || undefined,
  })

  internalOpen.value = false
  groupName.value = ""
  groupImage.value = ""
  selectedFriendIds.value = []
}
</script>

<template>
  <UModal v-model:open="internalOpen" title="Создать группу">
    <template #body>
      <div class="space-y-3">
        <UFormField label="Название группы" name="group-name">
          <UInput v-model="groupName" placeholder="Например, Команда проекта" />
        </UFormField>

        <UFormField label="Фото группы">
          <div class="chat-group-photo-upload">
            <UButton
              size="xs"
              color="neutral"
              variant="soft"
              :loading="uploadPending"
              @click="triggerImageInput"
            >
              Выбрать файл
            </UButton>
            <input
              ref="imageInput"
              type="file"
              accept="image/*"
              class="hidden"
              @change="onImageSelected"
            />
            <img
              v-if="imagePreview"
              :src="imagePreview"
              class="chat-group-photo-preview"
            />
          </div>
        </UFormField>

        <UFormField label="Участники" name="friends">
          <USelect
            v-model="selectedFriendIds"
            multiple
            :items="friendOptions"
            placeholder="Выберите друзей"
          />
        </UFormField>
      </div>

      <div v-if="error" class="mt-3 text-red-500">{{ error.message }}</div>
    </template>

    <template #footer>
      <UButton
        :loading="isPending"
        :disabled="isPending || selectedFriendIds.length === 0"
        @click="onCreateGroupChat"
      >
        Создать
      </UButton>
    </template>
  </UModal>
</template>
