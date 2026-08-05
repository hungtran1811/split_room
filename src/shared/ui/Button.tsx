import type { ButtonHTMLAttributes, ReactNode } from "react";

export type ButtonVariant = "primary" | "ghost" | "danger" | "coral";

type ButtonProps = {
  children: ReactNode;
  onClick?: ButtonHTMLAttributes<HTMLButtonElement>["onClick"];
  disabled?: boolean;
  type?: "button" | "submit" | "reset";
  className?: string;
  variant?: ButtonVariant;
  block?: boolean;
};

export function Button({
  children,
  onClick,
  disabled = false,
  type = "button",
  className = "",
  variant = "primary",
  block = false,
}: ButtonProps) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`btn btn--${variant} ${block ? "btn--block" : ""} ${className}`.trim()}
    >
      {children}
    </button>
  );
}
