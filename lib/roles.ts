// Permission-first role names. `super_admin` / `admin` live in profiles.role
// (platform-wide / Sphere-wide) and are NOT assignable via role_assignments;
// `sphere_admin` is assignable and grants full administration inside one Sphere.
// The remaining roles are scoped managers: they only hold the permissions in
// their assignment's scope.permissions, optionally narrowed by degree/year/branch.

export const ASSIGNABLE_ROLES = [
  "sphere_admin",
  "academic_manager",
  "social_moderator",
  "club_manager",
  "club_admin",
  "event_manager",
  "marketplace_moderator",
  "listing_manager",
  "promotion_moderator",
  "shop_admin",
] as const

export type AssignableRole = (typeof ASSIGNABLE_ROLES)[number]

export const ROLE_LABELS: Record<AssignableRole, string> = {
  sphere_admin: "Sphere admin",
  academic_manager: "Academic manager",
  social_moderator: "Social moderator",
  club_manager: "Club manager",
  club_admin: "Club admin",
  event_manager: "Event manager",
  marketplace_moderator: "Marketplace moderator",
  listing_manager: "Listing manager",
  promotion_moderator: "Promotion moderator",
  shop_admin: "Shop admin",
}

// Default permission set applied when the admin assigns a role without picking
// individual permissions. Administrators can still narrow it per assignment.
export const ROLE_PERMISSION_PRESETS: Record<AssignableRole, string[]> = {
  sphere_admin: [
    "academic.create", "academic.update", "academic.delete", "academic.read",
    "social.moderate", "social.delete_message", "social.manage_groups",
    "clubs.create", "clubs.update", "clubs.delete", "clubs.read",
    "events.create", "events.update", "events.delete", "events.read", "events.answer_queries",
    "marketplace.review", "marketplace.approve", "marketplace.reject", "marketplace.manage_orders",
    "listings.read", "listings.update", "listings.delete",
    "promotions.review", "promotions.approve", "promotions.reject", "promotions.delete",
    "shop.read", "shop.update", "shop.products.read", "shop.products.create", "shop.products.update", "shop.products.delete", "shop.orders.read", "shop.orders.update",
  ],
  academic_manager: ["academic.read", "academic.create", "academic.update", "academic.delete"],
  social_moderator: ["social.moderate", "social.delete_message", "social.manage_groups"],
  club_manager: ["clubs.read", "clubs.create", "clubs.update", "clubs.delete"],
  club_admin: ["clubs.read", "clubs.update", "events.create", "events.update", "events.read"],
  event_manager: ["events.read", "events.create", "events.update", "events.delete", "events.answer_queries"],
  marketplace_moderator: ["marketplace.review", "marketplace.approve", "marketplace.reject", "marketplace.manage_orders"],
  listing_manager: ["listings.read", "listings.update", "listings.delete"],
  promotion_moderator: ["promotions.review", "promotions.approve", "promotions.reject", "promotions.delete"],
  shop_admin: ["shop.read", "shop.update", "shop.products.read", "shop.products.create", "shop.products.update", "shop.products.delete", "shop.orders.read", "shop.orders.update"],
}

// Every permission name that exists anywhere (used by the permission picker).
export const ALL_PERMISSIONS = Array.from(
  new Set([
    ...Object.values(ROLE_PERMISSION_PRESETS).flat(),
    "users.view",
    "users.manage",
  ]),
).sort()

// Which scope fields apply to which role. academic_manager is scoped by
// degree/year/branch; the other manager roles are section-scoped by default.
export const ROLE_SCOPE_FIELDS: Record<AssignableRole, ("degree" | "year" | "branch")[]> = {
  sphere_admin: [],
  academic_manager: ["degree", "year", "branch"],
  social_moderator: [],
  club_manager: [],
  club_admin: [],
  event_manager: [],
  marketplace_moderator: [],
  listing_manager: [],
  promotion_moderator: [],
  shop_admin: [],
}

// Tabs a sphere-scoped manager may open, keyed by the permission that unlocks
// the tab. Sphere administrators and super admins always see every tab.
export const TAB_PERMISSION: Record<string, string> = {
  social: "social.moderate",
  groups: "social.manage_groups",
  academic: "academic.read",
  clubs: "clubs.read",
  events: "events.read",
  marketplace: "marketplace.manage_orders",
  listings: "listings.read",
  promotions: "promotions.review",
  shop: "shop.read",
}
