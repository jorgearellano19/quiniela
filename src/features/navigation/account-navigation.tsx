"use client";

import Link from "next/link";
import { MenuIcon, ShieldCheckIcon, WrenchIcon, XIcon } from "lucide-react";
import { Dialog } from "radix-ui";
import { Button } from "@/components/ui/button";
import { SignOutForm } from "@/features/auth/sign-out-form";

export function AccountNavigation({
  name,
  email,
  isOperator,
}: {
  name: string;
  email: string;
  isOperator: boolean;
}) {
  return (
    <>
      <div className="hidden items-center gap-4 lg:flex">
        <Link
          className="rounded-sm text-sm underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
          href="/account/security"
        >
          Seguridad
        </Link>
        {isOperator ? (
          <Link
            className="rounded-sm text-sm underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
            href="/operator/users"
          >
            Operación
          </Link>
        ) : null}
        <div className="max-w-60 text-right">
          <p className="truncate text-sm font-medium">{name}</p>
          <p className="truncate text-xs text-muted-foreground">{email}</p>
        </div>
        <SignOutForm />
      </div>

      <Dialog.Root>
        <Dialog.Trigger asChild>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="size-11 lg:hidden"
            aria-label="Abrir menú"
          >
            <MenuIcon aria-hidden="true" />
          </Button>
        </Dialog.Trigger>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-foreground/20 backdrop-blur-xs data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0" />
          <Dialog.Content className="fixed inset-y-0 right-0 z-50 flex w-[min(88vw,22rem)] flex-col border-l bg-background p-5 shadow-xl outline-none data-[state=open]:animate-in data-[state=open]:slide-in-from-right data-[state=closed]:animate-out data-[state=closed]:slide-out-to-right motion-reduce:animate-none">
            <div className="flex items-center justify-between gap-4 border-b pb-5">
              <div className="min-w-0">
                <Dialog.Title className="font-heading text-2xl">Tu cuenta</Dialog.Title>
                <Dialog.Description className="sr-only">
                  Navegación y opciones de la cuenta
                </Dialog.Description>
              </div>
              <Dialog.Close asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-11"
                  aria-label="Cerrar menú"
                >
                  <XIcon aria-hidden="true" />
                </Button>
              </Dialog.Close>
            </div>

            <div className="min-w-0 border-b py-5">
              <p className="truncate font-medium">{name}</p>
              <p className="mt-1 truncate text-sm text-muted-foreground">{email}</p>
            </div>

            <nav aria-label="Menú de cuenta" className="grid gap-2 py-5">
              <Dialog.Close asChild>
                <Link
                  href="/account/security"
                  className="flex min-h-12 items-center gap-3 rounded-xl px-3 text-sm font-medium hover:bg-secondary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                >
                  <ShieldCheckIcon aria-hidden="true" />
                  Seguridad
                </Link>
              </Dialog.Close>
              {isOperator ? (
                <Dialog.Close asChild>
                  <Link
                    href="/operator/users"
                    className="flex min-h-12 items-center gap-3 rounded-xl px-3 text-sm font-medium hover:bg-secondary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                  >
                    <WrenchIcon aria-hidden="true" />
                    Operación
                  </Link>
                </Dialog.Close>
              ) : null}
            </nav>

            <div className="mt-auto border-t pt-5 [&>form]:items-stretch [&_button]:h-11 [&_button]:w-full">
              <SignOutForm />
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}
