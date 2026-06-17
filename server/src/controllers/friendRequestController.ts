import type { Request, Response, NextFunction } from "express"
import prisma from "../../prisma/db"
import { FriendRequestStatus, NotificationType } from "@prisma/client"
import { getIO } from "../realtime/socketInstance"
import { emitToUser } from "../realtime/setupLobby"
import { asyncHandler } from "../utils"

export const sendFriendRequest = asyncHandler(
  async (req: Request, res: Response, next: NextFunction) => {
    const senderId = req.user?.id

    const { receiverId, receiverEmail } = req.body as {
      receiverId?: number
      receiverEmail?: string
    }

    if (!senderId) {
      res.status(401).json({ error: "Unauthorized" })
      return
    }

    if (!receiverId && !receiverEmail) {
      res
        .status(400)
        .json({ error: "receiverId or receiverEmail is required" })
      return
    }

    let resolvedReceiverId = receiverId
      ? Number.parseInt(String(receiverId), 10)
      : undefined

    if (resolvedReceiverId && Number.isNaN(resolvedReceiverId)) {
      resolvedReceiverId = undefined
    }

    if (!resolvedReceiverId && receiverEmail) {
      const receiverUser = await prisma.user.findUnique({
        where: { email: receiverEmail.trim() },
        select: { id: true },
      })

      if (!receiverUser) {
        res.status(404).json({ error: "User with this email was not found" })
        return
      }

      resolvedReceiverId = receiverUser.id
    }

    if (!resolvedReceiverId) {
      res.status(400).json({ error: "Invalid receiver identifier" })
      return
    }

    if (senderId === resolvedReceiverId) {
      res
        .status(400)
        .json({ error: "You cannot send a friend request to yourself" })
      return
    }
    const blockRelation = await prisma.userBlock.findFirst({
      where: {
        OR: [
          { blockerId: senderId, blockedId: resolvedReceiverId },
          { blockerId: resolvedReceiverId, blockedId: senderId },
        ],
      },
    })

    if (blockRelation) {
      res.status(403).json({
        error: "Невозможно отправить заявку в друзья: один из пользователей заблокирован",
      })
      return
    }
    const existingFriendRequest = await prisma.friendRequest.findFirst({
      where: {
        OR: [
          { senderId: senderId, receiverId: resolvedReceiverId },
          { senderId: resolvedReceiverId, receiverId: senderId },
        ],
      },
    })

    if (existingFriendRequest) {
      if (existingFriendRequest.receiverId === senderId) {
        res.status(400).json({
          error: "You already have a pending friend request from this user",
        })
        return
      }
      if (existingFriendRequest.senderId === senderId) {
        res.status(400).json({
          error: "You already sent a friend request to this user",
        })
        return
      }
    }

    const result = await prisma.$transaction(async (ctx) => {
      const friendRequest = await ctx.friendRequest.create({
        data: {
          senderId,
          receiverId: resolvedReceiverId,
          status: FriendRequestStatus.PENDING,
        },
      })

      const sender = await ctx.user.findUnique({
        where: { id: senderId },
      })

      const notification = await ctx.notification.create({
        data: {
          userId: resolvedReceiverId,
          type: NotificationType.FRIEND_REQUEST,
          message: `${sender?.name} sent you a friend request`,
          friendRequestId: friendRequest.id,
        },
        include: {
          friendRequest: true,
        },
      })

      return {
        friendRequest,
        notification,
      }
    })
    const io = getIO()
    const { friendRequest, notification } = result

    emitToUser(io, resolvedReceiverId, "friendRequestReceived", {
      friendRequest,
      notification,
    })
    res.status(201).json({
      message: "Friend request sent successfully",
      friendRequest,
      notification,
    })
  }
)

export const acceptFriendRequest = asyncHandler(
  async (req: Request, res: Response, next: NextFunction) => {
    const userId = req.user?.id
    const { requestId } = req.body

    if (!userId || !requestId) {
      res.status(400).json({ error: "Invalid request" })
      return
    }

    const friendRequest = await prisma.friendRequest.findUnique({
      where: {
        id: requestId,
      },
    })

    if (!friendRequest) {
      res.status(404).json({ error: "Friend request not found" })
      return
    }
    if (friendRequest.receiverId !== userId) {
      res.status(403).json({
        error: "You are not authorized to accept this friend request",
      })
    }
    const updatedFriendRequest = await prisma.friendRequest.update({
      where: { id: requestId },
      data: {
        status: FriendRequestStatus.ACCEPTED,
      },
    })
    const receiver = await prisma.user.findUnique({
      where: { id: userId },
    })

    const notification = await prisma.notification.create({
      data: {
        userId: friendRequest.senderId,
        type: NotificationType.FRIEND_REQUEST_ACCEPTED,
        message: `${receiver?.name} accepted your friend request`,
        friendRequestId: requestId,
      },
      include: {
        friendRequest: true,
      },
    })
    const io = getIO()
    emitToUser(io, friendRequest.senderId, "friendRequestAccepted", {
      friendRequest: updatedFriendRequest,
      notification,
    })
    emitToUser(io, friendRequest.receiverId, "friendRequestAccepted", {
      friendRequest: updatedFriendRequest,
      notification,
    })
    //   emitToUser(io, userId, "newFriendAdded", {
    //     friendRequest: updatedFriendRequest,
    //   })
    //   emitToUser(io, friendRequest.senderId, "newFriendAdded", {
    //     friendRequest: updatedFriendRequest,
    //   })

    res.status(200).json({
      message: "Friend request accepted successfully",
    })
  }
)

export const removeFriend = asyncHandler(
  async (req: Request, res: Response, next: NextFunction) => {
    const userId = req.user?.id
    if (!userId) {
      res.status(401).json({ error: "Unauthorized" })
      return
    }

    const friendId = Number.parseInt(String(req.params.friendId), 10)
    if (Number.isNaN(friendId)) {
      res.status(400).json({ error: "Invalid friend id" })
      return
    }

    const friendRequest = await prisma.friendRequest.findFirst({
      where: {
        status: FriendRequestStatus.ACCEPTED,
        OR: [
          { senderId: userId, receiverId: friendId },
          { senderId: friendId, receiverId: userId },
        ],
      },
    })

    if (!friendRequest) {
      res.status(404).json({ error: "Дружба не найдена" })
      return
    }

    const currentUser = await prisma.user.findUnique({
      where: { id: userId },
      select: { name: true },
    })

    await prisma.$transaction(async (ctx) => {
      await ctx.notification.deleteMany({
        where: { friendRequestId: friendRequest.id },
      })

      await ctx.friendRequest.delete({
        where: { id: friendRequest.id },
      })

      await ctx.notification.create({
        data: {
          userId: friendId,
          type: NotificationType.FRIEND_REMOVED,
          message: `${currentUser?.name ?? "Пользователь"} удалил вас из друзей`,
        },
      })
    })

    const io = getIO()
    emitToUser(io, friendId, "friendRemoved", { removedByUserId: userId })

    res.status(200).json({ message: "Друг удалён" })
  }
)

export const getFriends = asyncHandler(
  async (req: Request, res: Response, next: NextFunction) => {
    const userId = req.user?.id
    if (!userId) {
      res.status(400).json({ error: "Invalid request" })
      return
    }
    const friends = await prisma.friendRequest.findMany({
      where: {
        status: FriendRequestStatus.ACCEPTED,
        OR: [
          {
            senderId: userId,
          },
          {
            receiverId: userId,
          },
        ],
      },
      include: {
        sender: true,
        receiver: true,
        notifications: true,
      },
    })
    res.status(200).json({ friendRequests: friends })
  }
)
