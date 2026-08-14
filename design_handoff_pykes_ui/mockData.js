const now = Date.now();
const daysAgo = (d) => new Date(now - d * 86400000).toISOString();
const hoursAgo = (h) => new Date(now - h * 3600000).toISOString();

export const CURRENT_USER_ID = 'u1';

export const USERS = [
  { id: 'u1', username: 'novadev', displayName: 'Nova Reyes', bio: 'Solo dev building small useful things in public.', avatarHue: 150 },
  { id: 'u2', username: 'pixelpat', displayName: 'Pat Okafor', bio: 'Pixel artist turned indie hacker.', avatarHue: 40 },
  { id: 'u3', username: 'lunacodes', displayName: 'Luna Kowalski', bio: 'Shipping a new project every season.', avatarHue: 260 },
  { id: 'u4', username: 'ferrobyte', displayName: 'Theo Ferro', bio: 'Backend nerd, garden enjoyer.', avatarHue: 10 },
  { id: 'u5', username: 'saoirse', displayName: 'Saoirse Byrne', bio: 'Making tools for other makers.', avatarHue: 320 },
];

export const PROJECTS = [
  { id: 'p1', ownerId: 'u1', slug: 'tideline', name: 'Tideline', description: 'A minimal log for sailing trips and boat maintenance.', growthStage: 3, createdAt: daysAgo(64) },
  { id: 'p2', ownerId: 'u1', slug: 'kelp', name: 'Kelp', description: 'Fast, offline-first note-taking for developers.', growthStage: 1, createdAt: daysAgo(20) },
  { id: 'p3', ownerId: 'u2', slug: 'palette-forge', name: 'Palette Forge', description: 'A color palette generator for pixel artists.', growthStage: 5, createdAt: daysAgo(140) },
  { id: 'p4', ownerId: 'u3', slug: 'driftwood', name: 'Driftwood', description: 'A tiny journaling app that grows a tree with you.', growthStage: 4, createdAt: daysAgo(95) },
  { id: 'p5', ownerId: 'u4', slug: 'ledger', name: 'Ledger', description: 'Self-hosted budgeting for freelancers.', growthStage: 2, createdAt: daysAgo(30) },
  { id: 'p6', ownerId: 'u5', slug: 'stitch', name: 'Stitch', description: 'A CLI for scaffolding side projects fast.', growthStage: 0, createdAt: daysAgo(5) },
];

export const FOLLOWS = [
  { follower: 'u1', following: 'u2' },
  { follower: 'u1', following: 'u3' },
  { follower: 'u1', following: 'u4' },
];

export const POSTS = [
  { id: 'post1', userId: 'u1', projectId: 'p1', postType: 'idea', content: "Thinking about adding a tide chart overlay to Tideline's log view. Anyone tried the NOAA API before?", createdAt: hoursAgo(2), likedBy: ['u3'], commentCount: 2 },
  { id: 'post2', userId: 'u3', projectId: 'p4', postType: 'shipped', content: 'Shipped autosave for Driftwood entries. No more losing a paragraph because the laptop lid closed.', createdAt: hoursAgo(5), likedBy: ['u1', 'u4', 'u2'], commentCount: 4 },
  { id: 'post3', userId: 'u1', projectId: 'p2', postType: 'update', content: "Spent the morning on Kelp's sync engine. Conflict resolution is finally not a coin flip.", createdAt: hoursAgo(9), likedBy: ['u4'], commentCount: 1 },
  { id: 'post4', userId: 'u2', projectId: 'p3', postType: 'release', content: 'Palette Forge v1.0 is out. Export to Aseprite, Procreate, and CSS variables in one click. Two years of weekends, thank you to everyone who tested it.', createdAt: daysAgo(1), likedBy: ['u1', 'u3', 'u5'], commentCount: 9 },
  { id: 'post5', userId: 'u4', projectId: 'p5', postType: 'bug', content: 'Found a rounding error in Ledger where recurring expenses drift by a cent after a few months. Digging in.', createdAt: daysAgo(1), likedBy: [], commentCount: 3 },
  { id: 'post6', userId: 'u1', projectId: 'p1', postType: 'shipped', content: 'Shipped weather-aware trip warnings for Tideline. It now nudges you if a logged route crosses a small craft advisory.', createdAt: daysAgo(2), likedBy: ['u2', 'u3'], commentCount: 2 },
  { id: 'post7', userId: 'u3', projectId: 'p4', postType: 'idea', content: "Considering a 'seasons' view for Driftwood, four small trees instead of one, one per season of the year.", createdAt: daysAgo(3), likedBy: ['u1'], commentCount: 5 },
  { id: 'post8', userId: 'u5', projectId: 'p6', postType: 'update', content: 'Stitch can now scaffold a Vite + Express project with one command. Docker compose template next.', createdAt: daysAgo(3), likedBy: [], commentCount: 0 },
  { id: 'post9', userId: 'u2', projectId: 'p3', postType: 'shipped', content: 'Shipped a dark mode for the palette picker. Overdue.', createdAt: daysAgo(4), likedBy: ['u1'], commentCount: 1 },
  { id: 'post10', userId: 'u4', projectId: 'p5', postType: 'shipped', content: 'Shipped CSV import for Ledger. You can finally leave your spreadsheet behind.', createdAt: daysAgo(6), likedBy: ['u1', 'u2'], commentCount: 3 },
  { id: 'post11', userId: 'u1', projectId: 'p2', postType: 'release', content: "Kelp 0.3 is live: command palette, vim keys, and a much faster cold start. This is the version I've wanted to use myself.", createdAt: daysAgo(8), likedBy: ['u3', 'u4', 'u5'], commentCount: 6 },
  { id: 'post12', userId: 'u3', projectId: 'p4', postType: 'update', content: 'Redrew the tree sprites for Driftwood at a slightly higher resolution. Small thing, makes the whole app feel less flat.', createdAt: daysAgo(11), likedBy: ['u1'], commentCount: 2 },
];

export function currentUser() {
  return USERS.find((u) => u.id === CURRENT_USER_ID);
}
