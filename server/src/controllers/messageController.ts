import type { Response, NextFunction } from "express"
import type { AuthenticatedRequest } from "./chatController"
import prisma from "../../prisma/db"
import { getIO } from "../realtime/socketInstance"
import { emitToUser } from "../realtime/setupLobby"
import { asyncHandler } from "../utils"
import fs from "fs/promises"
import path from "path"

interface SendMessageBody {
  chatId: number
  content?: string
  attachments: {
    mediaUrl: string
    type: "GIF" | "IMAGE" | "VOICE" | "VIDEO"
  }[]
}

function parseId(value: string | undefined): number | null {
  if (!value) return null
  const parsed = Number.parseInt(value, 10)
  return Number.isNaN(parsed) ? null : parsed
}

const chatMediaStoragePath = path.join(__dirname, "../../storage/chatMedia")

function isRemoteMediaUrl(mediaUrl: string) {
  return mediaUrl.startsWith("http://") || mediaUrl.startsWith("https://")
}

export const sendMessage = asyncHandler(
  async (
    req: AuthenticatedRequest<SendMessageBody>,
    res: Response,
    next: NextFunction
  ) => {
    const userId = req.user?.id
    if (!userId) {
      res.status(401).json({ error: "Unauthorized" })
      return
    }

    const { chatId, content, attachments } = req.body
    const normalizedContent = (content ?? "").trim()

    if (!normalizedContent && (!attachments || attachments.length === 0)) {
      res.status(400).json({ error: "No content provided" })
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
    const isParticipant = chat.participants.some((p) => p.userId === userId)
    if (!isParticipant) {
      res.status(403).json({ error: "You are not a participant of this chat" })
      return
    }

    const otherParticipantIds = chat.participants
      .filter((p) => p.userId !== userId)
      .map((p) => p.userId)

    if (otherParticipantIds.length > 0) {
      const blockRelation = await prisma.userBlock.findFirst({
        where: {
          OR: [
            { blockerId: userId, blockedId: { in: otherParticipantIds } },
            { blockerId: { in: otherParticipantIds }, blockedId: userId },
          ],
        },
      })

      if (blockRelation) {
        res.status(403).json({
          error: "Невозможно отправить сообщение: один из пользователей заблокирован",
        })
        return
      }
    }

    const result = await prisma.$transaction(async (ctx) => {
      const newMessage = await ctx.chatMessage.create({
        data: { chatId, senderId: userId, content: normalizedContent },
      })

      if (attachments && attachments.length) {
        await ctx.chatMessageMedia.createMany({
          data: attachments.map((att) => ({
            messageId: newMessage.id,
            mediaUrl: att.mediaUrl,
            type: att.type,
          })),
        })
      }

      await ctx.chat.update({
        where: { id: chatId },
        data: { lastMessageId: newMessage.id },
      })

      // If user sends a new message in an archived chat, move this chat back to active.
      await ctx.chatArchive.deleteMany({
        where: {
          userId,
          chatId,
        },
      })

      const authUser = await ctx.user.findUnique({
        where: { id: userId },
      })

      const newNotifications = await Promise.all(
        chat.participants
          .filter((p) => p.userId !== userId)
          .map((p) =>
            ctx.notification.create({
              data: {
                userId: p.userId,
                type: "CHAT_MESSAGE",
                message: `${authUser?.name} sent you a message in the chat`,
                messageId: newMessage.id,
              },
            })
          )
      )

      const messageWithMedia = await ctx.chatMessage.findUnique({
        where: { id: newMessage.id },
        include: { media: true, sender: true, notifications: true },
      })

      return { message: messageWithMedia, notifications: newNotifications }
    })

    const io = getIO()

    chat.participants.forEach((p) => {
      if (p.userId !== userId) {
        const notification = result.notifications.find(
          (n) => n.userId === p.userId
        )
        emitToUser(io, p.userId, "chatMessageReceived", {
          message: result.message,
          notification,
        })
      }
    })
    res.status(201).json({ success: true, message: result.message })
  }
)

export const getMessages = asyncHandler(
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
    const isParticipant = chat.participants.some((p) => p.userId === userId)
    if (!isParticipant) {
      res.status(403).json({ error: "You are not a participant of this chat" })
      return
    }
    const messages = await prisma.chatMessage.findMany({
      where: {
        chatId,
      },
      include: {
        media: true,
        sender: true,
        notifications: true,
      },
      orderBy: {
        createdAt: "asc",
      },
    })
    res.status(200).json({ messages })
  }
)

export const deleteMessage = asyncHandler(
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const userId = req.user?.id
    if (!userId) {
      res.status(401).json({ error: "Unauthorized" })
      return
    }

    const chatId = parseId(req.params.chatId)
    const messageId = parseId(req.params.messageId)
    if (!chatId || !messageId) {
      res.status(400).json({ error: "Invalid chat or message id" })
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

    const isParticipant = chat.participants.some((participant) => participant.userId === userId)
    if (!isParticipant) {
      res.status(403).json({ error: "You are not a participant of this chat" })
      return
    }

    const message = await prisma.chatMessage.findUnique({
      where: { id: messageId },
      include: { media: true },
    })

    if (!message || message.chatId !== chatId) {
      res.status(404).json({ error: "Message not found" })
      return
    }

    if (message.senderId !== userId) {
      res.status(403).json({ error: "You can delete only your own messages" })
      return
    }

    await prisma.$transaction(async (ctx) => {
      await ctx.chatMessage.delete({
        where: { id: messageId },
      })

      if (chat.lastMessageId === messageId) {
        const previousMessage = await ctx.chatMessage.findFirst({
          where: { chatId },
          orderBy: { createdAt: "desc" },
        })

        await ctx.chat.update({
          where: { id: chatId },
          data: { lastMessageId: previousMessage?.id ?? null },
        })
      }
    })

    const localMediaFilenames = message.media
      .map((media) => media.mediaUrl)
      .filter((mediaUrl) => mediaUrl && !isRemoteMediaUrl(mediaUrl))

    await Promise.all(
      localMediaFilenames.map(async (filename) => {
        const absolutePath = path.resolve(chatMediaStoragePath, filename)
        if (!absolutePath.startsWith(chatMediaStoragePath)) return
        await fs.unlink(absolutePath).catch(() => undefined)
      })
    )

    getIO().to(chatId.toString()).emit("chatMessageDeleted", {
      chatId,
      messageId,
    })

    res.status(200).json({ success: true, message: "Message deleted successfully" })
  }
)
