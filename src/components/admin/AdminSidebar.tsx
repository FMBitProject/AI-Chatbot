"use client";
import { TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { LogoFull, LogoIcon } from "@/components/Logo";
import { cn } from "@/lib/utils";
import { ChevronLeft, LogOut, X, type LucideIcon } from "lucide-react";
import type { Plan } from "@/lib/plan-limits";
import type { Lang } from "@/lib/i18n";

export type AdminNavItem = {
  value: string;
  label: string;
  icon: LucideIcon;
};

// Every paid plan needs a case here: the fallback is "Free", so a plan this
// list has not heard of shows a paying customer — the negotiated Custom ones
// most of all — as being on the free tier. Moved out of the old header with
// the badge itself; the dark sidebar needs its own colours for these, because
// the light-background pills were unreadable on it.
const PLAN_BADGE: Record<Plan, { label: string; className: string }> = {
  custom: { label: "★ Custom", className: "bg-white text-gray-900" },
  enterprise: { label: "⚡ Enterprise", className: "bg-teal-500/20 text-teal-200 border border-teal-400/30" },
  professional: { label: "✦ Pro", className: "bg-teal-500/20 text-teal-200 border border-teal-400/30" },
  personal: { label: "◆ Personal", className: "bg-teal-500/20 text-teal-200 border border-teal-400/30" },
  starter: { label: "Free", className: "bg-white/10 text-gray-300 border border-white/15" },
};

type AdminSidebarProps = {
  items: AdminNavItem[];
  collapsed: boolean;
  onToggleCollapsed: () => void;
  /** Mobile drawer state. On md and up the sidebar is always in the layout and
   *  this is ignored. */
  mobileOpen: boolean;
  onCloseMobile: () => void;
  workspaceName: string;
  userName: string;
  isIndividual: boolean;
  plan: Plan;
  lang: Lang;
  logoutLabel: string;
  onLogout: () => void;
};

export function AdminSidebar({
  items,
  collapsed,
  onToggleCollapsed,
  mobileOpen,
  onCloseMobile,
  workspaceName,
  userName,
  isIndividual,
  plan,
  lang,
  logoutLabel,
  onLogout,
}: AdminSidebarProps) {
  const badge = PLAN_BADGE[plan] ?? PLAN_BADGE.starter;

  return (
    <>
      {/* Mobile scrim. Rendered only when the drawer is open so it cannot eat
          clicks on the dashboard behind it the rest of the time. */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-gray-900/50 backdrop-blur-sm md:hidden"
          onClick={onCloseMobile}
          aria-hidden
        />
      )}

      <aside
        className={cn(
          // Fixed on mobile so it slides over the content; from md up it takes
          // its own column and the main area shrinks beside it.
          //
          // `sticky` + `h-screen` rather than `static`: a static sidebar
          // stretches to the height of the page, so on a long documents table
          // the whole nav scrolls off the top and there is no way back to
          // another section without scrolling up again. Sticky keeps it in the
          // flex row (so it still reserves its column, which `fixed` would not)
          // while pinning it to the viewport, and the fixed height is what lets
          // the nav list below scroll on its own when the items outgrow it.
          "fixed inset-y-0 left-0 z-50 flex flex-col bg-[#0B1F26] text-gray-300",
          "transition-[transform,width] duration-200 ease-out",
          "md:sticky md:top-0 md:h-screen md:translate-x-0",
          mobileOpen ? "translate-x-0" : "-translate-x-full",
          collapsed ? "w-[248px] md:w-[76px]" : "w-[248px]"
        )}
      >
        {/* Brand row */}
        <div className="flex h-16 items-center gap-2 border-b border-white/10 px-4 shrink-0">
          {/* The wordmark's own white variant rather than the light one with
              a colour override: it already knows how to render itself on a
              dark ground. Collapsed, only the mark fits. */}
          {/* Both are rendered and swapped by breakpoint, not by `collapsed`
              alone. Collapsing is a desktop-only affordance — on mobile this is
              a 248px drawer either way — so a plain ternary would strip the
              wordmark off the drawer the moment someone had collapsed the
              desktop sidebar earlier in the session. */}
          <LogoFull
            size="sm"
            variant="white"
            className={cn("min-w-0 shrink", collapsed && "md:hidden")}
          />
          {collapsed && <LogoIcon size="sm" className="hidden shrink-0 md:block" />}
          {/* Collapse is a desktop affordance — on mobile the same button would
              shrink a drawer the user opened on purpose, so mobile gets a close
              button in its place. */}
          <button
            type="button"
            onClick={onToggleCollapsed}
            aria-label={collapsed
              ? (lang === "en" ? "Expand sidebar" : "Perlebar sidebar")
              : (lang === "en" ? "Collapse sidebar" : "Perkecil sidebar")}
            className="ml-auto hidden rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-white/10 hover:text-white md:block"
          >
            <ChevronLeft className={cn("h-4 w-4 transition-transform", collapsed && "rotate-180")} />
          </button>
          <button
            type="button"
            onClick={onCloseMobile}
            aria-label={lang === "en" ? "Close menu" : "Tutup menu"}
            className="ml-auto rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-white/10 hover:text-white md:hidden"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Nav.
            This is the dashboard's Radix TabsList, not a list of links — which
            is why it has to stay inside <Tabs>. Keeping the primitive buys the
            roving arrow-key focus, the aria-controls wiring to each panel and
            the active state for free; a hand-rolled list of buttons would have
            to reimplement all three, and the previous horizontal bar proved
            they are the parts nobody remembers to add back. */}
        <TabsList
          className={cn(
            "flex h-auto flex-1 flex-col items-stretch justify-start gap-1 overflow-y-auto rounded-none bg-transparent p-3 text-gray-300",
            collapsed && "md:px-2"
          )}
        >
          {items.map(({ value, label, icon: Icon }) => (
            <TabsTrigger
              key={value}
              value={value}
              // `title` rather than a tooltip component: collapsed, the label is
              // the only thing telling these six icons apart, and a native
              // tooltip needs no JS to appear.
              title={collapsed ? label : undefined}
              className={cn(
                "group relative h-11 w-full shrink-0 justify-start gap-3 rounded-xl px-3 text-sm font-medium",
                "text-gray-300 transition-colors hover:bg-white/5 hover:text-white",
                "focus-visible:ring-teal-400 focus-visible:ring-offset-[#0B1F26]",
                "data-[state=active]:bg-teal-600 data-[state=active]:text-white data-[state=active]:shadow-lg data-[state=active]:shadow-teal-900/40",
                collapsed && "md:justify-center md:px-0"
              )}
            >
              <Icon className="h-[18px] w-[18px] shrink-0" />
              <span className={cn("truncate", collapsed && "md:hidden")}>{label}</span>
              {/* The dot in the mock. Purely decorative, so it is hidden from
                  the accessibility tree — the active state is already conveyed
                  by aria-selected on the trigger. */}
              <span
                aria-hidden
                className={cn(
                  "ml-auto h-1.5 w-1.5 rounded-full bg-white/70 opacity-0 transition-opacity",
                  "group-data-[state=active]:opacity-100",
                  collapsed && "md:hidden"
                )}
              />
            </TabsTrigger>
          ))}
        </TabsList>

        {/* Footer: who you are, what you are paying for, and the two ways out. */}
        <div className={cn("shrink-0 border-t border-white/10 p-3", collapsed && "md:px-2")}>
          <div className={cn("mb-2 flex items-center gap-2 rounded-xl bg-white/5 p-2", collapsed && "md:justify-center md:bg-transparent md:p-0")}>
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-teal-600 text-xs font-semibold text-white">
              {(userName || "A").charAt(0).toUpperCase()}
            </div>
            <div className={cn("min-w-0 flex-1", collapsed && "md:hidden")}>
              <p className="truncate text-sm font-medium text-white">{userName}</p>
              {/* The workspace name is the person's own name on an individual
                  account — repeating it under itself says nothing. */}
              <p className="truncate text-xs text-gray-400">
                {isIndividual ? (lang === "en" ? "Personal workspace" : "Ruang pribadi") : (workspaceName || "—")}
              </p>
            </div>
          </div>

          <div className={cn("mb-2 flex items-center gap-2", collapsed && "md:hidden")}>
            <span className={cn("rounded-full px-2 py-0.5 text-xs font-semibold", badge.className)}>
              {badge.label}
            </span>
            <LanguageSwitcher className="ml-auto" />
          </div>

          {/* "Buka Chat" used to sit here. It moved to the top bar in the main
              column: it is the one control that leaves the dashboard for
              another surface, and buried under the nav it read as a seventh
              section rather than a way out. */}
          <Button
            variant="ghost"
            size="sm"
            onClick={onLogout}
            title={collapsed ? logoutLabel : undefined}
            className={cn(
              "w-full justify-start gap-2 text-gray-400 hover:bg-red-500/10 hover:text-red-300",
              collapsed && "md:justify-center md:px-0"
            )}
          >
            <LogOut className="h-4 w-4 shrink-0" />
            <span className={cn(collapsed && "md:hidden")}>{logoutLabel}</span>
          </Button>
        </div>
      </aside>
    </>
  );
}
