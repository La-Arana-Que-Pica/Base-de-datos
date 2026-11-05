import {LEAGUE_REWARD_PORTRAITS} from '../data/reward-portraits.js';
// Explicit reward identities, independent of array order. Visual portraits do not
// validate historical attributes, IDs, skills or eligibility for delivery.
export const ALBUM_REWARD_PORTRAITS={
 // 36 local league portraits or the explicit SVG placeholder.
 ...LEAGUE_REWARD_PORTRAITS,
 'global:10':'assets/special_players/Alex%20Hunter.png',
 'global:25':'assets/special_players/Sing%20(Shaolin%20Soccer).png',
 'global:40':'assets/special_players/Zak%20(Sendokai).png',
 'global:55':'assets/special_players/Ted%20Lasso.png',
 'global:70':'assets/special_players/Yoichi%20Isagi%20(Blue%20Lock).png',
 'global:85':'assets/special_players/Oliver%20Atom%20(Captain%20Tsubasa).png',
};
// Add portraits in assets/rewards/leagues and run refresh-reward-portraits.mjs.
// The manifest selects available local images without requesting missing files.
export function rewardPortrait(key){return ALBUM_REWARD_PORTRAITS[key]||null;}
