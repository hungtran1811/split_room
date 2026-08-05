type BrandLogoProps = {
  size?: number;
  className?: string;
  alt?: string;
  decorative?: boolean;
};

export function BrandLogo({
  size = 36,
  className = "",
  alt = "SplitRoom",
  decorative = false,
}: BrandLogoProps) {
  return (
    <img
      src="/brand/logo.png"
      alt={decorative ? "" : alt}
      width={size}
      height={size}
      className={`brand-logo ${className}`.trim()}
      decoding="async"
      draggable={false}
      aria-hidden={decorative ? true : undefined}
    />
  );
}
