import type { ChatParticipantRole } from "@prisma/client"
import type { Request, Response, NextFunction } from "express"
import prisma from "../../prisma/db"
import { getIO } from "../realtime/socketInstance"
import { emitToUser } from "../realtime/setupLobby"
import { asyncHandler } from "../utils"

interface OneToOneChatBody {
  friendId: number
}

interface GroupChatBody {
  friendIds: number[]
  name?: string
  image?: string
}

interface UpdateGroupBody {
  name?: string
  image?: string | null
}

interface UpdateGroupParticipantRoleBody {
  role?: "ADMIN" | "MEMBER"
}

export interface AuthenticatedUser {
  id: number
  email: string
  name: string
}

export interface AuthenticatedRequest<T = any> extends Request {
  user?: AuthenticatedUser
  body: T
}

function parseId(value: string | undefined): number | null {
  if (!value) return null
  const parsed = Number.parseInt(value, 10)
  return Number.isNaN(parsed) ? null : parsed
}

function parseGroupRole(value: string | undefined): "ADMIN" | "MEMBER" | null {
  if (!value) return null
  if (value === "ADMIN" || value === "MEMBER") return value
  return null
}

function normalizeGroupName(value: string | undefined): string | undefined {
  if (typeof value !== "string") return undefined
  const normalized = value.trim()
  if (!normalized) return undefined
  return normalized.slice(0, 120)
}

function normalizeUniqueIds(ids: number[] | undefined): number[] {
  if (!Array.isArray(ids)) return []

  const normalized = ids
    .map((id) => Number.parseInt(String(id), 10))
    .filter((id) => Number.isInteger(id) && id > 0)

  return [...new Set(normalized)]
}

function canManageGroup(role: ChatParticipantRole) {
  return role === "OWNER" || role === "ADMIN"
}

async function getBlockSets(userId: number) {
  const [blockedByMe, blockedMe] = await Promise.all([
    prisma.userBlock.findMany({
      where: { blockerId: userId },
      select: { blockedId: true },
    }),
    prisma.userBlock.findMany({
      where: { blockedId: userId },
      select: { blockerId: true },
    }),
  ])

  return {
    blockedByMeSet: new Set(blockedByMe.map((row) => row.blockedId)),
    blockedMeSet: new Set(blockedMe.map((row) => row.blockerId)),
  }
}

function augmentChatForUser(
  chat: {
    participants: { userId: number }[]
    archives: { userId: number }[]
  } & Record<string, any>,
  userId: number,
  blockedByMeSet: Set<number>,
  blockedMeSet: Set<number>
) {
  const otherParticipantIds = chat.participants
    .filter((participant) => participant.userId !== userId)
    .map((participant) => participant.userId)

  const blockedParticipantIds = otherParticipantIds.filter((id) =>
    blockedByMeSet.has(id)
  )
  const blockedByParticipantIds = otherParticipantIds.filter((id) =>
    blockedMeSet.has(id)
  )

  return {
    ...chat,
    isArchived: chat.archives.length > 0,
    blockedParticipantIds,
    blockedByParticipantIds,
    canMessage:
      blockedParticipantIds.length === 0 && blockedByParticipantIds.length === 0,
  }
}

async function getChatForGroupManagement(chatId: number, userId: number) {
  const chat = await prisma.chat.findUnique({
    where: { id: chatId },
    include: {
      participants: {
        include: { user: true },
      },
      archives: true,
    },
  })

  if (!chat) {
    return { error: { status: 404, message: "Chat not found" } }
  }

  if (chat.type !== "GROUP") {
    return {
      error: {
        status: 400,
        message: "This action is allowed only for group chats",
      },
    }
  }

  const requester = chat.participants.find(
    (participant) => participant.userId === userId
  )
  if (!requester) {
    return { error: { status: 403, message: "You are not a participant of this chat" } }
  }

  if (!canManageGroup(requester.role)) {
    return {
      error: {
        status: 403,
        message: "You do not have permissions to manage this group",
      },
    }
  }

  return { chat, requester }
}

