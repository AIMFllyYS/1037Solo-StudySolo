export interface AnkiCard { id: string; front: string; back: string; originalText?: string; explanation?: string; subjectId?: string; status?: string }
function html(value: string) { return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/\r?\n/g, "<br>").replace(/\t/g, " "); }
/** Anki GUIDs identify only StudySolo-origin notes; repeated import preserves review scheduling. */
async function guid(id: string) {
  const bytes = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`StudySolo:flashcard:${id}`)));
  return [...bytes.slice(0, 8)].map(byte => byte.toString(16).padStart(2, "0")).join("");
}
export async function ankiTsv(cards: readonly AnkiCard[]): Promise<string> {
  const ready = cards.filter(card => (!card.status || card.status === "ready") && card.id && card.front && card.back);
  const rows = await Promise.all(ready.map(async card => [await guid(card.id), html(card.front), html(card.back) + (card.explanation ? `<hr>${html(card.explanation)}` : ""), `StudySolo ss_subject_${(card.subjectId ?? "general").replace(/[^\w-]/g, "_")}`].join("\t")));
  return ["#separator:tab", "#html:true", "#notetype:Basic", "#deck:StudySolo", "#guid column:1", "#tags column:4", "#columns:GUID\tFront\tBack\tTags", ...rows, ""].join("\n");
}
