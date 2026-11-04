import type { Point } from './types';

/** Draft coordinates are millimetres; measure the sampled curve, not its chord. */
export function curveLength(points: Point[]): number {
 return points.slice(1).reduce((sum,p,i)=>sum+Math.hypot(p.x-points[i].x,p.y-points[i].y),0);
}
