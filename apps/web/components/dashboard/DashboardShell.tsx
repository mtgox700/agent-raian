interface DashboardShellProps {
  title?: string
  description?: string
  actions?: React.ReactNode
  children: React.ReactNode
}

export function DashboardShell({
  title,
  description,
  actions,
  children,
}: DashboardShellProps) {
  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Page header */}
      {(title || actions) && (
        <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3 md:px-6 md:py-4">
          <div className="min-w-0">
            {title && (
              <h2 className="font-display text-lg md:text-xl font-bold tracking-tight text-white truncate">
                {title}
              </h2>
            )}
            {description && (
              <p className="mt-0.5 text-xs md:text-sm text-muted">{description}</p>
            )}
          </div>
          {actions && <div className="flex items-center gap-2 md:gap-3 flex-shrink-0">{actions}</div>}
        </div>
      )}

      {/* Page content */}
      <div className="flex-1 overflow-auto p-4 md:p-6">{children}</div>
    </div>
  )
}
