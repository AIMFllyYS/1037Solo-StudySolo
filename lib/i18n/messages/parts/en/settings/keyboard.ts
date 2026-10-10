/** settings.keyboard locale entries. Keep keys/placeholders aligned with the other language. */
export const settingsKeyboardEn = {
    enabled: "{enabled} / {total} enabled",
    enableAll: "Enable all",
    disableAll: "Disable all",
    enableAria: "Enable {label}",
    openReference: "View the full shortcut reference",
    // Group names (SHORTCUT_CATEGORIES[].labelKey).
    category: {
      global: "Global",
      rightPanel: "Right panel",
      window: "Windows",
      review: "Review board",
      overlay: "Overlays",
      chat: "Chat",
    },
    // The 21 shortcuts (SHORTCUTS[].labelKey / descriptionKey); names mirror the ids in lib/keyboard/shortcuts.ts.
    shortcut: {
      global: {
        search: { label: "Global search", description: "Open global content search" },
        aiFloating: { label: "AI assistant popover", description: "Open the AI selection popover with no text selected" },
        toggleSidebar: { label: "Collapse / expand sidebar", description: "Toggle the left navigation" },
        billing: { label: "API billing overview", description: "Open the API billing overview window" },
        newChat: { label: "New chat", description: "Create a new AI chat and switch to the AI panel" },
        toggleTopBar: { label: "Collapse / expand top bar", description: "Toggle the top navigation" },
        openReview: { label: "Open review board", description: "Jump to the review board for the current subject" },
        shortcutHelp: { label: "Shortcut help", description: "Open the shortcut reference panel" },
        rightTab: {
          ai: { label: "AI chat tab", description: "Switch to the AI chat on the right" },
          video: { label: "Animated explainer tab", description: "Switch to the animated explainer on the right" },
          interactive: { label: "Interactive tab", description: "Switch to the interactive demo on the right" },
          browser: { label: "Browser tab", description: "Switch to the built-in browser on the right" },
        },
      },
      window: {
        close: { label: "Close window", description: "Close the selected floating window" },
        minimize: { label: "Minimize window", description: "Minimize or restore the selected floating window" },
        fullscreen: { label: "Fullscreen window", description: "Fullscreen or exit fullscreen for the selected floating window" },
      },
      overlay: {
        escape: { label: "Close overlay", description: "Close the topmost dialog, menu, or overlay" },
      },
      review: {
        prevCard: { label: "Previous card", description: "Review board: go to the previous card" },
        nextCard: { label: "Next card", description: "Review board: go to the next card" },
        flipCard: { label: "Flip card", description: "Review board: flip the current card" },
      },
      chat: {
        send: { label: "Send message", description: "Send from the chat input with Enter" },
        newline: { label: "New line", description: "Insert a new line in the chat input with Shift+Enter" },
      },
    },
  };
