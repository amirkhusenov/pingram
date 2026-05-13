type ChatCreatedPayload = {
  chat: Chat
  notification: Notification
}

export const useRealtimeChats = () => {
  const queryClient = useQueryClient()
  const { $socket: socket } = useNuxtApp()

  onMounted(() => {
    if (!socket) return

    socket.on("chatCreated", (payload: ChatCreatedPayload) => {
      const { notification, chat } = payload

      queryClient.setQueryData<Notification[]>(
        ["notifications"],

        (oldData = []) => {
          return [notification, ...oldData]
        }
      )

      const chatWithNewNotifications = {
        ...chat,
        notifications: [notification],
      }
      queryClient.setQueryData<Chat[]>(["chats"], (oldData = []) => {
        return [...oldData, chatWithNewNotifications]
      })
    })

    socket.on("chatUpdated", () => {
      queryClient.invalidateQueries({ queryKey: ["chats"] })
      const activeChatId = Number(useRoute().params.id)
      if (!Number.isNaN(activeChatId)) {
        queryClient.invalidateQueries({ queryKey: ["chat", activeChatId] })
      }
    })

    socket.on("groupParticipantRoleUpdated", (payload: { chatId: number }) => {
      queryClient.invalidateQueries({ queryKey: ["chats"] })
      queryClient.invalidateQueries({ queryKey: ["chat", payload.chatId] })
    })

    socket.on("groupParticipantRemoved", (payload: { chatId: number; userId: number }) => {
      queryClient.invalidateQueries({ queryKey: ["chats"] })
      queryClient.invalidateQueries({ queryKey: ["chat", payload.chatId] })

      const currentUserId = queryClient.getQueryData<{ user: User }>(["userProfile"])?.user?.id
      if (currentUserId && currentUserId === payload.userId && payload.chatId === Number(useRoute().params.id)) {
        navigateTo("/")
      }
    })

    socket.on("chatDeleted", (payload: { chatId: number }) => {
      const { chatId } = payload

      queryClient.setQueryData<Chat[]>(["chats"], (oldData = []) => {
        return oldData.filter((chat) => chat.id !== chatId)
      })
      if (chatId === Number(useRoute().params.id)) {
        navigateTo("/")
      }
    })
  })

  onBeforeUnmount(() => {
    if (!socket) return

    socket.off("chatCreated")
    socket.off("chatDeleted")
    socket.off("chatUpdated")
    socket.off("groupParticipantRoleUpdated")
    socket.off("groupParticipantRemoved")
  })
}
