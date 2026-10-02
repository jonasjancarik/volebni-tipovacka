/**
 * The form of an address that decides which account it belongs to. Mail providers deliver
 * `name+anything@…` to `name@…`, and Gmail also ignores dots, so without this one mailbox could
 * hold any number of accounts and fill a leaderboard with its own tips.
 */
export function canonicalEmail(email: string): string {
  const at = email.lastIndexOf("@")
  let local = email.slice(0, at).split("+")[0]
  const domain = email.slice(at + 1) === "googlemail.com" ? "gmail.com" : email.slice(at + 1)
  if (domain === "gmail.com") local = local.replaceAll(".", "")
  return local ? `${local}@${domain}` : email
}
