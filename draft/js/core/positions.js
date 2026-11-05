/** A positions have full performance. Non-A retains the prototype's no-penalty policy. */
export function isNaturalPosition(player, position) {
  if (!player || !position) return false;
  return (player.naturalPositions || [player.primaryPosition]).includes(position.toUpperCase());
}
export function getPositionFit(player, position) {
  return { natural: isNaturalPosition(player, position), performanceMultiplier: 1, chemistryMultiplier: 1 };
}
