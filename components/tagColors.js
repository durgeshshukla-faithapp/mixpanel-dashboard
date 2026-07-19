// Distinct, editorial-feel tag colors that pair well with the Terminal Noir palette
// Each tag gets a hue that's saturated enough to be recognizable but muted enough
// to fit the dark, financial-terminal aesthetic

const TAG_COLORS = {
  // Amber/gold family — primary business
  marketing: 'bg-[#D4A574]/15 text-[#D4A574] border border-[#D4A574]/30',
  business: 'bg-[#C9A96E]/15 text-[#C9A96E] border border-[#C9A96E]/30',
  revenue: 'bg-[#B8934F]/15 text-[#B8934F] border border-[#B8934F]/30',

  // Green family — growth/analytics
  analytics: 'bg-[#5EA870]/15 text-[#5EA870] border border-[#5EA870]/30',
  growth: 'bg-[#6BAC8F]/15 text-[#6BAC8F] border border-[#6BAC8F]/30',
  productivity: 'bg-[#7DB89C]/15 text-[#7DB89C] border border-[#7DB89C]/30',

  // Blue family — strategy/product
  strategy: 'bg-[#6A9BB5]/15 text-[#6A9BB5] border border-[#6A9BB5]/30',
  product: 'bg-[#7B8FC5]/15 text-[#7B8FC5] border border-[#7B8FC5]/30',
  engineering: 'bg-[#8B9DC7]/15 text-[#8B9DC7] border border-[#8B9DC7]/30',

  // Purple/pink — user-focused
  personal: 'bg-[#B37FB0]/15 text-[#B37FB0] border border-[#B37FB0]/30',
  'personal session': 'bg-[#B37FB0]/15 text-[#B37FB0] border border-[#B37FB0]/30',
  notifications: 'bg-[#9C7BB0]/15 text-[#9C7BB0] border border-[#9C7BB0]/30',
  users: 'bg-[#C580A5]/15 text-[#C580A5] border border-[#C580A5]/30',

  // Red/coral — alerts, fees
  alerts: 'bg-[#C77373]/15 text-[#C77373] border border-[#C77373]/30',
  'platform fees': 'bg-[#D4886B]/15 text-[#D4886B] border border-[#D4886B]/30',
  fees: 'bg-[#D4886B]/15 text-[#D4886B] border border-[#D4886B]/30',

  // Teal/cyan — data/technical
  data: 'bg-[#5CA9A5]/15 text-[#5CA9A5] border border-[#5CA9A5]/30',
  'sign in a/b': 'bg-[#68A5B0]/15 text-[#68A5B0] border border-[#68A5B0]/30',
};

const FALLBACK_COLORS = [
  'bg-[#D4A574]/15 text-[#D4A574] border border-[#D4A574]/30',
  'bg-[#5EA870]/15 text-[#5EA870] border border-[#5EA870]/30',
  'bg-[#6A9BB5]/15 text-[#6A9BB5] border border-[#6A9BB5]/30',
  'bg-[#B37FB0]/15 text-[#B37FB0] border border-[#B37FB0]/30',
  'bg-[#C77373]/15 text-[#C77373] border border-[#C77373]/30',
  'bg-[#5CA9A5]/15 text-[#5CA9A5] border border-[#5CA9A5]/30',
  'bg-[#D4886B]/15 text-[#D4886B] border border-[#D4886B]/30',
  'bg-[#9C7BB0]/15 text-[#9C7BB0] border border-[#9C7BB0]/30',
];

// Hash tag name to a stable fallback color for unknown tags
function hashTag(tag) {
  let h = 0;
  for (let i = 0; i < tag.length; i++) h = tag.charCodeAt(i) + ((h << 5) - h);
  return FALLBACK_COLORS[Math.abs(h) % FALLBACK_COLORS.length];
}

export function tagColor(tag) {
  const key = (tag || '').toLowerCase().trim();
  if (!key) return 'bg-dim/15 text-dim border border-dim/25';
  return TAG_COLORS[key] || hashTag(key);
}
