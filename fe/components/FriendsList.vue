<script lang="ts" setup>
const presenceStore = usePresenceStore()
const { friends, isLoading } = useFriendList()
const { onlineUsers: users } = storeToRefs(presenceStore)

const route = useRoute()
const routeName = route.name
const dataUserAuth = useUserProfile(routeName)
const { callApi } = useApi()
const queryClient = useQueryClient()
const toast = useToast()

const chatsQuery = useChatsList()
const chats = computed(() => chatsQuery.chats.value ?? [])

const friendEmail = ref("")
const sendFriendRequestPending = ref(false)

function isOnline(friendId: number) {
  return !!users.value.find((u) => u.id === friendId)
}

function getExistingOneToOneChatId(friendId: number) {
  const currentUserId = dataUserAuth.data.value?.user?.id
  if (!currentUserId) return null

  const chat = chats.value.find((entry) => {
    if (entry.type !== "ONE_ON_ONE") return false
    const participantIds = (entry.participants ?? []).map((p) => p.userId)
    return participantIds.includes(currentUserId) && participantIds.includes(friendId)
  })

  return chat?.id ?? null
}

async function sendFriendRequestByEmail() {
  const email = friendEmail.value.trim()
  if (!email) return

  sendFriendRequestPending.value = true
  try {
    await callApi<{ message: string }>("/friend-request", {
      method: "POST",
      credentials: "include",
      body: { receiverEmail: email },
    })
    toast.add({
      color: "success",
      title: "Заявка отправлена",
      description: `Запрос в друзья отправлен: ${email}`,
    })
    friendEmail.value = ""
    queryClient.invalidateQueries({ queryKey: ["notifications"] })
  } catch (error: any) {
    toast.add({
      color: "error",
      title: "Ошибка",
      description: error?.response?._data?.error || "Не удалось отправить заявку",
    })
  } finally {
    sendFriendRequestPending.value = false
  }
}

const oneToOneChatMutation = useCreateOneToOneChat()
function startOneToOneChat(friend: User) {
  const existingChatId = getExistingOneToOneChatId(friend.id)
  if (existingChatId) {
    navigateTo(`/chats/${existingChatId}`)
    return
  }

  oneToOneChatMutation.mutate(
    { friendId: friend.id },
    {
      onSuccess: ({ chat }) => {
        queryClient.invalidateQueries({ queryKey: ["chats"] })
        navigateTo(`/chats/${chat.id}`)
      },
      onError: (error: any) => {
        toast.add({
          color: "error",
          title: "Ошибка",
          description: error?.response?._data?.error || "Не удалось создать чат",
        })
      },
    }
  )
}

const removeFriendMutation = useMutation({
  mutationFn: async (friendId: number) => {
    await callApi<{ message: string }>(`/friend-request/friends/${friendId}`, {
      method: "DELETE",
      credentials: "include",
    })
  },
})

function removeFriend(friend: User) {
  removeFriendMutation.mutate(friend.id, {
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["friends"] })
      queryClient.invalidateQueries({ queryKey: ["notifications"] })
      toast.add({
        color: "success",
        title: "Друг удалён",
        description: `${friend.name} удалён из списка друзей`,
      })
    },
    onError: (error: any) => {
      toast.add({
        color: "error",
        title: "Ошибка",
        description: error?.response?._data?.error || "Не удалось удалить друга",
      })
    },
  })
}

const isModalOpen = ref(false)
const preselectedFriends = ref<number[]>([])

const groupFriendOptions = computed(() => {
  const currentUserId = dataUserAuth.data.value?.user?.id
  if (!currentUserId || !friends.value.length) return []
  return friends.value
    .filter((f) => f.id !== currentUserId)
    .map((f) => ({ value: f.id, label: f.name }))
})

function openGroupChatModal(friendIds: number[]) {
  isModalOpen.value = true
  preselectedFriends.value = friendIds
}

function addFriendToGroupChat(friend: User) {
  openGroupChatModal([friend.id])
}

const markAsReadMutation = useMutation({
  mutationFn: async (id: number) => {
    return await callApi<{ message: string }>(`/notifications/${id}/read`, {
      method: "PUT",
      credentials: "include",
    })
  },
})

async function markAsRead(entry: IntersectionObserverEntry) {
  const notificationId = Number(entry.target.getAttribute("data-notification-id"))
  const cachedNotifications = queryClient.getQueryData<Notification[]>(["notifications"])
  if (!cachedNotifications) return

  const notification = cachedNotifications.find((n) => n.id === notificationId)
  if (!notification || notification.read) return

  markAsReadMutation.mutate(notificationId, {
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] })
      queryClient.invalidateQueries({ queryKey: ["friends"] })
    },
  })
}

const { observeElement } = useIntersectionObserver(markAsRead)
function registerEl(el: Element | null) {
  observeElement(el as HTMLElement | null)
}
</script>

<template>
  <div class="friends-list">
    <div class="flex flex-col w-full">
      <div class="p-2 mb-2">
        <UInput
          v-model="friendEmail"
          type="email"
          placeholder="Добавить друга по email"
          @keydown.enter.prevent="sendFriendRequestByEmail"
        />
        <UButton
          class="mt-2 w-full"
          color="primary"
          :loading="sendFriendRequestPending"
          :disabled="sendFriendRequestPending || !friendEmail.trim()"
          @click="sendFriendRequestByEmail"
        >
          Добавить в друзья
        </UButton>
      </div>

      <div v-if="isLoading" class="dark:text-gray-300 text-xs text-gray-500 p-2">
        Загрузка...
      </div>
      <div v-else-if="!friends || friends.length === 0" class="text-gray-500 text-xs p-2">
        Нет друзей
      </div>
      <div
        v-for="friend in friends"
        v-else
        :key="friend.id"
        class="friends-list__item"
        :data-notification-id="friend.notification?.id"
        :ref="(el) => registerEl(el as HTMLElement)"
      >
        <div class="friends-list__item-button">
          <div class="flex items-center">
            <UChip inset size="sm" :color="isOnline(friend.id) ? 'success' : 'neutral'">
              <UAvatar :src="getAvatarUrl(friend)" />
            </UChip>
            <span class="ml-2 select-none truncate lg:w-[140px] w-[90px]">
              {{ friend.name }}
            </span>
          </div>

          <div class="friends-list__actions">
            <UButton
              v-if="!getExistingOneToOneChatId(friend.id)"
              size="xs"
              color="neutral"
              variant="soft"
              icon="i-heroicons-chat-bubble-bottom-center-text"
              :loading="oneToOneChatMutation.isPending.value"
              @click="startOneToOneChat(friend)"
            >
              Создать чат
            </UButton>
            <UButton
              v-else
              size="xs"
              color="primary"
              variant="soft"
              icon="i-heroicons-arrow-top-right-on-square"
              @click="startOneToOneChat(friend)"
            >
              Открыть чат
            </UButton>
            <UButton
              size="xs"
              color="neutral"
              variant="soft"
              icon="i-heroicons-user-group"
              @click="addFriendToGroupChat(friend)"
            >
              В группу
            </UButton>
            <UButton
              size="xs"
              color="error"
              variant="soft"
              icon="i-heroicons-user-minus"
              :loading="removeFriendMutation.isPending.value"
              @click="removeFriend(friend)"
            >
              Удалить
            </UButton>
          </div>
        </div>
      </div>
    </div>

    <GroupChatModal
      v-model:open="isModalOpen"
      :friend-options="groupFriendOptions"
      :preselected-friends="preselectedFriends"
    />
  </div>
</template>
