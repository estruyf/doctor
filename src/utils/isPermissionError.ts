/**
 * Whether a SharePoint failure is the account not being allowed to do
 * something, rather than something being wrong with the request.
 *
 * SharePoint words this a different way per API — a REST call answers 401/403,
 * CSOM throws `Access is denied. (Exception from HRESULT: 0x80070005
 * (E_ACCESSDENIED))`, and the CLI passes either through as text — so the
 * wording is matched broadly on purpose.
 */
export const isPermissionError = (error: unknown): boolean => {
  const message =
    typeof error === "string"
      ? error
      : error && typeof error === "object" && "message" in error
        ? String((error as { message: unknown }).message)
        : JSON.stringify(error ?? "");

  const normalized = (message || "").toLowerCase();

  return (
    normalized.includes("status 401") ||
    normalized.includes("status 403") ||
    normalized.includes("status code 401") ||
    normalized.includes("status code 403") ||
    normalized.includes("unauthorized") ||
    normalized.includes("forbidden") ||
    normalized.includes("access denied") ||
    // CSOM says "Access is denied", which the shorter phrase above misses
    normalized.includes("access is denied") ||
    normalized.includes("e_accessdenied") ||
    normalized.includes("0x80070005") ||
    normalized.includes("not authorized") ||
    normalized.includes("insufficient") ||
    normalized.includes("attempted to perform an unauthorized operation")
  );
};
