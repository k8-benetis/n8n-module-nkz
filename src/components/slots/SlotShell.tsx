import React, { useState, useCallback } from 'react';

interface SlotShellProps {
  moduleId?: string;
  accent?: { base: string; soft: string; strong: string };
  title?: string;
  icon?: React.ReactNode;
  collapsible?: boolean;
  defaultCollapsed?: boolean;
  children: React.ReactNode;
  className?: string;
}

class SlotErrorBoundary extends React.Component<
  { children: React.ReactNode; moduleId?: string },
  { error: Error | null }
> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <div className="p-3 text-gray-500 text-sm">
          <p className="text-red-500 font-medium">Error in slot</p>
          <p className="text-xs">{this.state.error.message}</p>
        </div>
      );
    }
    return this.props.children;
  }
}

export function SlotShell({
  title,
  icon,
  collapsible = false,
  defaultCollapsed = false,
  children,
  className,
}: SlotShellProps) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  const toggle = useCallback(() => setCollapsed((c) => !c), []);

  return (
    <SlotErrorBoundary>
      <div
        className={`border border-gray-200 rounded-lg bg-white/80 backdrop-blur-sm ${className || ''}`}
        style={{ minWidth: 0 }}
      >
        {(title || collapsible) && (
          <div className="flex items-center justify-between px-4 py-2 border-b border-gray-100">
            <div className="flex items-center gap-2">
              {icon && <span className="text-gray-500">{icon}</span>}
              {title && <span className="text-sm font-medium text-gray-700">{title}</span>}
            </div>
            {collapsible && (
              <button
                onClick={toggle}
                className="text-gray-400 hover:text-gray-600 transition-colors p-0.5 rounded"
                aria-label={collapsed ? 'Expand' : 'Collapse'}
              >
                <span
                  className={`inline-block transition-transform duration-200 ${collapsed ? 'rotate-0' : 'rotate-180'}`}
                >
                  ⌃
                </span>
              </button>
            )}
          </div>
        )}
        {!collapsed && <div className="p-3">{children}</div>}
      </div>
    </SlotErrorBoundary>
  );
}

export function SlotShellCompact({
  children,
  className,
}: Omit<SlotShellProps, 'title' | 'icon' | 'collapsible'>) {
  return (
    <SlotErrorBoundary>
      <div
        className={`border border-gray-200 rounded-lg bg-white/80 backdrop-blur-sm ${className || ''}`}
        style={{ minWidth: 0 }}
      >
        <div className="p-2">{children}</div>
      </div>
    </SlotErrorBoundary>
  );
}
