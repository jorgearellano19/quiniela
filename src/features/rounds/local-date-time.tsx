"use client";
export function LocalDateTime({ value }: { value: string }) {
  return (
    <time dateTime={value} suppressHydrationWarning>
      {new Intl.DateTimeFormat("es-MX", {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(new Date(value))}
    </time>
  );
}
