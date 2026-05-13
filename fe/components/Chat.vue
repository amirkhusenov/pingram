<script lang="ts" setup>
const route = useRoute()
const routeName = route.name
const chatId = ref(Number(route.params.id))
const userProfileQuery = useUserProfile(routeName)
const chatQuery = useGetChatWithMessages(chatId.value)
const { typingIndicators, emitTyping } = useSetupChatRoom(chatId.value, routeName)
const { callApi } = useApi()
const queryClient = useQueryClient()
const toast = useToast()

const currentUserId = computed(() => userProfileQuery.data.value?.user?.id)
const chat = computed(() => chatQuery.data.value)
const isLoading = chatQuery.isLoading
const error = chatQuery.error
const backendBaseUrl = useRuntimeConfig().public.BACKEND_BASE_URL

const otherTypingIndicators = computed(() =>
  typingIndicators.value.filter((indicator) => indicator.userId !== currentUserId.value)
)

const isGroup = computed(() => chat.value?.type === "GROUP")

const myParticipant = computed(() =>
  chat.value?.participants?.find((participant) => participant.userId === currentUserId.value) ?? null
)

const myRole = computed(() => myParticipant.value?.role ?? "MEMBER")
const isOwner = computed(() => myRole.value === "OWNER")
const isAdmin = computed(() => myRole.value === "ADMIN")
const canManageGroup = computed(() => isOwner.value || isAdmin.value)

function roleLabel(role: string | undefined) {
  if (role === "OWNER") return "Владелец"
  if (role === "ADMIN") return "Администратор"
  return "Участник"
}

const directParticipant = computed(() => {
  if (!chat.value?.participants?.length) return null
  return chat.value.participants.find((participant) => participant.userId !== currentUserId.value)?.user ?? null
})

const hasBlockedParticipant = computed(
  () => (chat.value?.blockedParticipantIds?.length ?? 0) > 0
)
const hasParticipantBlockedYou = computed(
  () => (chat.value?.blockedByParticipantIds?.length ?? 0) > 0
)
const canSend = computed(() => chat.value?.canMessage !== false)
const isArchived = computed(() => Boolean(chat.value?.isArchived))

function resolveChatImage(image: string | null | undefined) {
  if (!image) return ""
  if (image.startsWith("http://") || image.startsWith("https://")) return image
  if (image.includes("/")) return `${backendBaseUrl}/storage/${image}`
  return `${backendBaseUrl}/storage/chatMedia/${image}`
}

const groupAvatar = computed(() => resolveChatImage(chat.value?.image))

const message = ref("")
interface Attachment {
  mediaUrl: string
  type: "GIF" | "IMAGE" | "VOICE" | "VIDEO"
}
const attachments = ref<Attachment[]>([])
const imageUploadPending = ref(false)

function removeAttachment(index: number) {
  attachments.value.splice(index, 1)
}

const audioRecorder = ref<MediaRecorder | null>(null)
const audioStream = ref<MediaStream | null>(null)
const audioChunks = ref<Blob[]>([])
const isRecordingVoice = ref(false)
const voiceUploadPending = ref(false)
const videoRecorder = ref<MediaRecorder | null>(null)
const videoStream = ref<MediaStream | null>(null)
const videoChunks = ref<Blob[]>([])
const isRecordingVideo = ref(false)
const videoUploadPending = ref(false)
const recordingElapsed = ref(0)
const recordingTimer = ref<ReturnType<typeof setInterval> | null>(null)
const isSendingMessage = ref(false)

let resolveVoiceStop: ((uploaded: boolean) => void) | null = null
let voiceUploadPromise: Promise<Attachment | null> | null = null
let resolveVideoStop: ((uploaded: boolean) => void) | null = null
let videoUploadPromise: Promise<Attachment | null> | null = null

const canRecordVoice = computed(
  () =>
    process.client &&
    Boolean(navigator.mediaDevices?.getUserMedia) &&
    typeof MediaRecorder !== "undefined"
)
const canRecordVideo = computed(
  () =>
    process.client &&
    Boolean(navigator.mediaDevices?.getUserMedia) &&
    typeof MediaRecorder !== "undefined"
)

