const AUTH_ROUTES = new Set(["/login", "/register"])

export default defineNuxtRouteMiddleware(async (to) => {
  if (import.meta.server) return

  const isAuthRoute = AUTH_ROUTES.has(to.path)
  const { refetch } = useUserProfile(to.name)

  const profileQueryResult = await refetch({ throwOnError: false })
  const authenticatedUser = profileQueryResult.data?.user

  if (authenticatedUser && isAuthRoute) {
    return navigateTo("/")
  }

  if (authenticatedUser) {
    return
  }

  if (isAuthRoute) {
    return
  }

  const status = getHttpErrorStatus(profileQueryResult.error)
  if (status === 401 || status === 403) {
    return navigateTo("/login")
  }
})
