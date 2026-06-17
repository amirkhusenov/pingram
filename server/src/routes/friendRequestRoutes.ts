import { Router } from "express"
import { authenticateToken } from "../middleware/authenticateToken"
import {
  acceptFriendRequest,
  getFriends,
  removeFriend,
  sendFriendRequest,
} from "../controllers/friendRequestController"

const router = Router()

router.post("/", authenticateToken, sendFriendRequest)
router.put("/accept", authenticateToken, acceptFriendRequest)
router.get("/friends", authenticateToken, getFriends)
router.delete("/friends/:friendId", authenticateToken, removeFriend)

export default router
