/** Short names shown for the module a raiser heads, in the bracketed part of their name. The stored name is unchanged. */
const MODULE_SHORT_NAMES: Record<string, string> = {
  Stores: 'MM',
  'P&M': 'FEM',
  PMS: 'PCM',
}

/** Shows the PMS module as PCM (its stored code stays PMS). */
export const displayPCM = (text: string): string => text.replace(/\bPMS\b/g, 'PCM')

/** "Ananya Gupta (Stores module head)" → "Ananya Gupta (MM module head)"; other names are returned as they are. */
export const displayRaiser = (name: string): string =>
  displayPCM(name).replace(/\(([^()]*?) module head\)/, (whole, mod: string) => {
    const short = MODULE_SHORT_NAMES[mod.trim()]
    return short ? `(${short} module head)` : whole
  })
