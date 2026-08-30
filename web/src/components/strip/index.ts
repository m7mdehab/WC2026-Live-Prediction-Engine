// Minimal strip barrel for the Odds Time Machine port: only the shared LiveStrip rail (the one
// piece OddsTimeMachine transitively needs) is re-exported here. The other rail tiles (MatchTile,
// MoverTile, DeltaStatTile, Countdown) live on the source dashboard branch and are intentionally
// left behind - this review branch ships the Time Machine + Pace features only.
export {
  LiveStrip,
  STRIP_HEIGHT_BASE,
  STRIP_HEIGHT_MD,
  STRIP_HEIGHT_CLASS,
} from "./LiveStrip";
