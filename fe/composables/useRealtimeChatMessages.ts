export interface RealtimeNotificationPayload {
  message: ChatMessage
}

interface RealtimeMessageDeletedPayload {
  chatId: number
  messageId: number
}

export const useRealtimeChatMessages = () => {
  const queryClient = useQueryClient()
  const { $socket: socket } = useNuxtApp()

  onMounted(() => {
    socket.on("chatMessageReceived", (payload: RealtimeNotificationPayload) => {
      const newMessage = payload.message
      if (!newMessage) return
      const chatId = newMessage.chatId
      queryClient.invalidateQueries({ queryKey: ["notifications"] })
      queryClient.invalidateQueries({ queryKey: ["chats"] })

      const cachedChat = queryClient.getQueryData<Chat>(["chat", chatId])
      if (!cachedChat?.messages) return
      const newMessages = [...cachedChat.messages, newMessage]
      queryClient.setQueryData<Chat>(["chat", chatId], {
        ...cachedChat,
        messages: newMessages,
        lastMessageId: newMessage.id,
        lastMessage: newMessage,
      })
    })

    socket.on("chatMessageDeleted", (payload: RealtimeMessageDeletedPayload) => {
      const { chatId, messageId } = payload
      const cachedChat = queryClient.getQueryData<Chat>(["chat", chatId])
      if (!cachedChat?.messages) return

      const nextMessages = cachedChat.messages.filter((message) => message.id !== messageId)
      const nextLastMessage = nextMessages.length ? nextMessages[nextMessages.length - 1] : null

      queryClient.setQueryData<Chat>(["chat", chatId], {
        ...cachedChat,
        messages: nextMessages,
        lastMessageId: nextLastMessage?.id ?? null,
        lastMessage: nextLastMessage,
      })

      queryClient.invalidateQueries({ queryKey: ["chats"] })
      queryClient.invalidateQueries({ queryKey: ["notifications"] })
    })
  })

  onBeforeUnmount(() => {
    socket.off("chatMessageReceived")
    socket.off("chatMessageDeleted")
  })
}
