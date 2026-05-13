import { Router } from "express"
import { authenticateToken } from "../middleware/authenticateToken"
import {
  archiveChat,
  blockUser,
  createGroupChat,
  createOneToOneChat,
  deleteChat,
  getChatById,
  getBlockedUsers,
  getChats,
  removeGroupParticipant,
  updateGroupDetails,
  updateGroupParticipantRole,
  unarchiveChat,
  unblockUser,
} from "../controllers/chatController"
import type { Request, Response, NextFunction } from "express"
import multer from "multer"
import { deleteMessage, getMessages, sendMessage } from "../controllers/messageController"
import fs from "fs"
import path from "path"
const router = Router()
router.get("/", authenticateToken, getChats)
router.get("/blocked/users", authenticateToken, getBlockedUsers)
router.post("/one-to-one", authenticateToken, createOneToOneChat)
router.post("/group", authenticateToken, createGroupChat)
router.post("/users/:userId/block", authenticateToken, blockUser)
router.delete("/users/:userId/block", authenticateToken, unblockUser)
router.post("/:chatId/archive", authenticateToken, archiveChat)
router.delete("/:chatId/archive", authenticateToken, unarchiveChat)
router.patch("/:chatId/group", authenticateToken, updateGroupDetails)
router.patch("/:chatId/participants/:userId/role", authenticateToken, updateGroupParticipantRole)
router.delete("/:chatId/participants/:userId", authenticateToken, removeGroupParticipant)
router.get("/:chatId", authenticateToken, getChatById)
router.delete("/:chatId", authenticateToken, deleteChat)

//chatroom routes

const storageFolderPath = path.join(__dirname, "../../storage/chatMedia")
if (!fs.existsSync(storageFolderPath)) {
  fs.mkdirSync(storageFolderPath, { recursive: true })
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "storage/chatMedia")
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9)
    cb(null, uniqueSuffix + "-" + file.originalname)
  },
})
const upload = multer({ storage })

router.post(
  "/upload",
  authenticateToken,
  upload.single("file"),
  (req: Request, res: Response, next: NextFunction): void => {
    if (!req.file) {
      res.status(400).json({ error: "No file uploaded" })
      return
    }
    res.json({ storedFilename: req.file.filename })
  }
)
router.get("/:chatId/messages", authenticateToken, getMessages)
router.post("/:chatId/messages", authenticateToken, sendMessage)
router.delete("/:chatId/messages/:messageId", authenticateToken, deleteMessage)

export default router
