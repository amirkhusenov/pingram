<script lang="ts" setup>
const route = useRoute()
const routeName = route.name
const store = useSideTabsStore()
const userProfileQuery = useUserProfile(routeName)
const currentUserId = computed(() => userProfileQuery.data.value?.user?.id)

const chatsQuery = useChatsList()
const chats = chatsQuery.chats
const deleteMutation = useDeleteChat()
const { callApi } = useApi()
const queryClient = useQueryClient()
const toast = useToast()
const backendBaseUrl = useRuntimeConfig().public.BACKEND_BASE_URL

const searchTerm = ref("")
const mutatingChatId = ref<number | null>(null)
const mutatingUserId = ref<number | null>(null)
const openMenuChatId = ref<number | null>(null)

const blockedUsersQuery = useQuery<User[]>({
  queryKey: ["blocked-users"],
  queryFn: async () => {
    const response = await callApi<{ blockedUsers: User[] }>("/chats/blocked/users", {
      method: "GET",
      credentials: "include",
    })
    return response.blockedUsers
  },
})

const blockedUserIds = computed(() => {
  const ids = blockedUsersQuery.data.value?.map((user) => user.id) ?? []
  return new Set(ids)
})

const activeRouteChatId = computed(() => {
  const parsed = Number.parseInt(String(route.params.id ?? ""), 10)
  return Number.isNaN(parsed) ? null : parsed
})

function isBlockedChat(chat: Chat) {
  return (
    (chat.blockedParticipantIds?.length ?? 0) > 0 ||
    (chat.blockedByParticipantIds?.length ?? 0) > 0
  )
}

function hasUnread(chat: Chat) {
  const notifications = chat.notifications ?? []
  return notifications.some(
    (notification) =>
      notification.userId === currentUserId.value &&
      !notification.read &&
      notification.type === "CHAT_MESSAGE"
  )
}

function getOtherParticipant(chat: Chat) {
  const userId = currentUserId.value
  if (!chat.participants?.length) return null
  if (!userId) return chat.participants[0]?.user ?? null
  return chat.participants.find((p) => p.userId !== userId)?.user ?? null
}

function getMyParticipant(chat: Chat) {
  const userId = currentUserId.value
  if (!userId) return null
  return chat.participants?.find((participant) => participant.userId === userId) ?? null
}

function getChatAvatar(chat: Chat) {
  if (chat.type === "GROUP" && chat.image) {
    if (chat.image.startsWith("http://") || chat.image.startsWith("https://")) return chat.image
    if (chat.image.includes("/")) return `${backendBaseUrl}/storage/${chat.image}`
    return `${backendBaseUrl}/storage/chatMedia/${chat.image}`
  }
  return getAvatarUrl(getOtherParticipant(chat) ?? undefined)
}

function getChatTitle(chat: Chat) {
  if (chat.type === "ONE_ON_ONE") {
    return getOtherParticipant(chat)?.name ?? "Личный чат"
  }

  if (chat.name?.trim()) return chat.name

  const userId = currentUserId.value
  const names = (chat.participants ?? [])
    .filter((participant) => participant.userId !== userId)
    .map((participant) => participant.user?.name)
    .filter(Boolean) as string[]

  if (names.length === 0) return "Групповой чат"
  if (names.length <= 2) return names.join(", ")
  return `${names.slice(0, 2).join(", ")} +${names.length - 2}`
}

function getPreviewText(chat: Chat) {
  if (chat.lastMessage?.content) return chat.lastMessage.content
  if (chat.lastMessage?.media?.some((media) => media.type === "VOICE")) return "Голосовое сообщение"
  if (chat.lastMessage?.media?.some((media) => media.type === "VIDEO")) return "Видеосообщение"
  if (chat.lastMessage?.media?.length) return "Медиа-сообщение"
  return "Пока нет сообщений"
}

function getPhoneLabel(chat: Chat) {
  if (chat.type === "GROUP") return "Группа"
  const other = getOtherParticipant(chat)
  return other?.email ?? ""
}

