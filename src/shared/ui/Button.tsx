import type { ButtonHTMLAttributes, ReactNode } from "react";

export type ButtonVariant = "primary" | "ghost" | "danger";

type ButtonProps = {
  children: ReactNode;
  onClick?: ButtonHTMLAttributes<HTMLButtonElement>["onClick"];
  disabled?: boolean;
  type?: "button" | "submit" | "reset";
  className?: string;
  variant?: ButtonVariant;
};

export function Button({
  children,
  onClick,
  disabled = false,
  type = "button",
  className = "",
  variant = "primary",
}: ButtonProps) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`btn btn--${variant} ${className}`.trim()}
    >
      {children}
    </button>
  );
}
