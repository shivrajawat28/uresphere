/**
 * Shared feedback domain: categories, statuses, labels and pure validation.
 * Kept dependency-free so it can be unit-tested and reused by both the user
 * Feedback page and the admin Feedback panel.
 */

export const FEEDBACK_CATEGORIES = [
  "general",
  "bug",
  "feature",
  "improvement",
  "add",
  "remove",
  "other",
] as const

export type FeedbackCategory = (typeof FEEDBACK_CATEGORIES)[number]

export const FEEDBACK_CATEGORY_LABELS: Record<FeedbackCategory, string> = {
  general: "General Feedback",
  bug: "Bug Report",
  feature: "Feature Request",
  improvement: "Improvement",
  add: "Add Something",
  remove: "Remove Something",
  other: "Other",
}

export const FEEDBACK_STATUSES = ["open", "in_review", "replied", "resolved", "closed"] as const

export type FeedbackStatus = (typeof FEEDBACK_STATUSES)[number]

export const FEEDBACK_STATUS_LABELS: Record<FeedbackStatus, string> = {
  open: "Open",
  in_review: "In review",
  replied: "Replied",
  resolved: "Resolved",
  closed: "Closed",
}

export const FEEDBACK_SUBJECT_MAX = 120
export const FEEDBACK_MESSAGE_MAX = 2000

/** Returns a user-facing error message, or null when the input is valid. */
export function validateFeedbackInput(category: string, subject: string, message: string): string | null {
  if (!FEEDBACK_CATEGORIES.includes(category as FeedbackCategory)) {
    return "Pick a valid feedback category."
  }
  const subjectTrimmed = subject.trim()
  if (!subjectTrimmed) return "Subject is required."
  if (subjectTrimmed.length > FEEDBACK_SUBJECT_MAX) {
    return `Subject is too long (max ${FEEDBACK_SUBJECT_MAX} characters).`
  }
  const messageTrimmed = message.trim()
  if (!messageTrimmed) return "Feedback can't be empty."
  if (messageTrimmed.length > FEEDBACK_MESSAGE_MAX) {
    return `Feedback is too long (max ${FEEDBACK_MESSAGE_MAX} characters).`
  }
  return null
}

/** Returns a user-facing error message, or null when the reply is valid. */
export function validateFeedbackReply(message: string): string | null {
  const trimmed = message.trim()
  if (!trimmed) return "Reply can't be empty."
  if (trimmed.length > FEEDBACK_MESSAGE_MAX) {
    return `Reply is too long (max ${FEEDBACK_MESSAGE_MAX} characters).`
  }
  return null
}
