<script lang="ts" setup>
const routeName = useRoute().name
const userProfileQuery = useUserProfile(routeName)
const logoutMutation = useLogoutUser()
const mobileMenuOpen = useState<boolean>("mobile-menu-open", () => false)

const authUser = computed(() => userProfileQuery.data.value?.user)

async function logout() {
  await logoutMutation.mutateAsync()
  navigateTo("/login")
}

function toggleMobileMenu() {
  mobileMenuOpen.value = !mobileMenuOpen.value
}
</script>

<template>
  <header class="topbar">
    <div class="topbar__left">
      <UButton
        size="xs"
        color="neutral"
        variant="ghost"
        icon="i-heroicons-bars-3"
        class="topbar__mobile-menu-btn"
        @click="toggleMobileMenu"
      />
      <span class="topbar__brand">Pingram</span>
    </div>

    <div class="topbar__right">
      <div v-if="authUser" class="topbar__profile">
        <div class="topbar__profile-text">
          <span class="topbar__profile-greeting">{{ authUser.name }}</span>
          <span class="topbar__profile-phone">{{ authUser.email }}</span>
        </div>
        <NuxtLink to="/profile">
          <UAvatar :src="getAvatarUrl(authUser)" size="sm" />
        </NuxtLink>
      </div>

      <UButton
        v-if="authUser"
        size="xs"
        color="neutral"
        variant="ghost"
        icon="i-heroicons-arrow-left-start-on-rectangle"
        @click="logout"
      />
      <NuxtLink v-else to="/login">
        <UButton color="primary" size="xs">\u0412\u043e\u0439\u0442\u0438</UButton>
      </NuxtLink>
    </div>
  </header>
</template>
