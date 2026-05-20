import { create } from "zustand";
import { z } from "zod";

export const authSchema = z.object({
  email: z.string().email({ message: "Enter a valid email address" }),
  password: z.string().min(8, { message: "Password must be at least 8 characters" })
});

export const settingsSchema = z.object({
  autoAdvance: z.boolean(),
  delay: z.number().min(250, { message: "Delay must be at least 250ms" })
});

export type AuthForm = z.infer<typeof authSchema>;
export type SettingsForm = z.infer<typeof settingsSchema>;

export type MessageType = "info" | "success" | "error";

interface ExtensionState {
  token: string | null;
  email: string | null;
  message: string;
  messageType: MessageType;
  isLoading: boolean;
  autoAdvance: boolean;
  delay: number;
  setToken: (token: string | null) => void;
  setEmail: (email: string | null) => void;
  setMessage: (message: string, messageType?: MessageType) => void;
  setLoading: (isLoading: boolean) => void;
  setAutoAdvance: (autoAdvance: boolean) => void;
  setDelay: (delay: number) => void;
}

export const useExtensionStore = create<ExtensionState>((set) => ({
  token: null,
  email: null,
  message: "",
  messageType: "info",
  isLoading: false,
  autoAdvance: false,
  delay: 2000,
  setToken: (token) => set({ token }),
  setEmail: (email) => set({ email }),
  setMessage: (message, messageType = "info") => set({ message, messageType }),
  setLoading: (isLoading) => set({ isLoading }),
  setAutoAdvance: (autoAdvance) => set({ autoAdvance }),
  setDelay: (delay) => set({ delay })
}));