const sortedChats = computed(() =>
  [...chats.value].sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  )
)

const filteredByFolder = computed(() => {
  const base = sortedChats.value

  if (store.activeFolder === "all") return base.filter((chat) => !chat.isArchived && !isBlockedChat(chat))
  if (store.activeFolder === "archived") return base.filter((chat) => chat.isArchived && !isBlockedChat(chat))
  if (store.activeFolder === "blocked") return base.filter(isBlockedChat)
  return []
})

const visibleChats = computed(() => {
  const normalizedSearch = searchTerm.value.trim().toLowerCase()
  if (!normalizedSearch) return filteredByFolder.value

  return filteredByFolder.value.filter((chat) => {
    const haystack = `${getChatTitle(chat)} ${getPreviewText(chat)}`.toLowerCase()
    return haystack.includes(normalizedSearch)
  })
})

async function refreshChatData() {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: ["chats"] }),
    queryClient.invalidateQueries({ queryKey: ["blocked-users"] }),
  ])
}

async function archiveChat(chatId: number) {
  mutatingChatId.value = chatId
  try {
    await callApi<{ message: string }>(`/chats/${chatId}/archive`, {
      method: "POST",
      credentials: "include",
    })
    await refreshChatData()
  } finally {
    mutatingChatId.value = null
  }
}

async function unarchiveChat(chatId: number) {
  mutatingChatId.value = chatId
  try {
    await callApi<{ message: string }>(`/chats/${chatId}/archive`, {
      method: "DELETE",
      credentials: "include",
    })
    await refreshChatData()
  } finally {
    mutatingChatId.value = null
  }
}

async function blockUser(userId: number) {
  mutatingUserId.value = userId
  try {
    await callApi<{ message: string }>(`/chats/users/${userId}/block`, {
      method: "POST",
      credentials: "include",
    })
    await refreshChatData()
  } finally {
    mutatingUserId.value = null
  }
}

async function unblockUser(userId: number) {
  mutatingUserId.value = userId
  try {
    await callApi<{ message: string }>(`/chats/users/${userId}/block`, {
      method: "DELETE",
      credentials: "include",
    })
    await refreshChatData()
  } finally {
    mutatingUserId.value = null
  }
}

function deleteChat(chatId: number) {
  mutatingChatId.value = chatId
  deleteMutation.mutateAsync(chatId, {
    onSuccess: async () => {
      if (chatId === activeRouteChatId.value) await navigateTo("/")
      await refreshChatData()
      toast.add({
        color: "success",
        title: "Удалено",
        description: "Чат удален",
      })
    },
    onSettled: () => {
      mutatingChatId.value = null
    },
  })
}

function getDropdownItems(chat: Chat) {
  const items: { label: string; icon: string; onSelect: () => Promise<void> | void; danger?: boolean }[] =
    [
      {
        label: chat.isArchived ? "В папку «Входящие»" : "Архивировать",
        icon: chat.isArchived ? "i-heroicons-inbox-arrow-down" : "i-heroicons-archive-box",
        onSelect: () => (chat.isArchived ? unarchiveChat(chat.id) : archiveChat(chat.id)),
      },
    ]

  if (chat.type === "ONE_ON_ONE") {
    const other = getOtherParticipant(chat)
    if (other) {
      const isBlockedByMe = blockedUserIds.value.has(other.id)
      items.push({
        label: isBlockedByMe ? "Разблокировать пользователя" : "Заблокировать пользователя",
        icon: isBlockedByMe ? "i-heroicons-lock-open" : "i-heroicons-no-symbol",
        onSelect: () => (isBlockedByMe ? unblockUser(other.id) : blockUser(other.id)),
      })
    }
  }

  const isOneToOne = chat.type === "ONE_ON_ONE"
  const isGroupOwner = getMyParticipant(chat)?.role === "OWNER"

  if (isOneToOne || isGroupOwner) {
    items.push({
      label: "Удалить чат",
      icon: "i-heroicons-trash",
      danger: true,
      onSelect: () => deleteChat(chat.id),
    })
  }

  return items
}

