export const APP_SCREENS = ["title", "meadow", "collection", "battle", "result"] as const;

export type AppScreen = (typeof APP_SCREENS)[number];
