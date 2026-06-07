import type { RouteRecordNameGeneric } from "vue-router"

export interface UserResponse {
  message: string
  user: User
}

export const USER_PROFILE_QUERY_KEY = ["userProfile"] as const

export const useUserProfile = (routeName: RouteRecordNameGeneric) => {
  const { callApi } = useApi()

  return useQuery({
    queryKey: USER_PROFILE_QUERY_KEY,
    queryFn: async () => {
      return await callApi<UserResponse>("/profile", {
        method: "GET",
        credentials: "include",
      })
    },
    enabled: routeName !== "login" && routeName !== "register",
    retry: 1,
  })
}