function toggleMenu(chatId: number) {
  openMenuChatId.value = openMenuChatId.value === chatId ? null : chatId
}

function closeMenu() {
  openMenuChatId.value = null
}

async function handleMenuAction(action: { onSelect: () => Promise<void> | void }) {
  try {
    await action.onSelect()
  } finally {
    closeMenu()
  }
}

function onDocumentPointerDown(event: PointerEvent) {
  const target = event.target as HTMLElement | null
  if (!target?.closest(".dialogs-item__menu")) closeMenu()
}

onMounted(() => {
  document.addEventListener("pointerdown", onDocumentPointerDown)
})

onBeforeUnmount(() => {
  document.removeEventListener("pointerdown", onDocumentPointerDown)
})
function chatStateLabel(chat: Chat) {
  if ((chat.blockedParticipantIds?.length ?? 0) > 0) return "Вы заблокировали"
  if ((chat.blockedByParticipantIds?.length ?? 0) > 0) return "Вас заблокировали"
  if (chat.isArchived) return "В архиве"
  return ""
}
</script>

<template>
  <section class="dialogs-panel">
    <div class="dialogs-panel__search-wrap">
      <UInput
        v-model="searchTerm"
        icon="i-heroicons-magnifying-glass"
        placeholder="Поиск"
        class="dialogs-panel__search"
      />
    </div>

    <div class="dialogs-panel__body">
      <div v-if="chatsQuery.isLoading.value" class="dialogs-panel__empty">Загрузка чатов...</div>
      <div v-else-if="visibleChats.length === 0" class="dialogs-panel__empty">
        В этой папке нет чатов
      </div>

      <template v-else>
        <div
          v-for="chat in visibleChats"
          :key="chat.id"
          class="dialogs-item"
          :class="{
            'dialogs-item--active': activeRouteChatId === chat.id,
            'dialogs-item--muted': !hasUnread(chat),
          }"
        >
          <NuxtLink :to="`/chats/${chat.id}`" class="dialogs-item__main">
            <UAvatar :src="getChatAvatar(chat)" size="sm" />
            <div class="dialogs-item__text">
              <div class="dialogs-item__top">
                <span class="dialogs-item__name">{{ getChatTitle(chat) }}</span>
                <span class="dialogs-item__time">
                  {{
                    new Date(chat.updatedAt).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })
                  }}
                </span>
              </div>
              <span class="dialogs-item__phone">{{ getPhoneLabel(chat) }}</span>
              <span class="dialogs-item__preview">
                {{ chatStateLabel(chat) || getPreviewText(chat) }}
              </span>
            </div>
          </NuxtLink>

          <div class="dialogs-item__menu" @click.stop @pointerdown.stop>
            <UButton
              icon="i-heroicons-ellipsis-horizontal"
              variant="ghost"
              color="neutral"
              size="xs"
              class="dialogs-item__menu-btn"
              :loading="
                mutatingChatId === chat.id ||
                (chat.type === 'ONE_ON_ONE' && mutatingUserId === getOtherParticipant(chat)?.id)
              "
              @click.stop.prevent="toggleMenu(chat.id)"
              @pointerdown.stop.prevent
            />

            <div
              v-if="openMenuChatId === chat.id"
              class="dialogs-item__menu-popover"
              @click.stop
              @pointerdown.stop
            >
              <button
                v-for="action in getDropdownItems(chat)"
                :key="action.label"
                type="button"
                class="dialogs-item__menu-action"
                :class="{ 'dialogs-item__menu-action--danger': action.danger }"
                @click.stop.prevent="handleMenuAction(action)"
              >
                <UIcon :name="action.icon" />
                <span>{{ action.label }}</span>
              </button>
            </div>
          </div>
        </div>
      </template>
    </div>
  </section>
</template>
