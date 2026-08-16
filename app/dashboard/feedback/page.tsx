import type { Metadata } from "next"
import { requireMember } from "@/lib/data/session"
import { loadMyFeedbackWithReplies } from "@/lib/data/feedback"
import { FeedbackClient } from "@/components/dashboard/feedback-client"

export const dynamic = "force-dynamic"

export const metadata: Metadata = {
  title: "Feedback",
  // Private dashboard surface — never indexable. The dashboard layout also
  // sets robots: noindex, and robots.txt disallows /dashboard/.
  robots: { index: false, follow: false },
}

export default async function FeedbackPage() {
  const member = await requireMember()
  // RLS keeps this strictly to the member's own submissions — other users'
  // feedback can never leak into this page, even by hand-editing the URL.
  const feedback = await loadMyFeedbackWithReplies(member)

  return (
    <FeedbackClient
      member={{
        userId: member.userId,
        anonymousHandle: member.anonymousHandle,
        sphereName: member.sphereName,
      }}
      initialFeedback={feedback}
    />
  )
}
