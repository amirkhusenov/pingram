import type { Request, Response, NextFunction } from "express"

import jwt from "jsonwebtoken"
import bcrypt from "bcryptjs"
import prisma from "../../prisma/db"
import { asyncHandler } from "../utils"

const SALT_ROUNDS = 10

const cookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.COOKIE_SECURE === "true",
}

export const registerUser = asyncHandler(
  async (
    req: Request<
      {},
      {},
      {
        name: string
        email: string
        password: string
      }
    >,
    res: Response,
    next: NextFunction
  ) => {
    const { name, email, password } = req.body

    const existingUser = await prisma.user.findUnique({
      where: {
        email,
      },
    })
    if (existingUser) {
      res.status(400).json({ error: "Пользователь с таким email уже существует" })
      return
    }

    const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS)

    const newUser = await prisma.user.create({
      data: {
        name,
        email,
        password: hashedPassword,
      },
    })
    const token = jwt.sign(
      {
        id: newUser.id,
        email: newUser.email,
        name: newUser.name,
      },
      process.env.JWT_SECRET!,
      { expiresIn: "7days" }
    )

    res.cookie("token", token, cookieOptions)
    res.status(201).json({
      message: "User registered successfully",
    })
  }
)

export const loginUser = asyncHandler(
  async (
    req: Request<
      {},
      {},
      {
        email: string
        password: string
      }
    >,
    res: Response,
    next: NextFunction
  ) => {
    const { email, password } = req.body

    const existingUser = await prisma.user.findUnique({
      where: {
        email,
      },
    })
    if (!existingUser) {
      res.status(400).json({ error: "Неверный email или пароль" })
      return
    }

    const isHashed = existingUser.password.startsWith("$2a$") || existingUser.password.startsWith("$2b$")
    const isMatch = isHashed
      ? await bcrypt.compare(password, existingUser.password)
      : password === existingUser.password

    if (isMatch && !isHashed) {
      const hashed = await bcrypt.hash(password, SALT_ROUNDS)
      await prisma.user.update({ where: { id: existingUser.id }, data: { password: hashed } })
    }

    if (!isMatch) {
      res.status(400).json({ error: "Неверный email или пароль" })
      return
    }
    const token = jwt.sign(
      {
        id: existingUser.id,
        email: existingUser.email,
        name: existingUser.name,
      },
      process.env.JWT_SECRET!,
      { expiresIn: "7days" }
    )

    res.cookie("token", token, cookieOptions)

    res.status(200).json({
      message: "User logged in successfully",
    })
  }
)

export const logoutUser = asyncHandler(
  async (req: Request, res: Response, next: NextFunction) => {
    res.clearCookie("token")
    res.status(200).json({
      message: "User logged out successfully",
    })
  }
)
