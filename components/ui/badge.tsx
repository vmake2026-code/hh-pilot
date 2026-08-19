import type { ReactNode } from "react";

interface BadgeProps {
  children: ReactNode;
  variant?: "default" | "success" | "warning" | "info";
}

export default function Badge({ children, variant = "default" }: BadgeProps) {
  return <span className={`badge badge-${variant}`}>{children}</span>;
}
