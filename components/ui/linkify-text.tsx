import React from "react"
import Link from "next/link"

const URL_REGEX = /(https?:\/\/[^\s]+)/g

export function LinkifyText({ text, className }: { text: string; className?: string }) {
  if (!text) return null

  // Split by newlines first to preserve line breaks
  const lines = text.split("\n")

  return (
    <div className={className}>
      {lines.map((line, i) => (
        <React.Fragment key={i}>
          {line.split(URL_REGEX).map((part, j) => {
            if (part.match(URL_REGEX)) {
              return (
                <Link
                  key={j}
                  href={part}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline"
                >
                  {part}
                </Link>
              )
            }
            return part
          })}
          {i !== lines.length - 1 && <br />}
        </React.Fragment>
      ))}
    </div>
  )
}
