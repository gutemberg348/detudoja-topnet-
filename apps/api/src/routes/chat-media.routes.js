import { Router } from "express";
import { getPrivateChatMediaController } from "../modules/chat-media/chat-media.controller.js";

export const chatMediaRoutes = Router();

chatMediaRoutes.get("/:scope/:messageId", getPrivateChatMediaController);
