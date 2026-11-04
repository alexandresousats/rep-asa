"use client";

const GROUPS = [
  {
    id: "rostos",
    label: "Rostos",
    icon: "😀",
    emojis: ["😀", "😁", "😂", "🤣", "😊", "😍", "😘", "😎", "🤩", "🤔", "😴", "😢", "😭", "😤", "🤯", "🥳", "😇", "🤗", "😉", "😌"],
  },
  {
    id: "gestos",
    label: "Gestos",
    icon: "👍",
    emojis: ["👍", "👎", "👏", "🙌", "🙏", "🤝", "💪", "👌", "✌️", "🤞", "👋", "👊", "✊", "🤟", "🤘", "👆", "👇", "👈", "👉", "🫶"],
  },
  {
    id: "coracoes",
    label: "Corações",
    icon: "❤️",
    emojis: ["❤️", "🧡", "💛", "💚", "💙", "💜", "🖤", "🤍", "💔", "❣️", "💕", "💞", "💓", "💗", "💖", "💘", "💝", "🔥", "✨", "⭐"],
  },
  {
    id: "trabalho",
    label: "Trabalho",
    icon: "📌",
    emojis: ["📌", "✅", "❌", "⚠️", "📎", "📁", "📝", "📅", "⏰", "💡", "🚀", "🎯", "📊", "📈", "💼", "🏆", "🎉", "👀", "💬", "🔔"],
  },
] as const;

export function EmojiPicker({ onPick }: { onPick: (emoji: string) => void }) {
  return (
    <div className="w-[280px] overflow-hidden rounded-2xl border border-line bg-elevated shadow-lg">
      <div className="max-h-56 overflow-y-auto px-2 py-2">
        {GROUPS.map((group) => (
          <div key={group.id} className="mb-2">
            <p className="px-1 py-1 text-[11px] text-faint">{group.label}</p>
            <div className="grid grid-cols-8 gap-0.5">
              {group.emojis.map((emoji) => (
                <button
                  key={`${group.id}-${emoji}`}
                  type="button"
                  aria-label={emoji}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => onPick(emoji)}
                  className="grid h-8 w-8 place-items-center rounded-md text-lg hover:bg-hover"
                >
                  {emoji}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
