export interface LoginPayload {
  email: string
  password: string
}

export const useUseLoginUser = () => {
  const { callApi } = useApi()
  const toast = useToast()

  return useMutation({
    mutationFn: async (variables: LoginPayload) => {
      await callApi<{ message: string }>("/login", {
        method: "POST",
        body: variables,
        credentials: "include",
      })
    },
    onError: (error: any) => {
      toast.add({
        title: "Ошибка",
        description: error.response?._data?.error ?? "Не удалось войти",
        color: "error",
        icon: "i-heroicons-information-circle",
      })
    },
    onSuccess: async () => {
      navigateTo("/")
    },
  })
}
