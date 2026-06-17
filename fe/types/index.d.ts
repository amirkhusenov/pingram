declare global {
  export interface User {
    id: number
    name: string
    email: string
    profile_image?: string | null
    chatId?: number | null
    createdAt: Date
    updatedAt: Date

    sentFriendRequests?: FriendRequest[]
    receivedFriendRequests?: FriendRequest[]
    notifications?: Notification[]
    blockedUsers?: UserBlock[]
    blockedByUsers?: UserBlock[]
    archivedChats?: ChatArchive[]
  }

  export type MinimalUser = {
    name: string
    id: number
    profile_image: string
    chatId?: number
  }

  export enum FriendRequestStatus {
    PENDING = "PENDING",
    ACCEPTED = "ACCEPTED",
    DECLINED = "DECLINED",
  }

  export enum NotificationType {
    FRIEND_REQUEST = "FRIEND_REQUEST",
    FRIEND_REQUEST_ACCEPTED = "FRIEND_REQUEST_ACCEPTED",
    FRIEND_REMOVED = "FRIEND_REMOVED",
    CHAT_CREATED = "CHAT_CREATED",
    CHAT_MESSAGE = "CHAT_MESSAGE",
  }

  export enum ChatType {
    ONE_ON_ONE = "ONE_ON_ONE",
    GROUP = "GROUP",
  }

  export enum MessageType {
    TEXT = "TEXT",
    GIF = "GIF",
    IMAGE = "IMAGE",
    VOICE = "VOICE",
    VIDEO = "VIDEO",
  }

  export enum ChatParticipantRole {
    OWNER = "OWNER",
    ADMIN = "ADMIN",
    MEMBER = "MEMBER",
  }

  export interface FriendRequest {
    id: number
    senderId: number
    receiverId: number
    status: FriendRequestStatus
    createdAt: Date
    updatedAt: Date

    // Relations
    sender?: User
    receiver?: User
    notifications?: Notification[]
  }

  export interface Notification {
    id: number
    userId: number
    type: NotificationType
    message: string
    read: boolean
    createdAt: Date
    updatedAt: Date

    // Optional relations
    friendRequestId?: number | null
    chatId?: number | null
    messageId?: number | null

    // Relations
    user?: User
    friendRequest?: FriendRequest
    chat?: Chat
    chatMessage?: ChatMessage // If a single notification can reference multiple messages
  }
  export interface Chat {
    id: number
    type: ChatType
    name?: string | null
    image?: string | null
    createdAt: Date
    updatedAt: Date
    lastMessageId?: number | null
    isArchived?: boolean
    blockedParticipantIds?: number[]
    blockedByParticipantIds?: number[]
    canMessage?: boolean

    // Relations
    participants?: ChatParticipant[]
    messages?: ChatMessage[]
    lastMessage?: ChatMessage | null
    notifications?: Notification[]
    archives?: ChatArchive[]
  }

  export interface ChatParticipant {
    id: number
    chatId: number
    userId: number
    role: ChatParticipantRole
    joinedAt: Date

    // Relations
    chat?: Chat
    user?: User
  }

  export interface ChatMessage {
    id: number
    chatId: number
    senderId: number
    content?: string | null
    createdAt: Date

    // Relations
    chat?: Chat
    sender?: User
    media?: ChatMessageMedia[]
    Chat?: Chat[] // Because of the "lastMessage" relation, a Chat can reference this message
    notifications?: Notification[]
  }

  export interface ChatMessageMedia {
    id: number
    messageId: number
    mediaUrl: string
    type: MessageType
    createdAt: Date

    // Relations
    message?: ChatMessage
  }

  export interface UserBlock {
    id: number
    blockerId: number
    blockedId: number
    createdAt: Date
    blocker?: User
    blocked?: User
  }

  export interface ChatArchive {
    id: number
    userId: number
    chatId: number
    createdAt: Date
    user?: User
    chat?: Chat
  }
}

export {}