export const createOneToOneChat = asyncHandler(
  async (
    req: AuthenticatedRequest<OneToOneChatBody>,
    res: Response,
    next: NextFunction
  ) => {
    const userId = req.user?.id

    if (!userId) {
      res.status(401).json({ error: "Unauthorized" })
      return
    }

    const { friendId } = req.body
    if (!friendId) {
      res.status(400).json({ error: "No friendId provided" })
      return
    }

    if (friendId === userId) {
      res.status(400).json({ error: "You cannot create a chat with yourself" })
      return
    }

    const [friend, blockRelation] = await Promise.all([
      prisma.user.findUnique({
        where: { id: friendId },
      }),
      prisma.userBlock.findFirst({
        where: {
          OR: [
            { blockerId: userId, blockedId: friendId },
            { blockerId: friendId, blockedId: userId },
          ],
        },
      }),
    ])

    if (!friend) {
      res.status(404).json({ error: "Friend not found" })
      return
    }

    if (blockRelation) {
      res.status(403).json({
        error: "Cannot create chat because one of users is blocked",
      })
      return
    }

    const result = await prisma.$transaction(async (ctx) => {
      const newChat = await ctx.chat.create({
        data: {
          type: "ONE_ON_ONE",
          participants: {
            create: [{ userId }, { userId: friendId }],
          },
        },
        include: {
          participants: {
            include: { user: true },
          },
          notifications: true,
          archives: true,
        },
      })

      const authUser = await ctx.user.findUnique({ where: { id: userId } })

      const notification = await ctx.notification.create({
        data: {
          userId: friendId,
          type: "CHAT_CREATED",
          message: `${authUser?.name} created a chat with you`,
          chatId: newChat.id,
        },
        include: { friendRequest: true },
      })

      const notifactionForAuthUser = await ctx.notification.create({
        data: {
          userId,
          type: "CHAT_CREATED",
          message: "You created a chat",
          chatId: newChat.id,
        },
        include: { friendRequest: true },
      })

      return { newChat, notification, notifactionForAuthUser }
    })

    const io = getIO()
    const chatForPayload = {
      ...result.newChat,
      isArchived: false,
      blockedParticipantIds: [],
      blockedByParticipantIds: [],
      canMessage: true,
    }

    emitToUser(io, friendId, "chatCreated", {
      chat: chatForPayload,
      notification: result.notification,
    })

    emitToUser(io, userId, "chatCreated", {
      chat: chatForPayload,
      notification: result.notifactionForAuthUser,
    })

    res
      .status(201)
      .json({ message: "Chat created successfully", chat: chatForPayload })
  }
)

export const createGroupChat = asyncHandler(
  async (
    req: AuthenticatedRequest<GroupChatBody>,
    res: Response,
    next: NextFunction
  ) => {
    const userId = req.user?.id

    if (!userId) {
      res.status(401).json({ error: "Unauthorized" })
      return
    }

    const uniqueParticipantIds = normalizeUniqueIds(req.body.friendIds).filter(
      (participantId) => participantId !== userId
    )

    if (uniqueParticipantIds.length === 0) {
      res.status(400).json({ error: "No valid participant ids provided" })
      return
    }

    const invitedUsers = await prisma.user.findMany({
      where: {
        id: {
          in: uniqueParticipantIds,
        },
      },
      select: { id: true },
    })

    if (invitedUsers.length !== uniqueParticipantIds.length) {
      res.status(400).json({ error: "One or more invited users do not exist" })
      return
    }

    const groupName = normalizeGroupName(req.body.name) ?? "New Group"
    const groupImage =
      typeof req.body.image === "string" && req.body.image.trim()
        ? req.body.image.trim()
        : null

    const participants = [userId, ...uniqueParticipantIds]

    const result = await prisma.$transaction(async (ctx) => {
      const newChat = await ctx.chat.create({
        data: {
          type: "GROUP",
          name: groupName,
          image: groupImage,
          participants: {
            create: [
              { userId, role: "OWNER" },
              ...uniqueParticipantIds.map((participantId) => ({
                userId: participantId,
                role: "MEMBER" as const,
              })),
            ],
          },
        },
        include: {
          participants: { include: { user: true } },
          archives: true,
        },
      })

      const authUser = await ctx.user.findUnique({
        where: { id: userId },
      })

      const notifications = await Promise.all(
        participants.map(async (participantId) => {
          return ctx.notification.create({
            data: {
              userId: participantId,
              type: "CHAT_CREATED",
              message: `${authUser?.name} created a group chat with you`,
              chatId: newChat.id,
            },
          })
        })
      )

      return { newChat, notifications }
    })

    const io = getIO()
    const chatForPayload = {
      ...result.newChat,
      isArchived: false,
      blockedParticipantIds: [],
      blockedByParticipantIds: [],
      canMessage: true,
    }

    participants.forEach((participantId) => {
      emitToUser(io, participantId, "chatCreated", {
        chat: chatForPayload,
        notification: result.notifications.find(
          (notification) => notification.userId === participantId
        ),
      })
    })

    res
      .status(201)
      .json({ message: "Chat created successfully", chat: chatForPayload })
  }
)

