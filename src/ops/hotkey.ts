/* Zkratka jako text (Ctrl+Shift+KeyS): zobrazení a převod z události klávesnice v okně aplikace. */

/* Ctrl+Shift+KeyS → Ctrl+Shift+S */
export const hotkeyLabel = (h: string): string => h.split('+').map(p => p.replace(/^Key(?=[A-Z]$)/, '').replace(/^Digit(?=\d$)/, '')).join('+');

/* Klávesa z události: modifikátory + KeyboardEvent.code; samotný modifikátor nic nevrací. */
export function hotkeyFrom(e: { ctrlKey: boolean; altKey: boolean; shiftKey: boolean; metaKey: boolean; code: string }): string | null {
  if (/^(Control|Alt|Shift|Meta|OS)(Left|Right)?$/.test(e.code)) return null;
  const mods = [e.ctrlKey && 'Ctrl', e.altKey && 'Alt', e.shiftKey && 'Shift', e.metaKey && 'Super'].filter(Boolean) as string[];
  return [...mods, e.code].join('+');
}
