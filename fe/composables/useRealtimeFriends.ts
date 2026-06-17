export const useRealtimeFriends = () => {
  const queryClient = useQueryClient()
  const { $socket: socket } = useNuxtApp()

  onMounted(() => {
    socket.on("newFriendAdded", () => {
      queryClient.invalidateQueries({ queryKey: ["friends"] })
      queryClient.invalidateQueries({ queryKey: ["notifications"] })
    })
    socket.on("friendRemoved", () => {
      queryClient.invalidateQueries({ queryKey: ["friends"] })
      queryClient.invalidateQueries({ queryKey: ["notifications"] })
    })
  })
  onBeforeUnmount(() => {
    socket.off("newFriendAdded")
    socket.off("friendRemoved")
  })
}
