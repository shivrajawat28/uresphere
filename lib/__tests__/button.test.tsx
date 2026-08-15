// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest"
import { act } from "react"
import { createRoot } from "react-dom/client"
import type { ReactElement } from "react"
import { Button } from "@/components/ui/button"

/**
 * Mounts a React element into a detached jsdom container and flushes effects.
 * Base UI's Button runs its nativeButton contract check inside a useEffect,
 * so flushing effects is what triggers (or proves the absence of) the
 * "expected a native <button>" dev error that previously surfaced in the
 * Next.js error overlay.
 */
function mount(element: ReactElement) {
  const container = document.createElement("div")
  document.body.appendChild(container)
  const root = createRoot(container)
  act(() => {
    root.render(element)
  })
  act(() => {})
  return { container, root }
}

afterEach(() => {
  document.body.innerHTML = ""
  vi.restoreAllMocks()
})

describe("Button (Base UI)", () => {
  it("renders a native <button> without the nativeButton runtime error", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {})
    const { container, root } = mount(<Button>Save</Button>)

    expect(container.querySelector("button")).not.toBeNull()

    act(() => root.unmount())
    const logged = spy.mock.calls.flat().join(" ")
    expect(logged).not.toContain("nativeButton")
    expect(logged).not.toContain("expected a native <button>")
  })

  it("renders an asChild element (Link/anchor) without the nativeButton runtime error", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {})
    const { container, root } = mount(
      <Button asChild>
        {/* Mirrors the real usage in /onboarding/pending, /not-found, etc. */}
        <a href="/dashboard">Refresh</a>
      </Button>,
    )

    const link = container.querySelector("a")
    expect(link).not.toBeNull()
    // Button styling is applied to the rendered element.
    expect(link?.getAttribute("class") ?? "").toContain("inline-flex")

    act(() => root.unmount())
    const logged = spy.mock.calls.flat().join(" ")
    expect(logged).not.toContain("nativeButton")
    expect(logged).not.toContain("expected a native <button>")
  })
})
