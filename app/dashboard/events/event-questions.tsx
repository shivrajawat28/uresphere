"use client"

import { useState, useTransition } from "react"
import { ChevronDown, Loader2, MessageCircleQuestion, Send } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { askEventQuestionAction, answerEventQuestionAction } from "@/lib/actions/platform"
import { toast } from "sonner"

type Question = {
  id: string
  question: string
  answer: string | null
  created_at: string
}

type Props = {
  eventId: string
  questions: Question[]
  canAnswer: boolean
}

export function EventQuestions({ eventId, questions, canAnswer }: Props) {
  const [open, setOpen] = useState(false)
  const [question, setQuestion] = useState("")
  const [isPending, startTransition] = useTransition()
  const [answering, setAnswering] = useState<string | null>(null)
  const [answerText, setAnswerText] = useState("")

  function ask(e: React.FormEvent) {
    e.preventDefault()
    startTransition(async () => {
      const result = await askEventQuestionAction(eventId, question)
      if (result.error) toast.error(result.error)
      else {
        toast.success("Question posted — organizers will answer soon.")
        setQuestion("")
      }
    })
  }

  function answer(qId: string) {
    if (answerText.trim().length < 1) return
    startTransition(async () => {
      const result = await answerEventQuestionAction(qId, answerText)
      if (result.error) toast.error(result.error)
      else {
        toast.success("Answer posted.")
        setAnswering(null)
        setAnswerText("")
      }
    })
  }

  return (
    <div className="mt-4 border-t border-border/60 pt-3">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 text-sm font-medium text-muted-foreground transition hover:text-foreground"
        aria-expanded={open}
      >
        <MessageCircleQuestion className="size-4" />
        Ask about this event
        <ChevronDown className={`size-4 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="mt-3 space-y-3">
          <form onSubmit={ask} className="flex gap-2">
            <Input
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="Ask the organizers a question…"
              maxLength={500}
            />
            <Button type="submit" size="sm" disabled={isPending || question.trim().length === 0} className="shrink-0 gap-1.5">
              {isPending ? <Loader2 className="size-3.5 animate-spin" /> : <Send className="size-3.5" />}
              Ask
            </Button>
          </form>

          {questions.length === 0 && (
            <p className="text-xs text-muted-foreground">No questions yet — be the first to ask.</p>
          )}

          <div className="space-y-2">
            {questions.map((q) => (
              <div key={q.id} className="rounded-md border border-border/70 bg-secondary/20 p-3">
                <p className="text-sm text-foreground">{q.question}</p>
                {q.answer ? (
                  <p className="mt-1.5 border-l-2 border-primary/40 pl-2.5 text-sm text-muted-foreground">
                    <span className="font-medium text-foreground">Organizer:</span> {q.answer}
                  </p>
                ) : canAnswer ? (
                  <div className="mt-2 flex gap-2">
                    <Input
                      value={answering === q.id ? answerText : ""}
                      onChange={(e) => {
                        setAnswering(q.id)
                        setAnswerText(e.target.value)
                      }}
                      placeholder="Reply as an organizer…"
                      maxLength={500}
                      className="h-8 text-sm"
                    />
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 shrink-0"
                      disabled={isPending || (answering !== q.id ? true : answerText.trim().length === 0)}
                      onClick={() => answer(q.id)}
                    >
                      Reply
                    </Button>
                  </div>
                ) : (
                  <p className="mt-1.5 text-xs text-muted-foreground">Awaiting an answer.</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
