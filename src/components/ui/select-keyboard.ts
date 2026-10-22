export interface SelectKeyboardState {
  open: boolean;
  activeIndex: number;
}

export interface SelectKeyboardResult {
  state: SelectKeyboardState;
  commit: boolean;
  focusTrigger: boolean;
}

export function selectKeyboardAction(
  key: string,
  state: SelectKeyboardState,
  optionCount: number,
): SelectKeyboardResult | null {
  if (!state.open) {
    if (["Enter", " ", "ArrowDown", "ArrowUp"].includes(key) && optionCount > 0)
      return { state: { ...state, open: true }, commit: false, focusTrigger: false };
    return null;
  }
  if (key === "ArrowDown" || key === "ArrowUp") {
    const step = key === "ArrowDown" ? 1 : -1;
    return {
      state: { open: true, activeIndex: (state.activeIndex + step + optionCount) % optionCount },
      commit: false,
      focusTrigger: false,
    };
  }
  if (key === "Home" || key === "End")
    return {
      state: { open: true, activeIndex: key === "Home" ? 0 : optionCount - 1 },
      commit: false,
      focusTrigger: false,
    };
  if (key === "Enter" || key === " ")
    return { state: { ...state, open: false }, commit: true, focusTrigger: true };
  if (key === "Escape")
    return { state: { ...state, open: false }, commit: false, focusTrigger: true };
  if (key === "Tab")
    return { state: { ...state, open: false }, commit: false, focusTrigger: false };
  return null;
}