export const getChats = asyncHandler(
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const userId = req.user?.id

    if (!userId) {
      res.status(401).json({ error: "Unauthorized" })
      return
    }

    const { blockedByMeSet, blockedMeSet } = await getBlockSets(userId)

    const chats = await prisma.chat.findMany({
      where: {
        participants: {
          some: {
            userId,
          },
        },
      },
      orderBy: {
        updatedAt: "desc",
      },
      include: {
        notifications: true,
        lastMessage: { include: { sender: true, media: true } },
        participants: {
          include: { user: true },
        },
        messages: {
          orderBy: { createdAt: "desc" },
        },
        archives: {
          where: { userId },
          select: { userId: true },
        },
      },
    })

    const chatsWithMeta = chats.map((chat) =>
      augmentChatForUser(chat, userId, blockedByMeSet, blockedMeSet)
    )

    res.status(200).json(chatsWithMeta)
  }
)

export const getChatById = asyncHandler(
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const userId = req.user?.id

    if (!userId) {
      res.status(401).json({ error: "Unauthorized" })
      return
    }

    const chatId = parseId(req.params.chatId)
    if (!chatId) {
      res.status(400).json({ error: "Invalid chat id" })
      return
    }

    const { blockedByMeSet, blockedMeSet } = await getBlockSets(userId)

    const chat = await prisma.chat.findUnique({
      where: {
        id: chatId,
      },
      include: {
        participants: { include: { user: true } },
        messages: {
          orderBy: { createdAt: "asc" },
          include: {
            sender: true,
            media: true,
            notifications: true,
          },
        },
        lastMessage: { include: { sender: true, media: true } },
        archives: {
          where: { userId },
          select: { userId: true },
        },
      },
    })

    if (!chat) {
      res.status(404).json({ error: "Chat not found" })
      return
    }

    const isParticipant = chat.participants.some((p) => p.userId === userId)

    if (!isParticipant) {
      res.status(403).json({ error: "You are not a participant of this chat" })
      return
    }

    const chatWithMeta = augmentChatForUser(
      chat,
      userId,
      blockedByMeSet,
      blockedMeSet
    )
    res.status(200).json({ chat: chatWithMeta })
  }
)

export const archiveChat = asyncHandler(
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const userId = req.user?.id

    if (!userId) {
      res.status(401).json({ error: "Unauthorized" })
      return
    }

    const chatId = parseId(req.params.chatId)
    if (!chatId) {
      res.status(400).json({ error: "Invalid chat id" })
      return
    }

    const chat = await prisma.chat.findUnique({
      where: { id: chatId },
      include: { participants: true },
    })

    if (!chat) {
      res.status(404).json({ error: "Chat not found" })
      return
    }

    const isParticipant = chat.participants.some(
      (participant) => participant.userId === userId
    )
    if (!isParticipant) {
      res.status(403).json({ error: "You are not a participant of this chat" })
      return
    }

    await prisma.chatArchive.upsert({
      where: {
        userId_chatId: {
          userId,
          chatId,
        },
      },
      update: {},
      create: {
        userId,
        chatId,
      },
    })

    res.status(200).json({ message: "Chat archived successfully" })
  }
)

export const unarchiveChat = asyncHandler(
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const userId = req.user?.id

    if (!userId) {
      res.status(401).json({ error: "Unauthorized" })
      return
    }

    const chatId = parseId(req.params.chatId)
    if (!chatId) {
      res.status(400).json({ error: "Invalid chat id" })
      return
    }

    await prisma.chatArchive.deleteMany({
      where: {
        userId,
        chatId,
      },
    })

    res.status(200).json({ message: "Chat moved from archive successfully" })
  }
)

