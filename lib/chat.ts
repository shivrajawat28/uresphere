// Pure helpers for Sphere chat message state. Kept dependency-free so they are
// unit-testable and shared between the user ChatRoom and the admin Social tab.

export type DeletedByRole = "user" | "admin"

export type ChatMessage = {
  id: string
  body: string
  authorId: string
  createdAt: string
  isDeleted: boolean
  /** Who removed the message: the message owner ("user") or a Sphere admin
   * ("admin"). Written server-side only — never trusted from the client.
   * Null for messages that were never deleted. */
  deletedByRole?: DeletedByRole | null
  /** id of the message this one replies to (same Sphere only). Null when the
   * message is not a reply. */
  replyToMessageId?: string | null
  authorHandle: string
}

/**
 * Display label for a deleted message. Returns null when the message is not
 * deleted; otherwise "Message deleted by user"/"Message deleted by admin".
 * Legacy rows without a stored role render as "deleted by admin" (the old
 * UI's behaviour).
 */
export function deletedMessageLabel(isDeleted: boolean, deletedByRole?: DeletedByRole | null): string | null {
  if (!isDeleted) return null
  return deletedByRole === "admin" ? "Message deleted by admin" : "Message deleted by user"
}

/**
 * Merges a batch of incoming messages into the existing list, deduplicating by
 * message id and keeping the list sorted oldest → newest. Order is stable and
 * duplicate events (reconnect, double-subscription, optimistic + realtime echo)
 * can never produce a second copy of the same message.
 */
export function mergeChatMessages(existing: ChatMessage[], incoming: ChatMessage[]): ChatMessage[] {
  if (incoming.length === 0) return existing

  const byId = new Map<string, ChatMessage>()
  for (const m of existing) byId.set(m.id, m)
  for (const m of incoming) byId.set(m.id, m)

  return Array.from(byId.values()).sort((a, b) => {
    const ta = new Date(a.createdAt).getTime()
    const tb = new Date(b.createdAt).getTime()
    return ta - tb || a.id.localeCompare(b.id)
  })
}

/**
 * Replaces an optimistic (pending) message with the server-acknowledged one.
 * If the server message is already present (realtime beat the action response),
 * the optimistic copy is simply dropped. Returns the new list.
 */
export function replaceOptimisticMessage(
  existing: ChatMessage[],
  optimisticId: string,
  serverMessage: ChatMessage,
): ChatMessage[] {
  const alreadyPresent = existing.some((m) => m.id === serverMessage.id)
  if (alreadyPresent) {
    return existing.filter((m) => m.id !== optimisticId)
  }
  return mergeChatMessages(
    existing.filter((m) => m.id !== optimisticId),
    [serverMessage],
  )
}

/**
 * Picks the latest window of messages (newest first) for initial page load.
 * Returns the messages sorted oldest → newest plus whether older ones exist.
 */
export function selectInitialWindow(
  all: ChatMessage[],
  windowSize: number,
): { messages: ChatMessage[]; hasMore: boolean; oldestCreatedAt: string | null } {
  const sorted = [...all].sort((a, b) => {
    const ta = new Date(a.createdAt).getTime()
    const tb = new Date(b.createdAt).getTime()
    return tb - ta || b.id.localeCompare(a.id)
  })
  const window = sorted.slice(0, windowSize).reverse()
  return {
    messages: window,
    hasMore: sorted.length > windowSize,
    oldestCreatedAt: window.length > 0 ? window[0].createdAt : null,
  }
}

/**
 * Whether a keydown should send the chat message instead of inserting a newline.
 * True only for a bare Enter: Shift+Enter (newline), IME composition and the
 * legacy keyCode 229 (some IMEs / virtual keyboards) never send. Shared by the
 * Sphere chat and group chat composers so the behavior stays identical.
 */
export function shouldSendOnEnter(e: {
  key: string
  shiftKey: boolean
  isComposing: boolean
  keyCode: number
}): boolean {
  return e.key === "Enter" && !e.shiftKey && !e.isComposing && e.keyCode !== 229
}

/**
 * Computes the scrollTop that keeps the user's reading position stable after
 * older messages are prepended above the current viewport.
 *
 * - When the user was already near the bottom, stay at the bottom (the newest
 *   message stays visible).
 * - Otherwise keep the exact same messages in view: the container grew by
 *   `nextScrollHeight - prevScrollHeight`, so the old offset shifts down by
 *   that delta.
 */
export function computeScrollAnchor({
  wasNearBottom,
  prevScrollTop,
  prevScrollHeight,
  nextScrollHeight,
}: {
  wasNearBottom: boolean
  prevScrollTop: number
  prevScrollHeight: number
  nextScrollHeight: number
}): number {
  if (wasNearBottom) return nextScrollHeight
  return prevScrollTop + (nextScrollHeight - prevScrollHeight)
}
