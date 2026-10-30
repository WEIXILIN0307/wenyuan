import { id } from "./model";
import type { Recovery } from "./save";

let fallbackTab: string | null = null;
export function tabId(): string {
  try {
    let value = sessionStorage.getItem("wenyuan-tab");
    if (!value) {
      value = id();
      sessionStorage.setItem("wenyuan-tab", value);
    }
    return value;
  } catch {
    return (fallbackTab ||= id());
  }
}
export function recoveryKey(user: string, documentId: string) {
  return `wenyuan:${user}:${documentId}:${tabId()}`;
}
export function otherDrafts(
  user: string,
  documentId: string,
): { key: string; record: Recovery }[] {
  const prefix = `wenyuan:${user}:${documentId}:`,
    own = recoveryKey(user, documentId);
  const result: { key: string; record: Recovery }[] = [];
  for (let index = 0; index < localStorage.length; index++) {
    const key = localStorage.key(index)!;
    if (key.startsWith(prefix) && key !== own) {
      try {
        const record = JSON.parse(localStorage.getItem(key)!);
        if (record.draft) result.push({ key, record });
      } catch {
        /* A damaged backup is never applied. */
      }
    }
  }
  return result;
}