export const updateGroupDetails = asyncHandler(
  async (
    req: AuthenticatedRequest<UpdateGroupBody>,
    res: Response,
    next: NextFunction
  ) => {
    const userId = req.user?.id

    if (!userId) {
      res.status(401).json({ error: "Unauthorized" })
      return
    }

    const chatId = parseId(req.params.chatId)
    if (!chatId) {
      res.status(400).json({ error: "Invalid chat id" })
      return
    }

    const managed = await getChatForGroupManagement(chatId, userId)
    if ("error" in managed && managed.error) {
      res.status(managed.error.status).json({ error: managed.error.message })
      return
    }

    const maybeName = req.body.name
    const maybeImage = req.body.image

    if (
      typeof maybeName === "undefined" &&
      typeof maybeImage === "undefined"
    ) {
      res.status(400).json({ error: "No fields provided for update" })
      return
    }

    const data: { name?: string; image?: string | null } = {}

    if (typeof maybeName !== "undefined") {
      const normalizedName = normalizeGroupName(maybeName)
      if (!normalizedName) {
        res.status(400).json({ error: "Group name cannot be empty" })
        return
      }
      data.name = normalizedName
    }

    if (typeof maybeImage !== "undefined") {
      data.image =
        typeof maybeImage === "string" && maybeImage.trim()
          ? maybeImage.trim()
          : null
    }

    const updatedChat = await prisma.chat.update({
      where: { id: chatId },
      data,
      include: {
        participants: { include: { user: true } },
        archives: {
          where: { userId },
          select: { userId: true },
        },
      },
    })

    const io = getIO()
    managed.chat.participants.forEach((participant) => {
      emitToUser(io, participant.userId, "chatUpdated", { chat: updatedChat })
    })

    res
      .status(200)
      .json({ message: "Group updated successfully", chat: updatedChat })
  }
)

export const updateGroupParticipantRole = asyncHandler(
  async (
    req: AuthenticatedRequest<UpdateGroupParticipantRoleBody>,
    res: Response,
    next: NextFunction
  ) => {
    const userId = req.user?.id

    if (!userId) {
      res.status(401).json({ error: "Unauthorized" })
      return
    }

    const chatId = parseId(req.params.chatId)
    const targetUserId = parseId(req.params.userId)
    const requestedRole = parseGroupRole(req.body.role)

    if (!chatId || !targetUserId) {
      res.status(400).json({ error: "Invalid id" })
      return
    }

    if (!requestedRole) {
      res.status(400).json({ error: "Invalid role" })
      return
    }

    if (targetUserId === userId) {
      res.status(400).json({ error: "You cannot change your own role" })
      return
    }

    const managed = await getChatForGroupManagement(chatId, userId)
    if ("error" in managed && managed.error) {
      res.status(managed.error.status).json({ error: managed.error.message })
      return
    }

    const targetParticipant = managed.chat.participants.find(
      (participant) => participant.userId === targetUserId
    )

    if (!targetParticipant) {
      res
        .status(404)
        .json({ error: "Target user is not a participant of this group" })
      return
    }

    if (targetParticipant.role === "OWNER") {
      res.status(403).json({ error: "Owner role cannot be changed" })
      return
    }

    if (
      managed.requester.role === "ADMIN" &&
      targetParticipant.role === "ADMIN"
    ) {
      res.status(403).json({ error: "Admin cannot change another admin" })
      return
    }

    const updatedParticipant = await prisma.chatParticipant.update({
      where: {
        userId_chatId: {
          userId: targetUserId,
          chatId,
        },
      },
      data: {
        role: requestedRole,
      },
      include: { user: true },
    })

    const io = getIO()
    managed.chat.participants.forEach((participant) => {
      emitToUser(io, participant.userId, "groupParticipantRoleUpdated", {
        chatId,
        participant: updatedParticipant,
      })
    })

    res.status(200).json({
      message: "Participant role updated successfully",
      participant: updatedParticipant,
    })
  }
)

export const removeGroupParticipant = asyncHandler(
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const userId = req.user?.id

    if (!userId) {
      res.status(401).json({ error: "Unauthorized" })
      return
    }

    const chatId = parseId(req.params.chatId)
    const targetUserId = parseId(req.params.userId)

    if (!chatId || !targetUserId) {
      res.status(400).json({ error: "Invalid id" })
      return
    }

    if (targetUserId === userId) {
      res
        .status(400)
        .json({ error: "You cannot remove yourself from this endpoint" })
      return
    }

    const managed = await getChatForGroupManagement(chatId, userId)
    if ("error" in managed && managed.error) {
      res.status(managed.error.status).json({ error: managed.error.message })
      return
    }

    const targetParticipant = managed.chat.participants.find(
      (participant) => participant.userId === targetUserId
    )

    if (!targetParticipant) {
      res
        .status(404)
        .json({ error: "Target user is not a participant of this group" })
      return
    }

    if (targetParticipant.role === "OWNER") {
      res.status(403).json({ error: "Owner cannot be removed" })
      return
    }

    if (
      managed.requester.role === "ADMIN" &&
      targetParticipant.role === "ADMIN"
    ) {
      res.status(403).json({ error: "Admin cannot remove another admin" })
      return
    }

    await prisma.chatParticipant.delete({
      where: {
        userId_chatId: {
          userId: targetUserId,
          chatId,
        },
      },
    })

    const io = getIO()
    managed.chat.participants.forEach((participant) => {
      emitToUser(io, participant.userId, "groupParticipantRemoved", {
        chatId,
        userId: targetUserId,
      })
    })

    res.status(200).json({ message: "Participant removed successfully" })
  }
)

