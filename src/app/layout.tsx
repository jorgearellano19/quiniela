import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./styles.css";

export const metadata: Metadata = {
  title: "Quiniela",
  description: "Crea, comparte y compite en quinielas de pronósticos.",
};
export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="es">
      <body>
        <a className="skip-link" href="#main-content">
          Saltar al contenido principal
        </a>
        {children}
      </body>
    </html>
  );
}
