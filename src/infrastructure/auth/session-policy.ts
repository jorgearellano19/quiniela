export type TemporarySessionState = Readonly<{
  passwordChangeRequired?: boolean | undefined;
  temporaryPasswordExpiresAt?: Date | string | null | undefined;
}>;

export function isTemporarySessionUsable(
  user: TemporarySessionState,
  now = new Date(),
) {
  if (!user.passwordChangeRequired) return true;
  const expiresAt = user.temporaryPasswordExpiresAt;
  if (!expiresAt) return false;
  const expiryTime = new Date(expiresAt).getTime();
  return Number.isFinite(expiryTime) && expiryTime > now.getTime();
}