export const blockUser = asyncHandler(
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const blockerId = req.user?.id

    if (!blockerId) {
      res.status(401).json({ error: "Unauthorized" })
      return
    }

    const blockedId = parseId(req.params.userId)
    if (!blockedId) {
      res.status(400).json({ error: "Invalid user id" })
      return
    }

    if (blockedId === blockerId) {
      res.status(400).json({ error: "You cannot block yourself" })
      return
    }

    const blockedUser = await prisma.user.findUnique({
      where: { id: blockedId },
      select: { id: true, name: true, email: true, profile_image: true },
    })

    if (!blockedUser) {
      res.status(404).json({ error: "User not found" })
      return
    }

    await prisma.userBlock.upsert({
      where: {
        blockerId_blockedId: {
          blockerId,
          blockedId,
        },
      },
      update: {},
      create: {
        blockerId,
        blockedId,
      },
    })

    const oneToOneChats = await prisma.chat.findMany({
      where: {
        type: "ONE_ON_ONE",
        AND: [
          { participants: { some: { userId: blockerId } } },
          { participants: { some: { userId: blockedId } } },
        ],
      },
      select: { id: true },
    })

    if (oneToOneChats.length > 0) {
      await prisma.chatArchive.createMany({
        data: oneToOneChats.map((chat) => ({
          userId: blockerId,
          chatId: chat.id,
        })),
        skipDuplicates: true,
      })
    }

    res.status(200).json({
      message: "User blocked successfully",
      blockedUser,
      archivedChatIds: oneToOneChats.map((chat) => chat.id),
    })
  }
)

export const unblockUser = asyncHandler(
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const blockerId = req.user?.id

    if (!blockerId) {
      res.status(401).json({ error: "Unauthorized" })
      return
    }

    const blockedId = parseId(req.params.userId)
    if (!blockedId) {
      res.status(400).json({ error: "Invalid user id" })
      return
    }

    await prisma.userBlock.deleteMany({
      where: {
        blockerId,
        blockedId,
      },
    })

    res.status(200).json({ message: "User unblocked successfully" })
  }
)

export const getBlockedUsers = asyncHandler(
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const userId = req.user?.id

    if (!userId) {
      res.status(401).json({ error: "Unauthorized" })
      return
    }

    const blockedUsers = await prisma.userBlock.findMany({
      where: { blockerId: userId },
      include: {
        blocked: {
          select: {
            id: true,
            name: true,
            email: true,
            profile_image: true,
            createdAt: true,
            updatedAt: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    })

    res.status(200).json({
      blockedUsers: blockedUsers.map((entry) => entry.blocked),
    })
  }
)

export const deleteChat = asyncHandler(
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const userId = req.user?.id

    if (!userId) {
      res.status(401).json({ error: "Unauthorized" })
      return
    }

    const chatId = parseId(req.params.chatId)
    if (!chatId) {
      res.status(400).json({ error: "Invalid chat id" })
      return
    }

    const chat = await prisma.chat.findUnique({
      where: {
        id: chatId,
      },
      include: {
        participants: true,
      },
    })

    if (!chat) {
      res.status(404).json({ error: "Chat not found" })
      return
    }

    const requester = chat.participants.find(
      (participant) => participant.userId === userId
    )
    if (!requester) {
      res.status(403).json({
        error: "You are not a participant of this chat",
      })
      return
    }

    if (chat.type === "GROUP" && requester.role !== "OWNER") {
      res.status(403).json({
        error: "Only group owner can delete the group",
      })
      return
    }

    await prisma.chat.delete({
      where: {
        id: chatId,
      },
    })

    const io = getIO()
    chat.participants.forEach((participant) => {
      if (participant.userId !== userId) {
        emitToUser(io, participant.userId, "chatDeleted", { chatId })
      }
    })

    res.status(200).json({ message: "Chat deleted successfully" })
  }
)
