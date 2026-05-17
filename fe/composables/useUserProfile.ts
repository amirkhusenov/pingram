import type { RouteRecordNameGeneric } from "vue-router"

export interface UserResponse {
  message: string
  user: User
}

export const USER_PROFILE_QUERY_KEY = ["userProfile"] as const

type HttpErrorLike = {
  status?: number
  statusCode?: number
  response?: {
    status?: number
  }
}

export const getHttpErrorStatus = (error: unknown): number | null => {
  const normalizedError = error as HttpErrorLike | null

  return (
    normalizedError?.status ??
    normalizedError?.statusCode ??
    normalizedError?.response?.status ??
    null
  )
}

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
