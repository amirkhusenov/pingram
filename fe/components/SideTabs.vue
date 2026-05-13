<script lang="ts" setup>
const route = useRoute()
const store = useSideTabsStore()
const routeName = route.name
const userProfileQuery = useUserProfile(routeName)
const chatsQuery = useChatsList()
const notificationsQuery = useUseGetNotifications()

const currentUserId = computed(() => userProfileQuery.data.value?.user?.id)
const chats = computed(() => chatsQuery.chats.value ?? [])
const isSettingsRoute = computed(() => route.path === "/settings")

function isBlockedChat(chat: Chat) {
  return (
    (chat.blockedParticipantIds?.length ?? 0) > 0 ||
    (chat.blockedByParticipantIds?.length ?? 0) > 0
  )
}

const counts = computed(() => {
  const all = chats.value.filter((chat) => !chat.isArchived && !isBlockedChat(chat)).length
  const archived = chats.value.filter((chat) => chat.isArchived && !isBlockedChat(chat)).length
  const blocked = chats.value.filter(isBlockedChat).length
  return { all, archived, blocked }
})

const tabItems = computed(() => {
  const notifications = notificationsQuery.data.value ?? []
  const unreadCount = notifications.filter((n) => !n.read).length

  return [
    { key: "0", label: "Чаты", icon: "i-heroicons-chat-bubble-left-right", count: null },
    { key: "1", label: "Контакты", icon: "i-heroicons-user-group", count: null },
    { key: "2", label: "Уведомления", icon: "i-heroicons-bell", count: unreadCount },
  ] as const
})

const folderItems = computed(() => [
  { key: "all", label: "Все", icon: "i-heroicons-chat-bubble-left-right", count: counts.value.all },
  { key: "archived", label: "Архив", icon: "i-heroicons-archive-box", count: counts.value.archived },
  { key: "blocked", label: "Заблокированные", icon: "i-heroicons-no-symbol", count: counts.value.blocked },
])
</script>

<template>
  <aside class="workspace-sidebar">
    <div class="workspace-sidebar__folders">
      <div class="workspace-sidebar__top">
        <div class="workspace-sidebar__mode-list">
          <button
            v-for="item in tabItems"
            :key="item.key"
            class="workspace-sidebar__mode"
            :class="{ 'workspace-sidebar__mode--active': store.activeTabIndex === item.key }"
            @click="store.setActiveTabIndex(item.key)"
          >
            <span class="workspace-sidebar__mode-left">
              <UIcon :name="item.icon" size="16" />
              <span>{{ item.label }}</span>
            </span>
            <span v-if="item.count && item.count > 0" class="workspace-sidebar__mode-badge">
              {{ item.count > 99 ? "99+" : item.count }}
            </span>
          </button>
        </div>

        <div v-if="store.activeTabIndex === '0'" class="workspace-sidebar__folder-list">
          <button
            v-for="item in folderItems"
            :key="item.key"
            class="workspace-sidebar__folder"
            :class="{ 'workspace-sidebar__folder--active': store.activeFolder === item.key }"
            @click="store.setActiveFolder(item.key as any)"
          >
            <span class="workspace-sidebar__folder-left">
              <UIcon :name="item.icon" size="16" />
              <span>{{ item.label }}</span>
            </span>
            <span class="workspace-sidebar__folder-count">{{ item.count }}</span>
          </button>
        </div>
      </div>

      <div class="workspace-sidebar__footer">
        <button
          class="workspace-sidebar__settings-btn"
          :class="{ 'workspace-sidebar__settings-btn--active': isSettingsRoute }"
          @click="navigateTo('/settings')"
        >
          <span class="workspace-sidebar__mode-left">
            <UIcon name="i-heroicons-cog-6-tooth" size="16" />
            <span>Настройки</span>
          </span>
        </button>
      </div>
    </div>

    <div class="workspace-sidebar__content">
      <ChatsList v-if="store.activeTabIndex === '0'" />
      <FriendsList v-else-if="store.activeTabIndex === '1'" />
      <NotificationsList v-else />
    </div>
  </aside>
</template>