function formatDuration(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${seconds.toString().padStart(2, "0")}`
}

function resolveMediaUrl(attachment: Attachment | ChatMessageMedia) {
  if (attachment.mediaUrl.startsWith("http://") || attachment.mediaUrl.startsWith("https://")) {
    return attachment.mediaUrl
  }
  return `${backendBaseUrl}/storage/chatMedia/${attachment.mediaUrl}`
}

function getSupportedAudioMimeType() {
  const supportedTypes = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4",
    "audio/ogg;codecs=opus",
  ]

  return supportedTypes.find((type) => MediaRecorder.isTypeSupported(type)) ?? ""
}

function stopVoiceTracks() {
  audioStream.value?.getTracks().forEach((track) => track.stop())
  audioStream.value = null
}

function stopVideoTracks() {
  videoStream.value?.getTracks().forEach((track) => track.stop())
  videoStream.value = null
}

function stopRecordingTimer() {
  if (!recordingTimer.value) return
  clearInterval(recordingTimer.value)
  recordingTimer.value = null
}

function createVoiceFile(blob: Blob) {
  const extension = blob.type.includes("mp4")
    ? "m4a"
    : blob.type.includes("ogg")
      ? "ogg"
      : "webm"

  return new File([blob], `voice-${Date.now()}.${extension}`, {
    type: blob.type || "audio/webm",
  })
}

async function uploadVoiceBlob(blob: Blob): Promise<Attachment | null> {
  if (blob.size === 0) return null

  const formData = new FormData()
  formData.append("file", createVoiceFile(blob))

  voiceUploadPending.value = true
  try {
    const data = await callApi<{ storedFilename: string }>("/chats/upload", {
      method: "POST",
      body: formData,
      credentials: "include",
    })
    const attachment: Attachment = { mediaUrl: data.storedFilename, type: "VOICE" }
    attachments.value.push(attachment)
    return attachment
  } catch (error: any) {
    toast.add({
      color: "error",
      title: "Голосовое сообщение не добавлено",
      description: error?.response?._data?.error ?? "Не удалось загрузить аудио",
    })
    return null
  } finally {
    voiceUploadPending.value = false
  }
}

async function startVoiceRecording() {
  if (!canSend.value || !canRecordVoice.value || isRecordingVoice.value || isRecordingVideo.value) return

  try {
    audioChunks.value = []
    recordingElapsed.value = 0

    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    audioStream.value = stream

    const mimeType = getSupportedAudioMimeType()
    const recorder = new MediaRecorder(
      stream,
      mimeType ? { mimeType } : undefined
    )

    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) audioChunks.value.push(event.data)
    }

    recorder.onstop = async () => {
      const blob = new Blob(audioChunks.value, {
        type: recorder.mimeType || "audio/webm",
      })
      audioChunks.value = []
      stopVoiceTracks()
      voiceUploadPromise = uploadVoiceBlob(blob)
      const attachment = await voiceUploadPromise
      voiceUploadPromise = null
      resolveVoiceStop?.(Boolean(attachment))
      resolveVoiceStop = null
      audioRecorder.value = null
    }

    recorder.onerror = () => {
      toast.add({
        color: "error",
        title: "Ошибка записи",
        description: "Не удалось записать голосовое сообщение",
      })
      isRecordingVoice.value = false
      stopRecordingTimer()
      stopVoiceTracks()
      resolveVoiceStop?.(false)
      resolveVoiceStop = null
      audioRecorder.value = null
    }

    audioRecorder.value = recorder
    recorder.start()
    isRecordingVoice.value = true
    recordingTimer.value = setInterval(() => {
      recordingElapsed.value += 1
    }, 1000)
  } catch (error: any) {
    toast.add({
      color: "error",
      title: "Микрофон недоступен",
      description:
        error?.name === "NotAllowedError"
          ? "Разрешите доступ к микрофону в браузере"
          : "Не удалось получить доступ к микрофону",
    })
    stopVoiceTracks()
  }
}

function stopVoiceRecording() {
  if (!audioRecorder.value || audioRecorder.value.state === "inactive") {
    return Promise.resolve(false)
  }

  return new Promise<boolean>((resolve) => {
    resolveVoiceStop = resolve
    isRecordingVoice.value = false
    stopRecordingTimer()
    audioRecorder.value?.stop()
  })
}

function cancelVoiceRecording() {
  if (!audioRecorder.value || audioRecorder.value.state === "inactive") return

  resolveVoiceStop?.(false)
  resolveVoiceStop = null
  audioRecorder.value.ondataavailable = null
  audioRecorder.value.onstop = null
  audioChunks.value = []
  isRecordingVoice.value = false
  stopRecordingTimer()
  audioRecorder.value.stop()
  stopVoiceTracks()
  audioRecorder.value = null
}

async function startVideoRecording() {
  if (!canSend.value || !canRecordVideo.value || isRecordingVideo.value || isRecordingVoice.value) return

  try {
    videoChunks.value = []
    recordingElapsed.value = 0

    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "user" },
      audio: true,
    })
    videoStream.value = stream

    const mimeType = getSupportedVideoMimeType()
    const recorder = new MediaRecorder(
      stream,
      mimeType ? { mimeType } : undefined
    )

    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) videoChunks.value.push(event.data)
    }

    recorder.onstop = async () => {
      const blob = new Blob(videoChunks.value, {
        type: recorder.mimeType || "video/webm",
      })
      videoChunks.value = []
      stopVideoTracks()
      videoUploadPromise = uploadVideoBlob(blob)
      const attachment = await videoUploadPromise
      videoUploadPromise = null
      resolveVideoStop?.(Boolean(attachment))
      resolveVideoStop = null
      videoRecorder.value = null
    }

    recorder.onerror = () => {
      toast.add({
        color: "error",
        title: "Ошибка записи",
        description: "Не удалось записать видеосообщение",
      })
      isRecordingVideo.value = false
      stopRecordingTimer()
      stopVideoTracks()
      resolveVideoStop?.(false)
      resolveVideoStop = null
      videoRecorder.value = null
    }

    videoRecorder.value = recorder
    recorder.start()
    isRecordingVideo.value = true
    recordingTimer.value = setInterval(() => {
      recordingElapsed.value += 1
    }, 1000)
  } catch (error: any) {
    toast.add({
      color: "error",
      title: "Камера недоступна",
      description:
        error?.name === "NotAllowedError"
          ? "Разрешите доступ к камере и микрофону в браузере"
          : "Не удалось получить доступ к камере",
    })
    stopVideoTracks()
  }
}

function stopVideoRecording() {
  if (!videoRecorder.value || videoRecorder.value.state === "inactive") {
    return Promise.resolve(false)
  }

  return new Promise<boolean>((resolve) => {
    resolveVideoStop = resolve
    isRecordingVideo.value = false
    stopRecordingTimer()
    videoRecorder.value?.stop()
  })
}

function cancelVideoRecording() {
  if (!videoRecorder.value || videoRecorder.value.state === "inactive") return

  resolveVideoStop?.(false)
  resolveVideoStop = null
  videoRecorder.value.ondataavailable = null
  videoRecorder.value.onstop = null
  videoChunks.value = []
  isRecordingVideo.value = false
  stopRecordingTimer()
  videoRecorder.value.stop()
  stopVideoTracks()
  videoRecorder.value = null
}

const { mutateAsync } = useSendMessage()
const chatContainer = ref<HTMLElement | null>(null)
const isPinnedToBottom = ref(true)

const hasDraft = computed(() => message.value.trim().length > 0 || attachments.value.length > 0)
const deletingMessageIds = ref<number[]>([])
const canSubmitMessage = computed(
  () =>
    canSend.value &&
    !isSendingMessage.value &&
    !imageUploadPending.value &&
    (hasDraft.value ||
      isRecordingVoice.value ||
      isRecordingVideo.value ||
      Boolean(voiceUploadPromise) ||
      Boolean(videoUploadPromise))
)

const composerStatus = computed(() => {
  if (!canSend.value) return "Отправка сообщений недоступна"
  if (isSendingMessage.value) return "Отправляем сообщение..."
  if (voiceUploadPending.value) return "Загружаем голосовое сообщение..."
  if (videoUploadPending.value) return "Загружаем видеосообщение..."
  if (imageUploadPending.value) return "Загружаем изображение..."
  if (isRecordingVideo.value) return "Идет запись. Нажмите отправить, чтобы сразу отправить видео."
  if (isRecordingVoice.value) return "Идет запись. Нажмите отправить, чтобы сразу отправить голосовое."
  if (attachments.value.length > 0) return `${attachments.value.length} вложение готово к отправке`
  return ""
})

function updatePinnedState() {
  const element = chatContainer.value
  if (!element) return
  const distanceFromBottom = element.scrollHeight - element.scrollTop - element.clientHeight
  isPinnedToBottom.value = distanceFromBottom < 80
}

function scrollToBottom() {
  if (chatContainer.value) {
    chatContainer.value.scrollTop = chatContainer.value.scrollHeight
    isPinnedToBottom.value = true
  }
}

function scrollToBottomSoon() {
  nextTick(() => scrollToBottom())
}

async function sendMessage() {
  if (!canSubmitMessage.value) return

  if (isRecordingVoice.value) {
    await stopVoiceRecording()
  } else if (isRecordingVideo.value) {
    await stopVideoRecording()
  } else if (voiceUploadPromise) {
    await voiceUploadPromise
  } else if (videoUploadPromise) {
    await videoUploadPromise
  }

  if (!message.value.trim() && attachments.value.length === 0) return

  emitTyping(false)
  const payload = {
    chatId: chatId.value,
    content: message.value,
    attachments: attachments.value,
  }

  try {
    isSendingMessage.value = true
    await mutateAsync(payload)
    message.value = ""
    attachments.value = []
    await nextTick()
    scrollToBottom()
  } catch (error: any) {
    toast.add({
      color: "error",
      title: "Сообщение не отправлено",
      description: error?.response?._data?.error ?? "Не удалось отправить сообщение",
    })
  } finally {
    isSendingMessage.value = false
  }
}

function onInput() {
  emitTyping(true)
}

function onBlur() {
  emitTyping(false)
}

function onComposerKeydown(event: KeyboardEvent) {
  if (event.key !== "Enter" || event.shiftKey || event.ctrlKey || event.altKey || event.metaKey) {
    return
  }

  event.preventDefault()
  void sendMessage()
}

const showEmojiPicker = ref(false)
function toggleEmojiPicker() {
  showEmojiPicker.value = !showEmojiPicker.value
}

function onSelectEmoji(emoji: any) {
  message.value += emoji.i
  showEmojiPicker.value = false
}

const showGifPicker = ref(false)
function toggleGifPicker() {
  showGifPicker.value = !showGifPicker.value
}

function onSelectGif(gifUrl: string) {
  attachments.value.push({ mediaUrl: gifUrl, type: "GIF" })
  showGifPicker.value = false
}

const imageInput = ref<HTMLInputElement | null>(null)
function triggerImageInput() {
  imageInput.value?.click()
}

async function onImageSelected(event: Event) {
  const target = event.target as HTMLInputElement
  if (!target.files) return

  await uploadImageFiles(Array.from(target.files))
  target.value = ""
}

async function uploadImageFiles(files: File[]) {
  if (!files.length) return

  imageUploadPending.value = true
  try {
    for (const file of files) {
      const formData = new FormData()
      formData.append("file", file)
      const data = await callApi<{ storedFilename: string }>("/chats/upload", {
        method: "POST",
        body: formData,
        credentials: "include",
      })
      attachments.value.push({ mediaUrl: data.storedFilename, type: "IMAGE" })
    }
  } catch (error: any) {
    toast.add({
      color: "error",
      title: "Изображение не добавлено",
      description: error?.response?._data?.error ?? "Не удалось загрузить изображение",
    })
  } finally {
    imageUploadPending.value = false
  }
}

function isDeletingMessage(messageId: number) {
  return deletingMessageIds.value.includes(messageId)
}

function canDeleteMessage(messageItem: ChatMessage) {
  return messageItem.senderId === currentUserId.value
}

function isMessageReadByRecipients(messageItem: ChatMessage) {
  const recipientNotifications =
    messageItem.notifications?.filter(
      (notification) => notification.userId !== currentUserId.value
    ) ?? []

  if (!recipientNotifications.length) return false
  return recipientNotifications.every((notification) => notification.read)
}

async function deleteMessage(messageItem: ChatMessage) {
  if (!canDeleteMessage(messageItem) || isDeletingMessage(messageItem.id)) return

  deletingMessageIds.value = [...deletingMessageIds.value, messageItem.id]
  try {
    await callApi<{ success: boolean; message: string }>(
      `/chats/${chatId.value}/messages/${messageItem.id}`,
      {
        method: "DELETE",
        credentials: "include",
      }
    )
  } catch (error: any) {
    toast.add({
      color: "error",
      title: "Сообщение не удалено",
      description: error?.response?._data?.error ?? "Не удалось удалить сообщение",
    })
  } finally {
    deletingMessageIds.value = deletingMessageIds.value.filter((id) => id !== messageItem.id)
  }
}

function getSupportedVideoMimeType() {
  const supportedTypes = [
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp8,opus",
    "video/webm",
    "video/mp4",
  ]

  return supportedTypes.find((type) => MediaRecorder.isTypeSupported(type)) ?? ""
}

function createVideoFile(blob: Blob) {
  const extension = blob.type.includes("mp4") ? "mp4" : "webm"

  return new File([blob], `video-${Date.now()}.${extension}`, {
    type: blob.type || "video/webm",
  })
}

async function uploadVideoBlob(blob: Blob): Promise<Attachment | null> {
  if (blob.size === 0) return null

  const formData = new FormData()
  formData.append("file", createVideoFile(blob))

  videoUploadPending.value = true
  try {
    const data = await callApi<{ storedFilename: string }>("/chats/upload", {
      method: "POST",
      body: formData,
      credentials: "include",
    })
    const attachment: Attachment = { mediaUrl: data.storedFilename, type: "VIDEO" }
    attachments.value.push(attachment)
    return attachment
  } catch (error: any) {
    toast.add({
      color: "error",
      title: "Видеосообщение не добавлено",
      description: error?.response?._data?.error ?? "Не удалось загрузить видео",
    })
    return null
  } finally {
    videoUploadPending.value = false
  }
}

async function onComposerPaste(event: ClipboardEvent) {
  if (!canSend.value || imageUploadPending.value) return

  const clipboardItems = Array.from(event.clipboardData?.items ?? [])
  const imageFiles = clipboardItems
    .filter((item) => item.kind === "file" && item.type.startsWith("image/"))
    .map((item) => item.getAsFile())
    .filter((file): file is File => Boolean(file))

  if (!imageFiles.length) return

  event.preventDefault()
  await uploadImageFiles(imageFiles)
}

const markAsReadMutation = useMutation({
  mutationFn: async (id: number) => {
    return await callApi<{ message: string }>(`/notifications/${id}/read`, {
      method: "PUT",
      credentials: "include",
    })
  },
})

async function markAsRead(entry: IntersectionObserverEntry) {
  const msgId = Number(entry.target.getAttribute("data-msg-id"))
  if (!msgId) return

  const chatData = chatQuery.data.value
  const msg = chatData?.messages?.find((m) => m.id === msgId)
  if (!msg) return

  const notification = msg.notifications?.find(
    (n) => n.userId === userProfileQuery.data.value?.user?.id
  )
  if (!notification || notification.read) return

  markAsReadMutation.mutate(notification.id, {
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] })
      queryClient.invalidateQueries({ queryKey: ["chats"] })
    },
  })
}

const { observeElement } = useIntersectionObserver(markAsRead)
function registerMsgRef(element: HTMLElement) {
  observeElement(element)
}

function invalidateChatQueries() {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: ["chats"] }),
    queryClient.invalidateQueries({ queryKey: ["chat", chatId.value] }),
    queryClient.invalidateQueries({ queryKey: ["blocked-users"] }),
  ])
}

const archivePending = ref(false)
async function archiveCurrentChat() {
  archivePending.value = true
  try {
    await callApi<{ message: string }>(`/chats/${chatId.value}/archive`, {
      method: "POST",
      credentials: "include",
    })
    await invalidateChatQueries()
    toast.add({
      color: "success",
      title: "Архивировано",
      description: "Чат перемещен в архив",
    })
  } catch (error: any) {
    toast.add({
      color: "error",
      title: "Ошибка",
      description: error?.response?._data?.error ?? "Не удалось архивировать чат",
    })
  } finally {
    archivePending.value = false
  }
}

async function unarchiveCurrentChat() {
  archivePending.value = true
  try {
    await callApi<{ message: string }>(`/chats/${chatId.value}/archive`, {
      method: "DELETE",
      credentials: "include",
    })
    await invalidateChatQueries()
    toast.add({
      color: "success",
      title: "Восстановлено",
      description: "Чат возвращен из архива",
    })
  } catch (error: any) {
    toast.add({
      color: "error",
      title: "Ошибка",
      description: error?.response?._data?.error ?? "Не удалось вернуть чат из архива",
    })
  } finally {
    archivePending.value = false
  }
}

const blockPending = ref(false)
async function blockDirectParticipant() {
  if (!directParticipant.value) return
  blockPending.value = true

  try {
    await callApi<{ message: string }>(`/chats/users/${directParticipant.value.id}/block`, {
      method: "POST",
      credentials: "include",
    })
    await invalidateChatQueries()
    toast.add({
      color: "warning",
      title: "Пользователь заблокирован",
      description: "Вы заблокировали пользователя",
    })
  } catch (error: any) {
    toast.add({
      color: "error",
      title: "Ошибка",
      description: error?.response?._data?.error ?? "Не удалось заблокировать пользователя",
    })
  } finally {
    blockPending.value = false
  }
}

async function unblockDirectParticipant() {
  if (!directParticipant.value) return
  blockPending.value = true

  try {
    await callApi<{ message: string }>(`/chats/users/${directParticipant.value.id}/block`, {
      method: "DELETE",
      credentials: "include",
    })
    await invalidateChatQueries()
    toast.add({
      color: "success",
      title: "Пользователь разблокирован",
      description: "Вы разблокировали пользователя",
    })
  } catch (error: any) {
    toast.add({
      color: "error",
      title: "Ошибка",
      description: error?.response?._data?.error ?? "Не удалось разблокировать пользователя",
    })
  } finally {
    blockPending.value = false
  }
}

const showGroupManagement = ref(false)
const groupNameInput = ref("")
const groupImageInput = ref("")
const groupActionPending = ref(false)
const deleteGroupPending = ref(false)
const groupImageUploadPending = ref(false)
const groupImageFileInput = ref<HTMLInputElement | null>(null)
const groupImagePreview = computed(() => resolveChatImage(groupImageInput.value))

function triggerGroupImageInput() {
  groupImageFileInput.value?.click()
}

async function onGroupImageSelected(event: Event) {
  const target = event.target as HTMLInputElement
  if (!target.files?.length) return

  const file = target.files[0]
  const formData = new FormData()
  formData.append("file", file)
  groupImageUploadPending.value = true

  try {
    const data = await callApi<{ storedFilename: string }>("/chats/upload", {
      method: "POST",
      body: formData,
      credentials: "include",
    })
    groupImageInput.value = data.storedFilename
  } catch (error: any) {
    toast.add({
      color: "error",
      title: "Ошибка",
      description: error?.response?._data?.error ?? "Не удалось загрузить файл",
    })
  } finally {
    groupImageUploadPending.value = false
    target.value = ""
  }
}

watch(
  () => chat.value,
  (chatValue) => {
    if (!chatValue) return
    groupNameInput.value = chatValue.name ?? ""
    groupImageInput.value = chatValue.image ?? ""
  },
  { immediate: true }
)

const manageableParticipants = computed(() => {
  if (!chat.value?.participants) return []
  return chat.value.participants.filter((participant) => participant.userId !== currentUserId.value)
})

function canManageParticipantRole(participant: ChatParticipant) {
  if (!isGroup.value || !canManageGroup.value) return false
  if (participant.role === "OWNER") return false
  if (isOwner.value) return true
  return participant.role === "MEMBER"
}

function canKickParticipant(participant: ChatParticipant) {
  if (!isGroup.value || !canManageGroup.value) return false
  if (participant.role === "OWNER") return false
  if (isOwner.value) return true
  return participant.role === "MEMBER"
}

async function saveGroupDetails() {
  if (!isGroup.value || !canManageGroup.value) return
  groupActionPending.value = true

  try {
    await callApi<{ message: string }> (`/chats/${chatId.value}/group`, {
      method: "PATCH",
      credentials: "include",
      body: {
        name: groupNameInput.value,
        image: groupImageInput.value || null,
      },
    })
    await invalidateChatQueries()
    toast.add({
      color: "success",
      title: "Группа обновлена",
      description: "Название и фото группы сохранены",
    })
  } catch (error: any) {
    toast.add({
      color: "error",
      title: "Ошибка",
      description: error?.response?._data?.error ?? "Не удалось обновить группу",
    })
  } finally {
    groupActionPending.value = false
  }
}

async function setParticipantRole(participant: ChatParticipant, role: "ADMIN" | "MEMBER") {
  if (!canManageParticipantRole(participant)) return
  groupActionPending.value = true

  try {
    await callApi<{ message: string }>(`/chats/${chatId.value}/participants/${participant.userId}/role`, {
      method: "PATCH",
      credentials: "include",
      body: { role },
    })
    await invalidateChatQueries()
    toast.add({
      color: "success",
      title: "Права изменены",
      description: "Роль участника обновлена",
    })
  } catch (error: any) {
    toast.add({
      color: "error",
      title: "Ошибка",
      description: error?.response?._data?.error ?? "Не удалось изменить роль",
    })
  } finally {
    groupActionPending.value = false
  }
}

async function removeParticipant(participant: ChatParticipant) {
  if (!canKickParticipant(participant)) return
  groupActionPending.value = true

  try {
    await callApi<{ message: string }>(`/chats/${chatId.value}/participants/${participant.userId}`, {
      method: "DELETE",
      credentials: "include",
    })
    await invalidateChatQueries()
    toast.add({
      color: "success",
      title: "Участник удален",
      description: `${participant.user?.name ?? "Пользователь"} удален из группы`,
    })
  } catch (error: any) {
    toast.add({
      color: "error",
      title: "Ошибка",
      description: error?.response?._data?.error ?? "Не удалось удалить участника",
    })
  } finally {
    groupActionPending.value = false
  }
}

async function deleteCurrentGroup() {
  if (!isGroup.value || !isOwner.value) return
  deleteGroupPending.value = true

  try {
    await callApi<{ message: string }>(`/chats/${chatId.value}`, {
      method: "DELETE",
      credentials: "include",
    })
    await invalidateChatQueries()
    await navigateTo("/")
    toast.add({
      color: "success",
      title: "Группа удалена",
    })
  } catch (error: any) {
    toast.add({
      color: "error",
      title: "Ошибка",
      description: error?.response?._data?.error ?? "Не удалось удалить группу",
    })
  } finally {
    deleteGroupPending.value = false
  }
}

watch(
  () => chatQuery.data.value?.messages,
  () => {
    if (isPinnedToBottom.value) scrollToBottomSoon()
  },
  { immediate: true, deep: true }
)

onMounted(() => {
  scrollToBottom()
})

onBeforeUnmount(() => {
  stopRecordingTimer()
  stopVoiceTracks()
  stopVideoTracks()
})

const colorMode = useColorMode()

const presenceStore = usePresenceStore()
const onlineUsersInChat = computed(() => presenceStore.chatUsers)

const isOnline = (userId: number | undefined) => {
  if (!onlineUsersInChat.value || !userId) return false
  return onlineUsersInChat.value(chatId.value).some((user) => user.id === userId)
}

const chatTitle = computed(() => {
  if (!chat.value) return "Чат"
  if (chat.value.type === "ONE_ON_ONE") {
    return directParticipant.value?.name ?? "Личный чат"
  }

  if (chat.value.name?.trim()) return chat.value.name

  const names = (chat.value.participants ?? [])
    .filter((participant) => participant.userId !== currentUserId.value)
    .map((participant) => participant.user?.name)
    .filter(Boolean) as string[]

  if (names.length === 0) return "Групповой чат"
  return names.join(", ")
})
</script>

<template>
  <div class="chat-workspace">
    <div class="chat-shell__main">
      <div v-if="isLoading" class="chat-shell__placeholder">Загрузка чата...</div>
      <div v-else-if="error" class="chat-shell__placeholder">Не удалось загрузить чат</div>
      <template v-else>
        <header class="chat-shell__header chat-shell__header--floating">
          <div class="chat-shell__header-left">
            <UAvatar
              v-if="chat?.type === 'ONE_ON_ONE'"
              :src="getAvatarUrl(directParticipant ?? undefined)"
              size="xs"
            />
            <UAvatar
              v-else-if="groupAvatar"
              :src="groupAvatar"
              size="xs"
            />
            <UAvatarGroup v-else :max="3" size="xs">
              <UAvatar
                v-for="participant in chat?.participants?.filter(
                  (p) => p.userId !== currentUserId
                )"
                :key="participant.id"
                :src="getAvatarUrl(participant.user)"
              />
            </UAvatarGroup>
            <div class="chat-shell__meta">
              <h2>Диалог с {{ chatTitle }}</h2>
              <p v-if="chat?.type === 'ONE_ON_ONE' && directParticipant">
                {{ isOnline(directParticipant.id) ? "В сети" : "Не в сети" }}
              </p>
              <p v-else>
                {{ chat?.participants?.length ?? 0 }} участников
              </p>
            </div>
          </div>

          <div class="chat-shell__header-actions">
            <UButton
              size="xs"
              color="neutral"
              variant="soft"
              :loading="archivePending"
              @click="isArchived ? unarchiveCurrentChat() : archiveCurrentChat()"
            >
              {{ isArchived ? "Разархивировать" : "Архивировать" }}
            </UButton>

            <UButton
              v-if="chat?.type === 'ONE_ON_ONE' && directParticipant"
              size="xs"
              :color="hasBlockedParticipant ? 'success' : 'warning'"
              variant="soft"
              :loading="blockPending"
              @click="
                hasBlockedParticipant
                  ? unblockDirectParticipant()
                  : blockDirectParticipant()
              "
            >
              {{ hasBlockedParticipant ? "Разблокировать" : "Заблокировать" }}
            </UButton>

            <UButton
              v-if="isGroup && canManageGroup"
              size="xs"
              color="neutral"
              variant="soft"
              @click="showGroupManagement = !showGroupManagement"
            >
              {{ showGroupManagement ? "Скрыть управление" : "Управление группой" }}
            </UButton>
          </div>
        </header>

        <div
          v-if="hasBlockedParticipant || hasParticipantBlockedYou"
          class="chat-shell__status chat-shell__status--blocked"
        >
          <span v-if="hasBlockedParticipant">
            Вы заблокировали этого пользователя. Разблокируйте его, чтобы продолжить переписку.
          </span>
          <span v-else>
            Этот пользователь заблокировал вас. Отправка сообщений недоступна.
          </span>
        </div>

        <div v-if="isArchived" class="chat-shell__status chat-shell__status--archived">
          Этот чат находится у вас в архиве.
        </div>

        <div
          class="chat-shell__messages"
          :class="{ 'chat-shell__messages--compact': attachments.length > 0 }"
          ref="chatContainer"
          @scroll="updatePinnedState"
        >
          <div v-if="!chat?.messages?.length" class="chat-shell__empty">
            <UIcon name="i-heroicons-chat-bubble-left-right" size="28" />
            <p>Сообщений пока нет</p>
            <span>Напишите текст, отправьте изображение или запишите голосовое.</span>
          </div>

          <div
            v-for="messageItem in chat?.messages"
            :key="messageItem.id"
            class="chat-bubble"
            :class="
              messageItem.senderId === currentUserId
                ? 'chat-bubble--mine'
                : 'chat-bubble--other'
            "
            :data-msg-id="messageItem.id"
            :ref="(el) => registerMsgRef(el as HTMLElement)"
          >
            <div class="chat-bubble__sender">{{ messageItem.sender?.name }}</div>
            <p v-if="messageItem.content" class="chat-bubble__text">
              {{ messageItem.content }}
            </p>

            <div v-if="messageItem.media && messageItem.media.length" class="chat-bubble__media">
              <div v-for="attachment in messageItem.media" :key="attachment.id">
                <audio
                  v-if="attachment.type === 'VOICE'"
                  :src="resolveMediaUrl(attachment)"
                  controls
                  preload="metadata"
                  class="chat-bubble__voice"
                />
                <video
                  v-else-if="attachment.type === 'VIDEO'"
                  :src="resolveMediaUrl(attachment)"
                  controls
                  preload="metadata"
                  playsinline
                  class="chat-bubble__image"
                />
                <img
                  v-else-if="attachment.type === 'GIF'"
                  :src="attachment.mediaUrl"
                  class="chat-bubble__image"
                  @load="isPinnedToBottom && scrollToBottom()"
                />
                <img
                  v-else
                  :src="`${backendBaseUrl}/storage/chatMedia/${attachment.mediaUrl}`"
                  class="chat-bubble__image"
                  @load="isPinnedToBottom && scrollToBottom()"
                />
              </div>
            </div>
            <div class="chat-bubble__meta">
              <span
                v-if="messageItem.senderId === currentUserId"
                class="chat-bubble__status"
                :class="{
                  'chat-bubble__status--read': isMessageReadByRecipients(messageItem),
                }"
              >
                {{ isMessageReadByRecipients(messageItem) ? "✓✓" : "✓" }}
              </span>
              <span class="chat-bubble__time">
                {{
                  new Date(messageItem.createdAt).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })
                }}
              </span>
            </div>
            <UButton
              v-if="canDeleteMessage(messageItem)"
              class="chat-bubble__delete"
              color="neutral"
              variant="ghost"
              size="xs"
              :loading="isDeletingMessage(messageItem.id)"
              @click="deleteMessage(messageItem)"
            >
              Удалить
            </UButton>
          </div>
        </div>

        <UButton
          v-if="!isPinnedToBottom"
          class="chat-shell__jump"
          color="neutral"
          variant="soft"
          size="xs"
          @click="scrollToBottom"
        >
          <UIcon name="i-heroicons-arrow-down" />
          К последним
        </UButton>

        <UCard
          v-if="otherTypingIndicators.length"
          :ui="{ body: 'sm:p-1 p-1' }"
          class="chat-shell__typing"
        >
          <span v-for="(indicator, index) in otherTypingIndicators" :key="index">
            {{ indicator.name }} печатает...
          </span>
        </UCard>

        <div class="chat-shell__composer">
          <div
            v-if="attachments.length"
            class="chat-shell__attachments"
          >
            <div
              v-for="(attachment, index) in attachments"
              :key="index"
              class="chat-shell__attachment"
            >
              <div
                v-if="attachment.type === 'VOICE'"
                class="chat-shell__voice-preview"
              >
                <UIcon name="i-heroicons-microphone" />
                <span>Голосовое</span>
                <audio
                  :src="resolveMediaUrl(attachment)"
                  controls
                  preload="metadata"
                />
              </div>
              <video
                v-else-if="attachment.type === 'VIDEO'"
                class="chat-shell__attachment-video"
                :src="resolveMediaUrl(attachment)"
                controls
                preload="metadata"
                playsinline
              />
              <img
                v-else-if="attachment.type === 'IMAGE'"
                class="chat-shell__attachment-image"
                :src="`${backendBaseUrl}/storage/chatMedia/${attachment.mediaUrl}`"
              />
              <img
                v-else
                class="chat-shell__attachment-image"
                :src="attachment.mediaUrl"
              />
              <UButton
                class="chat-shell__attachment-remove"
                color="error"
                size="xs"
                @click="removeAttachment(index)"
              >
                x
              </UButton>
            </div>
          </div>

          <div class="chat-shell__composer-row">
            <UTextarea
              v-model="message"
              :disabled="!canSend"
              @input="onInput"
              @blur="onBlur"
              @keydown="onComposerKeydown"
              @paste="onComposerPaste"
              placeholder="Напишите сообщение..."
              class="chat-shell__input"
              :rows="1"
              autoresize
            />

            <div class="chat-shell__tools">
              <UButton
                variant="ghost"
                color="neutral"
                class="p-1"
                :disabled="!canSend"
                aria-label="Открыть эмодзи"
                title="Эмодзи"
                @click="toggleEmojiPicker"
              >
                <UIcon name="i-heroicons-face-smile" size="20" />
              </UButton>
              <UButton
                variant="ghost"
                color="neutral"
                class="p-1"
                :disabled="!canSend"
                aria-label="Открыть GIF"
                title="GIF"
                @click="toggleGifPicker"
              >
                <UIcon name="i-heroicons-gif" size="20" />
              </UButton>
              <UButton
                variant="ghost"
                color="neutral"
                class="p-1"
                :disabled="!canSend || imageUploadPending"
                :loading="imageUploadPending"
                aria-label="Прикрепить изображение"
                title="Изображение"
                @click="triggerImageInput"
              >
                <UIcon name="i-heroicons-photo" size="20" />
              </UButton>
              <UButton
                variant="ghost"
                :color="isRecordingVoice ? 'error' : 'neutral'"
                class="p-1"
                :disabled="!canSend || voiceUploadPending || videoUploadPending || isRecordingVideo || !canRecordVoice"
                :loading="voiceUploadPending"
                :aria-label="isRecordingVoice ? 'Остановить запись' : 'Записать голосовое'"
                :title="isRecordingVoice ? 'Остановить запись' : 'Голосовое сообщение'"
                @click="isRecordingVoice ? stopVoiceRecording() : startVoiceRecording()"
              >
                <UIcon
                  :name="isRecordingVoice ? 'i-heroicons-stop' : 'i-heroicons-microphone'"
                  size="20"
                />
              </UButton>
              <UButton
                color="primary"
                class="chat-shell__send-btn"
                :disabled="!canSubmitMessage"
                :loading="isSendingMessage || voiceUploadPending || videoUploadPending"
                aria-label="Отправить сообщение"
                title="Отправить"
                @click="sendMessage"
              >
              <UIcon name="i-heroicons-paper-airplane" size="16" />
              </UButton>
            </div>
          </div>

          <div class="chat-shell__composer-status">
            {{ composerStatus }}
          </div>

          <div v-if="isRecordingVoice || isRecordingVideo" class="chat-shell__recording">
            <span class="chat-shell__recording-dot" />
            <span>{{ isRecordingVideo ? "Видео" : "Запись" }} {{ formatDuration(recordingElapsed) }}</span>
            <div class="chat-shell__recording-wave" aria-hidden="true">
              <span v-for="bar in 12" :key="bar" />
            </div>
            <UButton
              size="xs"
              color="error"
              variant="soft"
              @click="isRecordingVideo ? cancelVideoRecording() : cancelVoiceRecording()"
            >
              Отмена
            </UButton>
          </div>

          <input
            type="file"
            ref="imageInput"
            accept="image/*"
            multiple
            class="hidden"
            @change="onImageSelected"
          />

          <div v-if="showEmojiPicker" class="chat-shell__picker">
            <ClientOnly>
              <ChatEmojiPicker
                :native="true"
                @select="onSelectEmoji"
                :theme="colorMode.value === 'dark' ? 'dark' : 'light'"
              />
            </ClientOnly>
          </div>

          <div v-if="showGifPicker" class="chat-shell__picker">
            <GifPicker @select="onSelectGif" />
          </div>
        </div>
      </template>
    </div>

    <aside class="chat-shell__info lg:flex hidden" v-if="chat">
      <div class="chat-info-card">
        <div class="chat-info-card__header">
          <UAvatar
            :src="chat.type === 'GROUP' ? groupAvatar : getAvatarUrl(directParticipant ?? undefined)"
          />
          <div>
            <p class="chat-info-card__name">{{ chatTitle }}</p>
            <span class="chat-info-card__phone">
              <template v-if="chat.type === 'ONE_ON_ONE'">
                {{ directParticipant?.email ?? "" }}
              </template>
              <template v-else>
                {{ roleLabel(myRole) }}
              </template>
            </span>
          </div>
        </div>
      </div>

      <div v-if="isGroup && showGroupManagement" class="chat-group-settings">
        <h3>Управление группой</h3>

        <div class="chat-group-settings__fields" v-if="canManageGroup">
          <UFormField label="Название группы">
            <UInput v-model="groupNameInput" />
          </UFormField>
          <UFormField label="Фото группы">
            <div class="chat-group-photo-upload">
              <UButton
                size="xs"
                color="neutral"
                variant="soft"
                :loading="groupImageUploadPending"
                @click="triggerGroupImageInput"
              >
                Выбрать файл
              </UButton>
              <input
                ref="groupImageFileInput"
                type="file"
                accept="image/*"
                class="hidden"
                @change="onGroupImageSelected"
              />
              <img
                v-if="groupImagePreview"
                :src="groupImagePreview"
                class="chat-group-photo-preview"
              />
            </div>
          </UFormField>
          <UButton
            size="xs"
            color="primary"
            :loading="groupActionPending"
            @click="saveGroupDetails"
          >
            Сохранить группу
          </UButton>
        </div>

        <div class="chat-group-settings__participants">
          <p class="chat-group-settings__subtitle">Участники</p>
          <div
            v-for="participant in manageableParticipants"
            :key="participant.id"
            class="chat-group-settings__participant"
          >
            <div class="chat-group-settings__participant-main">
              <UAvatar :src="getAvatarUrl(participant.user)" size="xs" />
              <div class="chat-group-settings__participant-meta">
                <span>{{ participant.user?.name }}</span>
                <small>{{ roleLabel(participant.role) }}</small>
              </div>
            </div>

            <div class="chat-group-settings__participant-actions">
              <UButton
                v-if="canManageParticipantRole(participant) && participant.role === 'MEMBER'"
                size="xs"
                color="neutral"
                variant="soft"
                :loading="groupActionPending"
                @click="setParticipantRole(participant, 'ADMIN')"
              >
                Сделать админом
              </UButton>
              <UButton
                v-if="canManageParticipantRole(participant) && participant.role === 'ADMIN' && isOwner"
                size="xs"
                color="neutral"
                variant="soft"
                :loading="groupActionPending"
                @click="setParticipantRole(participant, 'MEMBER')"
              >
                Снять админа
              </UButton>
              <UButton
                v-if="canKickParticipant(participant)"
                size="xs"
                color="error"
                variant="soft"
                :loading="groupActionPending"
                @click="removeParticipant(participant)"
              >
                Удалить
              </UButton>
            </div>
          </div>
        </div>

        <UButton
          v-if="isOwner"
          color="error"
          variant="soft"
          size="sm"
          :loading="deleteGroupPending"
          @click="deleteCurrentGroup"
        >
          Удалить группу
        </UButton>
      </div>
    </aside>
  </div>
</template>


