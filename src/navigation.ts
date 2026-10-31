/**
 * The screen switches the page (ui.ts) performs for the views it hosts: the raid view (coast-view/sample.ts) and the
 * station yard (station-view/route.ts). The page registers itself when it loads; a view asks through this port instead
 * of importing the page, so only the page decides which screen owns the session.
 */
import type { GameState } from './session';

export interface Navigation {
  /** One of the page's own screens: title, tab page or result. A raid always goes through enterExternalRun. */
  changeState(state: Exclude<GameState, 'run'>): void;
  /** Hand the whole page to the raid view. */
  enterExternalRun(): void;
  /** The raid's settlement is saved and its view released: by default the yard walks in and shows the one report. */
  settled(): void;
  render(): void;
  /** Clear the tab page for the yard; false keeps it (a pending settlement shows its save dialog instead). */
  hideoutExternal(): boolean;
  /** Start the raid the hideout has already committed; false leaves it saved for the title's continue. */
  startPreparedHideoutRaid(runId: string): Promise<boolean>;
}

let page: Navigation | null = null;
export function provideNavigation(navigation: Navigation): void { page = navigation; }
export function navigation(): Navigation {
  if (!page) throw new Error('The page has not registered its navigation yet.');
  return page;
}
