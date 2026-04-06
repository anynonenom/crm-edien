import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface AiMessage {
  role: "user" | "assistant";
  content: string;
  timestamp: number;
}

interface AiChatStore {
  // Messages keyed by workspaceId so each workspace has its own history
  messagesByWorkspace: Record<number, AiMessage[]>;
  getMessages: (workspaceId: number) => AiMessage[];
  addMessage: (workspaceId: number, msg: Omit<AiMessage, "timestamp">) => void;
  clearHistory: (workspaceId: number) => void;
}

export const useAiChatStore = create<AiChatStore>()(
  persist(
    (set, get) => ({
      messagesByWorkspace: {},

      getMessages: (workspaceId) =>
        get().messagesByWorkspace[workspaceId] ?? [],

      addMessage: (workspaceId, msg) =>
        set((state) => ({
          messagesByWorkspace: {
            ...state.messagesByWorkspace,
            [workspaceId]: [
              ...(state.messagesByWorkspace[workspaceId] ?? []),
              { ...msg, timestamp: Date.now() },
            ],
          },
        })),

      clearHistory: (workspaceId) =>
        set((state) => ({
          messagesByWorkspace: {
            ...state.messagesByWorkspace,
            [workspaceId]: [],
          },
        })),
    }),
    {
      name: "eiden-ai-chat", // localStorage key
      // Only persist the messages, not the derived methods
      partialize: (state) => ({ messagesByWorkspace: state.messagesByWorkspace }),
    }
  )
);
