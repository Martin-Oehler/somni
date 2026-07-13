// Tactile confirmation for the primary one-handed actions.
export const buzz = (ms = 10): void => {
  try {
    navigator.vibrate?.(ms);
  } catch {
    // not supported — fine
  }
};
