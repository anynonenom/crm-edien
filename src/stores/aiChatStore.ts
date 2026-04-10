import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface AiMessage {
  role: "user" | "assistant";
  content: string;
  timestamp: number;
}

interface AiChatStore {
  // Messages keyed by "userId_workspaceId" so each user has their own history
  messagesByKey: Record<string, AiMessage[]>;
  getMessages: (userId: number, workspaceId: number) => AiMessage[];
  addMessage: (userId: number, workspaceId: number, msg: Omit<AiMessage, "timestamp">) => void;
  clearHistory: (userId: number, workspaceId: number) => void;
}

const makeKey = (userId: number, workspaceId: number) => `${userId}_${workspaceId}`;

export const useAiChatStore = create<AiChatStore>()(
  persist(
    (set, get) => ({
      messagesByKey: {},

      getMessages: (userId, workspaceId) =>
        get().messagesByKey[makeKey(userId, workspaceId)] ?? [],

      addMessage: (userId, workspaceId, msg) =>
        set((state) => {
          const key = makeKey(userId, workspaceId);
          return {
            messagesByKey: {
              ...state.messagesByKey,
              [key]: [
                ...(state.messagesByKey[key] ?? []),
                { ...msg, timestamp: Date.now() },
              ],
            },
          };
        }),

      clearHistory: (userId, workspaceId) =>
        set((state) => {
          const key = makeKey(userId, workspaceId);
          return {
            messagesByKey: {
              ...state.messagesByKey,
              [key]: [],
            },
          };
        }),
    }),
    {
      name: "eiden-ai-chat-v2", // bumped key to avoid old workspace-only data
      partialize: (state) => ({ messagesByKey: state.messagesByKey }),
    }
  )
);
