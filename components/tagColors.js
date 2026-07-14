// Kept in its own module so both DashboardCard and DashboardGrid can use it.
// (Previously DashboardCard imported this from DashboardGrid while DashboardGrid
// imported DashboardCard — a circular import that caused a "Cannot access X before
// initialization" crash at module load time in production builds.)

const TAG_COLORS = {
  marketing: 'bg-[#C9A96E]/15 text-[#C9A96E] border border-[#C9A96E]/25',
  analytics: 'bg-[#4E9B6F]/15 text-[#4E9B6F] border border-[#4E9B6F]/25',
  strategy: 'bg-[#5B8FA8]/15 text-[#5B8FA8] border border-[#5B8FA8]/25',
  product: 'bg-[#7A6BA8]/15 text-[#7A6BA8] border border-[#7A6BA8]/25',
  business: 'bg-[#A89B5B]/15 text-[#A89B5B] border border-[#A89B5B]/25',
  productivity: 'bg-[#6BA88C]/15 text-[#6BA88C] border border-[#6BA88C]/25',
  engineering: 'bg-[#A85050]/15 text-[#A85050] border border-[#A85050]/25',
};

const DEFAULT_TAG_COLOR = 'bg-dim/15 text-dim border border-dim/25';

export function tagColor(tag) {
  return TAG_COLORS[(tag || '').toLowerCase()] || DEFAULT_TAG_COLOR;
}
