import type { TrackState } from './contract';
const PAINT: Record<string, string> = {
  black: '#27282a', white: '#eeeeea', silver: '#bfc3c5', grey: '#747a80', gray: '#747a80',
  beige: '#c3ae8b', gold: '#bca17b', tan: '#c3ae8b', brown: '#806048', blue: '#466582',
  red: '#a83232', green: '#49695a', yellow: '#c8b257', orange: '#c87637',
};
export function colourFamily(value?: string): string | null {
  if (!value) return null;
  const found = Object.keys(PAINT).find(k => value.toLowerCase().includes(k));
  if (!found) return null;
  return ({gray:'grey',tan:'beige',gold:'beige'} as Record<string,string>)[found] ?? found;
}
export function vehiclePaint(s: TrackState): string {
  const samples = s.track.samples;
  const observed = [...samples].reverse().find(p=>p.colour)?.colour;
  return PAINT[colourFamily(observed) ?? ''] ?? '#8a929b';
}
