// Data-driven team roster for the dashboard About page.
//
// To add / edit / remove a team member, change this array — no component
// changes needed. Keep the structure flat and replaceable:
//
//   {
//     name: "Jane Doe",
//     role: "Founder & product lead",
//     image: null,                    // or a URL/path to a square photo
//     bio: "One or two sentences.",
//     links: [{ label: "LinkedIn", href: "https://..." }],  // optional
//   }
//
// `image: null` renders an avatar with the member's initial, so entries are
// valid without a photo.

export type TeamMember = {
  name: string
  role: string
  /** Square profile photo (URL or asset path), or null for an initial avatar. */
  image: string | null
  /** Short bio shown under the member's name and role. */
  bio: string
  /** Optional profile/social links (label + href). */
  links?: { label: string; href: string }[]
}

// ─────────────────────────────────────────────────────────────────────────────
// PLACEHOLDERS — replace these with real team members before launch.
// No real personal information is included here.
// ─────────────────────────────────────────────────────────────────────────────
export const TEAM_MEMBERS: TeamMember[] = [
  {
    name: "Founder Name",
    role: "Founder",
    image: null,
    bio: "One-line bio for the founder — what drives them and why they started UreSphere.",
  },
  {
    name: "Co-founder Name",
    role: "Co-founder",
    image: null,
    bio: "One-line bio for the co-founder — the area of the product they lead.",
  },
  {
    name: "Team Member Name",
    role: "Role",
    image: null,
    bio: "One-line bio for this team member — what they do on the team.",
  },
]
