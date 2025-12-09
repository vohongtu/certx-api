import { Router } from "express"
import { login, register } from "../controllers/auth.controller.js"

const r = Router()
r.post("/login", login)
r.post("/register", register)
export default r
