<template>
  <div v-if="isReady" class="app-shell">
    <Navigation />

    <div class="app-body">
      <div class="app-sidebar-desktop">
        <SideTabs />
      </div>
      <div class="app-main">
        <slot />
      </div>
    </div>

    <Teleport to="body">
      <div
        v-if="mobileMenuOpen"
        class="mobile-sidebar"
        @click="closeMobileMenu"
      >
        <div class="mobile-sidebar__panel" @click.stop>
          <div class="mobile-sidebar__panel-header">
            <span>Меню</span>
            <UButton
              size="xs"
              color="neutral"
              variant="ghost"
              icon="i-heroicons-x-mark"
              @click="closeMobileMenu"
            />
          </div>
          <div class="mobile-sidebar__panel-body">
            <SideTabs />
          </div>
        </div>
      </div>
    </Teleport>
  </div>
  <div v-else class="app-loading">
    <div class="app-loading__spinner" />
  </div>
</template>

<script lang="ts" setup>
const socket = useNuxtApp().$socket
const presenceStore = usePresenceStore()
const route = useRoute()
const mobileMenuOpen = useState<boolean>("mobile-menu-open", () => false)
const routeName = route.name
const userProfileQuery = useUserProfile(routeName)

const isReady = computed(() => !!userProfileQuery.data.value?.user)

useUseRealtimeFriendRequest()
useRealtimeFriends()
useRealtimeChats()
useRealtimeChatMessages()

function closeMobileMenu() {
  mobileMenuOpen.value = false
}

function handleResize() {
  if (window.innerWidth > 980) {
    closeMobileMenu()
  }
}

function initSocket() {
  if (!socket.connected) {
    socket.connect()
  }
  socket.emit("joinLobby")
  presenceStore.initializePresence()
}

watch(
  () => route.fullPath,
  () => {
    closeMobileMenu()
  }
)

watch(isReady, (ready) => {
  if (ready) {
    initSocket()
  }
})

onMounted(() => {
  if (isReady.value) {
    initSocket()
  }

  handleResize()
  window.addEventListener("resize", handleResize)
})

onBeforeUnmount(() => {
  window.removeEventListener("resize", handleResize)

  const params = route.params
  if (params.id) {
    socket.emit(
      "leaveChat",
      {
        chatId: params.id,
      },
      () => {
        socket.disconnect()
      }
    )
  }

  socket.emit("leaveLobby", {}, () => {
    socket.disconnect()
  })
  presenceStore.cleanPresence()
})
</script>
